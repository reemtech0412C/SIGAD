import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { test } from "node:test";
import { hacherMotDePasse, verifierMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { configurerMfaTest } from "./mfa-test-helper.mjs";

const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const dossierD1 = process.env.SIGAD_D1_STATE_DIR;
const cheminCodes = process.env.SIGAD_CODES_FILE;
if (!dossierD1 || !cheminCodes) throw new Error("Les chemins de la D1 synthétique et des codes locaux sont requis.");

const codes = JSON.parse(readFileSync(cheminCodes, "utf8"));
if (!Array.isArray(codes)) throw new Error("Le fichier local des codes ne contient pas une liste.");

function codePour(identifiant) {
  const entree = codes.find((code) => code?.identifiant === identifiant);
  if (!entree || typeof entree.code_activation !== "string") throw new Error("Le compte central de test est incomplet.");
  return entree.code_activation;
}

function ouvrirD1Locale() {
  const candidats = readdirSync(dossierD1).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  for (const candidat of candidats) {
    const base = new DatabaseSync(join(dossierD1, candidat));
    const existe = base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get();
    if (existe) return base;
    base.close();
  }
  throw new Error("La base D1 locale isolée est introuvable.");
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (this.jetonCsrf && options.csrf !== false) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (this.cookies.size > 0) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
    });
    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      if (!paire) continue;
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (valeur === "" || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    const texte = await reponse.text();
    let donnees = null;
    try { donnees = JSON.parse(texte); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async initialiserCsrf() {
    const resultat = await this.requete("/api/auth/csrf");
    assert.equal(resultat.reponse.status, 200);
    this.jetonCsrf = resultat.donnees.jeton_csrf;
  }

  async connexion(identifiant, motDePasse) {
    await this.initialiserCsrf();
    return this.requete("/api/auth/connexion", {
      methode: "POST",
      corps: { identifiant, mot_de_passe: motDePasse },
    });
  }

  async changerMotDePasse(motDePasse) {
    return this.requete("/api/auth/changer-mot-de-passe-initial", {
      methode: "POST",
      corps: { nouveau_mot_de_passe: motDePasse },
    });
  }
}

function nouveauMotDePasse() {
  return `Sigad-${randomBytes(18).toString("base64url")}Aa9`;
}

async function messagesCaptureCourriel() {
  const adresse = process.env.SIGAD_TEST_EMAIL_CAPTURE_URL;
  if (!adresse) throw new Error("Le service local de capture des e-mails de test est absent.");
  const reponse = await fetch(new URL("/__test/emails", adresse));
  assert.equal(reponse.status, 200);
  return reponse.json();
}

test("Inscription, approbation et activation de consultation sans fournisseur d’e-mail", async (t) => {
  if (process.env.SIGAD_EMAIL_DELIVERY_ENABLED !== "false") {
    t.skip("Ce parcours est exécuté séparément avec EMAIL_DELIVERY_ENABLED=false.");
    return;
  }
  const statutCourriel = await fetch(new URL("/api/inscriptions/delegues/provinces", adresseApi));
  assert.equal(statutCourriel.status, 200);
  const configuration = await statutCourriel.json();
  assert.equal(configuration.livraison_courriel_active, false);
  assert.equal(configuration.verification_courriel_active, false);
  assert.equal(configuration.elements.length, 23);

  const messagesAvant = await messagesCaptureCourriel();
  const demandeur = new ClientLocal();
  await demandeur.initialiserCsrf();
  const motDePasseChoisi = nouveauMotDePasse();
  const courriel = `sans-courriel-${randomBytes(10).toString("hex")}@example.com`;
  const inscription = await demandeur.requete("/api/inscriptions/delegues", {
    methode: "POST",
    corps: {
      nom_complet: "Délégué sans service de messagerie",
      province_id: "prov-sila",
      courriel,
      telephone: "+235 66 12 34 56",
      mot_de_passe: motDePasseChoisi,
      confirmation_mot_de_passe: motDePasseChoisi,
    },
  });
  assert.equal(inscription.reponse.status, 202);
  assert.equal(inscription.donnees.verification_requise, false);
  assert.match(inscription.donnees.message, /non vérifiée/u);
  assert.equal(Object.hasOwn(inscription.donnees, "reference"), false);
  assert.deepEqual(await messagesCaptureCourriel(), messagesAvant, "Le mode sans e-mail ne doit appeler ni simuler le fournisseur.");

  const base = ouvrirD1Locale();
  const demande = base.prepare(`SELECT id, statut, courriel_verifie_le, mot_de_passe_hash, utilisateur_cree_id
    FROM inscriptions_delegues WHERE lower(trim(courriel)) = lower(?)`).get(courriel);
  assert.ok(demande);
  assert.equal(demande.statut, "EN_ATTENTE_APPROBATION");
  assert.equal(demande.courriel_verifie_le, null);
  assert.equal(demande.utilisateur_cree_id, null);
  assert.equal(await verifierMotDePasse(motDePasseChoisi, demande.mot_de_passe_hash), true);
  assert.equal(base.prepare("SELECT COUNT(*) AS total FROM verifications_courriel WHERE inscription_id = ?").get(demande.id).total, 0);
  assert.equal(base.prepare("SELECT COUNT(*) AS total FROM journaux_inscriptions WHERE inscription_id = ? AND action = 'CODE_ENVOYE'").get(demande.id).total, 0);
  const comptesAvant = base.prepare("SELECT COUNT(*) AS total FROM utilisateurs").get().total;
  base.close();
  assert.equal(comptesAvant, 25);

  const connexionAvantApprobation = await new ClientLocal().connexion(courriel, motDePasseChoisi);
  assert.equal(connexionAvantApprobation.reponse.status, 401, "Une demande en attente n’ouvre pas de session provinciale.");

  const administration = new ClientLocal();
  const connexionAdministration = await administration.connexion("central", codePour("central"));
  assert.equal(connexionAdministration.reponse.status, 200);
  const motDePasseCentral = nouveauMotDePasse();
  const changementInitialCentral = await administration.changerMotDePasse(motDePasseCentral);
  assert.equal(changementInitialCentral.reponse.status, 200);
  await configurerMfaTest(administration, "central");

  const approbationSansAttestation = await administration.requete(`/api/administration/comptes/delegues/${demande.id}/remplacer/usr-sila`, {
    methode: "POST",
    corps: { motif: "Identité examinée par la procédure administrative." },
  });
  assert.equal(approbationSansAttestation.reponse.status, 400, "L’approbation exige une attestation explicite distincte de l’e-mail.");
  const avantDecision = ouvrirD1Locale();
  assert.equal(avantDecision.prepare("SELECT statut FROM utilisateurs WHERE id = 'usr-sila'").get().statut, "ACTIF");
  assert.equal(avantDecision.prepare("SELECT utilisateur_cree_id FROM inscriptions_delegues WHERE id = ?").get(demande.id).utilisateur_cree_id, null);
  avantDecision.close();

  const approbation = await administration.requete(`/api/administration/comptes/delegues/${demande.id}/remplacer/usr-sila`, {
    methode: "POST",
    corps: { motif: "Identité examinée par la procédure administrative.", verification_identite_administrative: true },
  });
  assert.equal(approbation.reponse.status, 201);
  assert.match(approbation.donnees.message, /mot de passe choisi lors de l’inscription/u);
  const identifiantDelegue = approbation.donnees.identifiant;

  const apresDecision = ouvrirD1Locale();
  const compteDelegue = apresDecision.prepare(`SELECT u.id, u.statut, u.mot_de_passe_hash, u.code_activation_hash,
      u.doit_changer_mot_de_passe, u.courriel_verifie_le, i.statut AS statut_demande
    FROM utilisateurs u INNER JOIN inscriptions_delegues i ON i.utilisateur_cree_id = u.id WHERE i.id = ?`).get(demande.id);
  assert.ok(compteDelegue);
  assert.equal(compteDelegue.statut, "ACTIF");
  assert.equal(compteDelegue.statut_demande, "APPROUVEE");
  assert.equal(compteDelegue.code_activation_hash, null);
  assert.equal(compteDelegue.doit_changer_mot_de_passe, 0);
  assert.equal(compteDelegue.courriel_verifie_le, null);
  assert.equal(await verifierMotDePasse(motDePasseChoisi, compteDelegue.mot_de_passe_hash), true);
  assert.equal(apresDecision.prepare("SELECT statut FROM utilisateurs WHERE id = 'usr-sila'").get().statut, "SUSPENDU");
  assert.equal(apresDecision.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL' AND province_id = 'prov-sila' AND statut = 'ACTIF'").get().total, 1);
  const decision = apresDecision.prepare("SELECT details_json FROM decisions_comptes WHERE inscription_id = ? AND action = 'REMPLACEMENT_DELEGUE'").get(demande.id);
  const details = JSON.parse(decision.details_json);
  assert.equal(details.verification_identite_administrative, true);
  assert.equal(details.verification_courriel, "NON_VERIFIEE");
  apresDecision.close();

  const clientDelegue = new ClientLocal();
  const connexionDelegue = await clientDelegue.connexion(identifiantDelegue, motDePasseChoisi);
  assert.equal(connexionDelegue.reponse.status, 200, "Après approbation, le délégué utilise le mot de passe qu’il a choisi.");
  const profilDelegue = await clientDelegue.requete("/api/compte");
  assert.equal(profilDelegue.reponse.status, 200);
  assert.equal(profilDelegue.donnees.compte.modification_courriel_disponible, false);
  assert.equal(profilDelegue.donnees.compte.courriel_verifie_le, null);

  const demandeRefuseeClient = new ClientLocal();
  await demandeRefuseeClient.initialiserCsrf();
  const motDePasseRefuse = nouveauMotDePasse();
  const courrielRefuse = `refus-sans-courriel-${randomBytes(8).toString("hex")}@example.com`;
  const creationDemandeRefusee = await demandeRefuseeClient.requete("/api/inscriptions/delegues", {
    methode: "POST",
    corps: {
      nom_complet: "Demande de test à refuser",
      province_id: "prov-ouaddai",
      courriel: courrielRefuse,
      telephone: "+235 66 11 22 33",
      mot_de_passe: motDePasseRefuse,
      confirmation_mot_de_passe: motDePasseRefuse,
    },
  });
  assert.equal(creationDemandeRefusee.reponse.status, 202);
  const baseDemandeRefusee = ouvrirD1Locale();
  const idDemandeRefusee = baseDemandeRefusee.prepare("SELECT id FROM inscriptions_delegues WHERE courriel = ?").get(courrielRefuse).id;
  baseDemandeRefusee.close();
  const refus = await administration.requete(`/api/administration/comptes/delegues/${idDemandeRefusee}/refuser`, {
    methode: "POST",
    corps: { motif: "Dossier administratif non conforme." },
  });
  assert.equal(refus.reponse.status, 200);
  const baseApresRefus = ouvrirD1Locale();
  const demandeRefusee = baseApresRefus.prepare("SELECT statut, courriel_verifie_le, utilisateur_cree_id FROM inscriptions_delegues WHERE id = ?").get(idDemandeRefusee);
  assert.equal(demandeRefusee.statut, "REFUSEE");
  assert.equal(demandeRefusee.courriel_verifie_le, null);
  assert.equal(demandeRefusee.utilisateur_cree_id, null);
  baseApresRefus.close();
  assert.equal((await new ClientLocal().connexion(courrielRefuse, motDePasseRefuse)).reponse.status, 401);
  const demandesCourrielAvant = ouvrirD1Locale();
  const totalVerificationsAvant = demandesCourrielAvant.prepare("SELECT COUNT(*) AS total FROM verifications_courriel").get().total;
  demandesCourrielAvant.close();
  const changementCourrielDesactive = await clientDelegue.requete("/api/compte/courriel", {
    methode: "POST",
    corps: { nouveau_courriel: `nouveau-${randomBytes(8).toString("hex")}@example.com`, mot_de_passe_actuel: motDePasseChoisi },
  });
  assert.equal(changementCourrielDesactive.reponse.status, 409);
  const confirmationCourrielDesactive = await clientDelegue.requete("/api/compte/courriel/verifier", {
    methode: "POST",
    corps: { code: "123456" },
  });
  assert.equal(confirmationCourrielDesactive.reponse.status, 409);
  const demandesCourrielApres = ouvrirD1Locale();
  assert.equal(demandesCourrielApres.prepare("SELECT COUNT(*) AS total FROM verifications_courriel").get().total, totalVerificationsAvant);
  demandesCourrielApres.close();

  const creationConsultation = await administration.requete("/api/administration/comptes/consultation", {
    methode: "POST",
    corps: {
      nom_complet: "Responsable institutionnel de test",
      institution: "Service public de test",
      fonction: "Observateur",
      courriel: `consultation-${randomBytes(10).toString("hex")}@example.com`,
      telephone: null,
      perimetre: "NATIONAL",
      provinces: [],
      motif: "Création locale d’un compte de consultation.",
    },
  });
  assert.equal(creationConsultation.reponse.status, 201);
  assert.equal(typeof creationConsultation.donnees.code_activation, "string");
  const codeInitial = creationConsultation.donnees.code_activation;
  const identifiantConsultation = creationConsultation.donnees.identifiant;
  assert.equal(Object.hasOwn(creationConsultation.donnees, "mot_de_passe"), false);

  const compteConsultationDb = ouvrirD1Locale();
  const ligneConsultation = compteConsultationDb.prepare(`SELECT u.id, u.courriel_verifie_le, u.mot_de_passe_hash, u.code_activation_hash,
      u.doit_changer_mot_de_passe, cc.id AS compte_id, cc.statut
    FROM utilisateurs u INNER JOIN comptes_consultation cc ON cc.utilisateur_id = u.id WHERE u.identifiant = ?`).get(identifiantConsultation);
  assert.ok(ligneConsultation);
  assert.equal(ligneConsultation.courriel_verifie_le, null);
  assert.equal(ligneConsultation.statut, "INVITE");
  assert.equal(ligneConsultation.doit_changer_mot_de_passe, 1);
  assert.equal(ligneConsultation.mot_de_passe_hash, ligneConsultation.code_activation_hash);
  assert.equal(await verifierMotDePasse(codeInitial, ligneConsultation.code_activation_hash), true);
  compteConsultationDb.close();

  const reemission = await administration.requete(`/api/administration/comptes/consultation/${ligneConsultation.compte_id}/renvoyer-invitation`, {
    methode: "POST",
    corps: { motif: "Nouvelle remise privée du code d’activation." },
  });
  assert.equal(reemission.reponse.status, 200);
  assert.equal(typeof reemission.donnees.code_activation, "string");
  assert.notEqual(reemission.donnees.code_activation, codeInitial, "La réémission remplace le code précédent.");

  const ancienneActivation = await new ClientLocal().connexion(identifiantConsultation, codeInitial);
  assert.equal(ancienneActivation.reponse.status, 401, "Le code remplacé ne doit plus être utilisable.");
  const clientConsultation = new ClientLocal();
  const connexionConsultation = await clientConsultation.connexion(identifiantConsultation, reemission.donnees.code_activation);
  assert.equal(connexionConsultation.reponse.status, 200);
  assert.equal(connexionConsultation.donnees.utilisateur.doit_changer_mot_de_passe, true);
  const accesAvantChangement = await clientConsultation.requete("/api/gestion/listes-beneficiaires?limite=1&decalage=0");
  assert.equal(accesAvantChangement.reponse.status, 403);
  const motDePasseConsultation = nouveauMotDePasse();
  const changementInitialConsultation = await clientConsultation.changerMotDePasse(motDePasseConsultation);
  assert.equal(changementInitialConsultation.reponse.status, 200);
  const sessionConsultation = await clientConsultation.requete("/api/auth/session");
  assert.equal(sessionConsultation.reponse.status, 200);
  assert.equal(sessionConsultation.donnees.utilisateur.role, "CONSULTATION_INSTITUTIONNELLE");

  const suspensionDelegue = await administration.requete(`/api/administration/comptes/delegues/${compteDelegue.id}/suspendre`, {
    methode: "POST",
    corps: { motif: "Suspension locale de vérification." },
  });
  assert.equal(suspensionDelegue.reponse.status, 200);
  assert.equal((await clientDelegue.requete("/api/auth/session")).reponse.status, 401, "La suspension révoque la session du délégué.");
  assert.equal((await new ClientLocal().connexion(identifiantDelegue, motDePasseChoisi)).reponse.status, 401);

  const courrielDejaVerifie = `preuve-otp-anterieure-${randomBytes(8).toString("hex")}@example.com`;
  const idDemandeDejaVerifiee = crypto.randomUUID();
  const empreinteMotDePasse = await hacherMotDePasse(nouveauMotDePasse());
  const insertionDemandeVerifiee = ouvrirD1Locale();
  insertionDemandeVerifiee.prepare(`INSERT INTO inscriptions_delegues
    (id, nom_complet, province_id, courriel, telephone, mot_de_passe_hash, statut, courriel_verifie_le)
    VALUES (?, 'Demande déjà vérifiée', 'prov-sila', ?, '+235 66 55 44 33', ?, 'EN_ATTENTE_APPROBATION', '2026-10-23 12:00:00')`)
    .run(idDemandeDejaVerifiee, courrielDejaVerifie, empreinteMotDePasse);
  insertionDemandeVerifiee.close();
  const approbationPreuveExistante = await administration.requete(
    `/api/administration/comptes/delegues/${idDemandeDejaVerifiee}/approuver`,
    { methode: "POST", corps: { motif: "Identité vérifiée indépendamment avant la suspension du courrier.", verification_identite_administrative: true } },
  );
  assert.equal(approbationPreuveExistante.reponse.status, 201,
    "Le mode sans e-mail accepte l’approbation administrative d’une demande déjà vérifiée.");
  const apresApprobationPreuve = ouvrirD1Locale();
  const compteAvecPreuve = apresApprobationPreuve.prepare(`SELECT u.courriel_verifie_le, i.statut, d.details_json
    FROM inscriptions_delegues i JOIN utilisateurs u ON u.id = i.utilisateur_cree_id
    JOIN decisions_comptes d ON d.inscription_id = i.id WHERE i.id = ?`).get(idDemandeDejaVerifiee);
  assert.equal(compteAvecPreuve.courriel_verifie_le, "2026-10-23 12:00:00",
    "Une preuve OTP existante est conservée sans créer de nouvelle vérification.");
  assert.equal(compteAvecPreuve.statut, "APPROUVEE");
  assert.equal(JSON.parse(compteAvecPreuve.details_json).verification_courriel, "VERIFIEE");
  apresApprobationPreuve.close();

  assert.deepEqual(await messagesCaptureCourriel(), messagesAvant, "Aucune des deux procédures sans e-mail ne doit envoyer de message.");
});
