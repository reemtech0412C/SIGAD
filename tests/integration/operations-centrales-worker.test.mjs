import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  for (const fichier of readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossierEtat, fichier));
    base.exec("PRAGMA foreign_keys = ON");
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'operations_centrales_distribution'").get().total === 1) {
      return base;
    }
    base.close();
  }
  throw new Error("La base D1 locale des opérations centrales est introuvable.");
}

function creerCle(prefixe) { return `${prefixe}-${crypto.randomUUID()}`; }
function nouveauMotDePasse() { return `Test-${randomBytes(18).toString("base64url")}Aa9`; }

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers();
    if (!options.brut) entetes.set("Accept", "application/json");
    const formulaire = options.corps instanceof FormData;
    if (options.corps !== undefined && !formulaire) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: formulaire ? options.corps : JSON.stringify(options.corps) }),
    });

    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      if (!paire) continue;
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (!valeur || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }

    if (options.brut) {
      return { reponse, donnees: null };
    }

    let donnees = null;
    try { donnees = await reponse.json(); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async connexion(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    let connexion = await this.requete("/api/auth/connexion", {
      methode: "POST", corps: { identifiant, mot_de_passe: motDePasse },
    });
    assert.equal(connexion.reponse.status, 200, `La connexion locale du compte ${identifiant} doit réussir.`);
    connexion = await terminerConnexionMfaTest(this, identifiant, connexion);
    if (connexion.donnees?.utilisateur?.doit_changer_mot_de_passe) {
      const nouveauMdp = nouveauMotDePasse();
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST", corps: { nouveau_mot_de_passe: nouveauMdp },
      });
      assert.equal(changement.reponse.status, 200, "Le changement initial de mot de passe doit être obligatoire.");
      this.motDePasseActuel = nouveauMdp;
    } else {
      this.motDePasseActuel = motDePasse;
    }
    if (["central", "proprietaire"].includes(identifiant)) await configurerMfaTest(this, identifiant);
    return connexion;
  }
}

async function ouvrirSessions(base) {
  const comptes = {};
  for (const identifiant of ["sila", "ouaddai", "central"]) {
    const motDePasse = nouveauMotDePasse();
    const empreinte = await hacherMotDePasse(motDePasse);
    base.prepare(
      `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?,
       code_activation_expire_le = datetime('now', '+24 hours'),
       doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0,
       verrouille_jusqua = NULL WHERE identifiant = ?`,
    ).run(empreinte, empreinte, identifiant);
    const client = new ClientLocal();
    await client.connexion(identifiant, motDePasse);
    comptes[identifiant] = client;
  }
  if (process.env.SIGAD_E2E_PASSWORD_FILE && comptes.central?.motDePasseActuel) {
    await writeFile(process.env.SIGAD_E2E_PASSWORD_FILE, `${comptes.central.motDePasseActuel}\n`, {
      encoding: "utf8", flag: "w", mode: 0o600,
    });
  }
  if (process.env.SIGAD_E2E_SILA_PASSWORD_FILE && comptes.sila?.motDePasseActuel) {
    await writeFile(process.env.SIGAD_E2E_SILA_PASSWORD_FILE, `${comptes.sila.motDePasseActuel}\n`, {
      encoding: "utf8", flag: "w", mode: 0o600,
    });
  }
  return comptes;
}

test("Cycle complet de validation des Opérations Centrales de Distribution sur Worker local, D1 et R2", async () => {
  const base = ouvrirD1Locale();
  let operationId;
  let dossierSilaId;
  let dossierOuaddaiId;

  try {
    const sessions = await ouvrirSessions(base);
    const clientCentral = sessions.central;
    const clientSila = sessions.sila;
    const clientOuaddai = sessions.ouaddai;

    // 1. Contrôle préalable d'intégrité des stocks
    const totalMouvementsStockAvant = base.prepare("SELECT COUNT(*) AS total FROM mouvements_stock").get().total;

    // 2. Création de l'opération centrale inspirée de l'Arrêté 0033/2026 par ADMIN_CENTRAL
    const creation = await clientCentral.requete("/api/operations-centrales", {
      methode: "POST",
      cleIdempotence: creerCle("opc-create"),
      corps: {
        intitule: "Assistance d’urgence alimentaire et nutritionnelle aux ménages affectés par le déficit pluviométrique (Campagne 2026–2027)",
        reference_juridique: "Arrêté n°0033/PR/PM/MASSNAH/SG/2026 du 7 octobre 2026",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026-2027",
        institution_responsable: "MASSNAH / Comité de pilotage",
        description_contexte: "Opération nationale ciblée d'assistance gratuite dans les zones agro-pastorales déficitaires de l'Est tchadien",
        objectif_general: "Assurer la sécurité alimentaire immédiate de 15 000 ménages vulnérables",
        categories_beneficiaires: "Ménages ruraux affectés par le déficit pluviométrique",
        criteres_eligibilite: "Résidence locale, absence de réserve vivrière, vulnérabilité validée",
        sources_donnees_ciblage: "Enquêtes de ciblage conjointes MASSNAH/ONASA",
        nombre_previsionnel_menages: 15000,
        nombre_previsionnel_personnes: 90000,
        source_vivres: "ONASA",
        date_debut_prevue: "2026-11-01",
        date_fin_prevue: "2027-01-31",
        provinces: [
          { province_id: "prov-sila", quantite_allouee_prevue: 5000, nombre_menages_cibles_province: 5000, instructions_specifiques: "Priorité département de Djourf Al Ahmar" },
          { province_id: "prov-ouaddai", quantite_allouee_prevue: 6000, nombre_menages_cibles_province: 6000, instructions_specifiques: "Priorité zones rurales d'Abché et Assoungha" },
          { province_id: "prov-wadi-fira", quantite_allouee_prevue: 4000, nombre_menages_cibles_province: 4000, instructions_specifiques: "Priorité départements frontaliers" },
        ],
      },
    });

    assert.equal(creation.reponse.status, 201, "La création de l'opération centrale doit retourner 201.");
    assert.ok(creation.donnees.id);
    assert.equal(creation.donnees.statut, "BROUILLON");
    assert.equal(creation.donnees.nombre_provinces, 3);
    operationId = creation.donnees.id;

    // 3. Règle impérative : Vérifier la stricte non-altération du stock à la création
    const totalMouvementsStockApres = base.prepare("SELECT COUNT(*) AS total FROM mouvements_stock").get().total;
    assert.equal(totalMouvementsStockApres, totalMouvementsStockAvant, "Aucun mouvement de stock ne doit être créé à l'enregistrement de l'opération centrale.");

    // 4. Refus de création par un délégué provincial (RBAC)
    const creationRefusee = await clientSila.requete("/api/operations-centrales", {
      methode: "POST",
      cleIdempotence: creerCle("opc-refus"),
      corps: {
        intitule: "Opération pirate provinciale",
        type_intervention: "AUTRE",
        annee_campagne: "2026",
        source_vivres: "ONASA",
        provinces: [{ province_id: "prov-sila" }],
      },
    });
    assert.equal(creationRefusee.reponse.status, 403, "Le délégué provincial ne peut pas créer d'opération centrale (403 attendu).");

    // 5. Enregistrement des approbations de gouvernance
    // Approbation 1 : Comité de pilotage
    const appPilotage = await clientCentral.requete(`/api/operations-centrales/${operationId}/approbations`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-app-1"),
      corps: {
        type_approbation: "COMITE_PILOTAGE",
        instance_decisionnaire: "Comité de pilotage de l'Arrêté n°0033/2026",
        reference_acte: "Procès-verbal de session ordinaire n°01/CP/2026",
        date_decision: "2026-10-15",
        signataire_nom: "Dr. Mahamat Nour",
        signataire_qualite: "Président du Comité de Pilotage",
        decision: "APPROUVE",
        reserves_ou_conditions: "Respect strict de la clé de répartition entre les 3 provinces ciblées",
      },
    });
    assert.equal(appPilotage.reponse.status, 201, "L'enregistrement de l'avis du Comité de pilotage doit retourner 201.");

    // Transition vers SOUMISE_A_APPROBATION
    const versSoumise = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-statut-1"),
      corps: { nouveau_statut: "SOUMISE_A_APPROBATION", motif_ou_commentaire: "Transmission pour décision ministérielle" },
    });
    assert.equal(versSoumise.reponse.status, 200);

    // Test Rejet motivé avec motif inférieur à 5 caractères (doit échouer avec HTTP 400)
    const rejetCourt = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-rejet-court"),
      corps: { nouveau_statut: "BROUILLON", motif_ou_commentaire: "Non" },
    });
    assert.equal(rejetCourt.reponse.status, 400, "Le renvoi pour correction doit exiger au moins 5 caractères de motif.");

    // Rejet motivé valide (>= 5 caractères) : retour de SOUMISE_A_APPROBATION vers BROUILLON
    const retourBrouillon = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-retour-brouillon"),
      corps: { nouveau_statut: "BROUILLON", motif_ou_commentaire: "Compléter les effectifs prévisionnels par département avant validation" },
    });
    assert.equal(retourBrouillon.reponse.status, 200, "Le renvoi pour correction motivé doit réussir.");

    // Modification autorisée en statut BROUILLON (PUT)
    const modifBrouillon = await clientCentral.requete(`/api/operations-centrales/${operationId}`, {
      methode: "PUT",
      cleIdempotence: creerCle("opc-modif-brouillon"),
      corps: {
        intitule: "Assistance d’urgence alimentaire et nutritionnelle aux ménages affectés par le déficit pluviométrique (Campagne 2026–2027 révisée)",
        reference_juridique: "Arrêté n°0033/PR/PM/MASSNAH/SG/2026 du 7 octobre 2026",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026-2027",
        institution_responsable: "MASSNAH / Comité de pilotage",
        description_contexte: "Opération nationale ciblée révisée",
        objectif_general: "Assurer la sécurité alimentaire immédiate de 16 000 ménages vulnérables",
        categories_beneficiaires: "Ménages ruraux affectés",
        criteres_eligibilite: "Résidence locale, vulnérabilité validée",
        sources_donnees_ciblage: "Enquêtes de ciblage conjointes MASSNAH/ONASA",
        nombre_previsionnel_menages: 16000,
        nombre_previsionnel_personnes: 96000,
        source_vivres: "ONASA",
        date_debut_prevue: "2026-11-01",
        date_fin_prevue: "2027-01-31",
        provinces: [
          { province_id: "prov-sila", quantite_allouee_prevue: 5500, nombre_menages_cibles_province: 5500, instructions_specifiques: "Priorité Djourf Al Ahmar" },
          { province_id: "prov-ouaddai", quantite_allouee_prevue: 6500, nombre_menages_cibles_province: 6500, instructions_specifiques: "Priorité zones rurales" },
          { province_id: "prov-wadi-fira", quantite_allouee_prevue: 4000, nombre_menages_cibles_province: 4000, instructions_specifiques: "Priorité frontières" },
        ],
      },
    });
    assert.equal(modifBrouillon.reponse.status, 200, "La modification d'une opération en BROUILLON doit retourner 200.");

    // Resoumission vers SOUMISE_A_APPROBATION
    const reSoumission = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-resoumission"),
      corps: { nouveau_statut: "SOUMISE_A_APPROBATION", motif_ou_commentaire: "Dossier complété avec 16 000 ménages cibles" },
    });
    assert.equal(reSoumission.reponse.status, 200);

    // Tentative de modification en statut SOUMISE_A_APPROBATION (doit être interdite HTTP 400)
    const modifInterdite = await clientCentral.requete(`/api/operations-centrales/${operationId}`, {
      methode: "PUT",
      cleIdempotence: creerCle("opc-modif-interdite"),
      corps: {
        intitule: "Modification illégale sous approbation",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026-2027",
        provinces: [{ province_id: "prov-sila" }],
      },
    });
    assert.equal(modifInterdite.reponse.status, 400, "Une opération en attente d'approbation ne peut pas être modifiée.");

    // Approbation 2 : Validation Ministérielle (MASSNAH)
    const appMinistere = await clientCentral.requete(`/api/operations-centrales/${operationId}/approbations`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-app-2"),
      corps: {
        type_approbation: "VALIDATION_MINISTERIELLE",
        instance_decisionnaire: "Cabinet du Ministre de l'Action Sociale",
        reference_acte: "Note de service exécutoire n°088/MASSNAH/CAB/2026",
        date_decision: "2026-10-18",
        signataire_nom: "S.E. Mme la Ministre",
        signataire_qualite: "Ministre de l'Action Sociale et de la Solidarité Nationale",
        decision: "APPROUVE",
      },
    });
    assert.equal(appMinistere.reponse.status, 201, "La validation ministérielle doit retourner 201.");

    // Transition vers APPROUVEE
    const versApprouvee = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-statut-2"),
      corps: { nouveau_statut: "APPROUVEE", motif_ou_commentaire: "Conforme à la décision exécutoire ministérielle" },
    });
    assert.equal(versApprouvee.reponse.status, 200);

    // 6. Ouverture de l'opération (OUVERTE) et génération atomique des dossiers d'exécution provinciaux
    const versOuverte = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-statut-3"),
      corps: { nouveau_statut: "OUVERTE", motif_ou_commentaire: "Ouverture des opérations sur le terrain" },
    });
    assert.equal(versOuverte.reponse.status, 200);

    // Vérifier en base D1 que les dossiers d'exécution ont été créés atomiquement pour les 3 provinces
    const dossiersD1 = base.prepare("SELECT * FROM dossiers_execution_provinciaux WHERE operation_id = ? ORDER BY province_id").all(operationId);
    assert.equal(dossiersD1.length, 3, "Exactement 3 dossiers d'exécution provinciaux doivent être générés.");
    const provs = dossiersD1.map((d) => d.province_id);
    assert.deepEqual(provs, ["prov-ouaddai", "prov-sila", "prov-wadi-fira"]);

    dossierSilaId = dossiersD1.find((d) => d.province_id === "prov-sila").id;
    dossierOuaddaiId = dossiersD1.find((d) => d.province_id === "prov-ouaddai").id;

    // 7. Test de téléversement et récupération de document sur Cloudflare R2
    const contenuPdf = "%PDF-1.4\n%SIGAD Test PDF Arrêté 0033\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF";
    const blobPdf = new Blob([contenuPdf], { type: "application/pdf" });
    const formulaire = new FormData();
    formulaire.append("fichier", blobPdf, "Arrete_0033_2026.pdf");
    formulaire.append("categorie", "ARRETE_MINISTERIEL");
    formulaire.append("intitule", "Copie numérisée de l'Arrêté n°0033/2026");

    const uploadDoc = await clientCentral.requete(`/api/operations-centrales/${operationId}/documents`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-doc-upload"),
      corps: formulaire,
    });
    assert.equal(uploadDoc.reponse.status, 201, "Le téléversement R2 du document doit retourner 201.");
    const documentId = uploadDoc.donnees.id;
    assert.ok(documentId);

    // Téléchargement et vérification des octets depuis R2
    const getDoc = await clientCentral.requete(`/api/operations-centrales/${operationId}/documents/${documentId}`, {
      methode: "GET",
      brut: true,
    });
    assert.equal(getDoc.reponse.status, 200, "Le téléchargement du document R2 doit retourner 200.");
    assert.equal(getDoc.reponse.headers.get("content-type"), "application/pdf");
    const texteRecupere = await getDoc.reponse.text();
    assert.equal(texteRecupere, contenuPdf, "Les octets récupérés depuis le bucket R2 doivent correspondre exactement au fichier initial.");

    // 8. Vérification du cloisonnement territorial (RBAC Délégué Sila vs Ouaddaï)
    // Sila consulte ses opérations
    const opsSila = await clientSila.requete("/api/provincial/operations-centrales");
    assert.equal(opsSila.reponse.status, 200);
    const opVisibleSila = opsSila.donnees.elements.find((o) => o.id === operationId);
    assert.ok(opVisibleSila, "L'opération ouverte doit être visible pour le délégué de Sila.");

    // Sila consulte le détail : il ne voit QUE son dossier provincial
    const detailSila = await clientSila.requete(`/api/provincial/operations-centrales/${operationId}`);
    assert.equal(detailSila.reponse.status, 200);
    assert.equal(detailSila.donnees.dossiers.length, 1, "Le délégué ne doit voir que le dossier de sa province.");
    assert.equal(detailSila.donnees.dossiers[0].province_id, "prov-sila");

    // Sila met à jour son dossier provincial
    const majDossierSila = await clientSila.requete(`/api/provincial/operations-centrales/${operationId}/dossier`, {
      methode: "PATCH",
      cleIdempotence: creerCle("opc-dossier-sila"),
      corps: {
        statut_execution: "EN_PREPARATION",
        plan_operationnel_local: "Plan de déploiement validé : 2 équipes à Koukou-Angarana et Goz Beïda",
        observations_delegue: "Réception des vivres attendue sous 5 jours",
        date_debut_reelle: "2026-11-05",
      },
    });
    assert.equal(majDossierSila.reponse.status, 200, "La mise à jour du dossier par son délégué doit réussir.");

    // Tentative illégitime : Sila tente de consulter une opération d'une autre province
    // Créons une opération fictive sans Sila pour tester le rejet 403
    const opBorkou = await clientCentral.requete("/api/operations-centrales", {
      methode: "POST",
      cleIdempotence: creerCle("opc-borkou"),
      corps: {
        intitule: "Opération exclusive Borkou",
        type_intervention: "AUTRE",
        annee_campagne: "2026",
        source_vivres: "ONASA",
        provinces: [{ province_id: "prov-borkou" }],
      },
    });
    const accesInterditSila = await clientSila.requete(`/api/provincial/operations-centrales/${opBorkou.donnees.id}`);
    assert.equal(accesInterditSila.reponse.status, 403, "Le délégué provincial ne peut pas accéder à une opération ne ciblant pas sa province (403 attendu).");

    // 9. Rattachement effectif d'une distribution provinciale au dossier central par Sila
    // Insérer un département et entrepôt pour Sila si nécessaire pour le schéma
    base.prepare("INSERT OR IGNORE INTO departements (id, province_id, code, nom, chef_lieu, actif) VALUES ('dep-test-sila-opc', 'prov-sila', 'SILA-OPC', 'Département Sila Test', 'Goz Beïda', 1)").run();
    base.prepare("INSERT OR IGNORE INTO entrepots (id, code_entrepot, nom, niveau, province_id, actif) VALUES ('wh-test-sila-opc', 'WH-SILA-OPC', 'Entrepôt Sila Test', 'PROVINCIAL', 'prov-sila', 1)").run();
    base.prepare("INSERT OR IGNORE INTO localites (id, province_id, departement_id, nom, type_localite, statut_validation) VALUES ('loc-test-sila-opc', 'prov-sila', 'dep-test-sila-opc', 'Localité Centre', 'VILLAGE', 'VALIDE')").run();
    base.prepare("INSERT OR IGNORE INTO menages (id, province_id, departement_id, localite_id, code_menage, nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id, date_enregistrement, statut, cree_par) VALUES ('men-test-sila-opc', 'prov-sila', 'dep-test-sila-opc', 'loc-test-sila-opc', 'MEN-SILA-001', 'Chef Menage Test', 'M', 5, 'cat-pop-autochtone', '2026-10-24', 'ACTIF', 'usr-sila')").run();
    base.prepare("INSERT OR IGNORE INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, perissable, actif) VALUES ('art-test-opc', 'RIZ-50KG', 'Riz blanc 50kg', 'cat-alimentaire', 'unit-kg', 1, 1)").run();

    const planDistribution = {
      intitule_distribution: "Distribution locale rattachée au dossier d'urgence 2026",
      departement_id: "dep-test-sila-opc",
      nature_aide: "ALIMENTAIRE",
      objectif: "Distribution aux ménages ciblés par l'opération centrale",
      date_prevue: "2026-11-15",
      entrepot_id: "wh-test-sila-opc",
      operation_centrale_id: operationId,
      dossier_execution_id: dossierSilaId,
      zones: [{ localite_id: "loc-test-sila-opc", nom_site_distribution: "Site Localité Centre" }],
      articles: [{ article_id: "art-test-opc", source_approvisionnement: "STOCK_EXISTANT", ration_par_menage: 1 }],
      menages: [{ menage_id: "men-test-sila-opc", index_zone: 0 }],
    };

    const creationDist = await clientSila.requete("/api/distributions", {
      methode: "POST",
      cleIdempotence: creerCle("dist-rattachee"),
      corps: planDistribution,
    });
    assert.equal(creationDist.reponse.status, 201, JSON.stringify(creationDist.donnees));
    const distId = creationDist.donnees.id;

    // Vérifier en base D1 que le lien avec l'opération centrale et le dossier est bien persistant
    const distVerifiee = base.prepare("SELECT operation_centrale_id, dossier_execution_id FROM distributions_provinciales WHERE id = ?").get(distId);
    assert.equal(distVerifiee.operation_centrale_id, operationId, "La distribution doit être liée à l'opération centrale.");
    assert.equal(distVerifiee.dossier_execution_id, dossierSilaId, "La distribution doit être liée au dossier d'exécution provincial de Sila.");

    // 10. Consolidation nationale centrale
    const consolidation = await clientCentral.requete(`/api/operations-centrales/${operationId}/consolidation`);
    assert.equal(consolidation.reponse.status, 200);
    assert.equal(consolidation.donnees.nombre_provinces_ciblees, 3);
    assert.equal(consolidation.donnees.nombre_dossiers_ouverts, 3);
    const dossierSilaConsolide = consolidation.donnees.provinces_detail.find((p) => p.province_id === "prov-sila");
    assert.ok(dossierSilaConsolide);
    assert.equal(dossierSilaConsolide.statut_execution, "EN_PREPARATION");
    assert.equal(dossierSilaConsolide.nombre_distributions_provinciales, 1);

    // 11. Passage en consolidation et clôture officielle de l'opération centrale par l'administration habilitée
    const versConsolidation = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-vers-consolidation"),
      corps: { nouveau_statut: "EN_CONSOLIDATION", motif_ou_commentaire: "Mise en consolidation des dossiers provinciaux" },
    });
    assert.equal(versConsolidation.reponse.status, 200, "Le passage en consolidation doit retourner 200.");

    const clotureOp = await clientCentral.requete(`/api/operations-centrales/${operationId}/statut`, {
      methode: "POST",
      cleIdempotence: creerCle("opc-cloture"),
      corps: { nouveau_statut: "CLOTUREE", motif_ou_commentaire: "Clôture officielle de la campagne d'urgence après exécution complète" },
    });
    assert.equal(clotureOp.reponse.status, 200, "La clôture de l'opération centrale doit retourner 200.");

    const statutFinal = base.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(operationId);
    assert.equal(statutFinal.statut, "CLOTUREE", "Le statut final en base D1 doit être CLOTUREE.");

    console.log("PASS — Intégration Worker locale : création, cycle complet de gouvernance (brouillon, rejet motif >= 5, resoumission, approbations, ouverture, rattachement distribution, consolidation et clôture) vérifié avec succès.");
  } finally {
    base.close();
  }
});
