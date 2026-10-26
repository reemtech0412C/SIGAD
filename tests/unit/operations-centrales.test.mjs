import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, it, beforeAll } from "vitest";

import {
  creerOperationCentrale,
  modifierOperationCentrale,
  changerStatutOperationCentrale,
  enregistrerApprobation,
  listerOperationsCentrales,
  lireDetailOperationCentrale,
  listerDossiersProvince,
  mettreAJourDossierDelegue,
  lireConsolidationNationale,
  ErreurOperationCentrale,
} from "../../backend/src/services/operation-centrale.service.ts";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function adapterD1(dbSync) {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) {
          params = args.map((a) => (a === undefined ? null : a));
          return this;
        },
        async all() {
          const stmt = dbSync.prepare(sql);
          const results = stmt.all(...params);
          return { results, success: true, meta: { changes: 0 } };
        },
        async first(col) {
          const stmt = dbSync.prepare(sql);
          const row = stmt.get(...params);
          if (!row) return null;
          if (col) return row[col] ?? null;
          return row;
        },
        async run() {
          const stmt = dbSync.prepare(sql);
          const info = stmt.run(...params);
          return { success: true, meta: { changes: Number(info.changes) } };
        },
      };
    },
    async batch(statements) {
      const results = [];
      dbSync.exec("BEGIN TRANSACTION;");
      try {
        for (const stmt of statements) {
          const res = await stmt.run();
          results.push(res);
        }
        dbSync.exec("COMMIT;");
      } catch (err) {
        dbSync.exec("ROLLBACK;");
        throw err;
      }
      return results;
    },
  };
}

describe("Opérations centrales de distribution — Arrêté n°0033/2026", () => {
  let dbSync;
  let db;
  let operationId;
  let dossiersCrees = [];

  const adminCentral = {
    id: "usr-central",
    identifiant: "central",
    nom_complet: "Administrateur Central SIGAD",
    role: "ADMIN_CENTRAL",
    province_id: null,
  };

  const delegueSila = {
    id: "usr-sila",
    identifiant: "sila",
    nom_complet: "Délégué Provincial Sila",
    role: "DELEGUE_PROVINCIAL",
    province_id: "prov-sila",
  };

  const delegueOuaddai = {
    id: "usr-ouaddai",
    identifiant: "ouaddai",
    nom_complet: "Délégué Provincial Ouaddaï",
    role: "DELEGUE_PROVINCIAL",
    province_id: "prov-ouaddai",
  };

  beforeAll(async () => {
    dbSync = new DatabaseSync(":memory:");
    dbSync.exec("PRAGMA foreign_keys = ON;");
    const fichiers = (await readdir(resolve(racine, "migrations")))
      .filter((f) => /^\d{4}_.*\.sql$/u.test(f))
      .sort((a, b) => a.localeCompare(b));

    for (const f of fichiers) {
      const sql = await readFile(resolve(racine, "migrations", f), "utf8");
      dbSync.exec(sql);
    }

    // Référentiels minimaux pour les distributions provinciales de Sila
    dbSync.prepare(`
      INSERT INTO departements (id, code, nom, province_id, actif)
      VALUES ('dep-djourf-al-ahmar', 'DJOURF', 'Djourf Al Ahmar', 'prov-sila', 1)
    `).run();
    dbSync.prepare(`
      INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id, actif)
      VALUES ('entrepot-sila', 'ENT-SILA', 'Entrepôt Provincial Goz Beïda', 'PROVINCIAL', 'prov-sila', 1)
    `).run();

    db = adapterD1(dbSync);
  });

  it("1. Création initiale d'une opération centrale par ADMIN_CENTRAL (Arrêté n°0033/2026)", async () => {
    // Vérifier l'état initial des stocks
    const mouvementsAvant = dbSync.prepare("SELECT COUNT(*) AS total FROM mouvements_stock").get().total;

    const charge = {
      intitule: "Assistance d’urgence alimentaire et nutritionnelle aux ménages affectés par le déficit pluviométrique (Campagne 2026–2027)",
      reference_juridique: "Arrêté n°0033/PR/PM/MASSNAH/SG/2026 du 7 octobre 2026",
      type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
      annee_campagne: "2026-2027",
      institution_responsable: "MASSNAH / Comité de pilotage",
      description_contexte: "Réponse d'urgence ciblée dans les provinces de l'Est touchées par le déficit pluviométrique",
      objectif_general: "Apporter une aide alimentaire d’urgence aux ménages vulnérables",
      categories_beneficiaires: "Ménages sinistrés, déplacés et vulnérables sans réserve alimentaire",
      criteres_eligibilite: "Résidence avérée, score de vulnérabilité SIGAD élevé",
      sources_donnees_ciblage: "Enquêtes de ciblage conjointes et registres SIGAD",
      nombre_previsionnel_menages: 15000,
      nombre_previsionnel_personnes: 90000,
      source_vivres: "ONASA",
      date_debut_prevue: "2026-11-01",
      date_fin_prevue: "2027-01-31",
      date_limite_preparation_provinciale: "2026-10-30",
      date_limite_transmission_rapports: "2027-02-15",
      provinces: [
        { province_id: "prov-sila", quantite_allouee_prevue: 5000, nombre_menages_cibles_province: 5000, instructions_specifiques: "Zone prioritaire 1" },
        { province_id: "prov-ouaddai", quantite_allouee_prevue: 6000, nombre_menages_cibles_province: 6000, instructions_specifiques: "Zone prioritaire 2" },
        { province_id: "prov-wadi-fira", quantite_allouee_prevue: 4000, nombre_menages_cibles_province: 4000, instructions_specifiques: "Zone prioritaire 3" },
      ],
    };

    const reponse = await creerOperationCentrale(
      db,
      adminCentral,
      charge,
      "idemp-opc-creation-00000001",
      "127.0.0.1",
    );

    assert.ok(reponse.corps.id, "L'opération centrale doit avoir un identifiant unique.");
    assert.match(reponse.corps.code_operation, /^OPC-2026-[A-Z0-9]+$/u, "Le code doit être préfixé par OPC-2026.");
    assert.equal(reponse.corps.statut, "BROUILLON", "Le statut initial doit être BROUILLON.");
    assert.equal(reponse.corps.nombre_provinces, 3, "Exactement 3 provinces doivent être couvertes.");

    operationId = reponse.corps.id;

    // Règle impérative : stricte non-altération des stocks à la création de l'opération
    const mouvementsApres = dbSync.prepare("SELECT COUNT(*) AS total FROM mouvements_stock").get().total;
    assert.equal(mouvementsApres, mouvementsAvant, "La création d'une opération centrale ne doit créer aucun mouvement de stock.");
  });

  it("2. Refus de création par un délégué provincial (RBAC central strict)", async () => {
    await assert.rejects(
      async () => {
        await creerOperationCentrale(
          db,
          delegueSila,
          {
            intitule: "Opération pirate non autorisée",
            type_intervention: "AUTRE",
            annee_campagne: "2026",
            source_vivres: "ONASA",
            provinces: [{ province_id: "prov-sila" }],
          },
          "idemp-opc-refus-000000001",
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurOperationCentrale && err.statutHttp === 403,
    );
  });

  it("3. Modification du brouillon et consultation du détail", async () => {
    const modif = {
      intitule: "Assistance d’urgence alimentaire — Arrêté n°0033/2026 (Révisée)",
      description_contexte: "Contexte mis à jour avec précision sur les couloirs logistiques",
      nombre_previsionnel_menages: 16000,
      nombre_previsionnel_personnes: 96000,
      provinces: [
        { province_id: "prov-sila", quantite_allouee_prevue: 5500, nombre_menages_cibles_province: 5500 },
        { province_id: "prov-ouaddai", quantite_allouee_prevue: 6500, nombre_menages_cibles_province: 6500 },
        { province_id: "prov-wadi-fira", quantite_allouee_prevue: 4000, nombre_menages_cibles_province: 4000 },
      ],
    };

    const maj = await modifierOperationCentrale(
      db,
      adminCentral,
      operationId,
      modif,
      "idemp-opc-modif-000000001",
      "127.0.0.1",
    );

    assert.equal(maj.statutHttp, 200);

    const detail = await lireDetailOperationCentrale(db, adminCentral, operationId);
    assert.equal(detail.intitule, modif.intitule);
    assert.equal(detail.nombre_previsionnel_menages, 16000);
    assert.equal(detail.provinces.length, 3);
  });

  it("4. Enregistrement des approbations de gouvernance et passage en revue", async () => {
    // 1. Avis favorable du Comité de pilotage (Matière technique)
    const appPilotage = await enregistrerApprobation(
      db,
      adminCentral,
      operationId,
      {
        type_approbation: "COMITE_PILOTAGE",
        instance_decisionnaire: "Comité national de pilotage",
        reference_acte: "Procès-verbal de délibération n°04/CP/2026",
        date_decision: "2026-10-15",
        signataire_nom: "Dr. Mahamat Nour",
        signataire_qualite: "Président du Comité de Pilotage",
        decision: "APPROUVE",
        reserves_ou_conditions: "Plan opérationnel conforme aux orientations de l'Arrêté n°0033/2026",
      },
      "idemp-opc-app-00000000001",
      "127.0.0.1",
    );
    assert.ok(appPilotage.corps.id);

    // Transition vers SOUMISE_A_APPROBATION
    await changerStatutOperationCentrale(
      db,
      adminCentral,
      operationId,
      { nouveau_statut: "SOUMISE_A_APPROBATION", motif_ou_commentaire: "Soumission pour approbation ministérielle" },
      "idemp-opc-statut-00000001",
      "127.0.0.1",
    );

    // 2. Décision ministérielle (MASSNAH)
    await enregistrerApprobation(
      db,
      adminCentral,
      operationId,
      {
        type_approbation: "VALIDATION_MINISTERIELLE",
        instance_decisionnaire: "Ministère de l'Action Sociale",
        reference_acte: "Décision ministérielle n°041/MASSNAH/SG/2026",
        date_decision: "2026-10-18",
        signataire_nom: "Mme la Secrétaire Générale",
        signataire_qualite: "Pour le Ministre et par délégation",
        decision: "APPROUVE",
        reserves_ou_conditions: "Approbation exécutoire accordée sans réserve",
      },
      "idemp-opc-app-00000000002",
      "127.0.0.1",
    );

    // Transition vers APPROUVEE
    await changerStatutOperationCentrale(
      db,
      adminCentral,
      operationId,
      { nouveau_statut: "APPROUVEE", motif_ou_commentaire: "Validation ministérielle formelle reçue" },
      "idemp-opc-statut-00000002",
      "127.0.0.1",
    );

    const detail = await lireDetailOperationCentrale(db, adminCentral, operationId);
    assert.equal(detail.statut, "APPROUVEE");
    assert.equal(detail.approbations.length, 2);
  });

  it("5. Ouverture de l'opération (OUVERTE) et génération atomique des dossiers d'exécution provinciaux", async () => {
    // Vérifier qu'aucun dossier n'existe pour cette opération
    const dossiersAvant = dbSync.prepare("SELECT COUNT(*) AS total FROM dossiers_execution_provinciaux WHERE operation_id = ?").get(operationId).total;
    assert.equal(dossiersAvant, 0);

    // Transition vers OUVERTE
    const res = await changerStatutOperationCentrale(
      db,
      adminCentral,
      operationId,
      { nouveau_statut: "OUVERTE", motif_ou_commentaire: "Ouverture officielle pour déploiement provincial" },
      "idemp-opc-statut-00000003",
      "127.0.0.1",
    );

    assert.equal(res.corps.nouveau_statut, "OUVERTE");

    // Vérifier la création atomique d'EXACTEMENT 3 dossiers d'exécution provinciaux
    const dossiersApres = dbSync.prepare("SELECT * FROM dossiers_execution_provinciaux WHERE operation_id = ? ORDER BY province_id").all(operationId);
    assert.equal(dossiersApres.length, 3, "Il doit y avoir un dossier d'exécution par province couverte.");

    const provincesDossiers = dossiersApres.map((d) => d.province_id);
    assert.deepEqual(provincesDossiers, ["prov-ouaddai", "prov-sila", "prov-wadi-fira"]);

    for (const dossier of dossiersApres) {
      assert.equal(dossier.statut_execution, "ASSIGNE");
      assert.match(dossier.reference_dossier, /^DEX-[A-Z]+-2026-[A-Z0-9]+$/u);
    }

    dossiersCrees = dossiersApres;
  });

  it("6. Isolation territoriale stricte des dossiers provinciaux (RBAC Délégué)", async () => {
    // Le délégué de Sila ne doit voir QUE les dossiers de Sila
    const dossiersSila = await listerDossiersProvince(db, "prov-sila", { limite: 50, decalage: 0 });
    assert.equal(dossiersSila.total, 1, "Sila ne doit voir que son propre dossier.");
    assert.equal(dossiersSila.elements[0].province_id, "prov-sila");

    // Le délégué de Ouaddaï ne doit voir QUE les dossiers d'Ouaddaï
    const dossiersOuaddai = await listerDossiersProvince(db, "prov-ouaddai", { limite: 50, decalage: 0 });
    assert.equal(dossiersOuaddai.total, 1, "Ouaddaï ne doit voir que son propre dossier.");
    assert.equal(dossiersOuaddai.elements[0].province_id, "prov-ouaddai");

    // Tentative d'un délégué de modifier le dossier d'une province non affectée -> REJET 404/403
    await assert.rejects(
      async () => {
        // Le délégué de Batha (non ciblée dans cette opération) tente d'accéder au dossier
        const delegueBatha = {
          id: "usr-batha",
          identifiant: "batha",
          nom_complet: "Délégué Batha",
          role: "DELEGUE_PROVINCIAL",
          province_id: "prov-batha",
        };
        await mettreAJourDossierDelegue(
          db,
          delegueBatha,
          operationId,
          { statut_execution: "EN_PREPARATION", observations_delegue: "Tentative d'intrusion" },
          "idemp-opc-intrusion-001",
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurOperationCentrale && err.statutHttp === 404,
    );
  });

  it("7. Mise à jour du dossier par le délégué compétent (Sila)", async () => {
    const maj = await mettreAJourDossierDelegue(
      db,
      delegueSila,
      operationId,
      {
        statut_execution: "EN_PREPARATION",
        plan_operationnel_local: "Dépouillement des listes de ménages en cours dans le département de Djourf Al Ahmar.",
        observations_delegue: "Mise en place de 2 équipes mobiles de vérification.",
        date_debut_reelle: "2026-11-05",
      },
      "idemp-opc-maj-dossier-001",
      "127.0.0.1",
    );

    assert.equal(maj.statutHttp, 200);

    const detailApres = await lireDetailOperationCentrale(db, adminCentral, operationId);
    const dossierSila = detailApres.dossiers.find((d) => d.province_id === "prov-sila");
    assert.ok(dossierSila);
    assert.equal(dossierSila.statut_execution, "EN_PREPARATION");
    assert.match(dossierSila.plan_operationnel_local, /Djourf Al Ahmar/);
  });

  it("8. Rattachement facultatif d'une distribution provinciale au dossier central", async () => {
    const dossierSila = dossiersCrees.find((d) => d.province_id === "prov-sila");

    // Insérer un enregistrement de distribution rattaché à l'opération centrale
    const distId = "dist-sila-opc-001";
    dbSync.prepare(`
      INSERT INTO distributions_provinciales (
        id, reference_distribution, intitule_distribution, province_id, departement_id,
        nature_aide, objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue,
        entrepot_id, statut, cree_par, operation_centrale_id, dossier_execution_id
      ) VALUES (
        ?, 'DIS-TD-SI-2026-0001', 'Distribution pilote Sila - Déficit pluviométrique',
        'prov-sila', 'dep-djourf-al-ahmar', 'ALIMENTAIRE', 'Distribution aux ménages ciblés',
        120, 720, '2026-11-10', 'entrepot-sila', 'VALIDEE_PROVINCE', 'usr-sila', ?, ?
      )
    `).run(distId, operationId, dossierSila.id);

    const distRecuperee = dbSync.prepare("SELECT * FROM distributions_provinciales WHERE id = ?").get(distId);
    assert.equal(distRecuperee.operation_centrale_id, operationId);
    assert.equal(distRecuperee.dossier_execution_id, dossierSila.id);

    // Distribution autonome sans rattachement (rétrocompatibilité préservée)
    const distAutonomeId = "dist-sila-autonome-001";
    dbSync.prepare(`
      INSERT INTO distributions_provinciales (
        id, reference_distribution, intitule_distribution, province_id, departement_id,
        nature_aide, objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue,
        entrepot_id, statut, cree_par
      ) VALUES (
        ?, 'DIS-TD-SI-2026-0002', 'Distribution autonome locale Sila',
        'prov-sila', 'dep-djourf-al-ahmar', 'ALIMENTAIRE', 'Aide d urgence locale',
        50, 300, '2026-11-12', 'entrepot-sila', 'BROUILLON', 'usr-sila'
      )
    `).run(distAutonomeId);

    const distAutonome = dbSync.prepare("SELECT * FROM distributions_provinciales WHERE id = ?").get(distAutonomeId);
    assert.equal(distAutonome.operation_centrale_id, null);
    assert.equal(distAutonome.dossier_execution_id, null);
  });

  it("9. Consolidation nationale des indicateurs d'exécution", async () => {
    const consolidation = await lireConsolidationNationale(db, adminCentral, operationId);

    assert.equal(consolidation.operation_id, operationId);
    assert.equal(consolidation.nombre_provinces_ciblees, 3);
    assert.equal(consolidation.nombre_previsionnel_menages_national, 16000);
    assert.equal(consolidation.provinces_detail.length, 3);

    // Vérifier la présence du dossier Sila avec son statut mis à jour
    const bilanSila = consolidation.provinces_detail.find((d) => d.province_id === "prov-sila");
    assert.ok(bilanSila);
    assert.equal(bilanSila.statut_execution, "EN_PREPARATION");
    assert.equal(bilanSila.nombre_distributions_provinciales, 1);
  });
});
