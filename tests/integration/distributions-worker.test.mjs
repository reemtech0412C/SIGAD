import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
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
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'distributions_provinciales'").get().total === 1) return base;
    base.close();
  }
  throw new Error("La base D1 locale des distributions est introuvable.");
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
      assert.equal(changement.reponse.status, 200, "Le changement initial de mot de passe doit être obligatoire.");
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
  return comptes;
}

function preparerReferentiel(base, suffixe) {
  const ids = {
    departementSila: `dep-p6-sila-${suffixe}`,
    departementOuaddai: `dep-p6-ouaddai-${suffixe}`,
    localiteSila: `loc-p6-sila-${suffixe}`,
    siteSila: `site-p6-sila-${suffixe}`,
    localiteOuaddai: `loc-p6-ouaddai-${suffixe}`,
    entrepotSila: `wh-p6-sila-${suffixe}`,
    entrepotOuaddai: `wh-p6-ouaddai-${suffixe}`,
    articleRiz: `article-p6-riz-${suffixe}`,
    articleCentral: `article-p6-central-${suffixe}`,
    articleRollback: `article-p6-rollback-${suffixe}`,
    lotRizFefo: `lot-p6-riz-fefo-${suffixe}`,
    lotRizSuivant: `lot-p6-riz-suivant-${suffixe}`,
    lotRizPerime: `lot-p6-riz-perime-${suffixe}`,
    lotRizEndommage: `lot-p6-riz-endommage-${suffixe}`,
    lotCentral: `lot-p6-central-${suffixe}`,
    lotRollback: `lot-p6-rollback-${suffixe}`,
    bailleur: `partenaire-p6-bailleur-${suffixe}`,
    execution: `partenaire-p6-execution-${suffixe}`,
    liste: `liste-p6-${suffixe}`,
    menagesSila: [`menage-p6-sila-1-${suffixe}`, `menage-p6-sila-2-${suffixe}`, `menage-p6-sila-3-${suffixe}`],
    menageOuaddai: `menage-p6-ouaddai-${suffixe}`,
  };
  const date = new Date().toISOString().slice(0, 10);
  base.exec("BEGIN IMMEDIATE");
  try {
    base.prepare("INSERT INTO departements (id, province_id, code, nom, chef_lieu, actif) VALUES (?, ?, ?, ?, ?, 1)")
      .run(ids.departementSila, "prov-sila", `P6-S-${suffixe}`, "Département synthétique Phase 6 de Sila", "Goz Beïda");
    base.prepare("INSERT INTO departements (id, province_id, code, nom, chef_lieu, actif) VALUES (?, ?, ?, ?, ?, 1)")
      .run(ids.departementOuaddai, "prov-ouaddai", `P6-O-${suffixe}`, "Département synthétique Phase 6 du Ouaddaï", "Abéché");
    const insererLocalite = base.prepare(
      `INSERT INTO localites (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation, source_documentation, date_effet)
       VALUES (?, ?, ?, ?, 'VILLAGE', 'AUCUN', 'VALIDE', 'Donnée synthétique de test local', ?)`,
    );
    insererLocalite.run(ids.localiteSila, "prov-sila", ids.departementSila, "Localité synthétique Sila", date);
    insererLocalite.run(ids.localiteOuaddai, "prov-ouaddai", ids.departementOuaddai, "Localité synthétique Ouaddaï", date);
    base.prepare(
      `INSERT INTO sites_humanitaires (id, province_id, departement_id, code_site, nom, categorie_site, statut_validation)
       VALUES (?, 'prov-sila', ?, ?, 'Site humanitaire synthétique Sila', 'SITE_DEPLACES', 'VALIDE')`,
    ).run(ids.siteSila, ids.departementSila, `S-P6-${suffixe}`);
    const insererEntrepot = base.prepare(
      "INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id, actif) VALUES (?, ?, ?, 'PROVINCIAL', ?, 1)",
    );
    insererEntrepot.run(ids.entrepotSila, `WH-P6-S-${suffixe}`, "Entrepôt synthétique Sila Phase 6", "prov-sila");
    insererEntrepot.run(ids.entrepotOuaddai, `WH-P6-O-${suffixe}`, "Entrepôt synthétique Ouaddaï Phase 6", "prov-ouaddai");
    base.prepare("INSERT INTO categories_population (id, code, libelle) VALUES (?, ?, ?)")
      .run(`cat-p6-${suffixe}`, `P6-${suffixe}`, "Catégorie synthétique de test");
    const insererArticle = base.prepare(
      "INSERT INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, perissable, actif) VALUES (?, ?, ?, 'cat-alimentaire', ?, 1, 1)",
    );
    insererArticle.run(ids.articleRiz, `P6-RIZ-${suffixe}`, "Riz synthétique Phase 6", "unit-kg");
    insererArticle.run(ids.articleCentral, `P6-CENTRAL-${suffixe}`, "Farine issue d’un approvisionnement central synthétique", "unit-litre");
    insererArticle.run(ids.articleRollback, `P6-ROLLBACK-${suffixe}`, "Article de test de retour transactionnel", "unit-kg");
    const insererLot = base.prepare(
      `INSERT INTO lots_stock (id, numero_lot, article_id, entrepot_id, province_id, source_type,
       source_reference_id, date_peremption, etat_qualite, quantite_initiale, quantite_physique, quantite_reservee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    insererLot.run(ids.lotRizFefo, `P6-FEFO-${suffixe}`, ids.articleRiz, ids.entrepotSila, "prov-sila", "STOCK_INITIAL", null, "2026-12-01", "BON", 3, 3);
    insererLot.run(ids.lotRizSuivant, `P6-SUIVANT-${suffixe}`, ids.articleRiz, ids.entrepotSila, "prov-sila", "STOCK_INITIAL", null, "2027-01-01", "BON", 60, 60);
    insererLot.run(ids.lotRizPerime, `P6-PERIME-${suffixe}`, ids.articleRiz, ids.entrepotSila, "prov-sila", "STOCK_INITIAL", null, "2026-01-01", "PERIME", 50, 50);
    insererLot.run(ids.lotRizEndommage, `P6-ENDOMMAGE-${suffixe}`, ids.articleRiz, ids.entrepotSila, "prov-sila", "STOCK_INITIAL", null, "2027-06-01", "ENDOMMAGE", 50, 50);
    insererLot.run(ids.lotCentral, `P6-CENTRAL-${suffixe}`, ids.articleCentral, ids.entrepotSila, "prov-sila", "APPROVISIONNEMENT_CENTRAL", `approvisionnement-synthetique-${suffixe}`, "2027-03-01", "BON", 10, 10);
    insererLot.run(ids.lotRollback, `P6-ROLLBACK-${suffixe}`, ids.articleRollback, ids.entrepotSila, "prov-sila", "STOCK_INITIAL", null, "2027-04-01", "BON", 5, 5);
    insererLot.run(`lot-p6-riz-ouaddai-${suffixe}`, `P6-O-RIZ-${suffixe}`, ids.articleRiz, ids.entrepotOuaddai, "prov-ouaddai", "STOCK_INITIAL", null, "2027-05-01", "BON", 20, 20);
    const insererPartenaire = base.prepare(
      `INSERT INTO partenaires (id, code, nom, sigle, type_organisation, statut_validation, valide_par)
       VALUES (?, ?, ?, ?, 'Partenaire synthétique de test', 'VALIDE', 'usr-central')`,
    );
    insererPartenaire.run(ids.bailleur, `P6-B-${suffixe}`, `Bailleur synthétique ${suffixe}`, `B${suffixe.slice(0, 5)}`);
    insererPartenaire.run(ids.execution, `P6-E-${suffixe}`, `Partenaire d’exécution synthétique ${suffixe}`, `E${suffixe.slice(0, 5)}`);
    base.prepare("INSERT INTO roles_partenaires (id, partenaire_id, role) VALUES (?, ?, ?)")
      .run(`role-p6-b-${suffixe}`, ids.bailleur, "BAILLEUR_DE_FONDS");
    base.prepare("INSERT INTO roles_partenaires (id, partenaire_id, role) VALUES (?, ?, ?)")
      .run(`role-p6-e-${suffixe}`, ids.execution, "PARTENAIRE_EXECUTION");
    const insererMenage = base.prepare(
      `INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, site_humanitaire_id,
       nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id, date_enregistrement, statut, cree_par)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'F', 4, ?, ?, 'ACTIF', ?)`,
    );
    insererMenage.run(ids.menagesSila[0], `P6-S-01-${suffixe}`, "prov-sila", ids.departementSila, ids.localiteSila, null,
      "Ménage synthétique A", `cat-p6-${suffixe}`, date, "usr-sila");
    insererMenage.run(ids.menagesSila[1], `P6-S-02-${suffixe}`, "prov-sila", ids.departementSila, ids.localiteSila, null,
      "Ménage synthétique B", `cat-p6-${suffixe}`, date, "usr-sila");
    insererMenage.run(ids.menagesSila[2], `P6-S-03-${suffixe}`, "prov-sila", ids.departementSila, null, ids.siteSila,
      "Ménage synthétique C", `cat-p6-${suffixe}`, date, "usr-sila");
    insererMenage.run(ids.menageOuaddai, `P6-O-01-${suffixe}`, "prov-ouaddai", ids.departementOuaddai, ids.localiteOuaddai, null,
      "Ménage synthétique Ouaddaï", `cat-p6-${suffixe}`, date, "usr-ouaddai");
    base.prepare(
      `INSERT INTO listes_beneficiaires (id, reference_liste, intitule, province_id, nombre_menages_cibles,
       nombre_personnes_cibles, statut, cree_par) VALUES (?, ?, ?, 'prov-sila', 3, 12, 'PRETE', 'usr-sila')`,
    ).run(ids.liste, `LISTE-P6-${suffixe}`, `Liste synthétique Phase 6 ${suffixe}`);
    const inscrire = base.prepare("INSERT INTO inscriptions_beneficiaires (id, liste_id, menage_id, ordre_affichage, statut_verification) VALUES (?, ?, ?, ?, 'VALIDE')");
    ids.menagesSila.forEach((menageId, index) => inscrire.run(`inscription-p6-${suffixe}-${index}`, ids.liste, menageId, index + 1));
    base.exec("COMMIT");
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
  return ids;
}

function construirePlan(ids, suffixe, options = {}) {
  const provinceOuaddai = options.provinceOuaddai === true;
  const menages = provinceOuaddai ? [ids.menageOuaddai] : ids.menagesSila;
  const departement = provinceOuaddai ? ids.departementOuaddai : ids.departementSila;
  const entrepot = provinceOuaddai ? ids.entrepotOuaddai : ids.entrepotSila;
  const zones = provinceOuaddai
    ? [{ localite_id: ids.localiteOuaddai, nom_site_distribution: "Localité synthétique du Ouaddaï" }]
    : [
      { localite_id: ids.localiteSila, nom_site_distribution: "Village synthétique de Sila" },
      { site_humanitaire_id: ids.siteSila, nom_site_distribution: "Site humanitaire synthétique de Sila" },
    ];
  const articles = options.articles ?? [
    { article_id: ids.articleRiz, source_approvisionnement: "STOCK_EXISTANT", ration_par_menage: 2 },
    { article_id: ids.articleCentral, source_approvisionnement: "APPROVISIONNEMENT_CENTRAL", ration_par_menage: 1 },
  ];
  return {
    intitule_distribution: `Distribution synthétique ${suffixe}`,
    departement_id: departement,
    nature_aide: "ALIMENTAIRE",
    bailleur_fonds_id: provinceOuaddai ? null : ids.bailleur,
    partenaire_execution_id: provinceOuaddai ? null : ids.execution,
    objectif: "Scénario synthétique d’intégration locale de la Phase 6.",
    date_prevue: new Date().toISOString().slice(0, 10),
    entrepot_id: entrepot,
    liste_beneficiaires_id: provinceOuaddai || options.liste_beneficiaires_id === null ? null : ids.liste,
    observations: "Données synthétiques : aucun référentiel géographique non vérifié n’est utilisé.",
    zones,
    articles,
    menages: menages.map((menage_id, index) => ({ menage_id, index_zone: provinceOuaddai || index < 2 ? 0 : 1 })),
  };
}

async function creerDistribution(client, plan) {
  const resultat = await client.requete("/api/distributions", {
    methode: "POST", cleIdempotence: creerCle("distribution-p6"), corps: plan,
  });
  assert.equal(resultat.reponse.status, 201, JSON.stringify(resultat.donnees));
  return resultat.donnees;
}

async function passerEnPreparation(client, distributionId) {
  const resultat = await client.requete(`/api/distributions/${distributionId}/preparation`, {
    methode: "POST", cleIdempotence: creerCle("preparation-p6"), corps: {},
  });
  assert.equal(resultat.reponse.status, 200, JSON.stringify(resultat.donnees));
}

async function lireMenages(client, distributionId) {
  const resultat = await client.requete(`/api/distributions/${distributionId}/menages?limite=100&decalage=0`);
  assert.equal(resultat.reponse.status, 200);
  return resultat.donnees.elements;
}

async function valider(client, distributionId, cle = creerCle("validation-p6")) {
  return client.requete(`/api/distributions/${distributionId}/validation`, {
    methode: "POST", cleIdempotence: cle, corps: {},
  });
}

test("Cycle de distribution provinciale avec isolation, FEFO, atomicité, remises et clôture dans Wrangler local", async (t) => {
  const base = ouvrirD1Locale();
  const suffixe = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const ids = preparerReferentiel(base, suffixe);
  const comptes = await ouvrirSessions(base);
  base.close();
  const sila = comptes.sila;
  const ouaddai = comptes.ouaddai;
  const central = comptes.central;

  const tentativeSansCsrf = await sila.requete("/api/distributions", {
    methode: "POST", csrf: false, cleIdempotence: creerCle("sans-csrf-p6"), corps: construirePlan(ids, suffixe),
  });
  await t.test("CSRF, RBAC et séparation stricte Sila/Ouaddaï", async () => {
    assert.equal(tentativeSansCsrf.reponse.status, 403, "Une écriture sans jeton CSRF doit être refusée.");
    const distributionOuaddai = await creerDistribution(ouaddai, construirePlan(ids, `${suffixe}-OUADDAI`, { provinceOuaddai: true }));
    const lectureCroisee = await sila.requete(`/api/distributions/${distributionOuaddai.id}`);
    assert.equal(lectureCroisee.reponse.status, 404, "Un délégué de Sila ne doit pas découvrir une distribution du Ouaddaï.");
    const filtreCroise = await sila.requete("/api/distributions?province_id=prov-ouaddai");
    assert.equal(filtreCroise.reponse.status, 403, "Le filtre provincial d’un délégué ne peut pas sortir de sa session.");
    const corpsProvince = { ...construirePlan(ids, `${suffixe}-INJECTION`), province_id: "prov-ouaddai" };
    const injection = await sila.requete("/api/distributions", {
      methode: "POST", cleIdempotence: creerCle("province-injection-p6"), corps: corpsProvince,
    });
    assert.equal(injection.reponse.status, 400, "Le corps strict ne doit accepter aucun province_id fourni par le client.");
    const donneesOuaddai = construirePlan(ids, `${suffixe}-CROISE`, { provinceOuaddai: true });
    const creationCroisee = await sila.requete("/api/distributions", {
      methode: "POST", cleIdempotence: creerCle("creation-croisee-p6"), corps: donneesOuaddai,
    });
    assert.equal(creationCroisee.reponse.status, 403, "Les ménages, dépôts et départements d’une autre province doivent être refusés.");
    const validationCentrale = await central.requete(`/api/distributions/${distributionOuaddai.id}/validation`, {
      methode: "POST", cleIdempotence: creerCle("central-validation-p6"), corps: {},
    });
    assert.equal(validationCentrale.reponse.status, 403, "L’administration centrale ne valide pas une distribution provinciale.");
    const clotureDelegue = await sila.requete(`/api/central/distributions/${distributionOuaddai.id}/cloture`, {
      methode: "POST", cleIdempotence: creerCle("delegate-close-p6"), corps: { observations_finales: null },
    });
    assert.equal(clotureDelegue.reponse.status, 403, "Un délégué ne peut appeler une fonction de clôture centrale.");
  });

  const plan = construirePlan(ids, suffixe);
  const brouillon = await creerDistribution(sila, plan);
  await t.test("Création autonome, partenariats, liste et plusieurs zones", async () => {
    assert.equal(brouillon.statut, "BROUILLON");
    const detail = await sila.requete(`/api/distributions/${brouillon.id}`);
    assert.equal(detail.reponse.status, 200);
    assert.equal(detail.donnees.province_id, "prov-sila");
    assert.equal(detail.donnees.zones.length, 2, "La localité et le site humanitaire restent deux zones distinctes.");
    assert.equal(detail.donnees.bailleur_fonds_id, ids.bailleur);
    assert.equal(detail.donnees.partenaire_execution_id, ids.execution);
    assert.equal(detail.donnees.liste_beneficiaires_id, ids.liste);
  });

  await passerEnPreparation(sila, brouillon.id);
  const menages = await lireMenages(sila, brouillon.id);
  const menageA = menages.find((menage) => menage.code_menage.startsWith(`P6-S-01-${suffixe}`));
  const menageB = menages.find((menage) => menage.code_menage.startsWith(`P6-S-02-${suffixe}`));
  const menageC = menages.find((menage) => menage.code_menage.startsWith(`P6-S-03-${suffixe}`));
  assert.ok(menageA && menageB && menageC);
  const cleValidation = creerCle("validation-rejeu-p6");
  const validation = await valider(sila, brouillon.id, cleValidation);
  await t.test("Validation FEFO, exclusion des lots impropres, snapshot et rejeu idempotent", async () => {
    assert.equal(validation.reponse.status, 200, JSON.stringify(validation.donnees));
    assert.equal(validation.donnees.statut, "VALIDEE_PROVINCE");
    const rejouee = await valider(sila, brouillon.id, cleValidation);
    assert.equal(rejouee.reponse.status, 200);
    assert.equal(rejouee.reponse.headers.get("Idempotency-Replayed"), "true");
    const baseControle = ouvrirD1Locale();
    const reservationFefo = baseControle.prepare("SELECT SUM(quantite_reservee) AS total FROM reservations_stock WHERE distribution_id = ? AND lot_stock_id = ?").get(brouillon.id, ids.lotRizFefo).total;
    const reservationSuivant = baseControle.prepare("SELECT SUM(quantite_reservee) AS total FROM reservations_stock WHERE distribution_id = ? AND lot_stock_id = ?").get(brouillon.id, ids.lotRizSuivant).total;
    const reservationPerime = baseControle.prepare("SELECT COUNT(*) AS total FROM reservations_stock WHERE distribution_id = ? AND lot_stock_id = ?").get(brouillon.id, ids.lotRizPerime).total;
    const reservationEndommage = baseControle.prepare("SELECT COUNT(*) AS total FROM reservations_stock WHERE distribution_id = ? AND lot_stock_id = ?").get(brouillon.id, ids.lotRizEndommage).total;
    const snapshot = baseControle.prepare("SELECT snapshot_plan_json FROM validations_distribution WHERE distribution_id = ?").get(brouillon.id);
    assert.equal(reservationFefo, 3, "Le lot valide à échéance la plus proche doit être consommé en premier.");
    assert.equal(reservationSuivant, 3, "Le reliquat doit provenir du lot valide suivant.");
    assert.equal(reservationPerime, 0, "Aucun lot périmé ne doit être réservé.");
    assert.equal(reservationEndommage, 0, "Aucun lot endommagé ne doit être réservé.");
    assert.ok(snapshot?.snapshot_plan_json.includes(ids.siteSila), "Le snapshot doit conserver la zone humanitaire ciblée.");
    baseControle.close();

    const kpiApresReservation = await central.requete(`/api/rapports/indicateurs-carte?article_id=${encodeURIComponent(ids.articleRiz)}`);
    assert.equal(kpiApresReservation.reponse.status, 200, JSON.stringify(kpiApresReservation.donnees));
    const stockReserve = kpiApresReservation.donnees.provinces.find((province) => province.province_id === "prov-sila")?.stocks_disponibles;
    assert.equal(stockReserve?.valeur, 57, "Le stock cartographique retire les 6 kg réservés et exclut 100 kg impropres.");
    assert.equal(stockReserve?.etat, "DISPONIBLE");
    assert.equal(stockReserve?.unite_code, "KG");
    console.info("UI-MAP 1.6 — stock après réservation: attendu 57 kg, obtenu 57 kg; état DISPONIBLE.");
    const kpiStockLitres = await central.requete(`/api/rapports/indicateurs-carte?article_id=${encodeURIComponent(ids.articleCentral)}`);
    assert.equal(kpiStockLitres.reponse.status, 200, JSON.stringify(kpiStockLitres.donnees));
    const stockLitres = kpiStockLitres.donnees.provinces.find((province) => province.province_id === "prov-sila")?.stocks_disponibles;
    assert.equal(stockLitres?.valeur, 7, "Le stock du second article exclut ses 3 litres réservés et n’additionne aucun kilogramme.");
    assert.equal(stockLitres?.unite_code, "LITRE");
    assert.equal(stockLitres?.unite_libelle, "Litre");
    console.info("UI-MAP 1.6 — unités hétérogènes: riz 57 KG et farine 7 LITRE après réservation, agrégats séparés par article.");
  });

  await t.test("Remise complète, dépassement, idempotence et conflit de contenu", async () => {
    const execution = await sila.requete(`/api/distributions/${brouillon.id}/execution`, { methode: "POST", cleIdempotence: creerCle("execution-p6"), corps: {} });
    assert.equal(execution.reponse.status, 200, JSON.stringify(execution.donnees));
    const kpiEnExecution = await central.requete("/api/rapports/indicateurs-carte?date_debut=2026-10-01&date_fin=2026-10-31");
    assert.equal(kpiEnExecution.reponse.status, 200, JSON.stringify(kpiEnExecution.donnees));
    const silaEnExecution = kpiEnExecution.donnees.provinces.find((province) => province.province_id === "prov-sila");
    assert.equal(silaEnExecution?.distributions_realisees.valeur, 0);
    assert.equal(silaEnExecution?.distributions_en_cours.valeur, 1, "Une distribution passée à EN_EXECUTION est comptée une fois.");
    assert.equal(silaEnExecution?.menages_servis.valeur, 0, "Un plan démarré sans remise positive ne prouve aucun ménage servi.");
    const kpiExecutionHorsPeriode = await central.requete("/api/rapports/indicateurs-carte?date_debut=2020-01-01&date_fin=2020-01-31");
    assert.equal(kpiExecutionHorsPeriode.reponse.status, 200);
    assert.equal(kpiExecutionHorsPeriode.donnees.provinces.find((province) => province.province_id === "prov-sila")?.distributions_en_cours.valeur,
      1, "Le KPI en cours est une photographie et ne varie pas selon la période historique.");
    console.info("UI-MAP 1.6 — distribution en exécution: attendu 0 réalisée / 1 en cours / 0 ménage servi, valeurs identiques à l’API; période historique: 1 en cours.");
    const allocationsA = await sila.requete(`/api/distributions/${brouillon.id}/menages/${menageA.id}/allocations`);
    assert.equal(allocationsA.reponse.status, 200);
    const allocationRizA = allocationsA.donnees.find((allocation) => allocation.article_id === ids.articleRiz);
    const allocationCentralA = allocationsA.donnees.find((allocation) => allocation.article_id === ids.articleCentral);
    const remiseA = {
      menage_distribution_id: menageA.id,
      date_remise: new Date().toISOString().slice(0, 10),
      identite_recepteur: "Récepteur synthétique A",
      statut_service: "SERVI",
      lignes: [
        { allocation_id: allocationRizA.id, quantite_remise: 2 },
        { allocation_id: allocationCentralA.id, quantite_remise: 1 },
      ],
    };
    const depassement = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: creerCle("depassement-p6"), corps: { ...remiseA, lignes: [{ allocation_id: allocationRizA.id, quantite_remise: 2.001 }] },
    });
    assert.equal(depassement.reponse.status, 409, "Une remise ne peut dépasser l’allocation.");
    const cleRemise = creerCle("remise-rejeu-p6");
    const remise = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: cleRemise, corps: remiseA,
    });
    assert.equal(remise.reponse.status, 201, JSON.stringify(remise.donnees));
    const rejeu = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: cleRemise, corps: remiseA,
    });
    assert.equal(rejeu.reponse.status, 201);
    assert.equal(rejeu.reponse.headers.get("Idempotency-Replayed"), "true");
    const autreContenu = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: cleRemise, corps: { ...remiseA, identite_recepteur: "Contenu différent" },
    });
    assert.equal(autreContenu.reponse.status, 409, "Une clé existante ne peut pas être réutilisée pour un contenu différent.");
  });

  await t.test("Remise partielle concurrente, ménage absent et absence de double débit", async () => {
    const allocationsBResultat = await sila.requete(`/api/distributions/${brouillon.id}/menages/${menageB.id}/allocations`);
    const allocationRizB = allocationsBResultat.donnees.find((allocation) => allocation.article_id === ids.articleRiz);
    const allocationCentralB = allocationsBResultat.donnees.find((allocation) => allocation.article_id === ids.articleCentral);
    const partielle = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: creerCle("partielle-p6"), corps: {
        menage_distribution_id: menageB.id, date_remise: new Date().toISOString().slice(0, 10),
        identite_recepteur: "Récepteur synthétique B", statut_service: "PARTIELLEMENT_SERVI",
        lignes: [{ allocation_id: allocationRizB.id, quantite_remise: 1 }, { allocation_id: allocationCentralB.id, quantite_remise: 0.5 }],
      },
    });
    assert.equal(partielle.reponse.status, 201, JSON.stringify(partielle.donnees));
    const suiteRemise = {
      menage_distribution_id: menageB.id, date_remise: new Date().toISOString().slice(0, 10),
      identite_recepteur: "Récepteur synthétique B", statut_service: "SERVI",
      lignes: [{ allocation_id: allocationRizB.id, quantite_remise: 1 }, { allocation_id: allocationCentralB.id, quantite_remise: 0.5 }],
    };
    const courses = await Promise.all([
      sila.requete(`/api/distributions/${brouillon.id}/remises`, { methode: "POST", cleIdempotence: creerCle("concurrence-a-p6"), corps: suiteRemise }),
      sila.requete(`/api/distributions/${brouillon.id}/remises`, { methode: "POST", cleIdempotence: creerCle("concurrence-b-p6"), corps: suiteRemise }),
    ]);
    assert.deepEqual(courses.map((resultat) => resultat.reponse.status).sort(), [201, 409], "Une seule des deux opérations concurrentes doit réussir.");
    const absent = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: creerCle("absent-p6"), corps: {
        menage_distribution_id: menageC.id, date_remise: new Date().toISOString().slice(0, 10),
        identite_recepteur: "Aucun : ménage absent", statut_service: "ABSENT", motif_non_service: "Ménage absent lors du passage.", lignes: [],
      },
    });
    assert.equal(absent.reponse.status, 201, JSON.stringify(absent.donnees));
    const baseControle = ouvrirD1Locale();
    const sorties = baseControle.prepare("SELECT SUM(quantite) AS total FROM mouvements_stock WHERE type_mouvement = 'SORTIE_DISTRIBUTION' AND document_source_type = 'REMISE_DISTRIBUTION' AND lot_stock_id = ? AND document_source_id IN (SELECT id FROM remises_distribution WHERE distribution_id = ?)").get(ids.lotRizFefo, brouillon.id).total;
    const bilan = baseControle.prepare(
      `SELECT (SELECT SUM(quantite_physique) FROM lots_stock WHERE entrepot_id = l.entrepot_id AND article_id = l.article_id) AS quantite_physique,
        (SELECT SUM(quantite_reservee) FROM lots_stock WHERE entrepot_id = l.entrepot_id AND article_id = l.article_id) AS quantite_reservee,
        s.quantite_physique AS solde_physique, s.quantite_reservee AS solde_reservee
       FROM lots_stock l JOIN soldes_stock s ON s.entrepot_id = l.entrepot_id AND s.article_id = l.article_id WHERE l.id = ?`,
    ).get(ids.lotRizFefo);
    assert.equal(sorties, 3, "Les mouvements de sortie restent égaux aux remises effectivement consommées sur le premier lot.");
    assert.equal(bilan.quantite_physique, bilan.solde_physique);
    assert.equal(bilan.quantite_reservee, bilan.solde_reservee, "Le total réservé des lots reste égal au solde consolidé.");
    const historisations = baseControle.prepare("SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'REMISE_DISTRIBUTION' AND entite_id = ?").get(brouillon.id).total;
    assert.equal(historisations, 4, "Les quatre remises, y compris l’absence constatée, sont auditées; le conflit concurrent n’en crée pas.");
    baseControle.close();
  });

  await t.test("Déclaration, retour sans réécriture des remises, validation centrale et clôture avec libération", async () => {
    const sansPv = await sila.requete(`/api/distributions/${brouillon.id}/declaration-fin`, {
      methode: "POST", cleIdempotence: creerCle("fin-sans-pv-p6"), corps: { observations: null },
    });
    assert.equal(sansPv.reponse.status, 400, "Le procès-verbal est requis avant la déclaration de fin.");
    const formulaireUsurpe = new FormData();
    formulaireUsurpe.set("fichier", new Blob(["contenu qui n’est pas un PDF"], { type: "application/pdf" }), "faux.pdf");
    const usurpation = await sila.requete(`/api/distributions/${brouillon.id}/pv`, {
      methode: "POST", cleIdempotence: creerCle("pv-usurpe-p6"), corps: formulaireUsurpe,
    });
    assert.equal(usurpation.reponse.status, 400, "Un fichier qui déclare un PDF sans signature PDF doit être refusé.");
    const formulaire = new FormData();
    formulaire.set("fichier", new Blob(["%PDF-1.4\nProcès-verbal synthétique Phase 6\n%%EOF"], { type: "application/pdf" }), "pv-phase6.pdf");
    const pv = await sila.requete(`/api/distributions/${brouillon.id}/pv`, {
      methode: "POST", cleIdempotence: creerCle("pv-p6"), corps: formulaire,
    });
    assert.equal(pv.reponse.status, 201, JSON.stringify(pv.donnees));
    const declaration = await sila.requete(`/api/distributions/${brouillon.id}/declaration-fin`, {
      methode: "POST", cleIdempotence: creerCle("fin-p6"), corps: { observations: "Bilan synthétique vérifié." },
    });
    assert.equal(declaration.reponse.status, 200, JSON.stringify(declaration.donnees));
    const remiseApresFin = await sila.requete(`/api/distributions/${brouillon.id}/remises`, {
      methode: "POST", cleIdempotence: creerCle("apres-fin-p6"), corps: {
        menage_distribution_id: menageC.id, date_remise: new Date().toISOString().slice(0, 10),
        identite_recepteur: "Aucun : ménage non servi", statut_service: "NON_SERVI", motif_non_service: "La période de distribution est achevée.", lignes: [],
      },
    });
    assert.equal(remiseApresFin.reponse.status, 409, "Aucune nouvelle remise ne peut suivre la déclaration de fin.");
    const baseAvantRetour = ouvrirD1Locale();
    const nombreRemisesAvant = baseAvantRetour.prepare("SELECT COUNT(*) AS total FROM remises_distribution WHERE distribution_id = ?").get(brouillon.id).total;
    const sortiesAvantCorrection = baseAvantRetour.prepare(
      "SELECT COUNT(*) AS total FROM mouvements_stock WHERE document_source_type = 'REMISE_DISTRIBUTION' AND document_source_id IN (SELECT id FROM remises_distribution WHERE distribution_id = ?)",
    ).get(brouillon.id).total;
    baseAvantRetour.close();
    const retour = await central.requete(`/api/central/distributions/${brouillon.id}/retour-correction`, {
      methode: "POST", cleIdempotence: creerCle("retour-p6"), corps: {
        motif_retour: "Préciser les observations de terrain avant la clôture.", elements_a_corriger: ["observations"],
      },
    });
    assert.equal(retour.reponse.status, 200, JSON.stringify(retour.donnees));
    const kpiEnCorrection = await central.requete("/api/rapports/indicateurs-carte?date_debut=2026-10-01&date_fin=2026-10-31");
    assert.equal(kpiEnCorrection.reponse.status, 200);
    const silaEnCorrection = kpiEnCorrection.donnees.provinces.find((province) => province.province_id === "prov-sila");
    assert.equal(silaEnCorrection?.distributions_realisees.valeur, 0);
    assert.equal(silaEnCorrection?.distributions_en_cours.valeur, 1, "Le retour en correction ne clôt pas l’opération déjà démarrée.");
    assert.equal(silaEnCorrection?.menages_servis.valeur, 2, "Deux ménages avec remise positive restent comptés malgré la correction documentaire.");
    console.info("UI-MAP 1.6 — retour pour correction: attendu 0 réalisée / 1 en cours / 2 ménages uniques servis, valeurs identiques à l’API.");
    const fermeturePrematuree = await central.requete(`/api/central/distributions/${brouillon.id}/cloture`, {
      methode: "POST", cleIdempotence: creerCle("cloture-prematuree-p6"), corps: { observations_finales: null },
    });
    assert.equal(fermeturePrematuree.reponse.status, 409, "La clôture est bloquée pendant une correction ouverte.");
    const reponseCorrection = await sila.requete(`/api/distributions/${brouillon.id}/corrections`, {
      methode: "POST", cleIdempotence: creerCle("reponse-correction-p6"), corps: {
        reponse_delegue: "Les observations ont été complétées sur la base du procès-verbal.",
        corrections: { observations: "Bilan complété après revue du procès-verbal." },
      },
    });
    assert.equal(reponseCorrection.reponse.status, 200, JSON.stringify(reponseCorrection.donnees));
    const correctionId = reponseCorrection.donnees.demande_correction_id;
    const validationCorrection = await central.requete(`/api/central/distributions/${brouillon.id}/corrections/${correctionId}/validation`, {
      methode: "POST", cleIdempotence: creerCle("validation-correction-p6"), corps: {},
    });
    assert.equal(validationCorrection.reponse.status, 200, JSON.stringify(validationCorrection.donnees));
    const baseApresCorrection = ouvrirD1Locale();
    assert.equal(baseApresCorrection.prepare("SELECT COUNT(*) AS total FROM remises_distribution WHERE distribution_id = ?").get(brouillon.id).total,
      nombreRemisesAvant, "Le traitement d’une correction conserve toutes les remises déjà enregistrées.");
    assert.equal(baseApresCorrection.prepare(
      "SELECT COUNT(*) AS total FROM mouvements_stock WHERE document_source_type = 'REMISE_DISTRIBUTION' AND document_source_id IN (SELECT id FROM remises_distribution WHERE distribution_id = ?)",
    ).get(brouillon.id).total, sortiesAvantCorrection, "Une correction de données ne réémet aucun mouvement de sortie de stock.");
    const traceCorrection = JSON.parse(baseApresCorrection.prepare(
      "SELECT elements_a_corriger FROM demandes_correction WHERE id = ?",
    ).get(correctionId).elements_a_corriger);
    assert.equal(traceCorrection.valeurs_originales.observations, "Bilan synthétique vérifié.");
    assert.equal(traceCorrection.valeurs_corrigees.observations, "Bilan complété après revue du procès-verbal.");
    baseApresCorrection.close();
    const observationCreee = await central.requete("/api/central/controle/observations", {
      methode: "POST", cleIdempotence: creerCle("observation-critique-p7"), corps: {
        operation_type: "DISTRIBUTION_PROVINCIALE", operation_id: brouillon.id,
        province_id: "prov-sila", niveau_gravite: "CRITIQUE",
        observation: "Vérifier le rapprochement des documents avant la clôture centrale.",
      },
    });
    assert.equal(observationCreee.reponse.status, 201, JSON.stringify(observationCreee.donnees));
    const observationId = observationCreee.donnees.id;
    const reponseCroisee = await ouaddai.requete(`/api/provincial/observations/${observationId}/reponse`, {
      methode: "POST", cleIdempotence: creerCle("observation-croisee-p7"), corps: { reponse_delegue: "Réponse hors périmètre de Sila." },
    });
    assert.equal(reponseCroisee.reponse.status, 404, "La délégation du Ouaddaï ne peut répondre à une observation de Sila.");
    const clotureParDelegue = await sila.requete(`/api/central/controle/observations/${observationId}/cloture`, {
      methode: "POST", cleIdempotence: creerCle("observation-rbac-p7"), corps: { statut: "TRAITEE", decision: "Décision interdite." },
    });
    assert.equal(clotureParDelegue.reponse.status, 403, "La délégation ne possède pas le droit de clôture centrale.");
    const baseObservation = ouvrirD1Locale();
    assert.throws(() => baseObservation.prepare("UPDATE observations_controle SET observation = 'Texte modifié' WHERE id = ?").run(observationId), /OBSERVATION_CONTROLE_IMMUABLE/u);
    baseObservation.close();
    const reponseObservation = await sila.requete(`/api/provincial/observations/${observationId}/reponse`, {
      methode: "POST", cleIdempotence: creerCle("observation-reponse-p7"),
      corps: { reponse_delegue: "Les pièces justificatives ont été vérifiées par notre équipe." },
    });
    assert.equal(reponseObservation.reponse.status, 200, JSON.stringify(reponseObservation.donnees));
    const blocageObservationCritique = await central.requete(`/api/central/distributions/${brouillon.id}/cloture`, {
      methode: "POST", cleIdempotence: creerCle("cloture-obs-critique-p7"), corps: { observations_finales: null },
    });
    assert.equal(blocageObservationCritique.reponse.status, 409, "Une observation critique ouverte liée à la distribution bloque la clôture.");
    const clotureObservation = await central.requete(`/api/central/controle/observations/${observationId}/cloture`, {
      methode: "POST", cleIdempotence: creerCle("observation-cloture-p7"),
      corps: { statut: "TRAITEE", decision: "Réponse vérifiée et pièces rapprochées." },
    });
    assert.equal(clotureObservation.reponse.status, 200, JSON.stringify(clotureObservation.donnees));
    const observationInformation = await central.requete("/api/central/controle/observations", {
      methode: "POST", cleIdempotence: creerCle("observation-info-ouverte-p7"), corps: {
        operation_type: "DISTRIBUTION_PROVINCIALE", operation_id: brouillon.id,
        province_id: "prov-sila", niveau_gravite: "INFO",
        observation: "Archiver la copie du procès-verbal dans le dossier annuel.",
      },
    });
    assert.equal(observationInformation.reponse.status, 201, JSON.stringify(observationInformation.donnees));
    const fermeture = await central.requete(`/api/central/distributions/${brouillon.id}/cloture`, {
      methode: "POST", cleIdempotence: creerCle("cloture-p6"), corps: { observations_finales: "Écart de reliquat libéré après rapprochement." },
    });
    assert.equal(fermeture.reponse.status, 200, JSON.stringify(fermeture.donnees));
    assert.equal(observationInformation.donnees.statut, "OUVERTE", "Une observation informative reste ouverte sans bloquer la clôture.");
    assert.equal(fermeture.donnees.statut, "CLOTUREE_CENTRAL");
    const kpiCloture = await central.requete(`/api/rapports/indicateurs-carte?date_debut=2026-10-01&date_fin=2026-10-31&article_id=${encodeURIComponent(ids.articleRiz)}`);
    assert.equal(kpiCloture.reponse.status, 200, JSON.stringify(kpiCloture.donnees));
    const silaCloture = kpiCloture.donnees.provinces.find((province) => province.province_id === "prov-sila");
    const ouaddaiCloture = kpiCloture.donnees.provinces.find((province) => province.province_id === "prov-ouaddai");
    assert.equal(silaCloture?.distributions_realisees.valeur, 1);
    assert.equal(silaCloture?.distributions_en_cours.valeur, 0);
    assert.equal(silaCloture?.menages_servis.valeur, 2, "Le ménage servi deux fois ne compte qu’une fois et la remise partielle reste une preuve.");
    assert.equal(silaCloture?.stocks_disponibles.valeur, 59, "Le stock net après 4 kg remis et 2 kg de réservation libérés vaut 59 kg.");
    assert.equal(silaCloture?.stocks_disponibles.unite_code, "KG");
    assert.equal(ouaddaiCloture?.distributions_realisees.valeur, 0);
    assert.equal(ouaddaiCloture?.distributions_en_cours.valeur, 0);
    assert.equal(ouaddaiCloture?.menages_servis.valeur, 0);
    assert.equal(ouaddaiCloture?.stocks_disponibles.valeur, 20, "Le lot distinct du Ouaddaï reste disponible dans son propre périmètre.");
    const baseKpiRevision = ouvrirD1Locale();
    const menageServiPourRevision = baseKpiRevision.prepare(
      `SELECT m.id, m.statut, m.statut_validation FROM menages m
       INNER JOIN remises_distribution rd ON rd.menage_id = m.id AND rd.distribution_id = ?
       INNER JOIN lignes_remise lr ON lr.remise_id = rd.id AND lr.quantite_remise > 0
       ORDER BY rd.date_remise, rd.id LIMIT 1`,
    ).get(brouillon.id);
    assert.ok(menageServiPourRevision?.id, "Le scénario fermé doit conserver au moins un ménage avec remise positive.");
    const statutInitialMenageServi = menageServiPourRevision.statut;
    const validationInitialeMenageServi = menageServiPourRevision.statut_validation;
    baseKpiRevision.prepare("UPDATE menages SET statut = 'DOUBLON_SUSPECTE', statut_validation = 'A_VERIFIER' WHERE id = ? AND province_id = 'prov-sila'")
      .run(menageServiPourRevision.id);
    baseKpiRevision.close();
    try {
      const kpiApresMiseEnRevision = await central.requete(
        `/api/rapports/indicateurs-carte?date_debut=2026-10-01&date_fin=2026-10-31&article_id=${encodeURIComponent(ids.articleRiz)}`,
      );
      assert.equal(kpiApresMiseEnRevision.reponse.status, 200);
      const silaApresMiseEnRevision = kpiApresMiseEnRevision.donnees.provinces.find((province) => province.province_id === "prov-sila");
      assert.equal(silaApresMiseEnRevision?.menages_servis.valeur, 2,
        "Le seul changement du statut administratif en revue ne retire ni n’ajoute une preuve de remise au KPI.");
      assert.equal(silaApresMiseEnRevision?.distributions_realisees.valeur, 1,
        "Le marquage d’un ménage en revue ne modifie pas le décompte de clôtures.");
    } finally {
      const baseRestaurerKpi = ouvrirD1Locale();
      baseRestaurerKpi.prepare("UPDATE menages SET statut = ?, statut_validation = ? WHERE id = ? AND province_id = 'prov-sila'")
        .run(statutInitialMenageServi, validationInitialeMenageServi, menageServiPourRevision.id);
      baseRestaurerKpi.close();
    }
    const kpiHorsPeriode = await central.requete(`/api/rapports/indicateurs-carte?date_debut=2020-01-01&date_fin=2020-01-31`);
    assert.equal(kpiHorsPeriode.reponse.status, 200);
    const silaHorsPeriode = kpiHorsPeriode.donnees.provinces.find((province) => province.province_id === "prov-sila");
    assert.equal(silaHorsPeriode?.distributions_realisees.valeur, 0);
    assert.equal(silaHorsPeriode?.menages_servis.valeur, 0);
    assert.equal(silaHorsPeriode?.distributions_en_cours.valeur, 0, "Une opération clôturée n’est plus dans la photographie en cours.");
    console.info("UI-MAP 1.6 — clôture Sila: attendus 1 réalisée / 0 en cours / 2 ménages / 59 kg; Ouaddaï: 0 / 0 / 0 / 20 kg; valeurs identiques à l’API.");
    const detailFinal = await central.requete(`/api/distributions/${brouillon.id}`);
    assert.equal(detailFinal.donnees.corrections[0].statut, "VALIDEE_CENTRAL");
    const baseControle = ouvrirD1Locale();
    const nombreRemisesApres = baseControle.prepare("SELECT COUNT(*) AS total FROM remises_distribution WHERE distribution_id = ?").get(brouillon.id).total;
    const bilanFinal = baseControle.prepare(
      `SELECT r.quantite_reservee, r.quantite_consommee, r.quantite_liberee, r.statut,
        (SELECT SUM(quantite_physique) FROM lots_stock WHERE entrepot_id = l.entrepot_id AND article_id = l.article_id) AS quantite_physique,
        (SELECT SUM(quantite_reservee) FROM lots_stock WHERE entrepot_id = l.entrepot_id AND article_id = l.article_id) AS reserve_lot,
        s.quantite_physique AS physique_solde, s.quantite_reservee AS reserve_solde
       FROM reservations_stock r JOIN lots_stock l ON l.id = r.lot_stock_id
       JOIN soldes_stock s ON s.entrepot_id = l.entrepot_id AND s.article_id = l.article_id
       WHERE r.distribution_id = ? AND r.article_id = ? AND r.quantite_liberee > 0`,
    ).get(brouillon.id, ids.articleRiz);
    assert.equal(nombreRemisesApres, nombreRemisesAvant, "La revue centrale ne réécrit ni ne duplique les remises initiales.");
    assert.equal(bilanFinal.statut, "LIBEREE_CLOTURE");
    assert.equal(bilanFinal.quantite_liberee, bilanFinal.quantite_reservee - bilanFinal.quantite_consommee);
    assert.equal(bilanFinal.reserve_lot, bilanFinal.reserve_solde);
    assert.equal(bilanFinal.quantite_physique, bilanFinal.physique_solde);
    const historique = baseControle.prepare("SELECT COUNT(*) AS total FROM historique_statuts WHERE operation_type = 'DISTRIBUTION_PROVINCIALE' AND operation_id = ?").get(brouillon.id).total;
    const cloture = baseControle.prepare("SELECT COUNT(*) AS total FROM clotures_distribution WHERE distribution_id = ?").get(brouillon.id).total;
    assert.ok(historique >= 6, "Chaque transition importante doit conserver son historique.");
    assert.equal(cloture, 1);
    const definitionStatut = baseControle.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'distributions_provinciales'").get().sql;
    assert.doesNotMatch(definitionStatut, /'ANNULEE'/u, "Le schéma ne représente actuellement aucun statut d’annulation de distribution.");
    assert.throws(
      () => baseControle.prepare("UPDATE distributions_provinciales SET statut = 'ANNULEE' WHERE id = ?").run(brouillon.id),
      /TRANSITION_STATUT_DISTRIBUTION_INVALIDE|CHECK constraint failed/iu,
      "La tentative synthétique d’annulation est rejetée par D1 et ne doit pas être comptabilisée comme un statut métier pris en charge.",
    );
    assert.equal(baseControle.prepare("SELECT statut FROM distributions_provinciales WHERE id = ?").get(brouillon.id).statut,
      "CLOTUREE_CENTRAL", "Le rejet de la valeur d’annulation ne modifie pas la distribution clôturée.");
    baseControle.close();
  });

  await t.test("Rollback de toute la validation si l’audit final échoue", async () => {
    const planRollback = construirePlan(ids, `${suffixe}-ROLLBACK`, {
      liste_beneficiaires_id: null,
      articles: [{ article_id: ids.articleRollback, source_approvisionnement: "STOCK_EXISTANT", ration_par_menage: 1 }],
    });
    planRollback.menages = [planRollback.menages[0]];
    const distribution = await creerDistribution(sila, planRollback);
    await passerEnPreparation(sila, distribution.id);
    const baseControle = ouvrirD1Locale();
    baseControle.exec(
      `CREATE TRIGGER refus_audit_validation_p6 BEFORE INSERT ON journaux_audit
       WHEN NEW.action = 'VALIDATION_DISTRIBUTION' AND NEW.entite_id = '${distribution.id}'
       BEGIN SELECT RAISE(ABORT, 'TEST_AUDIT_DISTRIBUTION'); END`,
    );
    baseControle.close();
    const echec = await valider(sila, distribution.id, creerCle("validation-rollback-p6"));
    assert.equal(echec.reponse.status, 500, JSON.stringify(echec.donnees));
    const apresEchec = ouvrirD1Locale();
    const statut = apresEchec.prepare("SELECT statut FROM distributions_provinciales WHERE id = ?").get(distribution.id).statut;
    const reserveLot = apresEchec.prepare("SELECT quantite_reservee FROM lots_stock WHERE id = ?").get(ids.lotRollback).quantite_reservee;
    const reservations = apresEchec.prepare("SELECT COUNT(*) AS total FROM reservations_stock WHERE distribution_id = ?").get(distribution.id).total;
    const mouvements = apresEchec.prepare("SELECT COUNT(*) AS total FROM mouvements_stock WHERE type_mouvement = 'RESERVATION' AND document_source_id = ?").get(distribution.id).total;
    assert.equal(statut, "EN_PREPARATION");
    assert.equal(reserveLot, 0);
    assert.equal(reservations, 0);
    assert.equal(mouvements, 0);
    apresEchec.exec("DROP TRIGGER refus_audit_validation_p6");
    apresEchec.close();
    const succes = await valider(sila, distribution.id, creerCle("validation-reprise-p6"));
    assert.equal(succes.reponse.status, 200, "Après retrait de la panne injectée, la validation doit pouvoir réussir.");
  });

  await t.test("Concurrence entre deux validations et cohérence lots_stock / soldes_stock", async () => {
    const planConcurrentA = construirePlan(ids, `${suffixe}-COURSE-A`, { articles: [{ article_id: ids.articleRiz, source_approvisionnement: "STOCK_EXISTANT", ration_par_menage: 10 }] });
    const planConcurrentB = construirePlan(ids, `${suffixe}-COURSE-B`, { articles: [{ article_id: ids.articleRiz, source_approvisionnement: "STOCK_EXISTANT", ration_par_menage: 10 }] });
    const distributionA = await creerDistribution(sila, planConcurrentA);
    const distributionB = await creerDistribution(sila, planConcurrentB);
    await Promise.all([passerEnPreparation(sila, distributionA.id), passerEnPreparation(sila, distributionB.id)]);
    const resultats = await Promise.all([valider(sila, distributionA.id), valider(sila, distributionB.id)]);
    assert.deepEqual(resultats.map((resultat) => resultat.reponse.status).sort(), [200, 409], "Une seule validation peut réserver le stock concurrent.");
    const baseControle = ouvrirD1Locale();
    const ecarts = baseControle.prepare(
      `SELECT COUNT(*) AS total FROM soldes_stock s WHERE abs(s.quantite_physique - (
         SELECT COALESCE(SUM(l.quantite_physique), 0) FROM lots_stock l WHERE l.entrepot_id = s.entrepot_id AND l.article_id = s.article_id
       )) > 0.000000001 OR abs(s.quantite_reservee - (
         SELECT COALESCE(SUM(l.quantite_reservee), 0) FROM lots_stock l WHERE l.entrepot_id = s.entrepot_id AND l.article_id = s.article_id
       )) > 0.000000001`,
    ).get().total;
    const negativites = baseControle.prepare("SELECT COUNT(*) AS total FROM lots_stock WHERE quantite_physique < 0 OR quantite_reservee < 0 OR quantite_reservee > quantite_physique").get().total;
    assert.equal(ecarts, 0, "Les soldes agrégés doivent être identiques à la somme des lots.");
    assert.equal(negativites, 0, "Aucun solde de lot ne peut devenir négatif ou sur-réservé.");
    baseControle.close();
  });

  await t.test("Périmètre du journal, notifications, idempotence et rollback des observations", async () => {
    const corps = {
      operation_type: "DISTRIBUTION_PROVINCIALE",
      operation_id: brouillon.id,
      province_id: "prov-sila",
      niveau_gravite: "INFO",
      observation: "Information de contrôle archivistique sans blocage de clôture.",
    };
    const cleObservation = creerCle("observation-info-p7");
    const observation = await central.requete("/api/central/controle/observations", {
      methode: "POST", cleIdempotence: cleObservation, corps,
    });
    assert.equal(observation.reponse.status, 201, JSON.stringify(observation.donnees));
    const rejeu = await central.requete("/api/central/controle/observations", {
      methode: "POST", cleIdempotence: cleObservation, corps,
    });
    assert.equal(rejeu.reponse.status, 201);
    assert.equal(rejeu.reponse.headers.get("Idempotency-Replayed"), "true");
    const reutilisation = await central.requete("/api/central/controle/observations", {
      methode: "POST", cleIdempotence: cleObservation,
      corps: { ...corps, observation: "Texte différent pour la même clé d’idempotence." },
    });
    assert.equal(reutilisation.reponse.status, 409, "Une clé réutilisée avec un autre contenu doit être refusée.");

    const sansCsrf = await sila.requete("/api/notifications/lecture-toutes", { methode: "POST", csrf: false });
    assert.equal(sansCsrf.reponse.status, 403, "La modification des notifications doit être protégée par CSRF.");
    const notificationsSila = await sila.requete("/api/notifications?limite=100&decalage=0");
    const notificationsOuaddai = await ouaddai.requete("/api/notifications?limite=100&decalage=0");
    assert.equal(notificationsSila.reponse.status, 200);
    assert.equal(notificationsOuaddai.reponse.status, 200);
    assert.ok(notificationsSila.donnees.elements.some((item) => item.titre === "Correction de distribution demandée"));
    assert.ok(!notificationsOuaddai.donnees.elements.some((item) => item.titre === "Correction de distribution demandée"),
      "Une notification de Sila n’est pas visible au Ouaddaï.");

    const auditSila = await sila.requete("/api/provincial/audit?limite=100&decalage=0");
    assert.equal(auditSila.reponse.status, 200, JSON.stringify(auditSila.donnees));
    assert.ok(auditSila.donnees.elements.every((item) => !item.province_id || item.province_id === "prov-sila"),
      "Les entrées liées à une autre province sont exclues du journal du délégué.");
    const auditApiMutation = await central.requete("/api/central/audit", {
      methode: "POST", cleIdempotence: creerCle("audit-ecriture-p7"), corps: {},
    });
    assert.ok([404, 405].includes(auditApiMutation.reponse.status), "Aucune route d’écriture n’existe pour le journal d’audit.");

    const baseControle = ouvrirD1Locale();
    const auditDistrib = baseControle.prepare(
      "SELECT id FROM journaux_audit WHERE entite_type = 'DISTRIBUTION_PROVINCIALE' AND entite_id = ? LIMIT 1",
    ).get(brouillon.id);
    assert.ok(auditDistrib);
    assert.throws(() => baseControle.prepare("UPDATE journaux_audit SET action = 'ALTÉRATION' WHERE id = ?").run(auditDistrib.id), /JOURNAL_AUDIT_IMMUABLE/u);
    assert.throws(() => baseControle.prepare("DELETE FROM journaux_audit WHERE id = ?").run(auditDistrib.id), /JOURNAL_AUDIT_IMMUABLE/u);
    const avantRollback = baseControle.prepare("SELECT COUNT(*) AS total FROM observations_controle").get().total;
    baseControle.exec(
      `CREATE TRIGGER test_refus_audit_observation BEFORE INSERT ON journaux_audit
       WHEN NEW.action = 'CREATION_OBSERVATION_CONTROLE'
       BEGIN SELECT RAISE(ABORT, 'TEST_AUDIT_OBSERVATION'); END`,
    );
    baseControle.close();
    const echecAudit = await central.requete("/api/central/controle/observations", {
      methode: "POST", cleIdempotence: creerCle("rollback-observation-p7"),
      corps: { ...corps, niveau_gravite: "INFO", observation: "L’observation doit être annulée avec son audit." },
    });
    assert.equal(echecAudit.reponse.status, 500, JSON.stringify(echecAudit.donnees));
    const apresRollback = ouvrirD1Locale();
    const nombreApres = apresRollback.prepare("SELECT COUNT(*) AS total FROM observations_controle").get().total;
    assert.equal(nombreApres, avantRollback, "L’échec du journal annule l’observation et ses autres écritures liées.");
    apresRollback.exec("DROP TRIGGER test_refus_audit_observation");
    apresRollback.close();
  });
});
