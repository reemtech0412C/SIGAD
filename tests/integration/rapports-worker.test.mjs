import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { hacherMotDePasse, verifierMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  for (const fichier of readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossierEtat, fichier));
    base.exec("PRAGMA foreign_keys = ON");
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'rapports_generes'").get().total === 1) return base;
    base.close();
  }
  throw new Error("La base D1 locale des rapports est introuvable.");
}

function motDePasseAleatoire() { return `Rapport-${randomBytes(24).toString("base64url")}Aa9`; }

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;
  motDePasseActuel = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET", headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
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
    const typeMime = reponse.headers.get("Content-Type") ?? "";
    const donnees = typeMime.includes("application/json") ? await reponse.json() : null;
    return { reponse, donnees };
  }

  async connecter(identifiant) {
    const motDePasse = motDePasseAleatoire();
    this.motDePasseActuel = motDePasse;
    const base = ouvrirD1Locale();
    const empreinte = await hacherMotDePasse(motDePasse);
    base.prepare(`UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?,
      code_activation_expire_le = datetime('now', '+24 hours'),
      doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL
      WHERE identifiant = ?`).run(empreinte, empreinte, identifiant);
    base.close();
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    let connexion = await this.requete("/api/auth/connexion", { methode: "POST", corps: { identifiant, mot_de_passe: motDePasse } });
    assert.equal(connexion.reponse.status, 200, `La connexion de test ${identifiant} doit réussir.`);
    connexion = await terminerConnexionMfaTest(this, identifiant, connexion);
    if (connexion.donnees?.utilisateur?.doit_changer_mot_de_passe) {
      const nouveauMotDePasse = motDePasseAleatoire();
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST", corps: { nouveau_mot_de_passe: nouveauMotDePasse },
      });
      assert.equal(changement.reponse.status, 200);
      this.motDePasseActuel = nouveauMotDePasse;
    }
    if (["central", "proprietaire"].includes(identifiant)) await configurerMfaTest(this, identifiant);
  }
}

function lireDistributionEtMenages(base) {
  const distribution = base.prepare(`SELECT d.id, d.province_id, d.departement_id, d.entrepot_id FROM distributions_provinciales d
    INNER JOIN clotures_distribution c ON c.distribution_id = d.id
    WHERE d.province_id = 'prov-sila' ORDER BY c.date_cloture DESC, d.id DESC LIMIT 1`).get();
  const menages = base.prepare("SELECT id FROM menages WHERE province_id = 'prov-sila' ORDER BY id LIMIT 3").all();
  const departement = base.prepare("SELECT id FROM departements WHERE province_id = 'prov-sila' ORDER BY id LIMIT 1").get();
  const categorie = base.prepare("SELECT id FROM categories_population ORDER BY id LIMIT 1").get();
  assert.ok(distribution, "Les tests de Phase 6 doivent laisser une distribution clôturée de Sila.");
  assert.ok(menages.length >= 3, "Les tests antérieurs doivent laisser des ménages de Sila.");
  assert.ok(departement && categorie, "Le référentiel synthétique de Sila doit être disponible.");
  return { distribution, menages, departement: departement.id, categorie: categorie.id };
}

function insererMenagesSynthétiques(base, departementId, categorieId, debut, fin) {
  base.exec("BEGIN IMMEDIATE");
  try {
    const inserer = base.prepare(`INSERT INTO menages
      (id, code_menage, province_id, departement_id, nom_chef_menage, sexe_chef, nombre_personnes,
       categorie_population_id, date_enregistrement, statut, cree_par)
      VALUES (?, ?, 'prov-sila', ?, ?, 'F', 4, ?, '2026-10-15', 'ACTIF', 'usr-sila')`);
    for (let index = debut; index < fin; index += 1) {
      const code = `P8-${String(index).padStart(4, "0")}`;
      const nom = index === 0 ? "=HYPERLINK(\"https://exemple.invalid\")" : `Ménage synthétique ${index}`;
      inserer.run(`menage-p8-${index}`, code, departementId, nom, categorieId);
    }
    base.exec("COMMIT");
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
}

function insererFixtureRapport(base, departementId, fixture) {
  base.exec("BEGIN IMMEDIATE");
  try {
    base.prepare(`INSERT INTO distributions_provinciales
      (id, reference_distribution, intitule_distribution, province_id, departement_id, nature_aide,
       objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue, entrepot_id, statut, cree_par)
      VALUES ('distribution-p8-test', 'P8-DIST-TEST', 'Distribution synthétique de vérification des rapports',
       'prov-sila', ?, 'ALIMENTAIRE', 'Vérification des indicateurs avec plusieurs articles', 3, 12,
       '2026-10-15', ?, 'BROUILLON', 'usr-sila')`).run(departementId, fixture.distribution.entrepot_id);
    const articles = base.prepare("SELECT id FROM articles WHERE actif = 1 ORDER BY id LIMIT 2").all();
    assert.equal(articles.length, 2, "Deux articles actifs doivent exister pour vérifier les métriques sans multiplication.");
    const article = base.prepare(`INSERT INTO articles_distribution
      (id, distribution_id, article_id, source_approvisionnement, ration_par_menage, quantite_totale_prevue)
      VALUES (?, 'distribution-p8-test', ?, 'STOCK_EXISTANT', 1, 3)`);
    for (let index = 0; index < articles.length; index += 1) article.run(`article-p8-${index}`, articles[index].id);
    const cible = base.prepare(`INSERT INTO menages_distribution
      (id, distribution_id, province_id, menage_id, statut_service, date_service)
      VALUES (?, 'distribution-p8-test', 'prov-sila', ?, 'EN_ATTENTE', NULL)`);
    for (let index = 0; index < 3; index += 1) {
      const menageId = `menage-p8-${index}`;
      cible.run(`menage-distribution-p8-${index}`, menageId);
      const statut = index === 0 ? "SERVI" : index === 1 ? "PARTIELLEMENT_SERVI" : "NON_SERVI";
      base.prepare("UPDATE menages_distribution SET statut_service = ?, date_service = CASE WHEN ? IN ('SERVI','PARTIELLEMENT_SERVI') THEN '2026-10-15' ELSE NULL END WHERE id = ?")
        .run(statut, statut, `menage-distribution-p8-${index}`);
    }
    base.exec("COMMIT");
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
}

function percentile(valeurs, quantile) {
  const tries = [...valeurs].sort((gauche, droite) => gauche - droite);
  const index = Math.max(0, Math.ceil(quantile * tries.length) - 1);
  return Number((tries[index] ?? 0).toFixed(2));
}

async function mesurerIndicateursCarte(client, menagesAjoutes, articleId) {
  const mesurerVariante = async (libelle, parametres) => {
    const durees = [];
    let ressources = null;
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const debut = performance.now();
      const resultat = await client.requete(`/api/rapports/indicateurs-carte?${parametres}`);
      durees.push(performance.now() - debut);
      assert.equal(resultat.reponse.status, 200, JSON.stringify(resultat.donnees));
      ressources = resultat.donnees.ressources_d1;
    }
    assert.ok(ressources, "Les compteurs D1 doivent être présents dans chaque réponse d’indicateurs.");
    console.info(`UI-MAP 1.6 — ${libelle}, ménages synthétiques ajoutés ${menagesAjoutes}: n=5, p50=${percentile(durees, 0.50)} ms, p95=${percentile(durees, 0.95)} ms, p99=${percentile(durees, 0.99)} ms; dernière requête D1 rows_read=${ressources.lignes_lues}, rows_written=${ressources.lignes_ecrites}, durée=${ressources.duree_requetes_ms} ms, requêtes=${ressources.requetes}.`);
  };
  await mesurerVariante("agrégats hors stock", "date_debut=2026-10-01&date_fin=2026-10-31");
  await mesurerVariante("agrégats avec stock", `date_debut=2026-10-01&date_fin=2026-10-31&article_id=${encodeURIComponent(articleId)}`);
}

function construireQuery(valeurs) {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(valeurs)) if (valeur !== undefined && valeur !== null && String(valeur) !== "") params.set(cle, String(valeur));
  return params.toString();
}

test("Rapports SIGAD: calculs, exports, confidentialité provinciale et archives sur Wrangler local", async (t) => {
  const base = ouvrirD1Locale();
  const fixture = lireDistributionEtMenages(base);
  const totalMouvements = base.prepare("SELECT COUNT(*) AS total FROM mouvements_stock").get().total;
  const articleCarte = base.prepare("SELECT id FROM articles WHERE actif = 1 ORDER BY id LIMIT 1").get();
  assert.ok(articleCarte, "Un article actif synthétique est requis pour mesurer la variante avec stock.");
  base.close();
  const comptes = { central: new ClientLocal(), sila: new ClientLocal(), ouaddai: new ClientLocal(), proprietaire: new ClientLocal() };
  for (const [identifiant, client] of Object.entries(comptes)) await client.connecter(identifiant);

  await mesurerIndicateursCarte(comptes.central, 0, articleCarte.id);
  let baseJeu = ouvrirD1Locale();
  insererMenagesSynthétiques(baseJeu, fixture.departement, fixture.categorie, 0, 500);
  insererFixtureRapport(baseJeu, fixture.departement, fixture);
  baseJeu.close();
  await mesurerIndicateursCarte(comptes.central, 500, articleCarte.id);
  baseJeu = ouvrirD1Locale();
  insererMenagesSynthétiques(baseJeu, fixture.departement, fixture.categorie, 500, 1_500);
  baseJeu.close();
  await mesurerIndicateursCarte(comptes.central, 1_500, articleCarte.id);
  baseJeu = ouvrirD1Locale();
  insererMenagesSynthétiques(baseJeu, fixture.departement, fixture.categorie, 1_500, 5_000);
  baseJeu.close();
  await mesurerIndicateursCarte(comptes.central, 5_000, articleCarte.id);

  await t.test("Le tableau de bord applique les filtres temporels, les totaux distincts et les périmètres provinciaux", async () => {
    const national = await comptes.central.requete(`/api/rapports/tableau-de-bord?${construireQuery({ date_debut: "2026-10-01", date_fin: "2026-10-31" })}`);
    assert.equal(national.reponse.status, 200, JSON.stringify(national.donnees));
    assert.equal(national.donnees.perimetre, "NATIONAL");
    assert.equal(national.donnees.provinces.length, 23, "L’agrégat national autorisé expose exactement les 23 provinces actives.");
    assert.equal("distributions_realisees" in national.donnees.indicateurs, false,
      "L’API existante ne doit pas être présentée comme calculant les distributions clôturées selon UI-MAP 1.4.");
    assert.equal("distributions_en_cours" in national.donnees.indicateurs, false);
    assert.equal("menages_avec_preuve_de_remise" in national.donnees.indicateurs, false);
    assert.equal("stocks_par_entrepot_article_unite" in national.donnees.indicateurs, false);
    assert.ok(Number.isInteger(national.donnees.ressources_d1.lignes_lues));
    console.info(`UI-MAP 1.4 — /api/rapports/tableau-de-bord: ${national.donnees.ressources_d1.lignes_lues} lignes D1 lues, ${national.donnees.ressources_d1.duree_requetes_ms} ms déclarées.`);
    assert.ok(national.donnees.indicateurs.menages_cibles_uniques >= national.donnees.indicateurs.menages_servis_uniques);
    assert.ok(national.donnees.indicateurs.personnes_enregistrees_menages_cibles >= national.donnees.indicateurs.personnes_assistees_menages_uniques);
    const baseContrat = ouvrirD1Locale();
    const distributionBrouillon = baseContrat.prepare(`SELECT COUNT(*) AS total FROM distributions_provinciales
      WHERE id = 'distribution-p8-test' AND statut = 'BROUILLON' AND date_prevue >= '2026-10-01' AND date_prevue < '2026-11-01'`).get().total;
    const cloturesDansPeriode = baseContrat.prepare(`SELECT COUNT(DISTINCT d.id) AS total FROM distributions_provinciales d
      INNER JOIN clotures_distribution c ON c.distribution_id = d.id
      WHERE d.statut = 'CLOTUREE_CENTRAL' AND c.date_cloture >= '2026-10-01' AND c.date_cloture < '2026-11-01'`).get().total;
    const remisesAvecPreuveFixture = baseContrat.prepare(`SELECT COUNT(DISTINCT rd.menage_id) AS total
      FROM remises_distribution rd INNER JOIN lignes_remise lr ON lr.remise_id = rd.id
      WHERE rd.distribution_id = 'distribution-p8-test' AND rd.date_remise >= '2026-10-01'
        AND rd.date_remise < '2026-11-01' AND lr.quantite_remise > 0`).get().total;
    const menagesServisSelonStatut = baseContrat.prepare(`SELECT COUNT(DISTINCT md.menage_id) AS total
      FROM menages_distribution md INNER JOIN distributions_provinciales d ON d.id = md.distribution_id
      INNER JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
      WHERE d.date_prevue >= '2026-10-01' AND d.date_prevue < '2026-11-01'
        AND md.province_id = d.province_id AND md.statut_service = 'SERVI'`).get().total;
    const menagesServisSansPreuveFixture = baseContrat.prepare(`SELECT COUNT(DISTINCT md.menage_id) AS total
      FROM menages_distribution md WHERE md.distribution_id = 'distribution-p8-test' AND md.statut_service = 'SERVI'`).get().total;
    baseContrat.close();
    assert.equal(distributionBrouillon, 1, "Le jeu synthétique contient un plan non exécuté dans la période.");
    assert.ok(national.donnees.indicateurs.distributions > cloturesDansPeriode,
      "Le total historique inclut au moins le brouillon et n’équivaut donc pas aux distributions clôturées pendant la période.");
    assert.equal(national.donnees.indicateurs.menages_servis_uniques, menagesServisSelonStatut,
      "Le champ historique suit les statuts des ménages, et non les lignes de preuve physique.");
    assert.equal(menagesServisSansPreuveFixture, 1, "Le plan synthétique contient un ménage marqué SERVI sans remise enregistrée.");
    assert.equal(remisesAvecPreuveFixture, 0, "Le plan synthétique n’a aucune remise ni ligne de preuve physique.");
    const provincial = await comptes.sila.requete("/api/rapports/tableau-de-bord?date_debut=2026-10-01&date_fin=2026-10-31");
    assert.equal(provincial.reponse.status, 200, JSON.stringify(provincial.donnees));
    assert.equal(provincial.donnees.perimetre, "PROVINCIAL");
    assert.equal(provincial.donnees.province_id, "prov-sila");
    assert.deepEqual(provincial.donnees.provinces.map((province) => province.province_id), ["prov-sila"],
      "La réponse d’un délégué de Sila ne contient aucune agrégation d’une autre province.");
    const filtreCroise = await comptes.sila.requete("/api/rapports/tableau-de-bord?province_id=prov-ouaddai");
    assert.equal(filtreCroise.reponse.status, 403);
    const provincialOuaddai = await comptes.ouaddai.requete("/api/rapports/tableau-de-bord");
    assert.equal(provincialOuaddai.reponse.status, 200);
    assert.equal(provincialOuaddai.donnees.perimetre, "PROVINCIAL");
    assert.equal(provincialOuaddai.donnees.province_id, "prov-ouaddai");
    assert.deepEqual(provincialOuaddai.donnees.provinces.map((province) => province.province_id), ["prov-ouaddai"],
      "La réponse d’un délégué du Ouaddaï ne contient aucune agrégation d’une autre province.");
    const filtreCroiseOuaddai = await comptes.ouaddai.requete("/api/rapports/tableau-de-bord?province_id=prov-sila");
    assert.equal(filtreCroiseOuaddai.reponse.status, 403);
    const nombreMaisons = await comptes.sila.requete("/api/rapports/LISTE_BENEFICIAIRES/apercu?limite=25&decalage=0");
    assert.equal(nombreMaisons.reponse.status, 200, JSON.stringify(nombreMaisons.donnees));
    assert.equal(nombreMaisons.donnees.elements.length, 25);
    assert.equal(nombreMaisons.donnees.suite_disponible, true);
    assert.ok(totalMouvements >= 0);
  });

  await t.test("Les quinze rapports sont exécutables avec leurs filtres et leurs références opérationnelles", async () => {
    const filtres = await comptes.central.requete("/api/rapports/filtres");
    assert.equal(filtres.reponse.status, 200, JSON.stringify(filtres.donnees));
    const types = await comptes.central.requete("/api/rapports/catalogue");
    assert.equal(types.donnees.elements.length, 15);
    for (const rapport of types.donnees.elements) {
      const parametres = { province_id: "prov-sila", limite: 10, decalage: 0 };
      if (rapport.identifiantOperationRequis) parametres.distribution_id = fixture.distribution.id;
      if (rapport.type === "RAPPORT_PARTENAIRE") parametres.nature_aide = "ALIMENTAIRE";
      const resultat = await comptes.central.requete(`/api/rapports/${rapport.type}/apercu?${construireQuery(parametres)}`);
      assert.equal(resultat.reponse.status, 200, `${rapport.type}: ${JSON.stringify(resultat.donnees)}`);
      assert.ok(Array.isArray(resultat.donnees.elements));
      assert.ok(resultat.donnees.elements.length <= 10);
    }
    const cloture = await comptes.central.requete(`/api/rapports/PROCES_VERBAL_DISTRIBUTION/apercu?${construireQuery({ province_id: "prov-sila", distribution_id: fixture.distribution.id, limite: 5, decalage: 0 })}`);
    assert.equal(cloture.reponse.status, 200);
    assert.ok(cloture.donnees.elements.length <= 1);
  });

  await t.test("Les métriques des ménages ne se multiplient pas selon les articles et la distribution reste vérifiable", async () => {
    const distribution = await comptes.sila.requete(`/api/rapports/RAPPORT_DISTRIBUTION/apercu?${construireQuery({ limite: 50, decalage: 0 })}`);
    assert.equal(distribution.reponse.status, 200, JSON.stringify(distribution.donnees));
    const baseControle = ouvrirD1Locale();
    const attendu = baseControle.prepare(`SELECT COUNT(*) AS menages, SUM(CASE WHEN statut_service IN ('SERVI','PARTIELLEMENT_SERVI') THEN 1 ELSE 0 END) AS occurrences
      FROM menages_distribution md INNER JOIN distributions_provinciales d ON d.id = md.distribution_id
      WHERE d.province_id = 'prov-sila'`).get();
    const tableau = await comptes.sila.requete("/api/rapports/tableau-de-bord");
    assert.equal(tableau.donnees.indicateurs.menages_cibles_uniques,
      baseControle.prepare(`SELECT COUNT(DISTINCT md.menage_id) AS total FROM menages_distribution md
        INNER JOIN distributions_provinciales d ON d.id = md.distribution_id WHERE d.province_id = 'prov-sila'`).get().total);
    assert.equal(tableau.donnees.indicateurs.occurrences_beneficiaires, attendu.occurrences);
    assert.ok(tableau.donnees.indicateurs.menages_partiellement_servis_uniques >= 1);
    const ligneFixture = distribution.donnees.elements.find((ligne) => ligne.reference === "P8-DIST-TEST");
    assert.ok(ligneFixture, "La distribution synthétique doit figurer dans le rapport filtrable.");
    assert.equal(ligneFixture.menages_cibles_uniques, 3);
    assert.equal(ligneFixture.menages_servis_uniques, 1);
    assert.equal(ligneFixture.menages_partiels_uniques, 1);
    assert.equal(ligneFixture.occurrences_beneficiaires, 2, "Deux articles ne doivent pas transformer deux ménages aidés en quatre occurrences.");
    const etatStock = await comptes.central.requete(`/api/rapports/ETAT_STOCKS/apercu?${construireQuery({ province_id: "prov-sila", limite: 100, decalage: 0 })}`);
    assert.equal(etatStock.reponse.status, 200, JSON.stringify(etatStock.donnees));
    for (const ligne of etatStock.donnees.elements) {
      assert.equal(ligne.quantite_physique_solde, ligne.quantite_physique_lots);
      assert.equal(ligne.quantite_reservee_solde, ligne.quantite_reservee_lots);
    }
    const national = await comptes.central.requete(`/api/rapports/RAPPORT_NATIONAL_CONSOLIDE/apercu?${construireQuery({ province_id: "prov-sila", limite: 100, decalage: 0 })}`);
    assert.equal(national.reponse.status, 200, JSON.stringify(national.donnees));
    const nationalSila = national.donnees.elements[0];
    const quantitesAttenues = baseControle.prepare(`SELECT
      (SELECT COALESCE(SUM(le.quantite_expediee), 0) FROM expeditions e INNER JOIN lignes_expedition le ON le.expedition_id = e.id WHERE e.province_destinataire_id = 'prov-sila') AS expediee,
      (SELECT COALESCE(SUM(lr.quantite_acceptee), 0) FROM receptions_provinciales rp INNER JOIN lignes_reception_provinciale lr ON lr.reception_provinciale_id = rp.id WHERE rp.province_id = 'prov-sila') AS receptionnee,
      (SELECT COALESCE(SUM(lr.quantite_remise), 0) FROM remises_distribution rd INNER JOIN lignes_remise lr ON lr.remise_id = rd.id WHERE rd.province_id = 'prov-sila') AS distribuee`).get();
    assert.equal(nationalSila.quantite_expediee, quantitesAttenues.expediee);
    assert.equal(nationalSila.quantite_receptionnee, quantitesAttenues.receptionnee);
    assert.equal(nationalSila.quantite_distribuee, quantitesAttenues.distribuee);
    const clôtureAvant = await comptes.central.requete(`/api/rapports/RAPPORT_CLOTURE/apercu?${construireQuery({ province_id: "prov-sila", date_debut: "2026-01-01", date_fin: "2026-12-31", limite: 100, decalage: 0 })}`);
    const clôtureAprès = await comptes.central.requete(`/api/rapports/RAPPORT_CLOTURE/apercu?${construireQuery({ province_id: "prov-sila", date_debut: "2026-01-01", date_fin: "2026-12-31", limite: 100, decalage: 0 })}`);
    assert.deepEqual(clôtureAvant.donnees.elements, clôtureAprès.donnees.elements, "Le rapport de clôture doit conserver les valeurs figées.");
    baseControle.close();
  });

  await t.test("Les exports français CSV, XLSX et PDF protègent les données et produisent un PDF paginé", async () => {
    const exportCsv = await comptes.central.requete("/api/rapports/LISTE_BENEFICIAIRES/export", {
      methode: "POST", corps: { format: "CSV", archiver: false, filtres: { province_id: "prov-sila" } },
    });
    assert.equal(exportCsv.reponse.status, 200);
    assert.match(exportCsv.reponse.headers.get("Content-Type") ?? "", /text\/csv/u);
    const contenuCsv = await exportCsv.reponse.text();
    assert.match(contenuCsv, /sep=;/u);
    assert.match(contenuCsv, /&quot;|=HYPERLINK|Ménage synthétique/u);
    assert.ok(contenuCsv.includes("'=HYPERLINK") || !contenuCsv.includes("=HYPERLINK"), "Les cellules de formule doivent être protégées ou absentes de la page exportée.");
    const exportExcel = await comptes.central.requete("/api/rapports/LISTE_BENEFICIAIRES/export", {
      methode: "POST", corps: { format: "EXCEL", archiver: false, filtres: { province_id: "prov-sila" } },
    });
    assert.equal(exportExcel.reponse.status, 200);
    assert.match(exportExcel.reponse.headers.get("Content-Type") ?? "", /spreadsheetml/u);
    assert.ok((await exportExcel.reponse.arrayBuffer()).byteLength > 500);
    const exportPdf = await comptes.central.requete("/api/rapports/LISTE_BENEFICIAIRES/export", {
      methode: "POST", corps: { format: "PDF", archiver: false, filtres: { province_id: "prov-sila" } },
    });
    assert.equal(exportPdf.reponse.status, 200);
    const contenuPdf = new TextDecoder().decode(await exportPdf.reponse.arrayBuffer());
    assert.match(contenuPdf, /\/Count (?:[2-9]|[1-9][0-9]+)/u);
    assert.match(contenuPdf, /Page 1|506167652031/u);
    assert.match(contenuPdf, /Page 2|506167652032/u);
  });

  await t.test("L’export CSV natif accepte uniquement le jeton CSRF du formulaire et renvoie un fichier exploitable", async () => {
    const base = ouvrirD1Locale();
    const rapportsAvant = base.prepare("SELECT COUNT(*) AS total FROM rapports_generes").get().total;
    const auditsAvant = base.prepare("SELECT COUNT(*) AS total FROM journaux_audit").get().total;
    base.close();
    const cookies = [...comptes.central.cookies]
      .map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; ");
    const formulaire = new URLSearchParams({
      format: "CSV",
      filtres: JSON.stringify({ province_id: "prov-sila" }),
      archiver: "false",
      jeton_csrf: comptes.central.jetonCsrf,
    });
    const fichier = await fetch(new URL("/api/rapports/RAPPORT_MENSUEL_PROVINCIAL/export", adresseApi), {
      method: "POST",
      headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" },
      body: formulaire,
    });
    assert.equal(fichier.status, 200);
    assert.match(fichier.headers.get("Content-Type") ?? "", /text\/csv;\s*charset=utf-8/iu);
    assert.match(fichier.headers.get("Content-Disposition") ?? "", /attachment;\s*filename=/iu);
    assert.equal(fichier.headers.get("X-Frame-Options"), "SAMEORIGIN");
    assert.match(fichier.headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'self'/u);
    const octets = await fichier.arrayBuffer();
    assert.ok(octets.byteLength > 0, "Le téléchargement doit contenir un fichier non vide.");
    const contenu = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(octets);
    assert.ok(contenu.startsWith("\uFEFFsep=;\r\n"), "Le CSV doit inclure son BOM UTF-8 et son séparateur français.");
    assert.match(contenu, /Référence du rapport/u);
    assert.ok(contenu.includes('"Province";"Mois"'), "Les noms de colonnes doivent être correctement séparés.");
    assert.match(contenu, /Sila/u);
    assert.doesNotMatch(contenu, /Ouaddaï/u, "L’export filtré de Sila ne doit pas contenir de donnée d’Ouaddaï.");

    const refus = await fetch(new URL("/api/rapports/RAPPORT_MENSUEL_PROVINCIAL/export", adresseApi), {
      method: "POST",
      headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        format: "CSV",
        filtres: JSON.stringify({ province_id: "prov-sila" }),
        archiver: "false",
        jeton_csrf: "jeton-invalide",
      }),
    });
    assert.equal(refus.status, 403, "Un jeton de formulaire incorrect doit être refusé.");
    const baseAprès = ouvrirD1Locale();
    assert.equal(baseAprès.prepare("SELECT COUNT(*) AS total FROM rapports_generes").get().total, rapportsAvant + 1,
      "Le formulaire refusé ne doit pas créer un rapport.");
    assert.equal(baseAprès.prepare("SELECT COUNT(*) AS total FROM journaux_audit").get().total, auditsAvant + 1,
      "Le formulaire refusé ne doit pas écrire de trace d’audit.");
    baseAprès.close();
  });

  await t.test("La génération archivée applique les mêmes droits, l’idempotence des références et le CSRF", async () => {
    const sansCsrf = await comptes.sila.requete("/api/rapports/RAPPORT_DISTRIBUTION/export", {
      methode: "POST", csrf: false, corps: { format: "CSV", archiver: true, filtres: {} },
    });
    assert.equal(sansCsrf.reponse.status, 403);
    const injectionProvince = await comptes.sila.requete("/api/rapports/RAPPORT_DISTRIBUTION/export", {
      methode: "POST", corps: { format: "CSV", archiver: true, filtres: { province_id: "prov-ouaddai" } },
    });
    assert.equal(injectionProvince.reponse.status, 403);
    const archivee = await comptes.sila.requete("/api/rapports/RAPPORT_DISTRIBUTION/export", {
      methode: "POST", corps: { format: "CSV", archiver: true, filtres: {} },
    });
    assert.equal(archivee.reponse.status, 200);
    const id = archivee.reponse.headers.get("X-Report-Id");
    assert.ok(id);
    const refusee = await comptes.ouaddai.requete(`/api/rapports/archives/${id}`);
    assert.equal(refusee.reponse.status, 403);
    const autorisee = await comptes.sila.requete(`/api/rapports/archives/${id}`);
    assert.equal(autorisee.reponse.status, 200);
    const liste = await comptes.ouaddai.requete("/api/rapports/archives?limite=100&decalage=0");
    assert.equal(liste.reponse.status, 200);
    assert.equal(liste.donnees.elements.some((rapport) => rapport.id === id), false);
    assert.equal(liste.donnees.elements.some((rapport) => "cle_r2_archive" in rapport), false);
    const reconciliationAdmin = await comptes.central.requete("/api/rapports/archives/reconciliation?limite=20");
    assert.equal(reconciliationAdmin.reponse.status, 403);
    const reconciliationProprietaire = await comptes.proprietaire.requete("/api/rapports/archives/reconciliation?limite=20");
    assert.equal(reconciliationProprietaire.reponse.status, 200, JSON.stringify(reconciliationProprietaire.donnees));
    const suppressionSansConfirmation = await comptes.proprietaire.requete("/api/rapports/archives/reconciliation", {
      methode: "POST", corps: { limite: 20, confirmer_suppression: false },
    });
    assert.equal(suppressionSansConfirmation.reponse.status, 400,
      "La réconciliation ne peut supprimer un objet R2 sans confirmation explicite.");
    const reconciliationConfirmee = await comptes.proprietaire.requete("/api/rapports/archives/reconciliation", {
      methode: "POST", corps: { limite: 20, confirmer_suppression: true },
    });
    assert.equal(reconciliationConfirmee.reponse.status, 200, JSON.stringify(reconciliationConfirmee.donnees));
    assert.equal(reconciliationConfirmee.donnees.echec, 0, "La page locale de réconciliation se termine sans erreur de suppression.");
  });

  await t.test("Les quatre KPI cartographiques correspondent aux preuves D1 et respectent le périmètre de session", async () => {
    const periode = { date_debut: "2026-10-01", date_fin: "2026-10-31" };
    const parametres = construireQuery(periode);
    const anonyme = await new ClientLocal().requete(`/api/rapports/indicateurs-carte?${parametres}`);
    assert.equal(anonyme.reponse.status, 401, "L’agrégat cartographique exige une session.");

    const national = await comptes.central.requete(`/api/rapports/indicateurs-carte?${parametres}`);
    assert.equal(national.reponse.status, 200, JSON.stringify(national.donnees));
    assert.equal(national.donnees.version_contrat, "1.5");
    assert.equal(national.donnees.perimetre, "NATIONAL");
    assert.equal(national.donnees.provinces.length, 23);
    assert.deepEqual(national.donnees.indicateurs_desactives, ["personnes_beneficiaires", "validations_en_attente"]);
    assert.equal(national.donnees.ressources_d1.lignes_ecrites, 0, "Une consultation d’indicateurs reste strictement en lecture seule.");
    assert.equal(national.donnees.ressources_d1.requetes, 1);
    assert.equal("nom_chef_menage" in national.donnees, false);
    assert.equal("identite_recepteur" in national.donnees, false);
    assert.equal(JSON.stringify(national.donnees).includes("menage_id"), false, "Aucun identifiant nominatif ne doit atteindre la carte.");

    const baseKpi = ouvrirD1Locale();
    const attendus = baseKpi.prepare(`SELECT p.id AS province_id,
      (SELECT COUNT(DISTINCT d.id) FROM distributions_provinciales d
        INNER JOIN clotures_distribution c ON c.distribution_id = d.id AND c.province_id = d.province_id
        WHERE d.province_id = p.id AND d.statut = 'CLOTUREE_CENTRAL'
          AND c.date_cloture >= '2026-10-01' AND c.date_cloture < date('2026-10-31', '+1 day')) AS distributions_realisees,
      (SELECT COUNT(DISTINCT d.id) FROM distributions_provinciales d
        WHERE d.province_id = p.id AND d.statut IN ('EN_EXECUTION','TERMINEE_PROVINCE','RETOURNEE_POUR_CORRECTION')
          AND EXISTS (SELECT 1 FROM historique_statuts h WHERE h.operation_type = 'DISTRIBUTION_PROVINCIALE'
            AND h.operation_id = d.id AND h.nouveau_statut = 'EN_EXECUTION')) AS distributions_en_cours,
      (SELECT COUNT(DISTINCT rd.menage_id) FROM remises_distribution rd
        INNER JOIN distributions_provinciales d ON d.id = rd.distribution_id AND d.province_id = rd.province_id
        INNER JOIN menages_distribution md ON md.id = rd.menage_distribution_id AND md.distribution_id = rd.distribution_id
          AND md.province_id = rd.province_id AND md.menage_id = rd.menage_id
        INNER JOIN menages m ON m.id = rd.menage_id AND m.province_id = rd.province_id
        WHERE rd.province_id = p.id AND rd.date_remise >= '2026-10-01'
          AND rd.date_remise < date('2026-10-31', '+1 day')
          AND EXISTS (SELECT 1 FROM lignes_remise lr WHERE lr.remise_id = rd.id AND lr.quantite_remise > 0)) AS menages_servis
      FROM provinces p`).all();
    const article = baseKpi.prepare("SELECT id FROM articles WHERE actif = 1 ORDER BY id LIMIT 1").get();
    assert.ok(article, "Un article actif synthétique doit permettre de vérifier le stock.");
    baseKpi.close();

    const parProvince = new Map(attendus.map((ligne) => [ligne.province_id, ligne]));
    for (const province of national.donnees.provinces) {
      const attendu = parProvince.get(province.province_id);
      assert.ok(attendu, `L’agrégat doit utiliser l’identifiant SIGAD ${province.province_id}.`);
      assert.equal(province.distributions_realisees.valeur, attendu.distributions_realisees, `${province.province_id}: clôtures finales dans la période.`);
      assert.equal(province.distributions_en_cours.valeur, attendu.distributions_en_cours, `${province.province_id}: photographie des opérations réellement démarrées.`);
      assert.equal(province.menages_servis.valeur, attendu.menages_servis, `${province.province_id}: ménages distincts avec ligne de remise positive.`);
    }
    assert.ok(national.donnees.provinces.some((province) => province.province_id === "prov-sila"
      && province.menages_servis.valeur >= 0), "Le résultat peut représenter un zéro exact sans le confondre avec une indisponibilité.");

    const stockNational = await comptes.central.requete(`/api/rapports/indicateurs-carte?${construireQuery({ article_id: article.id })}`);
    assert.equal(stockNational.reponse.status, 200, JSON.stringify(stockNational.donnees));
    assert.equal(stockNational.donnees.ressources_d1.requetes, 2);
    assert.equal(stockNational.donnees.ressources_d1.lignes_ecrites, 0);
    const stockSila = stockNational.donnees.provinces.find((province) => province.province_id === "prov-sila");
    assert.ok(stockSila);
    const baseStock = ouvrirD1Locale();
    const entrepots = baseStock.prepare(`SELECT e.id AS entrepot_id, e.nom, COALESCE(s.quantite_physique,0) AS physique_solde,
      COALESCE(s.quantite_reservee,0) AS reserve_solde,
      COALESCE((SELECT SUM(l.quantite_physique) FROM lots_stock l WHERE l.entrepot_id = e.id AND l.article_id = ? AND l.province_id = e.province_id),0) AS physique_lots,
      COALESCE((SELECT SUM(l.quantite_reservee) FROM lots_stock l WHERE l.entrepot_id = e.id AND l.article_id = ? AND l.province_id = e.province_id),0) AS reserve_lots,
      COALESCE((SELECT SUM(CASE WHEN l.etat_qualite = 'BON' AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
        THEN l.quantite_physique - l.quantite_reservee ELSE 0 END) FROM lots_stock l
        WHERE l.entrepot_id = e.id AND l.article_id = ? AND l.province_id = e.province_id),0) AS disponible_lots
      FROM entrepots e LEFT JOIN soldes_stock s ON s.entrepot_id = e.id AND s.article_id = ? AND s.province_id = e.province_id
      WHERE e.niveau = 'PROVINCIAL' AND e.actif = 1 AND e.province_id = 'prov-sila' ORDER BY e.id`)
      .all(article.id, article.id, article.id, article.id);
    baseStock.close();
    assert.equal(stockSila.stocks_disponibles.entrepots_actifs, entrepots.length);
    const coherents = entrepots.every((entrepot) => Math.abs(entrepot.physique_solde - entrepot.physique_lots) <= 0.000001
      && Math.abs(entrepot.reserve_solde - entrepot.reserve_lots) <= 0.000001);
    if (entrepots.length === 0) {
      assert.equal(stockSila.stocks_disponibles.etat, "AUCUNE_DONNEE");
      assert.equal(stockSila.stocks_disponibles.valeur, null);
    } else if (!coherents) {
      assert.equal(stockSila.stocks_disponibles.etat, "INCOHERENT");
      assert.equal(stockSila.stocks_disponibles.valeur, null);
    } else {
      const disponibleAttendu = entrepots.reduce((somme, entrepot) => somme + entrepot.disponible_lots, 0);
      assert.equal(stockSila.stocks_disponibles.etat, "DISPONIBLE");
      assert.ok(Math.abs(stockSila.stocks_disponibles.valeur - disponibleAttendu) <= 0.000001);
      assert.equal(stockSila.stocks_disponibles.unite_mesure_id !== null, true);
    }

    const sila = await comptes.sila.requete(`/api/rapports/indicateurs-carte?${parametres}`);
    assert.equal(sila.reponse.status, 200, JSON.stringify(sila.donnees));
    assert.equal(sila.donnees.provinces.length, 1);
    assert.equal(sila.donnees.provinces[0].province_id, "prov-sila");
    const filtreCroiseSila = await comptes.sila.requete(`/api/rapports/indicateurs-carte?${construireQuery({ ...periode, province_id: "prov-ouaddai" })}`);
    assert.equal(filtreCroiseSila.reponse.status, 403);
    const ouaddai = await comptes.ouaddai.requete(`/api/rapports/indicateurs-carte?${parametres}`);
    assert.equal(ouaddai.reponse.status, 200, JSON.stringify(ouaddai.donnees));
    assert.equal(ouaddai.donnees.provinces.length, 1);
    assert.equal(ouaddai.donnees.provinces[0].province_id, "prov-ouaddai");
    const filtreCroiseOuaddai = await comptes.ouaddai.requete(`/api/rapports/indicateurs-carte?${construireQuery({ ...periode, province_id: "prov-sila" })}`);
    assert.equal(filtreCroiseOuaddai.reponse.status, 403);
    const filtreInvalide = await comptes.central.requete(`/api/rapports/indicateurs-carte?${construireQuery({ date_debut: "2026-10-31", date_fin: "2026-10-01" })}`);
    assert.equal(filtreInvalide.reponse.status, 400);
    const articleInactif = await comptes.central.requete(`/api/rapports/indicateurs-carte?${construireQuery({ article_id: "article-inconnu" })}`);
    assert.equal(articleInactif.reponse.status, 404);
  });

  if (process.env.SIGAD_E2E_PASSWORD_FILE) {
    assert.ok(comptes.central.motDePasseActuel);
    assert.ok(comptes.sila.motDePasseActuel);
    const empreintesActivation = new Map([
      ["central", await hacherMotDePasse(comptes.central.motDePasseActuel)],
      ["sila", await hacherMotDePasse(comptes.sila.motDePasseActuel)],
    ]);
    const baseE2E = ouvrirD1Locale();
    try {
      const preparerActivationInitiale = baseE2E.prepare(`UPDATE utilisateurs
        SET code_activation_hash = ?, code_activation_expire_le = datetime('now', '+24 hours'),
            code_activation_recuperation_id = NULL, doit_changer_mot_de_passe = 1,
            statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL
        WHERE identifiant = ?`);
      for (const identifiant of ["central", "sila"]) {
        const empreinte = empreintesActivation.get(identifiant);
        const compte = comptes[identifiant];
        assert.ok(empreinte && compte.motDePasseActuel);
        assert.equal(
          await verifierMotDePasse(compte.motDePasseActuel, empreinte),
          true,
          `Le mot de passe temporaire du compte ${identifiant} doit correspondre à son empreinte d’activation.`,
        );
        assert.equal(preparerActivationInitiale.run(empreinte, identifiant).changes, 1,
          `Le compte synthétique ${identifiant} doit être préparé pour son authentification initiale.`);
      }
    } finally {
      baseE2E.close();
    }
    await writeFile(process.env.SIGAD_E2E_PASSWORD_FILE, `${comptes.central.motDePasseActuel}\n`, {
      encoding: "utf8", flag: "w", mode: 0o600,
    });
    if (process.env.SIGAD_E2E_SILA_PASSWORD_FILE) {
      await writeFile(process.env.SIGAD_E2E_SILA_PASSWORD_FILE, `${comptes.sila.motDePasseActuel}\n`, {
        encoding: "utf8", flag: "w", mode: 0o600,
      });
    }
    const baseE2EVerif = ouvrirD1Locale();
    try {
      const verifierFixtureE2E = baseE2EVerif.prepare(`SELECT code_activation_hash, code_activation_expire_le,
        code_activation_recuperation_id, doit_changer_mot_de_passe, statut, role
        FROM utilisateurs WHERE identifiant = ?`);
      for (const identifiant of ["central", "sila"]) {
        const fichierMotDePasse = identifiant === "central"
          ? process.env.SIGAD_E2E_PASSWORD_FILE
          : process.env.SIGAD_E2E_SILA_PASSWORD_FILE;
        assert.ok(fichierMotDePasse, `Le fichier temporaire du compte ${identifiant} doit être configuré.`);
        const motDePasseFichier = (await readFile(fichierMotDePasse, "utf8")).trim();
        const compte = comptes[identifiant];
        const etat = verifierFixtureE2E.get(identifiant);
        assert.ok(compte.motDePasseActuel && etat?.code_activation_hash);
        assert.equal(motDePasseFichier === compte.motDePasseActuel, true,
          `Le fichier de test du compte ${identifiant} doit contenir le mot de passe courant du client synthétique.`);
        assert.equal(await verifierMotDePasse(motDePasseFichier, etat.code_activation_hash), true,
          `L’empreinte d’activation du compte synthétique ${identifiant} doit correspondre au fichier E2E.`);
        assert.equal(etat.statut, "ACTIF");
        assert.equal(etat.doit_changer_mot_de_passe, 1);
        assert.equal(etat.code_activation_recuperation_id, null);
        assert.equal(etat.role, identifiant === "central" ? "ADMIN_CENTRAL" : "DELEGUE_PROVINCIAL");
        assert.equal(Date.parse(`${etat.code_activation_expire_le.replace(" ", "T")}Z`) > Date.now(), true,
          `L’activation locale du compte ${identifiant} doit être valide avant Playwright.`);
      }
    } finally {
      baseE2EVerif.close();
    }
  }
});
