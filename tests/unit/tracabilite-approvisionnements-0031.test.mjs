import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dossierMigrations = resolve(racine, "migrations");

async function initBaseMemoire() {
  const dbSync = new DatabaseSync(":memory:");
  dbSync.exec("PRAGMA foreign_keys = ON;");

  const fichiers = (await readdir(dossierMigrations))
    .filter((nom) => /^\d{4}_.*\.sql$/u.test(nom))
    .sort((a, b) => a.localeCompare(b));

  for (const fichier of fichiers) {
    const sql = await readFile(resolve(dossierMigrations, fichier), "utf8");
    dbSync.exec(sql);
  }

  // Chargement des entrepôts et lots de démonstration pour banc de test
  const demoStocks = await readFile(resolve(racine, "tests/fixtures/demonstration-stocks.sql"), "utf8");
  dbSync.exec(demoStocks);

  return dbSync;
}

describe("Chantier 05 — Traçabilité intégrée opérations, approvisionnements et distributions", () => {
  it("relie l'opération centrale à l'approvisionnement, expédition, réception, stock et distribution", async () => {
    const db = await initBaseMemoire();

    // 1. Création d'une opération centrale de distribution
    const opId = "opc-test-tracabilite-01";
    db.exec(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, reference_administrative, intitule, type_intervention, annee_campagne,
        source_vivres, statut, cree_par
      ) VALUES (
        '${opId}', 'OPC-2026-TRAC-01', 'REF-MIN-2026-001', 'Distribution Vivres Ouaddai Campagne 2026',
        'DISTRIBUTION_GRATUITE_VIVRES', '2026', 'ONASA', 'OUVERTE', 'usr-central'
      );
    `);

    // Rattachement de la province Ouaddaï
    db.exec(`
      INSERT INTO operations_centrales_provinces (id, operation_id, province_id, quantite_allouee_prevue, nombre_menages_cibles_province)
      VALUES ('opp-01', '${opId}', 'prov-ouaddai', 50000, 1000);
    `);

    // Dossier d'exécution provincial
    db.exec(`
      INSERT INTO dossiers_execution_provinciaux (id, operation_id, province_id, reference_dossier, statut_execution)
      VALUES ('doss-01', '${opId}', 'prov-ouaddai', 'DOS-OUADDAI-2026-01', 'EN_PREPARATION');
    `);

    // 2. Approvisionnement central lié à l'opération (Migration 0031)
    const appLieId = "app-lie-01";
    db.exec(`
      INSERT INTO approvisionnements_centraux (
        id, reference, intitule_operation, date_creation, source_articles, nature_aide, statut, cree_par, operation_centrale_id
      ) VALUES (
        '${appLieId}', 'APP-NAT-2026-LIE-01', 'Convoi Vivres Ouaddaï', date('now'), 'ENTREPOT_CENTRAL', 'ALIMENTAIRE', 'BROUILLON', 'usr-central', '${opId}'
      );
    `);

    // Destination Ouaddaï
    db.exec(`
      INSERT INTO destinations_approvisionnement (id, approvisionnement_id, province_id, statut_destination)
      VALUES ('dest-01', '${appLieId}', 'prov-ouaddai', 'PLANIFIEE');
    `);

    // Allocation de 20 000 kg de Sorgho (400 sacs de 50 kg)
    db.exec(`
      INSERT INTO articles_approvisionnement (id, approvisionnement_id, destination_id, province_id, article_id, quantite_allouee, quantite_expediee, quantite_receptionnee_acceptee)
      VALUES ('art-app-01', '${appLieId}', 'dest-01', 'prov-ouaddai', 'art-sorgho-50kg', 400, 0, 0);

      -- Passage à VALIDEE après constitution du plan d'approvisionnement
      UPDATE approvisionnements_centraux SET statut = 'VALIDEE' WHERE id = '${appLieId}';
    `);

    // Vérification de la liaison facultative : l'approvisionnement autonome fonctionne aussi sans opération
    const appAutonomeId = "app-auto-01";
    db.exec(`
      INSERT INTO approvisionnements_centraux (
        id, reference, intitule_operation, date_creation, source_articles, nature_aide, statut, cree_par, operation_centrale_id
      ) VALUES (
        '${appAutonomeId}', 'APP-NAT-2026-AUTO-01', 'Approvisionnement d urgence autonome', date('now'), 'DON_PARTENAIRE', 'ALIMENTAIRE', 'VALIDEE', 'usr-central', NULL
      );
    `);
    const verificationLiaison = db.prepare("SELECT operation_centrale_id FROM approvisionnements_centraux WHERE id = ?").get(appAutonomeId);
    expect(verificationLiaison.operation_centrale_id).toBeNull();

    // 3. Expédition depuis le stock central N'Djaména vers l'entrepôt provincial d'Abéché
    const expId = "exp-01";
    db.exec(`
      INSERT INTO expeditions (
        id, reference_expedition, approvisionnement_id, destination_id, province_destinataire_id,
        date_expedition, origine_expedition, entrepot_origine_id, reference_bordereau, statut_expedition, cree_par
      ) VALUES (
        '${expId}', 'EXP-2026-001-OUADDAI', '${appLieId}', 'dest-01', 'prov-ouaddai',
        date('now'), 'ENTREPOT_CENTRAL', 'ent-central-ndjamena', 'BORD-2026-001', 'EN_ROUTE', 'usr-central'
      );

      INSERT INTO lignes_expedition (id, expedition_id, article_approvisionnement_id, article_id, lot_origine_id, quantite_expediee)
      VALUES ('lig-exp-01', '${expId}', 'art-app-01', 'art-sorgho-50kg', 'lot-sorg-cen-01', 400);
    `);

    // 4. Réception physique à l'entrepôt provincial Ouaddaï (Abéché) avec constatation d'un écart mineur (398 acceptés, 2 endommagés)
    const recId = "rec-01";
    const rsId = "rec-stock-01";
    const lotProvId = "lot-sorgho-abeche-01";
    const lotEndomId = "lot-sorgho-abeche-endommage-01";
    db.exec(`
      -- Création préalable de l'entrée de stock dans l'entrepôt provincial
      INSERT INTO receptions_stock (
        id, reference_reception, entrepot_id, province_id, type_entree, date_reception, numero_bordereau_externe, enregistre_par
      ) VALUES (
        '${rsId}', 'REC-STK-OUA-001', 'ent-prov-ouaddai', 'prov-ouaddai', 'APPROVISIONNEMENT_CENTRAL', date('now'), 'BORD-2026-001', 'usr-ouaddai'
      );

      -- Création du lot provincial accepté
      INSERT INTO lots_stock (
        id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
        date_peremption, etat_qualite, quantite_initiale, quantite_physique, quantite_reservee
      ) VALUES (
        '${lotProvId}', 'LOT-SOR-ABECHE-01', 'art-sorgho-50kg', 'ent-prov-ouaddai', 'prov-ouaddai', 'APPROVISIONNEMENT_CENTRAL',
        '${rsId}', '2027-12-31', 'BON', 398, 398, 0
      );

      -- Création du lot endommagé consigné à part
      INSERT INTO lots_stock (
        id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
        date_peremption, etat_qualite, quantite_initiale, quantite_physique, quantite_reservee
      ) VALUES (
        '${lotEndomId}', 'LOT-SOR-ABECHE-END-01', 'art-sorgho-50kg', 'ent-prov-ouaddai', 'prov-ouaddai', 'APPROVISIONNEMENT_CENTRAL',
        '${rsId}', '2027-12-31', 'ENDOMMAGE', 2, 2, 0
      );

      -- Procès-verbal de réception provinciale
      INSERT INTO receptions_provinciales (
        id, reference_reception_prov, expedition_id, approvisionnement_id, province_id, entrepot_recepteur_id,
        date_reception, numero_pv_reception, comporte_ecarts, statut_rapprochement, enregistre_par, reception_stock_id
      ) VALUES (
        '${recId}', 'REC-OUADDAI-2026-001', '${expId}', '${appLieId}', 'prov-ouaddai', 'ent-prov-ouaddai',
        date('now'), 'PV-REC-OUA-001', 1, 'RAPPROCHE_JUSTIFIE', 'usr-ouaddai', '${rsId}'
      );

      INSERT INTO lignes_reception_provinciale (
        id, reception_provinciale_id, ligne_expedition_id, article_id,
        quantite_expediee, quantite_recue_physique, quantite_acceptee, quantite_endommagee, quantite_manquante,
        lot_cree_id, lot_endommage_id, justification_ecart
      ) VALUES (
        'lig-rec-01', '${recId}', 'lig-exp-01', 'art-sorgho-50kg',
        400, 400, 398, 2, 0,
        '${lotProvId}', '${lotEndomId}', '2 sacs percés pendant le transit, avarie constatée contradictoirement'
      );
    `);

    // 5. Vérification de la chaîne de traçabilité des quantités
    const synthese = db.prepare(`
      SELECT
        a.reference AS ref_approvisionnement,
        aa.quantite_allouee,
        aa.quantite_expediee,
        aa.quantite_receptionnee_acceptee,
        lr.quantite_endommagee,
        lr.quantite_manquante,
        (ls.quantite_physique - ls.quantite_reservee) AS stock_magasin_disponible
      FROM approvisionnements_centraux a
      INNER JOIN articles_approvisionnement aa ON aa.approvisionnement_id = a.id
      INNER JOIN lignes_expedition le ON le.article_approvisionnement_id = aa.id
      INNER JOIN lignes_reception_provinciale lr ON lr.ligne_expedition_id = le.id
      INNER JOIN lots_stock ls ON ls.id = lr.lot_cree_id
      WHERE a.id = ?
    `).get(appLieId);

    expect(synthese.quantite_allouee).toBe(400);
    expect(synthese.quantite_expediee).toBe(400);
    expect(synthese.quantite_receptionnee_acceptee).toBe(398);
    expect(synthese.quantite_endommagee).toBe(2);
    expect(synthese.quantite_manquante).toBe(0);
    expect(synthese.stock_magasin_disponible).toBe(398);

    // 6. Distribution provinciale liée au dossier central
    const distId = "dist-ouaddai-01";
    db.exec(`
      INSERT INTO distributions_provinciales (
        id, reference_distribution, intitule_distribution, province_id, departement_id,
        nature_aide, objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue,
        entrepot_id, statut, cree_par, operation_centrale_id, dossier_execution_id
      ) VALUES (
        '${distId}', 'DIST-OUADDAI-2026-001', 'Distribution vivres Ouara', 'prov-ouaddai', 'dep-ouaddai-ouara',
        'ALIMENTAIRE', 'Appui aux ménages vulnérables de Ouara', 100, 600, date('now'),
        'ent-prov-ouaddai', 'EN_PREPARATION', 'usr-ouaddai', '${opId}', 'doss-01'
      );

      INSERT INTO articles_distribution (
        id, distribution_id, article_id, source_approvisionnement, lot_stock_id,
        ration_par_menage, quantite_totale_prevue, quantite_reservee, quantite_distribuee
      ) VALUES (
        'art-dist-01', '${distId}', 'art-sorgho-50kg', 'APPROVISIONNEMENT_CENTRAL', '${lotProvId}',
        1, 100, 100, 0
      );

      -- Validation par le délégué provincial puis passage en exécution terrain
      UPDATE distributions_provinciales SET statut = 'VALIDEE_PROVINCE' WHERE id = '${distId}';
      UPDATE distributions_provinciales SET statut = 'EN_EXECUTION' WHERE id = '${distId}';
      UPDATE articles_distribution SET quantite_distribuee = 98 WHERE id = 'art-dist-01';
      UPDATE lots_stock SET quantite_physique = quantite_physique - 98 WHERE id = '${lotProvId}';
    `);

    const stockFinal = db.prepare("SELECT quantite_physique FROM lots_stock WHERE id = ?").get(lotProvId);
    expect(stockFinal.quantite_physique).toBe(300);
  });
});
