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

describe("Chantier 06 — Recette opérationnelle complète et intégrale", () => {
  it("exécute avec succès les 21 étapes du parcours de bout en bout", async () => {
    const db = await initBaseMemoire();

    // =========================================================================
    // ÉTAPE 1 : Création de l'opération centrale en mode BROUILLON (Admin Central)
    // =========================================================================
    const opId = "opc-recette-e2e-2026";
    db.exec(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, reference_administrative, intitule, description_contexte,
        type_intervention, annee_campagne, institution_responsable, objectif_general,
        source_vivres, statut, cree_par
      ) VALUES (
        '${opId}', 'OPC-2026-RECETTE-E2E', 'REF-MASSNAH-2026-REC-01',
        'Campagne Nationale d Assistance Alimentaire d Urgence 2026',
        'Appui d urgence aux populations affectées par la soudure agropastorale',
        'DISTRIBUTION_GRATUITE_VIVRES', '2026', 'MASSNAH',
        'Assister 2 000 ménages vulnérables dans les provinces de l Est',
        'ONASA', 'BROUILLON', 'usr-central'
      );
    `);
    const opCree = db.prepare("SELECT statut, intitule FROM operations_centrales_distribution WHERE id = ?").get(opId);
    expect(opCree.statut).toBe("BROUILLON");

    // =========================================================================
    // ÉTAPE 2 & 3 : Sélection des provinces, objectifs, critères et ressources
    // =========================================================================
    db.exec(`
      INSERT INTO operations_centrales_provinces (id, operation_id, province_id, quantite_allouee_prevue, nombre_menages_cibles_province, instructions_specifiques)
      VALUES
        ('opp-rec-01', '${opId}', 'prov-ouaddai', 50000, 1000, 'Priorité aux ménages périurbains et ruraux vulnérables de Ouara'),
        ('opp-rec-02', '${opId}', 'prov-sila', 50000, 1000, 'Priorité aux zones de retournés et communautés nomades');

      UPDATE operations_centrales_distribution
      SET nombre_previsionnel_menages = 2000,
          nombre_previsionnel_personnes = 12000,
          criteres_eligibilite = 'Ménages très pauvres selon l enquête harmonisée 2026',
          categories_beneficiaires = 'Pauvres extrêmes, personnes déplacées, cheffes de ménage isolées'
      WHERE id = '${opId}';
    `);

    // =========================================================================
    // ÉTAPE 4 : Enregistrement des actes formels d'approbation (Comité de pilotage + Arrêté)
    // =========================================================================
    db.exec(`
      -- 1. Approbation du Comité de pilotage
      INSERT INTO approbations_operations (
        id, operation_id, type_approbation, instance_decisionnaire, reference_acte,
        date_decision, signataire_nom, signataire_qualite, decision, enregistre_par
      ) VALUES (
        'appr-rec-01', '${opId}', 'COMITE_PILOTAGE', 'Comité National de Pilotage des Distributions',
        'PV-CNP-2026-03', date('now'), 'Dr. Mahamat Nour', 'Président du Comité', 'APPROUVE', 'usr-central'
      );

      -- 2. Validation ministérielle
      INSERT INTO approbations_operations (
        id, operation_id, type_approbation, instance_decisionnaire, reference_acte,
        date_decision, signataire_nom, signataire_qualite, decision, enregistre_par
      ) VALUES (
        'appr-rec-02', '${opId}', 'VALIDATION_MINISTERIELLE', 'Cabinet du Ministre MASSNAH',
        'ARRETE-2026-042-MASSNAH', date('now'), 'Mme la Ministre', 'Ministre de l Action Sociale', 'APPROUVE', 'usr-central'
      );
    `);

    // =========================================================================
    // ÉTAPE 5 : Transition vers APPROUVEE puis OUVERTE
    // =========================================================================
    db.exec(`
      UPDATE operations_centrales_distribution SET statut = 'APPROUVEE' WHERE id = '${opId}';
      UPDATE operations_centrales_distribution SET statut = 'OUVERTE' WHERE id = '${opId}';
    `);
    const opOuverte = db.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opId);
    expect(opOuverte.statut).toBe("OUVERTE");

    // =========================================================================
    // ÉTAPE 6 : Ouverture des dossiers d'exécution provinciaux
    // =========================================================================
    db.exec(`
      INSERT INTO dossiers_execution_provinciaux (id, operation_id, province_id, reference_dossier, statut_execution)
      VALUES
        ('doss-rec-ouaddai', '${opId}', 'prov-ouaddai', 'DOS-REC-OUA-2026', 'ASSIGNE'),
        ('doss-rec-sila', '${opId}', 'prov-sila', 'DOS-REC-SIL-2026', 'ASSIGNE');
    `);
    const dossiers = db.prepare("SELECT COUNT(*) AS total FROM dossiers_execution_provinciaux WHERE operation_id = ?").get(opId);
    expect(dossiers.total).toBe(2);

    // =========================================================================
    // ÉTAPE 7 : Localisation ciblée vérifiée (Urbain, Rural et Nomade)
    // =========================================================================
    db.exec(`
      INSERT INTO localites (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation)
      VALUES ('loc-abeche', 'prov-ouaddai', 'dep-ouaddai-ouara', 'Abéché', 'VILLE', 'SANS_ARRONDISSEMENT', 'VALIDE');

      INSERT INTO quartiers (id, localite_id, nom, possede_carres, statut_validation)
      VALUES ('qrt-rec-abeche-01', 'loc-abeche', 'Quartier Djar-El-Goz', 1, 'VALIDE');

      INSERT INTO carres (id, quartier_id, code_ou_nom, statut_validation)
      VALUES ('car-rec-abeche-01', 'qrt-rec-abeche-01', 'Carré de l Espoir', 'VALIDE');
    `);

    // =========================================================================
    // ÉTAPE 8 : Enregistrement de ménages bénéficiaires
    // =========================================================================
    const menage1Id = "men-rec-01";
    const menage2Id = "men-rec-02";
    db.exec(`
      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id, quartier_id, carre_id,
        nom_chef_menage, sexe_chef, nombre_personnes, telephone,
        categorie_population_id, criteres_vulnerabilite, date_enregistrement, statut, cree_par
      ) VALUES (
        '${menage1Id}', 'MEN-REC-OUA-001', 'prov-ouaddai', 'dep-ouaddai-ouara', 'loc-abeche', 'qrt-rec-abeche-01', 'car-rec-abeche-01',
        'Fatime Abdelkerim', 'F', 6, '+23566001122',
        'cat-pop-hote-vulnerable', 'vuln-femme-seule', date('now'), 'ACTIF', 'usr-ouaddai'
      );

      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id, quartier_id, carre_id,
        nom_chef_menage, sexe_chef, nombre_personnes, telephone,
        categorie_population_id, criteres_vulnerabilite, date_enregistrement, statut, cree_par
      ) VALUES (
        '${menage2Id}', 'MEN-REC-OUA-002', 'prov-ouaddai', 'dep-ouaddai-ouara', 'loc-abeche', 'qrt-rec-abeche-01', 'car-rec-abeche-01',
        'Mahamat Idriss', 'M', 7, '+23566334455',
        'cat-pop-deplace-interne', 'vuln-charge-elevee', date('now'), 'ACTIF', 'usr-ouaddai'
      );
    `);

    // =========================================================================
    // ÉTAPE 9 : Contrôle des doublons et validation d'intégrité
    // =========================================================================
    const doublons = db.prepare("SELECT COUNT(*) AS total FROM menages WHERE telephone = '+23566001122'").get();
    expect(doublons.total).toBe(1);

    // =========================================================================
    // ÉTAPE 10 : Validation de la liste de bénéficiaires par le délégué provincial
    // =========================================================================
    const listeId = "lst-rec-ouaddai-01";
    db.exec(`
      INSERT INTO listes_beneficiaires (
        id, reference_liste, intitule, province_id,
        nombre_menages_cibles, nombre_personnes_cibles, statut, cree_par
      ) VALUES (
        '${listeId}', 'LST-REC-OUA-2026-01', 'Liste ciblée Ouara Centre', 'prov-ouaddai',
        2, 13, 'PRETE', 'usr-ouaddai'
      );

      INSERT INTO inscriptions_beneficiaires (id, liste_id, menage_id, statut_verification)
      VALUES
        ('lgl-01', '${listeId}', '${menage1Id}', 'VALIDE'),
        ('lgl-02', '${listeId}', '${menage2Id}', 'VALIDE');

      UPDATE listes_beneficiaires SET statut = 'VERROUILLEE' WHERE id = '${listeId}';
    `);
    const listeValidee = db.prepare("SELECT statut FROM listes_beneficiaires WHERE id = ?").get(listeId);
    expect(listeValidee.statut).toBe("VERROUILLEE");

    // =========================================================================
    // ÉTAPE 11 : Approvisionnement central et expédition de vivres
    // =========================================================================
    const appRecId = "app-rec-e2e-01";
    db.exec(`
      INSERT INTO approvisionnements_centraux (
        id, reference, intitule_operation, date_creation, source_articles, nature_aide, statut, cree_par, operation_centrale_id
      ) VALUES (
        '${appRecId}', 'APP-REC-E2E-001', 'Expédition vivres Ouaddaï', date('now'), 'ENTREPOT_CENTRAL', 'ALIMENTAIRE', 'BROUILLON', 'usr-central', '${opId}'
      );

      INSERT INTO destinations_approvisionnement (id, approvisionnement_id, province_id, statut_destination)
      VALUES ('dest-rec-01', '${appRecId}', 'prov-ouaddai', 'PLANIFIEE');

      INSERT INTO articles_approvisionnement (id, approvisionnement_id, destination_id, province_id, article_id, quantite_allouee, quantite_expediee, quantite_receptionnee_acceptee)
      VALUES ('art-app-rec-01', '${appRecId}', 'dest-rec-01', 'prov-ouaddai', 'art-sorgho-50kg', 100, 0, 0);

      UPDATE approvisionnements_centraux SET statut = 'VALIDEE' WHERE id = '${appRecId}';
    `);

    const expRecId = "exp-rec-e2e-01";
    db.exec(`
      INSERT INTO expeditions (
        id, reference_expedition, approvisionnement_id, destination_id, province_destinataire_id,
        date_expedition, origine_expedition, entrepot_origine_id, reference_bordereau, statut_expedition, cree_par
      ) VALUES (
        '${expRecId}', 'EXP-REC-E2E-001', '${appRecId}', 'dest-rec-01', 'prov-ouaddai',
        date('now'), 'ENTREPOT_CENTRAL', 'ent-central-ndjamena', 'BORD-REC-001', 'EN_ROUTE', 'usr-central'
      );

      INSERT INTO lignes_expedition (id, expedition_id, article_approvisionnement_id, article_id, lot_origine_id, quantite_expediee)
      VALUES ('lig-exp-rec-01', '${expRecId}', 'art-app-rec-01', 'art-sorgho-50kg', 'lot-sorg-cen-01', 100);
    `);

    // =========================================================================
    // ÉTAPES 12 & 13 : Réception physique au magasin provincial et mise en stock
    // =========================================================================
    const recProvId = "rec-prov-e2e-01";
    const rsId = "rs-rec-e2e-01";
    const lotProvId = "lot-sorgho-rec-e2e-01";
    db.exec(`
      INSERT INTO receptions_stock (
        id, reference_reception, entrepot_id, province_id, type_entree, date_reception, numero_bordereau_externe, enregistre_par
      ) VALUES (
        '${rsId}', 'REC-STK-E2E-001', 'ent-prov-ouaddai', 'prov-ouaddai', 'APPROVISIONNEMENT_CENTRAL', date('now'), 'BORD-REC-001', 'usr-ouaddai'
      );

      INSERT INTO lots_stock (
        id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
        date_peremption, etat_qualite, quantite_initiale, quantite_physique, quantite_reservee
      ) VALUES (
        '${lotProvId}', 'LOT-SOR-REC-01', 'art-sorgho-50kg', 'ent-prov-ouaddai', 'prov-ouaddai', 'APPROVISIONNEMENT_CENTRAL',
        '${rsId}', '2027-12-31', 'BON', 100, 100, 0
      );

      INSERT INTO receptions_provinciales (
        id, reference_reception_prov, expedition_id, approvisionnement_id, province_id, entrepot_recepteur_id,
        date_reception, numero_pv_reception, comporte_ecarts, statut_rapprochement, enregistre_par, reception_stock_id
      ) VALUES (
        '${recProvId}', 'REC-E2E-OUA-001', '${expRecId}', '${appRecId}', 'prov-ouaddai', 'ent-prov-ouaddai',
        date('now'), 'PV-REC-E2E-001', 0, 'AUCUN', 'usr-ouaddai', '${rsId}'
      );

      INSERT INTO lignes_reception_provinciale (
        id, reception_provinciale_id, ligne_expedition_id, article_id,
        quantite_expediee, quantite_recue_physique, quantite_acceptee, quantite_endommagee, quantite_manquante,
        lot_cree_id, justification_ecart
      ) VALUES (
        'lig-rec-e2e-01', '${recProvId}', 'lig-exp-rec-01', 'art-sorgho-50kg',
        100, 100, 100, 0, 0, '${lotProvId}', 'Réception 100% conforme'
      );
    `);

    // =========================================================================
    // ÉTAPE 14 : Préparation de la distribution et réservation des rations
    // =========================================================================
    const distE2EId = "dist-e2e-ouaddai-01";
    db.exec(`
      INSERT INTO distributions_provinciales (
        id, reference_distribution, intitule_distribution, province_id, departement_id,
        nature_aide, objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue,
        entrepot_id, liste_beneficiaires_id, statut, cree_par, operation_centrale_id, dossier_execution_id
      ) VALUES (
        '${distE2EId}', 'DIST-E2E-OUA-2026-01', 'Distribution Djar-El-Goz', 'prov-ouaddai', 'dep-ouaddai-ouara',
        'ALIMENTAIRE', 'Remise vivres campagne 2026', 2, 13, date('now'),
        'ent-prov-ouaddai', '${listeId}', 'EN_PREPARATION', 'usr-ouaddai', '${opId}', 'doss-rec-ouaddai'
      );

      INSERT INTO articles_distribution (
        id, distribution_id, article_id, source_approvisionnement, lot_stock_id,
        ration_par_menage, quantite_totale_prevue, quantite_reservee, quantite_distribuee
      ) VALUES (
        'art-dist-e2e-01', '${distE2EId}', 'art-sorgho-50kg', 'APPROVISIONNEMENT_CENTRAL', '${lotProvId}',
        1, 2, 2, 0
      );

      -- Enregistrement des ménages convoqués à la distribution (en attente)
      INSERT INTO menages_distribution (id, distribution_id, province_id, menage_id, statut_service)
      VALUES
        ('md-01', '${distE2EId}', 'prov-ouaddai', '${menage1Id}', 'EN_ATTENTE'),
        ('md-02', '${distE2EId}', 'prov-ouaddai', '${menage2Id}', 'EN_ATTENTE');

      -- Validation provinciale par le délégué
      UPDATE distributions_provinciales SET statut = 'VALIDEE_PROVINCE' WHERE id = '${distE2EId}';
    `);

    // =========================================================================
    // ÉTAPES 15, 16 & 17 : Remise effective sur le terrain et déstockage unique
    // =========================================================================
    db.exec(`
      -- Passage en exécution terrain
      UPDATE distributions_provinciales SET statut = 'EN_EXECUTION' WHERE id = '${distE2EId}';

      -- Émargement des 2 ménages servis (1 sac de 50 kg par ménage)
      UPDATE menages_distribution SET statut_service = 'SERVI', date_service = date('now')
      WHERE distribution_id = '${distE2EId}';

      -- Décrémentation physique exacte : 2 sacs distribués
      UPDATE articles_distribution SET quantite_distribuee = 2 WHERE id = 'art-dist-e2e-01';
      UPDATE lots_stock SET quantite_physique = quantite_physique - 2 WHERE id = '${lotProvId}';
    `);

    const stockApresDist = db.prepare("SELECT quantite_physique FROM lots_stock WHERE id = ?").get(lotProvId);
    expect(stockApresDist.quantite_physique).toBe(98);

    // =========================================================================
    // ÉTAPE 18 : Déclaration d'achèvement provincial
    // =========================================================================
    db.exec(`
      UPDATE distributions_provinciales
      SET statut = 'TERMINEE_PROVINCE', date_declaration_fin = date('now')
      WHERE id = '${distE2EId}';

      UPDATE dossiers_execution_provinciaux
      SET statut_execution = 'RAPPORT_TRANSMIS',
          total_menages_servis = 2,
          total_personnes_servies = 13,
          quantite_totale_distribuee = 2,
          date_fin_reelle = date('now')
      WHERE id = 'doss-rec-ouaddai';
    `);

    // =========================================================================
    // ÉTAPE 19 : Consolidation nationale au niveau central
    // =========================================================================
    db.exec(`
      UPDATE operations_centrales_distribution SET statut = 'EN_CONSOLIDATION' WHERE id = '${opId}';
    `);
    const consolidation = db.prepare(`
      SELECT
        SUM(total_menages_servis) AS menages_consolides,
        SUM(quantite_totale_distribuee) AS vivres_consolides
      FROM dossiers_execution_provinciaux
      WHERE operation_id = ?
    `).get(opId);

    expect(consolidation.menages_consolides).toBe(2);
    expect(consolidation.vivres_consolides).toBe(2);

    // =========================================================================
    // ÉTAPES 20 & 21 : Clôture administrative de l'opération
    // =========================================================================
    db.exec(`
      UPDATE distributions_provinciales SET statut = 'CLOTUREE_CENTRAL' WHERE id = '${distE2EId}';
      UPDATE dossiers_execution_provinciaux SET statut_execution = 'VALIDE_CENTRAL' WHERE id = 'doss-rec-ouaddai';
      UPDATE operations_centrales_distribution SET statut = 'CLOTUREE' WHERE id = '${opId}';
    `);

    const opFinale = db.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opId);
    expect(opFinale.statut).toBe("CLOTUREE");

    // =========================================================================
    // Contrôle d'isolation provinciale : exclusion formelle d'un délégué externe
    // =========================================================================
    const vueDelegueSila = db.prepare(`
      SELECT COUNT(*) AS total
      FROM distributions_provinciales
      WHERE id = ? AND province_id = 'prov-sila'
    `).get(distE2EId);
    expect(vueDelegueSila.total).toBe(0);
  });
});
