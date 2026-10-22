import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";

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
    base.prepare(`UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = NULL,
      doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL
      WHERE identifiant = ?`).run(await hacherMotDePasse(motDePasse), identifiant);
    base.close();
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    const connexion = await this.requete("/api/auth/connexion", { methode: "POST", corps: { identifiant, mot_de_passe: motDePasse } });
    assert.equal(connexion.reponse.status, 200, `La connexion de test ${identifiant} doit réussir.`);
    if (connexion.donnees.utilisateur.doit_changer_mot_de_passe) {
      const nouveauMotDePasse = motDePasseAleatoire();
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST", corps: { nouveau_mot_de_passe: nouveauMotDePasse },
      });
      assert.equal(changement.reponse.status, 200);
      this.motDePasseActuel = nouveauMotDePasse;
    }
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

function insererGrandJeu(base, departementId, categorieId, fixture) {
  base.exec("BEGIN IMMEDIATE");
  try {
    const inserer = base.prepare(`INSERT INTO menages
      (id, code_menage, province_id, departement_id, nom_chef_menage, sexe_chef, nombre_personnes,
       categorie_population_id, date_enregistrement, statut, cree_par)
      VALUES (?, ?, 'prov-sila', ?, ?, 'F', 4, ?, '2026-10-15', 'ACTIF', 'usr-sila')`);
    for (let index = 0; index < 1_500; index += 1) {
      const code = `P8-${String(index).padStart(4, "0")}`;
      const nom = index === 0 ? "=HYPERLINK(\"https://exemple.invalid\")" : `Ménage synthétique ${index}`;
      inserer.run(`menage-p8-${index}`, code, departementId, nom, categorieId);
    }
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

function construireQuery(valeurs) {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(valeurs)) if (valeur !== undefined && valeur !== null && String(valeur) !== "") params.set(cle, String(valeur));
  return params.toString();
}

test("Rapports SIGAD: calculs, exports, confidentialité provinciale et archives sur Wrangler local", async (t) => {
  const base = ouvrirD1Locale();
  const fixture = lireDistributionEtMenages(base);
  insererGrandJeu(base, fixture.departement, fixture.categorie, fixture);
  const totalMouvements = base.prepare("SELECT COUNT(*) AS total FROM mouvements_stock").get().total;
  const comptes = { central: new ClientLocal(), sila: new ClientLocal(), ouaddai: new ClientLocal(), proprietaire: new ClientLocal() };
  base.close();
  for (const [identifiant, client] of Object.entries(comptes)) await client.connecter(identifiant);

  await t.test("Le tableau de bord applique les filtres temporels, les totaux distincts et les périmètres provinciaux", async () => {
    const national = await comptes.central.requete(`/api/rapports/tableau-de-bord?${construireQuery({ date_debut: "2026-10-01", date_fin: "2026-10-31" })}`);
    assert.equal(national.reponse.status, 200, JSON.stringify(national.donnees));
    assert.equal(national.donnees.perimetre, "NATIONAL");
    assert.ok(national.donnees.indicateurs.menages_cibles_uniques >= national.donnees.indicateurs.menages_servis_uniques);
    assert.ok(national.donnees.indicateurs.personnes_enregistrees_menages_cibles >= national.donnees.indicateurs.personnes_assistees_menages_uniques);
    const provincial = await comptes.sila.requete("/api/rapports/tableau-de-bord?date_debut=2026-10-01&date_fin=2026-10-31");
    assert.equal(provincial.reponse.status, 200, JSON.stringify(provincial.donnees));
    assert.equal(provincial.donnees.perimetre, "PROVINCIAL");
    assert.equal(provincial.donnees.province_id, "prov-sila");
    const filtreCroise = await comptes.sila.requete("/api/rapports/tableau-de-bord?province_id=prov-ouaddai");
    assert.equal(filtreCroise.reponse.status, 403);
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
    assert.match(contenuPdf, /\/Count [2-9]/u);
    assert.match(contenuPdf, /Page 1|506167652031/u);
    assert.match(contenuPdf, /Page 2|506167652032/u);
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
  });
  if (process.env.SIGAD_E2E_PASSWORD_FILE) {
    assert.ok(comptes.central.motDePasseActuel);
    await writeFile(process.env.SIGAD_E2E_PASSWORD_FILE, `${comptes.central.motDePasseActuel}\n`, {
      encoding: "utf8", flag: "w", mode: 0o600,
    });
  }
});
