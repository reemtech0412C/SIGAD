import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const racine = resolve(import.meta.dirname, "..");
const migrations = resolve(racine, "migrations");

async function creerBase(jusqua) {
  const base = new DatabaseSync(":memory:");
  base.exec("PRAGMA foreign_keys = ON;");
  for (let numero = 1; numero <= jusqua; numero += 1) {
    const nom = `${String(numero).padStart(4, "0")}_`;
    const { readdir } = await import("node:fs/promises");
    const fichier = (await readdir(migrations)).find((element) => element.startsWith(nom) && element.endsWith(".sql"));
    assert.ok(fichier, `Migration ${nom} présente`);
    base.exec(await readFile(resolve(migrations, fichier), "utf8"));
  }
  return base;
}

function ajouterMenage(base, id, statut, telephone) {
  const categorie = base.prepare("SELECT id FROM categories_population ORDER BY id LIMIT 1").get().id;
  const colonnes = base.prepare("PRAGMA table_info(menages)").all().map((ligne) => ligne.name);
  const validation = colonnes.includes("statut_validation") ? ", statut_validation" : "";
  const valeurValidation = validation ? ", 'A_VERIFIER'" : "";
  base.prepare(
    `INSERT INTO menages
     (id, code_menage, province_id, departement_id, nom_chef_menage, sexe_chef, nombre_personnes,
      telephone, categorie_population_id, date_enregistrement, statut, cree_par${validation})
     VALUES (?, ?, 'prov-sila', 'dep-test-sila', ?, 'F', 4, ?, ?, '2026-10-01', ?, 'usr-central'${valeurValidation})`,
  ).run(id, `CODE-${id}`, `Ménage synthétique ${id}`, telephone, categorie, statut);
}

const ancienne = await creerBase(21);
try {
  ancienne.prepare("INSERT INTO departements (id, province_id, code, nom) VALUES ('dep-test-sila', 'prov-sila', 'TEST-SI', 'Département synthétique')").run();
  ajouterMenage(ancienne, "menage-historique-a", "DOUBLON_SUSPECTE", "23566009991");
  ajouterMenage(ancienne, "menage-historique-b", "DOUBLON_SUSPECTE", "23566009991");
  ancienne.prepare(
    `INSERT INTO signalements_doublons
     (id, province_id, menage_source_id, menage_suspect_id, motif_similitude, statut_traitement, traite_par, observations)
     VALUES ('revue-historique-distincte', 'prov-sila', 'menage-historique-a', 'menage-historique-b',
       'MEME_TELEPHONE', 'CONFIRME_DISTINCT', 'usr-central', 'Décision historique synthétique.')`,
  ).run();
  ancienne.exec(await readFile(resolve(migrations, "0022_cloture_revue_doublons.sql"), "utf8"));
  const etats = ancienne.prepare(
    `SELECT statut, statut_validation FROM menages
     WHERE id IN ('menage-historique-a', 'menage-historique-b') ORDER BY id`,
  ).all();
  assert.deepEqual(etats.map((ligne) => [ligne.statut, ligne.statut_validation]), [
    ["INACTIF", "A_VERIFIER"], ["INACTIF", "A_VERIFIER"],
  ]);
  assert.equal(ancienne.prepare("SELECT COUNT(*) AS n FROM menages WHERE id LIKE 'menage-historique-%'").get().n, 2);
  assert.equal(ancienne.prepare("SELECT statut_traitement FROM signalements_doublons WHERE id = 'revue-historique-distincte'").get().statut_traitement, "CONFIRME_DISTINCT");
  assert.equal(ancienne.prepare("PRAGMA foreign_key_check").all().length, 0);

  ajouterMenage(ancienne, "menage-nouveau-a", "DOUBLON_SUSPECTE", "23566009992");
  ajouterMenage(ancienne, "menage-nouveau-b", "DOUBLON_SUSPECTE", "23566009993");
  ancienne.prepare(
    `INSERT INTO signalements_doublons
     (id, province_id, menage_source_id, menage_suspect_id, motif_similitude, empreintes_preuve_json, comparaison_json)
     VALUES ('revue-nouvelle', 'prov-sila', 'menage-nouveau-a', 'menage-nouveau-b', 'MEME_TELEPHONE', '[]', '{"version":1}')`,
  ).run();
  ancienne.prepare(
    "UPDATE signalements_doublons SET statut_traitement = 'CONFIRME_DISTINCT', traite_par = 'usr-central', observations = 'Validation distincte synthétique.', traite_le = datetime('now') WHERE id = 'revue-nouvelle'",
  ).run();
  const transition = ancienne.prepare(
    `SELECT statut, statut_validation FROM menages WHERE id IN ('menage-nouveau-a', 'menage-nouveau-b') ORDER BY id`,
  ).all();
  assert.deepEqual(transition.map((ligne) => [ligne.statut, ligne.statut_validation]), [
    ["INACTIF", "A_VERIFIER"], ["INACTIF", "A_VERIFIER"],
  ]);
  assert.equal(ancienne.prepare("SELECT COUNT(*) AS n FROM journaux_audit WHERE action = 'CONFIRME_DISTINCT' AND entite_id = 'revue-nouvelle'").get().n, 1);
  assert.throws(() => ancienne.prepare("UPDATE signalements_doublons SET observations = 'Modification interdite' WHERE id = 'revue-nouvelle'").run(), /signalement clos est immuable/u);
  assert.equal(ancienne.prepare("PRAGMA foreign_key_check").all().length, 0);
  console.log("PASS — migration 0022 sur un schéma 0021 : historique confirmé distinct conservé, deux dossiers placés en revue individuelle, nouvelles décisions atomiques, historique immuable et clés étrangères valides.");
} finally {
  ancienne.close();
}

const vierge = await creerBase(22);
try {
  const colonnesMenages = vierge.prepare("PRAGMA table_info(menages)").all().map((ligne) => ligne.name);
  const colonnesSignalements = vierge.prepare("PRAGMA table_info(signalements_doublons)").all().map((ligne) => ligne.name);
  for (const colonne of ["statut_validation", "validation_decidee_par", "validation_decidee_le", "motif_validation"]) assert.ok(colonnesMenages.includes(colonne));
  for (const colonne of ["empreintes_preuve_json", "comparaison_json", "empreinte_reference_preuve", "reouverture_de_id", "traite_le", "reouvert_par", "motif_reouverture"]) {
    assert.ok(colonnesSignalements.includes(colonne));
  }
  const indexes = vierge.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_signalements_doublons_paire_%'").all().map((ligne) => ligne.name);
  assert.deepEqual(indexes, ["idx_signalements_doublons_paire_ouverte_unique"]);
  console.log("PASS — migration 0022 sur un schéma vierge : colonnes, clé étrangère d’historique et index partiel uniques vérifiés.");
} finally {
  vierge.close();
}
