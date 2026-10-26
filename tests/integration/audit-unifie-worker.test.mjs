import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { test } from "node:test";

const racine = resolve(import.meta.dirname, "../..");

function ouvrirD1Locale() {
  const dossier = process.env.SIGAD_D1_STATE_DIR;
  if (!dossier) throw new Error("Le chemin D1 local du test d’audit est absent.");
  for (const nom of readdirSync(dossier).filter((entree) => entree.endsWith(".sqlite") && entree !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossier, nom));
    if (base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evenements_audit'").get()) return base;
    base.close();
  }
  throw new Error("La base D1 locale ne contient pas le journal d’audit unifié.");
}

test("B2.4 — adaptateurs d’audit, corrélation, expurgation et immuabilité", () => {
  const base = ouvrirD1Locale();
  const suffixe = randomUUID().replaceAll("-", "");
  const acteurId = "usr-central";
  const donneesSensibles = JSON.stringify({
    nom_complet: "PERSONNE_SYNTHETIQUE_B24",
    courriel: "audit-person@example.invalid",
    telephone: "23566000000",
    jeton: "Bearer secret-test-token-123456789",
  });

  try {
    const requestIds = {
      journal: `req-journal-${suffixe}`,
      territoire: `req-territoire-${suffixe}`,
      decoupage: `req-decoupage-${suffixe}`,
      compte: `req-compte-${suffixe}`,
      operation: `req-operation-${suffixe}`,
    };

    base.prepare(`INSERT INTO journaux_audit
      (id, utilisateur_id, role_utilisateur, action, entite_type, entite_id, donnees_apres, request_id)
      VALUES (?, ?, 'ADMIN_CENTRAL', 'EXPORT_DONNEES_NOMINATIVES', 'RAPPORT', ?, ?, ?)`)
      .run(`journal-${suffixe}`, acteurId, `rapport-${suffixe}`, donneesSensibles, requestIds.journal);

    base.prepare(`INSERT INTO audits_territoire
      (id, action, entite_type, entite_id, utilisateur_id, anciennes_valeurs, nouvelles_valeurs, motif, request_id)
      VALUES (?, 'FUSION', 'DEPARTEMENT', ?, ?, ?, ?, ?, ?)`)
      .run(`territoire-${suffixe}`, `departement-${suffixe}`, acteurId, donneesSensibles, donneesSensibles,
        `Motif avec PII audit-person@example.invalid`, requestIds.territoire);

    base.prepare(`INSERT INTO historique_decoupages
      (id, entite_type, entite_id, type_modification, anciennes_valeurs, nouvelles_valeurs,
       source_officielle, date_effet, auteur_id, request_id)
      VALUES (?, 'DEPARTEMENT', ?, 'VALIDATION_PROPOSITION', ?, ?, 'Source synthétique de test', '2026-10-26', ?, ?)`)
      .run(`decoupage-${suffixe}`, `departement-${suffixe}`, donneesSensibles, donneesSensibles, acteurId, requestIds.decoupage);

    base.prepare(`INSERT INTO decisions_comptes
      (id, acteur_id, utilisateur_cible_id, action, motif, details_json, request_id)
      VALUES (?, ?, 'usr-sila', 'SUSPENSION_DELEGUE', ?, ?, ?)`)
      .run(`decision-${suffixe}`, acteurId, `Motif synthétique avec le jeton secret-test-token-123456789`, donneesSensibles, requestIds.compte);

    const operationId = `operation-${suffixe}`;
    base.prepare(`INSERT INTO operations_centrales_distribution
      (id, code_operation, intitule, annee_campagne, cree_par)
      VALUES (?, ?, 'Opération synthétique B2.4', '2026', ?)`)
      .run(operationId, `TEST-B24-${suffixe}`, acteurId);
    base.prepare(`INSERT INTO historique_operations_centrales
      (id, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id, request_id)
      VALUES (?, ?, 'BROUILLON', 'SOUMISE_A_APPROBATION', ?, ?, ?)`)
      .run(`operation-historique-${suffixe}`, operationId, `Commentaire synthétique ${donneesSensibles}`, acteurId, requestIds.operation);

    const sources = [
      ["journaux_audit", `journal-${suffixe}`, requestIds.journal],
      ["audits_territoire", `territoire-${suffixe}`, requestIds.territoire],
      ["historique_decoupages", `decoupage-${suffixe}`, requestIds.decoupage],
      ["decisions_comptes", `decision-${suffixe}`, requestIds.compte],
      ["historique_operations_centrales", `operation-historique-${suffixe}`, requestIds.operation],
    ];
    for (const [sourceTable, sourceId, requestId] of sources) {
      const evenement = base.prepare(
        "SELECT source_table, source_id, request_id, acteur_id, acteur_role, action, cible_type, cible_id, avant, apres, motif, resultat FROM evenements_audit WHERE source_table = ? AND source_id = ?",
      ).get(sourceTable, sourceId);
      assert.ok(evenement, `${sourceTable} doit alimenter le journal unifié.`);
      assert.equal(evenement.request_id, requestId);
      assert.equal(evenement.acteur_id, acteurId);
      assert.equal(evenement.resultat, "SUCCES");
      const rendu = JSON.stringify(evenement);
      assert.doesNotMatch(rendu, /PERSONNE_SYNTHETIQUE_B24|audit-person@example\.invalid|23566000000|secret-test-token-123456789/iu,
        "Les instantanés et motifs libres des journaux spécialisés ne doivent pas être recopiés dans l’événement unifié.");
    }
    assert.equal(base.prepare("SELECT action FROM evenements_audit WHERE source_table = 'audits_territoire' AND source_id = ?")
      .get(`territoire-${suffixe}`).action, "FUSION_TERRITORIALE");

    const requestIdDeduplication = `req-dedup-${suffixe}`;
    const cibleDeduplication = `cible-dedup-${suffixe}`;
    base.prepare(`INSERT INTO journaux_audit
      (id, utilisateur_id, role_utilisateur, action, entite_type, entite_id, request_id)
      VALUES (?, ?, 'ADMIN_CENTRAL', 'FUSION_TERRITORIALE', 'DEPARTEMENT', ?, ?)`)
      .run(`journal-dedup-${suffixe}`, acteurId, cibleDeduplication, requestIdDeduplication);
    base.prepare(`INSERT INTO audits_territoire
      (id, action, entite_type, entite_id, utilisateur_id, request_id)
      VALUES (?, 'FUSION', 'DEPARTEMENT', ?, ?, ?)`)
      .run(`territoire-dedup-${suffixe}`, cibleDeduplication, acteurId, requestIdDeduplication);
    assert.equal(base.prepare("SELECT COUNT(*) AS total FROM evenements_audit WHERE request_id = ? AND cible_id = ?")
      .get(requestIdDeduplication, cibleDeduplication).total, 1,
    "Deux sources historiques du même acte ne doivent créer qu’un événement pour la même requête et la même cible.");

    const eventId = base.prepare("SELECT id FROM evenements_audit WHERE source_table = 'journaux_audit' AND source_id = ?")
      .get(`journal-${suffixe}`).id;
    assert.throws(() => base.prepare("UPDATE evenements_audit SET action = 'ALTÉRATION' WHERE id = ?").run(eventId), /EVENEMENTS_AUDIT_IMMUABLE/u);
    assert.throws(() => base.prepare("DELETE FROM evenements_audit WHERE id = ?").run(eventId), /EVENEMENTS_AUDIT_IMMUABLE/u);
    assert.equal(base.prepare("SELECT COUNT(*) AS total FROM journaux_audit WHERE id = ?").get(`journal-${suffixe}`).total, 1,
      "L’adaptateur conserve le journal spécialisé existant.");
  } finally {
    base.close();
  }
});
