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
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get().total === 1) return base;
    base.close();
  }
  throw new Error("La base D1 locale SIGAD est introuvable.");
}

function creerCle(prefixe) { return `${prefixe}-${crypto.randomUUID()}`; }
function nouveauMotDePasse() { return `Test-${randomBytes(18).toString("base64url")}Aa9`; }

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
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
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST", corps: { nouveau_mot_de_passe: nouveauMotDePasse() },
      });
      assert.equal(changement.reponse.status, 200, "Le changement du mot de passe initial est obligatoire.");
    }
    if (["central", "proprietaire"].includes(identifiant)) await configurerMfaTest(this, identifiant);
    return connexion;
  }
}

function preparerDonnees(base, identifiants) {
  const insererEntrepot = base.prepare(
    `INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id, actif)
     VALUES (?, ?, ?, ?, ?, 1)`,
  );
  insererEntrepot.run(identifiants.entrepotCentral, `${identifiants.suffixe}-CENTRAL`, "Entrepôt central d’essai Phase 5", "CENTRAL", null);
  insererEntrepot.run(identifiants.entrepotSila, `${identifiants.suffixe}-SILA`, "Entrepôt d’essai de Sila", "PROVINCIAL", "prov-sila");
  insererEntrepot.run(identifiants.entrepotOuaddai, `${identifiants.suffixe}-OUADDAI`, "Entrepôt d’essai du Ouaddaï", "PROVINCIAL", "prov-ouaddai");

  const insererArticle = base.prepare(
    `INSERT INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, perissable, actif)
     VALUES (?, ?, ?, ?, ?, 1, 1)`,
  );
  insererArticle.run(identifiants.articleRiz, `${identifiants.suffixe}-RIZ`, "Riz synthétique Phase 5", "cat-alimentaire", "unit-kg");
  insererArticle.run(identifiants.articleNfi, `${identifiants.suffixe}-KIT`, "Kit d’hygiène synthétique Phase 5", "cat-hygiene", "unit-piece");
  const insererArticleAllocation = base.prepare(
    `INSERT INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, perissable, actif)
     VALUES (?, ?, ?, 'cat-alimentaire', 'unit-kg', 1, 1)`,
  );
  for (const article of identifiants.articlesAllocation) {
    insererArticleAllocation.run(article.id, article.code, article.designation);
  }

  const insererLot = base.prepare(
    `INSERT INTO lots_stock
      (id, numero_lot, article_id, entrepot_id, province_id, source_type, date_peremption,
       etat_qualite, quantite_initiale, quantite_physique, quantite_reservee)
     VALUES (?, ?, ?, ?, NULL, 'STOCK_INITIAL', ?, ?, ?, ?, 0)`,
  );
  insererLot.run(identifiants.lotFefo, `${identifiants.suffixe}-FEFO`, identifiants.articleRiz, identifiants.entrepotCentral, "2026-11-01", "BON", 10, 10);
  insererLot.run(identifiants.lotSuivant, `${identifiants.suffixe}-SUIVANT`, identifiants.articleRiz, identifiants.entrepotCentral, "2027-01-01", "BON", 30, 30);
  insererLot.run(identifiants.lotExpire, `${identifiants.suffixe}-EXPIRE`, identifiants.articleRiz, identifiants.entrepotCentral, "2026-09-01", "PERIME", 100, 100);
  insererLot.run(identifiants.lotEndommage, `${identifiants.suffixe}-ENDOMMAGE`, identifiants.articleRiz, identifiants.entrepotCentral, "2027-03-01", "ENDOMMAGE", 100, 100);
  insererLot.run(identifiants.lotNfi, `${identifiants.suffixe}-KIT`, identifiants.articleNfi, identifiants.entrepotCentral, null, "BON", 10, 10);

}

async function connecterComptes(base) {
  const resultats = {};
  for (const identifiant of ["central", "sila", "ouaddai", "proprietaire"]) {
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
    resultats[identifiant] = client;
  }
  return resultats;
}

function corpsApprovisionnement(reference, destinations, autres = {}) {
  return {
    reference,
    intitule_operation: `Opération synthétique ${reference}`,
    description: "Scénario d’intégration local réservé aux tests.",
    source_articles: "ENTREPOT_CENTRAL",
    nature_aide: "ALIMENTAIRE",
    date_prevue_expedition: "2026-10-22",
    destinations,
    ...autres,
  };
}

async function creerApprovisionnement(client, entree) {
  const resultat = await client.requete("/api/central/approvisionnements", {
    methode: "POST", cleIdempotence: creerCle("appro-phase5"), corps: entree,
  });
  assert.equal(resultat.reponse.status, 201, JSON.stringify(resultat.donnees));
  return resultat.donnees;
}

async function validerApprovisionnement(client, id) {
  const resultat = await client.requete(`/api/central/approvisionnements/${id}/validation`, {
    methode: "POST", cleIdempotence: creerCle("validation-phase5"), corps: {},
  });
  assert.equal(resultat.reponse.status, 200, JSON.stringify(resultat.donnees));
}

async function creerExpedition(client, approvisionnementId, destinationId, entrepotId, lignes, reference) {
  return client.requete(`/api/central/approvisionnements/${approvisionnementId}/expeditions`, {
    methode: "POST",
    cleIdempotence: creerCle("expedition-phase5"),
    corps: {
      destination_id: destinationId,
      date_expedition: "2026-10-22",
      origine_expedition: entrepotId ? "ENTREPOT_CENTRAL" : "LIVRAISON_DIRECTE_FOURNISSEUR",
      entrepot_origine_id: entrepotId,
      reference_bordereau: reference,
      lignes,
    },
  });
}

async function televerserPvValide(client, expeditionId, cle) {
  const formulaire = new FormData();
  formulaire.set("fichier", new Blob(["%PDF-1.4\nProcès-verbal de test\n%%EOF"], { type: "application/pdf" }), "pv-phase5.pdf");
  return client.requete(`/api/provincial/expeditions/${expeditionId}/pv`, {
    methode: "POST", cleIdempotence: cle, corps: formulaire,
  });
}

async function televerserPv(client, expeditionId) {
  const formulaireUsurpe = new FormData();
  formulaireUsurpe.set("fichier", new Blob(["contenu qui n’est pas un PDF"], { type: "application/pdf" }), "faux.pdf");
  const usurpation = await client.requete(`/api/provincial/expeditions/${expeditionId}/pv`, {
    methode: "POST", cleIdempotence: creerCle("pv-usurpe-phase5"), corps: formulaireUsurpe,
  });
  assert.equal(usurpation.reponse.status, 400, "Un fichier qui déclare un PDF sans signature PDF doit être refusé.");
  const resultat = await televerserPvValide(client, expeditionId, creerCle("pv-phase5"));
  assert.equal(resultat.reponse.status, 201, JSON.stringify(resultat.donnees));
  return resultat.donnees.id;
}

async function recevoir(client, expeditionId, entrepotId, pvId, lignes, cle = creerCle("reception-phase5")) {
  return client.requete(`/api/provincial/expeditions/${expeditionId}/reception`, {
    methode: "POST",
    cleIdempotence: cle,
    corps: {
      entrepot_recepteur_id: entrepotId,
      date_reception: "2026-10-22",
      numero_pv_reception: `PV-${pvId.slice(0, 8)}`,
      pv_piece_jointe_id: pvId,
      lignes,
    },
  });
}

test("Approvisionnements centraux, réception provinciale et intégrité atomique dans Wrangler local", async () => {
  const base = ouvrirD1Locale();
  const suffixe = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const ids = {
    suffixe,
    entrepotCentral: `wh-p5-central-${suffixe}`,
    entrepotSila: `wh-p5-sila-${suffixe}`,
    entrepotOuaddai: `wh-p5-ouaddai-${suffixe}`,
    articleRiz: `article-p5-riz-${suffixe}`,
    articleNfi: `article-p5-kit-${suffixe}`,
    articlesAllocation: Array.from({ length: 20 }, (_, index) => ({
      id: `article-p5-allocation-${index + 1}-${suffixe}`,
      code: `${suffixe}-AL-${String(index + 1).padStart(2, "0")}`,
      designation: `Article d’allocation ${index + 1} synthétique Phase 5`,
    })),
    partenaire: `partner-p5-${suffixe}`,
    lotFefo: `lot-p5-fefo-${suffixe}`,
    lotSuivant: `lot-p5-suivant-${suffixe}`,
    lotExpire: `lot-p5-expire-${suffixe}`,
    lotEndommage: `lot-p5-endommage-${suffixe}`,
    lotNfi: `lot-p5-nfi-${suffixe}`,
  };
  base.exec("BEGIN IMMEDIATE");
  try { preparerDonnees(base, ids); base.exec("COMMIT"); } catch (erreur) { base.exec("ROLLBACK"); base.close(); throw erreur; }
  const comptes = await connecterComptes(base);
  base.close();
  const central = comptes.central;
  const sila = comptes.sila;
  const ouaddai = comptes.ouaddai;
  const proprietaire = comptes.proprietaire;
  const allocationLimite = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-ALLOCATIONS`,
    [{ province_id: "prov-sila", articles: ids.articlesAllocation.map((article) => ({ article_id: article.id, quantite_allouee: 1 })) }],
  ));
  assert.equal(allocationLimite.nombre_allocations, 20, "Une allocation de 20 articles respecte la limite de paramètres SQL D1.");
  const partenaire = await central.requete("/api/gestion/partenaires", {
    methode: "POST",
    corps: {
      nom: `Fournisseur synthétique Phase 5 ${suffixe}`,
      sigle: `F${suffixe.slice(0, 6)}`,
      type_organisation: "Fournisseur de test",
      roles: ["FOURNISSEUR"],
    },
  });
  assert.equal(partenaire.reponse.status, 201, "Le fournisseur de scénario suit le parcours de création autorisé.");
  ids.partenaire = partenaire.donnees.id;

  const refusCsrf = await central.requete("/api/central/approvisionnements", {
    methode: "POST", csrf: false, cleIdempotence: creerCle("csrf-phase5"),
    corps: corpsApprovisionnement(`APP-${suffixe}-CSRF`, [{ province_id: "prov-sila", articles: [{ article_id: ids.articleRiz, quantite_allouee: 1 }] }]),
  });
  assert.equal(refusCsrf.reponse.status, 403, "La création centrale exige une protection CSRF valide.");
  const mutationProprietaire = await proprietaire.requete("/api/central/approvisionnements", {
    methode: "POST", cleIdempotence: creerCle("rbac-phase5"),
    corps: corpsApprovisionnement(`APP-${suffixe}-OWNER`, [{ province_id: "prov-sila", articles: [{ article_id: ids.articleRiz, quantite_allouee: 1 }] }]),
  });
  assert.equal(mutationProprietaire.reponse.status, 403, "Le propriétaire technique ne crée pas d’opération administrative.");

  const approvisionnement = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-FEFO`,
    [{ province_id: "prov-sila", articles: [{ article_id: ids.articleRiz, quantite_allouee: 20 }] }],
  ));
  const cleCreationRejeu = creerCle("idempotence-appro-p5");
  const entreeRejeu = corpsApprovisionnement(`APP-${suffixe}-REJEU`, [
    { province_id: "prov-sila", articles: [{ article_id: ids.articleNfi, quantite_allouee: 2 }] },
  ]);
  const premierRejeu = await central.requete("/api/central/approvisionnements", {
    methode: "POST", cleIdempotence: cleCreationRejeu, corps: entreeRejeu,
  });
  assert.equal(premierRejeu.reponse.status, 201);
  const secondRejeu = await central.requete("/api/central/approvisionnements", {
    methode: "POST", cleIdempotence: cleCreationRejeu, corps: entreeRejeu,
  });
  assert.equal(secondRejeu.reponse.status, 201);
  assert.equal(secondRejeu.reponse.headers.get("Idempotency-Replayed"), "true");
  const corpsModifie = await central.requete("/api/central/approvisionnements", {
    methode: "POST", cleIdempotence: cleCreationRejeu,
    corps: { ...entreeRejeu, intitule_operation: "Autre contenu" },
  });
  assert.equal(corpsModifie.reponse.status, 409, "Une clé réutilisée avec un corps différent est refusée.");

  await validerApprovisionnement(central, approvisionnement.id);
  const repartition = await central.requete(`/api/approvisionnements/${approvisionnement.id}/repartition?limite=10&decalage=0`);
  assert.equal(repartition.reponse.status, 200);
  assert.equal(repartition.donnees.total, 1);
  const destinationSila = repartition.donnees.elements[0].destination_id;
  const baseControleLots = ouvrirD1Locale();
  const soldeCentralAvant = baseControleLots.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
    .get(ids.entrepotCentral, ids.articleRiz).quantite_physique;

  const expeditionComplete = await creerExpedition(central, approvisionnement.id, destinationSila, ids.entrepotCentral,
    [{ article_approvisionnement_id: repartition.donnees.elements[0].id, quantite_expediee: 15 }], `BORD-${suffixe}-01`);
  assert.equal(expeditionComplete.reponse.status, 201, JSON.stringify(expeditionComplete.donnees));
  assert.equal(expeditionComplete.donnees.nombre_lignes, 2, "Le FEFO répartit l’expédition sur les deux lots valides les plus proches.");
  const lotsFefo = baseControleLots.prepare(
    `SELECT numero_lot, quantite_physique FROM lots_stock
     WHERE id IN (?, ?, ?, ?) ORDER BY date_peremption`,
  ).all(ids.lotFefo, ids.lotSuivant, ids.lotExpire, ids.lotEndommage);
  assert.equal(lotsFefo.find((lot) => lot.numero_lot.endsWith("-FEFO")).quantite_physique, 0);
  assert.equal(lotsFefo.find((lot) => lot.numero_lot.endsWith("-SUIVANT")).quantite_physique, 25);
  assert.equal(lotsFefo.find((lot) => lot.numero_lot.endsWith("-EXPIRE")).quantite_physique, 100);
  assert.equal(lotsFefo.find((lot) => lot.numero_lot.endsWith("-ENDOMMAGE")).quantite_physique, 100);
  assert.equal(baseControleLots.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
    .get(ids.entrepotCentral, ids.articleRiz).quantite_physique, soldeCentralAvant - 15,
  "L’expédition centrale diminue le solde du même montant que les lots débités.");
  baseControleLots.close();
  const expeditionPartielle = await creerExpedition(central, approvisionnement.id, destinationSila, ids.entrepotCentral,
    [{ article_approvisionnement_id: repartition.donnees.elements[0].id, quantite_expediee: 5 }], `BORD-${suffixe}-02`);
  assert.equal(expeditionPartielle.reponse.status, 201, "Une destination accepte plusieurs expéditions.");
  const depassementAllocation = await creerExpedition(central, approvisionnement.id, destinationSila, ids.entrepotCentral,
    [{ article_approvisionnement_id: repartition.donnees.elements[0].id, quantite_expediee: 1 }], `BORD-${suffixe}-03`);
  assert.equal(depassementAllocation.reponse.status, 409, "Une allocation ne peut être dépassée.");

  const cleR2ApresEchecReference = creerCle("pv-reference-rollback-phase5");
  const baseTriggerR2 = ouvrirD1Locale();
  baseTriggerR2.exec(
    `CREATE TRIGGER refuser_reference_pv_test BEFORE INSERT ON pieces_jointes
     WHEN NEW.entite_liee_id = '${expeditionComplete.donnees.id}' AND NEW.categorie_document = 'PV_RECEPTION'
     BEGIN SELECT RAISE(ABORT, 'TEST_R2_REFERENCE'); END`,
  );
  baseTriggerR2.close();
  const echecReferenceR2 = await televerserPvValide(sila, expeditionComplete.donnees.id, cleR2ApresEchecReference);
  assert.equal(echecReferenceR2.reponse.status, 500, "Un échec de référence D1 doit échouer l’upload du procès-verbal.");
  const baseApresEchecReference = ouvrirD1Locale();
  assert.equal(baseApresEchecReference.prepare(
    "SELECT COUNT(*) AS total FROM pieces_jointes WHERE entite_liee_id = ? AND categorie_document = 'PV_RECEPTION'",
  ).get(expeditionComplete.donnees.id).total, 0, "L’échec ne laisse aucun enregistrement de pièce jointe dans D1.");
  baseApresEchecReference.exec("DROP TRIGGER refuser_reference_pv_test");
  baseApresEchecReference.close();
  const repriseReferenceR2 = await televerserPvValide(sila, expeditionComplete.donnees.id, cleR2ApresEchecReference);
  assert.equal(repriseReferenceR2.reponse.status, 201, "La même demande peut être reprise après rétablissement de D1.");
  const pvComplet = repriseReferenceR2.donnees.id;
  const detailComplet = await sila.requete(`/api/provincial/expeditions/${expeditionComplete.donnees.id}`);
  assert.equal(detailComplet.reponse.status, 200);
  const lignesCompletes = detailComplet.donnees.lignes.map((ligne) => ({
    ligne_expedition_id: ligne.id,
    quantite_recue_physique: ligne.quantite_expediee,
    quantite_acceptee: ligne.quantite_expediee,
    quantite_endommagee: 0,
  }));
  const cleReceptionComplete = creerCle("reception-complete-p5");
  const receptionComplete = await recevoir(sila, expeditionComplete.donnees.id, ids.entrepotSila, pvComplet, lignesCompletes, cleReceptionComplete);
  assert.equal(receptionComplete.reponse.status, 201, JSON.stringify(receptionComplete.donnees));
  const replayReception = await recevoir(sila, expeditionComplete.donnees.id, ids.entrepotSila, pvComplet, lignesCompletes, cleReceptionComplete);
  assert.equal(replayReception.reponse.status, 201);
  assert.equal(replayReception.reponse.headers.get("Idempotency-Replayed"), "true", "La reprise d’une réception retourne le résultat mémorisé.");
  const receptionDupliqueeComplete = await recevoir(sila, expeditionComplete.donnees.id, ids.entrepotSila, pvComplet, lignesCompletes,
    creerCle("reception-duplicate-complete-p5"));
  assert.equal(receptionDupliqueeComplete.reponse.status, 404, "Une nouvelle clé ne peut pas enregistrer une seconde réception.");

  const pvPartiel = await televerserPv(sila, expeditionPartielle.donnees.id);
  const detailPartiel = await sila.requete(`/api/provincial/expeditions/${expeditionPartielle.donnees.id}`);
  assert.equal(detailPartiel.reponse.status, 200);
  const lignePartielle = detailPartiel.donnees.lignes[0];
  const cleReceptionPartielle = creerCle("reception-partielle-p5");
  const receptionPartielle = await recevoir(sila, expeditionPartielle.donnees.id, ids.entrepotSila, pvPartiel, [{
    ligne_expedition_id: lignePartielle.id,
    quantite_recue_physique: 4,
    quantite_acceptee: 3,
    quantite_endommagee: 1,
  }], cleReceptionPartielle);
  assert.equal(receptionPartielle.reponse.status, 201, JSON.stringify(receptionPartielle.donnees));
  const receptionDupliquee = await recevoir(sila, expeditionPartielle.donnees.id, ids.entrepotSila, pvPartiel, [{
    ligne_expedition_id: lignePartielle.id,
    quantite_recue_physique: 4,
    quantite_acceptee: 3,
    quantite_endommagee: 1,
  }], creerCle("reception-duplicate-p5"));
  assert.equal(receptionDupliquee.reponse.status, 404, "Une réception déjà validée est protégée contre le doublon.");

  const baseControle = ouvrirD1Locale();
  try {
    const reception = baseControle.prepare("SELECT id, statut_rapprochement FROM receptions_provinciales WHERE id = ?")
      .get(receptionPartielle.donnees.id);
    assert.equal(reception.statut_rapprochement, "ECART_OUVERT");
    const ligneReception = baseControle.prepare(
      `SELECT id, quantite_manquante, quantite_acceptee, lot_cree_id, lot_endommage_id
       FROM lignes_reception_provinciale WHERE reception_provinciale_id = ?`,
    ).get(reception.id);
    assert.equal(ligneReception.quantite_manquante, 1);
    assert.ok(ligneReception.lot_cree_id);
    assert.ok(ligneReception.lot_endommage_id);
    const lots = baseControle.prepare("SELECT etat_qualite, quantite_physique FROM lots_stock WHERE id IN (?, ?) ORDER BY etat_qualite")
      .all(ligneReception.lot_cree_id, ligneReception.lot_endommage_id);
    assert.deepEqual(lots.map((lot) => lot.etat_qualite).sort(), ["BON", "ENDOMMAGE"]);
    const solde = baseControle.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
      .get(ids.entrepotSila, ids.articleRiz);
    const sommeLots = baseControle.prepare("SELECT SUM(quantite_physique) AS total FROM lots_stock WHERE entrepot_id = ? AND article_id = ?")
      .get(ids.entrepotSila, ids.articleRiz);
    assert.equal(solde.quantite_physique, sommeLots.total, "Le solde consolidé est égal à la somme physique de tous les lots reçus.");
    const disponible = baseControle.prepare(
      `SELECT SUM(CASE WHEN etat_qualite = 'BON' AND (date_peremption IS NULL OR date_peremption >= date('now'))
       THEN quantite_physique - quantite_reservee ELSE 0 END) AS total
       FROM lots_stock WHERE entrepot_id = ? AND article_id = ?`,
    ).get(ids.entrepotSila, ids.articleRiz);
    assert.equal(disponible.total, 18, "Les lots endommagés ne sont pas disponibles à la distribution.");

    let mouvementAjoute = false;
    try {
      baseControle.prepare(
        `INSERT INTO mouvements_stock (id, reference_mouvement, entrepot_id, province_id, article_id, lot_stock_id,
          type_mouvement, sens, quantite, solde_physique_avant, solde_physique_apres,
          document_source_type, document_source_id, motif, auteur_id)
         VALUES (?, ?, ?, ?, ?, ?, 'RECEPTION', 'PLUS', 1, 18, 19, 'TEST', 'TEST', 'Mouvement sans mutation', 'usr-central')`,
      ).run(crypto.randomUUID(), creerCle("mouvement-sans-update"), ids.entrepotSila, "prov-sila", ids.articleRiz,
        ligneReception.lot_cree_id);
      mouvementAjoute = true;
    } catch (erreur) { assert.match(erreur.message, /MOUVEMENT_SANS_MUTATION_EFFECTIVE/u); }
    assert.equal(mouvementAjoute, false, "Un mouvement ne peut être écrit sans mise à jour effective du lot dans la séquence transactionnelle.");
  } finally { baseControle.close(); }

  const fermetureAvantRapprochement = await central.requete(`/api/central/approvisionnements/${approvisionnement.id}/cloture`, {
    methode: "POST", cleIdempotence: creerCle("cloture-ouverte-p5"), corps: { observations_cloture: "Tentative avant rapprochement" },
  });
  assert.equal(fermetureAvantRapprochement.reponse.status, 409, "La clôture est bloquée tant que l’écart reste ouvert.");
  const rapprochement = await central.requete(
    `/api/central/approvisionnements/${approvisionnement.id}/receptions/${receptionPartielle.donnees.id}/rapprochement`,
    {
      methode: "POST", cleIdempotence: creerCle("rapprochement-p5"),
      corps: { justifications: [{ ligne_reception_id: ligneReceptionId(receptionPartielle.donnees.id), justification_ecart: "Perte constatée et documentée au déchargement." }] },
    },
  );
  assert.equal(rapprochement.reponse.status, 200, JSON.stringify(rapprochement.donnees));
  const statutApresRapprochement = await central.requete(`/api/approvisionnements/${approvisionnement.id}`);
  assert.equal(statutApresRapprochement.donnees.statut, "RECEPTIONNEE");

  const multi = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-MULTI`,
    [
      { province_id: "prov-sila", articles: [{ article_id: ids.articleNfi, quantite_allouee: 2 }] },
      { province_id: "prov-ouaddai", articles: [{ article_id: ids.articleNfi, quantite_allouee: 4 }] },
      { province_id: "prov-batha", articles: [{ article_id: ids.articleNfi, quantite_allouee: 6 }] },
    ],
    { nature_aide: "NFI" },
  ));
  assert.equal(multi.nombre_destinations, 3);
  const destinationsPage = await central.requete(`/api/approvisionnements/${multi.id}/destinations?limite=2&decalage=0`);
  assert.equal(destinationsPage.reponse.status, 200);
  assert.equal(destinationsPage.donnees.total, 3, "La liste paginée des destinations compte les trois provinces.");
  assert.equal(destinationsPage.donnees.elements.length, 2, "La pagination des destinations respecte la limite demandée.");
  const repartitionMulti = await central.requete(`/api/approvisionnements/${multi.id}/repartition?limite=20&decalage=0`);
  assert.deepEqual(repartitionMulti.donnees.elements.map((element) => element.quantite_allouee).sort((a, b) => a - b), [2, 4, 6]);
  await validerApprovisionnement(central, multi.id);
  const ligneOuaddai = repartitionMulti.donnees.elements.find((ligne) => ligne.province_id === "prov-ouaddai");
  assert.ok(ligneOuaddai);
  const expeditionOuaddai = await creerExpedition(central, multi.id, ligneOuaddai.destination_id, ids.entrepotCentral,
    [{ article_approvisionnement_id: ligneOuaddai.id, quantite_expediee: 2 }], `BORD-${suffixe}-OD`);
  assert.equal(expeditionOuaddai.reponse.status, 201, JSON.stringify(expeditionOuaddai.donnees));
  const lectureSila = await sila.requete("/api/provincial/expeditions?limite=100&decalage=0");
  assert.equal(lectureSila.reponse.status, 200);
  assert.equal(lectureSila.donnees.elements.some((element) => element.id === expeditionOuaddai.donnees.id), false,
    "Le délégué de Sila ne voit aucun enregistrement du Ouaddaï.");
  const destinationsSila = await sila.requete(`/api/approvisionnements/${multi.id}/destinations?limite=23&decalage=0`);
  assert.equal(destinationsSila.reponse.status, 200);
  assert.equal(destinationsSila.donnees.total, 1);
  assert.equal(destinationsSila.donnees.elements[0].province_id, "prov-sila", "Les destinations de l’interface sont limitées à la province issue de la session.");
  const destinationsOuaddaiInterdites = await sila.requete(`/api/approvisionnements/${multi.id}/destinations?province_id=prov-ouaddai`);
  assert.equal(destinationsOuaddaiInterdites.reponse.status, 403);
  const detailCroise = await sila.requete(`/api/provincial/expeditions/${expeditionOuaddai.donnees.id}`);
  assert.equal(detailCroise.reponse.status, 404, "L’identifiant de l’expédition ne peut pas élargir le périmètre provincial.");
  const receptionCroisee = await sila.requete(`/api/provincial/expeditions/${expeditionOuaddai.donnees.id}/reception`, {
    methode: "POST", cleIdempotence: creerCle("reception-croisee-p5"),
    corps: { province_id: "prov-ouaddai" },
  });
  assert.equal(receptionCroisee.reponse.status, 403, "Une province fournie par le client est refusée avant le service.");
  const actionCentraleDeleguee = await sila.requete(`/api/central/approvisionnements/${multi.id}/cloture`, {
    methode: "POST", cleIdempotence: creerCle("rbac-central-p5"), corps: {},
  });
  assert.equal(actionCentraleDeleguee.reponse.status, 403, "Le délégué ne peut pas utiliser une fonction centrale.");

  const direct = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-FOURN`,
    [{ province_id: "prov-sila", articles: [{ article_id: ids.articleNfi, quantite_allouee: 2 }] }],
    { source_articles: "FOURNISSEUR_EXTERNE", partenaire_id: ids.partenaire, nature_aide: "NFI" },
  ));
  await validerApprovisionnement(central, direct.id);
  const allocationDirecte = (await central.requete(`/api/approvisionnements/${direct.id}/repartition?limite=10&decalage=0`)).donnees.elements[0];
  const baseAvantDirect = ouvrirD1Locale();
  const soldeNfiCentralAvant = baseAvantDirect.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
    .get(ids.entrepotCentral, ids.articleNfi).quantite_physique;
  baseAvantDirect.close();
  const expeditionDirecte = await creerExpedition(central, direct.id, allocationDirecte.destination_id, null, [{
    article_approvisionnement_id: allocationDirecte.id, quantite_expediee: 2,
    numero_lot_fournisseur: `FOURN-${suffixe}`, date_peremption: null,
  }], `BORD-${suffixe}-DIRECT`);
  assert.equal(expeditionDirecte.reponse.status, 201, JSON.stringify(expeditionDirecte.donnees));
  const baseDirect = ouvrirD1Locale();
  try {
    const expeditionLue = baseDirect.prepare("SELECT origine_expedition, entrepot_origine_id FROM expeditions WHERE id = ?")
      .get(expeditionDirecte.donnees.id);
    assert.equal(expeditionLue.origine_expedition, "LIVRAISON_DIRECTE_FOURNISSEUR");
    assert.equal(expeditionLue.entrepot_origine_id, null);
    assert.equal(baseDirect.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
      .get(ids.entrepotCentral, ids.articleNfi).quantite_physique, soldeNfiCentralAvant,
    "Une livraison fournisseur directe ne provoque aucun débit fictif du stock central.");
  } finally { baseDirect.close(); }
  const pvDirect = await televerserPv(sila, expeditionDirecte.donnees.id);
  const detailDirect = await sila.requete(`/api/provincial/expeditions/${expeditionDirecte.donnees.id}`);
  const receiveDirect = await recevoir(sila, expeditionDirecte.donnees.id, ids.entrepotSila, pvDirect,
    detailDirect.donnees.lignes.map((ligne) => ({ ligne_expedition_id: ligne.id, quantite_recue_physique: 2, quantite_acceptee: 2, quantite_endommagee: 0 })));
  assert.equal(receiveDirect.reponse.status, 201, JSON.stringify(receiveDirect.donnees));

  const supplyRupture = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-RUPTURE`,
    [{ province_id: "prov-sila", articles: [{ article_id: ids.articleRiz, quantite_allouee: 40 }] }],
  ));
  await validerApprovisionnement(central, supplyRupture.id);
  const allocationRupture = (await central.requete(`/api/approvisionnements/${supplyRupture.id}/repartition?limite=10&decalage=0`)).donnees.elements[0];
  const indisponible = await creerExpedition(central, supplyRupture.id, allocationRupture.destination_id, ids.entrepotCentral,
    [{ article_approvisionnement_id: allocationRupture.id, quantite_expediee: 40 }], `BORD-${suffixe}-INDISP`);
  assert.equal(indisponible.reponse.status, 409, "Une quantité supérieure aux lots bons et non périmés est refusée.");

  const supplyConcurrent = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-CONCURRENT`,
    [{ province_id: "prov-sila", articles: [{ article_id: ids.articleRiz, quantite_allouee: 20 }] }],
  ));
  await validerApprovisionnement(central, supplyConcurrent.id);
  const allocationConcurrent = (await central.requete(`/api/approvisionnements/${supplyConcurrent.id}/repartition?limite=10&decalage=0`)).donnees.elements[0];
  const resultatsConcurrentes = await Promise.all([
    creerExpedition(central, supplyConcurrent.id, allocationConcurrent.destination_id, ids.entrepotCentral,
      [{ article_approvisionnement_id: allocationConcurrent.id, quantite_expediee: 15 }], `BORD-${suffixe}-CA`),
    creerExpedition(central, supplyConcurrent.id, allocationConcurrent.destination_id, ids.entrepotCentral,
      [{ article_approvisionnement_id: allocationConcurrent.id, quantite_expediee: 15 }], `BORD-${suffixe}-CB`),
  ]);
  assert.deepEqual(resultatsConcurrentes.map((resultat) => resultat.reponse.status).sort(), [201, 409],
    "Deux expéditions concurrentes ne peuvent déduire ensemble plus que le disponible.");
  const baseConcurrent = ouvrirD1Locale();
  try {
    const mouvements = baseConcurrent.prepare(
      "SELECT COUNT(*) AS total FROM mouvements_stock WHERE document_source_type = 'EXPEDITION_CENTRALE' AND document_source_id IN (SELECT id FROM expeditions WHERE approvisionnement_id = ?)",
    ).get(supplyConcurrent.id).total;
    const expeditions = baseConcurrent.prepare("SELECT COUNT(*) AS total FROM expeditions WHERE approvisionnement_id = ?")
      .get(supplyConcurrent.id).total;
    assert.equal(expeditions, 1, "Une seule expédition concurrente est conservée.");
    assert.equal(mouvements, 1, "La tentative perdante ne laisse aucun mouvement orphelin.");
    let violationSolde = false;
    try {
      baseConcurrent.prepare("UPDATE soldes_stock SET quantite_physique = quantite_physique + 1 WHERE entrepot_id = ? AND article_id = ?")
        .run(ids.entrepotCentral, ids.articleRiz);
    } catch (erreur) { violationSolde = /SOLDE_STOCK_INCOHERENT/u.test(erreur.message); }
    assert.equal(violationSolde, true, "Le solde central reste protégé contre la divergence des lots.");
  } finally { baseConcurrent.close(); }

  const supplyRollbackMouvement = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-ROLLBACK-MVT`,
    [{ province_id: "prov-sila", articles: [{ article_id: ids.articleRiz, quantite_allouee: 1 }] }],
  ));
  await validerApprovisionnement(central, supplyRollbackMouvement.id);
  const allocationRollbackMouvement = (await central.requete(`/api/approvisionnements/${supplyRollbackMouvement.id}/repartition?limite=10&decalage=0`)).donnees.elements[0];
  const baseAvantMouvement = ouvrirD1Locale();
  const soldeAvantMouvement = baseAvantMouvement.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
    .get(ids.entrepotCentral, ids.articleRiz).quantite_physique;
  baseAvantMouvement.exec(
    `CREATE TRIGGER test_echec_mouvement_phase5 BEFORE INSERT ON mouvements_stock
     WHEN NEW.document_source_type = 'EXPEDITION_CENTRALE'
     BEGIN SELECT RAISE(ABORT, 'ECHEC_MOUVEMENT_PHASE5'); END;`,
  );
  baseAvantMouvement.close();
  const mouvementEnEchec = await creerExpedition(central, supplyRollbackMouvement.id, allocationRollbackMouvement.destination_id,
    ids.entrepotCentral, [{ article_approvisionnement_id: allocationRollbackMouvement.id, quantite_expediee: 1 }], `BORD-${suffixe}-ROLLBACK`);
  assert.equal(mouvementEnEchec.reponse.status, 500, "Une panne du mouvement annule l’expédition entière.");
  const baseApresMouvement = ouvrirD1Locale();
  try {
    assert.equal(baseApresMouvement.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
      .get(ids.entrepotCentral, ids.articleRiz).quantite_physique, soldeAvantMouvement);
    assert.equal(baseApresMouvement.prepare("SELECT COUNT(*) AS total FROM expeditions WHERE approvisionnement_id = ?")
      .get(supplyRollbackMouvement.id).total, 0);
    assert.equal(baseApresMouvement.prepare("SELECT COUNT(*) AS total FROM cles_idempotence WHERE route_api LIKE ?")
      .get(`/api/central/approvisionnements/${supplyRollbackMouvement.id}/expeditions`).total, 0);
    baseApresMouvement.exec("DROP TRIGGER test_echec_mouvement_phase5");
  } finally { baseApresMouvement.close(); }

  const supplyRollbackAudit = await creerApprovisionnement(central, corpsApprovisionnement(
    `APP-${suffixe}-ROLLBACK-AUDIT`,
    [{ province_id: "prov-sila", articles: [{ article_id: ids.articleNfi, quantite_allouee: 1 }] }],
    { source_articles: "FOURNISSEUR_EXTERNE", partenaire_id: ids.partenaire, nature_aide: "NFI" },
  ));
  await validerApprovisionnement(central, supplyRollbackAudit.id);
  const allocationRollbackAudit = (await central.requete(`/api/approvisionnements/${supplyRollbackAudit.id}/repartition?limite=10&decalage=0`)).donnees.elements[0];
  const expeditionRollbackAudit = await creerExpedition(central, supplyRollbackAudit.id, allocationRollbackAudit.destination_id, null, [{
    article_approvisionnement_id: allocationRollbackAudit.id, quantite_expediee: 1,
    numero_lot_fournisseur: `FOURN-ROLLBACK-${suffixe}`,
  }], `BORD-${suffixe}-AUDIT`);
  assert.equal(expeditionRollbackAudit.reponse.status, 201);
  const pvRollback = await televerserPv(sila, expeditionRollbackAudit.donnees.id);
  const detailRollback = await sila.requete(`/api/provincial/expeditions/${expeditionRollbackAudit.donnees.id}`);
  const baseAvantAudit = ouvrirD1Locale();
  const stockSilaAvant = baseAvantAudit.prepare("SELECT COALESCE(quantite_physique, 0) AS total FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
    .get(ids.entrepotSila, ids.articleNfi)?.total ?? 0;
  baseAvantAudit.exec(
    `CREATE TRIGGER test_echec_audit_phase5 BEFORE INSERT ON journaux_audit
     WHEN NEW.action = 'RECEPTION_PROVINCIALE_APPROVISIONNEMENT'
     BEGIN SELECT RAISE(ABORT, 'ECHEC_AUDIT_PHASE5'); END;`,
  );
  baseAvantAudit.close();
  const lignesRollback = detailRollback.donnees.lignes.map((ligne) => ({
    ligne_expedition_id: ligne.id, quantite_recue_physique: 1, quantite_acceptee: 1, quantite_endommagee: 0,
  }));
  const cleEchecAudit = creerCle("audit-rollback-p5");
  const receptionEnEchec = await recevoir(sila, expeditionRollbackAudit.donnees.id, ids.entrepotSila, pvRollback, lignesRollback, cleEchecAudit);
  assert.equal(receptionEnEchec.reponse.status, 500, "Une panne du journal annule complètement la réception provinciale.");
  const baseApresAudit = ouvrirD1Locale();
  try {
    assert.equal(baseApresAudit.prepare("SELECT COUNT(*) AS total FROM receptions_provinciales WHERE expedition_id = ?")
      .get(expeditionRollbackAudit.donnees.id).total, 0);
    assert.equal(baseApresAudit.prepare("SELECT quantite_physique FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?")
      .get(ids.entrepotSila, ids.articleNfi)?.quantite_physique ?? 0, stockSilaAvant);
    assert.equal(baseApresAudit.prepare("SELECT COUNT(*) AS total FROM cles_idempotence WHERE cle = ?")
      .get(cleEchecAudit).total, 0, "La clé idempotente échoue et s’annule avec la transaction.");
    assert.equal(baseApresAudit.prepare("SELECT statut_expedition FROM expeditions WHERE id = ?")
      .get(expeditionRollbackAudit.donnees.id).statut_expedition, "EN_ROUTE");
    baseApresAudit.exec("DROP TRIGGER test_echec_audit_phase5");
  } finally { baseApresAudit.close(); }
  const receptionApresReparation = await recevoir(sila, expeditionRollbackAudit.donnees.id, ids.entrepotSila, pvRollback, lignesRollback, cleEchecAudit);
  assert.equal(receptionApresReparation.reponse.status, 201, "Après retrait du déclencheur de panne, la même clé peut réessayer le lot annulé.");

  const cloture = await central.requete(`/api/central/approvisionnements/${approvisionnement.id}/cloture`, {
    methode: "POST", cleIdempotence: creerCle("cloture-phase5"),
    corps: { observations_cloture: "Réceptions traitées et écarts rapprochés." },
  });
  assert.equal(cloture.reponse.status, 200, JSON.stringify(cloture.donnees));
  const statutCloture = await central.requete(`/api/approvisionnements/${approvisionnement.id}`);
  assert.equal(statutCloture.donnees.statut, "CLOTUREE");

  const detailApresCloture = await sila.requete(`/api/provincial/expeditions/${expeditionComplete.donnees.id}`);
  assert.equal(detailApresCloture.reponse.status, 200);
  assert.equal(detailApresCloture.donnees.pv_piece_jointe_id !== null, true);
  const pvTelecharge = await fetch(new URL(`/api/provincial/expeditions/${expeditionComplete.donnees.id}/pv`, adresseApi), {
    headers: { Cookie: [...sila.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; ") },
  });
  assert.equal(pvTelecharge.status, 200, "Le PV lié à une expédition peut être relu dans le périmètre provincial.");
  assert.equal(pvTelecharge.headers.get("content-type"), "application/pdf");
  const pvHorsProvince = await ouaddai.requete(`/api/provincial/expeditions/${expeditionComplete.donnees.id}/pv`);
  assert.equal(pvHorsProvince.reponse.status, 404, "Le procès-verbal de Sila n’est pas accessible depuis le Ouaddaï.");

  if (process.env.SIGAD_E2E_EXPEDITION_FILE) {
    const operationNavigateur = await creerApprovisionnement(central, corpsApprovisionnement(
      `APP-${suffixe}-NAVIGATEUR`,
      [{ province_id: "prov-sila", articles: [{ article_id: ids.articleNfi, quantite_allouee: 6 }] }],
      { source_articles: "FOURNISSEUR_EXTERNE", partenaire_id: ids.partenaire, nature_aide: "NFI" },
    ));
    await validerApprovisionnement(central, operationNavigateur.id);
    const allocationNavigateur = (await central.requete(`/api/approvisionnements/${operationNavigateur.id}/repartition?limite=10&decalage=0`)).donnees.elements[0];
    const expeditionNavigateur = await creerExpedition(central, operationNavigateur.id, allocationNavigateur.destination_id, null, [{
      article_approvisionnement_id: allocationNavigateur.id,
      quantite_expediee: 6,
      numero_lot_fournisseur: `FOURN-E2E-${suffixe}`,
      date_peremption: null,
    }], `BORD-E2E-${suffixe}`);
    assert.equal(expeditionNavigateur.reponse.status, 201, JSON.stringify(expeditionNavigateur.donnees));
    await writeFile(process.env.SIGAD_E2E_EXPEDITION_FILE, JSON.stringify({
      id: expeditionNavigateur.donnees.id,
      reference_bordereau: `BORD-E2E-${suffixe}`,
      entrepot_recepteur_id: ids.entrepotSila,
      quantite_expediee: 6,
    }), { encoding: "utf8", mode: 0o600 });
  }
});

function ligneReceptionId(receptionId) {
  const base = ouvrirD1Locale();
  try {
    const ligne = base.prepare("SELECT id FROM lignes_reception_provinciale WHERE reception_provinciale_id = ?")
      .get(receptionId);
    assert.ok(ligne, "La ligne reçue est disponible pour rapprochement.");
    return ligne.id;
  } finally { base.close(); }
}
