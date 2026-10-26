import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, it, beforeAll } from "vitest";

import {
  validerAccesProprietaire,
  verifierMotDePasseProprietaire,
  analyserDependancesEtEligibilite,
  listerOperationsDonneesTest,
  reclassifierOperation,
  supprimerOperationTest,
  nettoyageLotDonneesTest,
  listerHistoriqueSuppressions,
  listerFileReconciliationR2,
  traiterFileReconciliationR2,
  ErreurDonneesTest,
} from "../../backend/src/services/donnees-test.service.ts";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";

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

function creerBucketMock() {
  const objets = new Map();
  const suppressions = [];
  const bucket = {
    async put(cle, contenu) {
      objets.set(cle, contenu);
      return {};
    },
    async delete(cle) {
      suppressions.push(cle);
      objets.delete(cle);
    },
  };
  return { bucket, objets, suppressions };
}

describe("Gestion sécurisée des données de test — Compte PROPRIETAIRE", () => {
  let dbSync;
  let db;
  let bucketMock;

  const MOT_DE_PASSE_PROPRIETAIRE = "Proprio-Secret-Securise-2026!";

  const utilisateurProprietaire = {
    id: "usr-proprietaire",
    identifiant: "proprietaire",
    nom_complet: "Propriétaire Système SIGAD",
    role: "PROPRIETAIRE",
    province_id: null,
  };

  const utilisateurAdminCentral = {
    id: "usr-central",
    identifiant: "central",
    nom_complet: "Admin Central",
    role: "ADMIN_CENTRAL",
    province_id: null,
  };

  const utilisateurDelegue = {
    id: "usr-delegue",
    identifiant: "delegue_sila",
    nom_complet: "Délégué Sila",
    role: "DELEGUE_PROVINCIAL",
    province_id: "prov-sila",
  };

  const utilisateurConsultation = {
    id: "usr-consultation",
    identifiant: "partenaire_onu",
    nom_complet: "Observateur ONU",
    role: "CONSULTATION_INSTITUTIONNELLE",
    province_id: null,
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

    // Créer ou mettre à jour le compte PROPRIETAIRE avec mot de passe haché connu
    const mdpHache = await hacherMotDePasse(MOT_DE_PASSE_PROPRIETAIRE);
    const proprietaireExiste = dbSync.prepare("SELECT id FROM utilisateurs WHERE id = 'usr-proprietaire'").get();
    if (proprietaireExiste) {
      dbSync.prepare("UPDATE utilisateurs SET mot_de_passe_hash = ?, statut = 'ACTIF' WHERE id = 'usr-proprietaire'").run(mdpHache);
    } else {
      dbSync.prepare(`
        INSERT INTO utilisateurs (id, identifiant, nom_complet, role, mot_de_passe_hash, statut, double_facteur_actif)
        VALUES ('usr-proprietaire', 'proprietaire', 'Propriétaire Système SIGAD', 'PROPRIETAIRE', ?, 'ACTIF', 1)
      `).run(mdpHache);
    }

    // Référentiels territoriaux pour nos tests
    dbSync.prepare(`
      INSERT OR IGNORE INTO departements (id, code, nom, province_id, actif)
      VALUES ('dep-djourf-al-ahmar', 'DJOURF', 'Djourf Al Ahmar', 'prov-sila', 1)
    `).run();
    dbSync.prepare(`
      INSERT OR IGNORE INTO entrepots (id, code_entrepot, nom, niveau, province_id, actif)
      VALUES ('entrepot-sila', 'ENT-SILA', 'Entrepôt Provincial Goz Beïda', 'PROVINCIAL', 'prov-sila', 1)
    `).run();
    dbSync.prepare(`
      INSERT OR IGNORE INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, actif)
      VALUES ('art-sorgho', 'SORGHO-50', 'Sorgho blanc 50kg', 'cat-alimentaire', 'unit-sac', 1)
    `).run();

    db = adapterD1(dbSync);
    bucketMock = creerBucketMock();
  });

  it("1. Contrôle d'accès strict : PROPRIETAIRE seul autorisé, rejet 403 pour tous les autres rôles", () => {
    // PROPRIETAIRE doit passer sans exception
    assert.doesNotThrow(() => {
      validerAccesProprietaire(utilisateurProprietaire);
    });

    // ADMIN_CENTRAL doit être rejeté avec 403
    assert.throws(
      () => validerAccesProprietaire(utilisateurAdminCentral),
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 403 && err.code === "ACCES_REFUSE_PROPRIETAIRE_REQUIS",
    );

    // DELEGUE_PROVINCIAL doit être rejeté avec 403
    assert.throws(
      () => validerAccesProprietaire(utilisateurDelegue),
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 403 && err.code === "ACCES_REFUSE_PROPRIETAIRE_REQUIS",
    );

    // CONSULTATION_INSTITUTIONNELLE doit être rejetée avec 403
    assert.throws(
      () => validerAccesProprietaire(utilisateurConsultation),
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 403 && err.code === "ACCES_REFUSE_PROPRIETAIRE_REQUIS",
    );
  });

  it("2. Vérification du mot de passe propriétaire", async () => {
    await assert.doesNotReject(async () => {
      await verifierMotDePasseProprietaire(db, "usr-proprietaire", MOT_DE_PASSE_PROPRIETAIRE);
    });

    await assert.rejects(
      async () => {
        await verifierMotDePasseProprietaire(db, "usr-proprietaire", "Mauvais-Mot-De-Passe-123");
      },
      (err) => err instanceof ErreurDonneesTest && err.code === "MOT_DE_PASSE_PROPRIETAIRE_INCORRECT",
    );

    await assert.rejects(
      async () => {
        await verifierMotDePasseProprietaire(db, "usr-inconnu", MOT_DE_PASSE_PROPRIETAIRE);
      },
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 403,
    );
  });

  it("3. Structure D1 de la migration 0027 et déclencheurs d'immuabilité de l'audit", () => {
    const idAudit = "audit-immutabilite-test";
    dbSync.prepare(`
      INSERT INTO audits_suppression_donnees_test (
        id, entite_type, entite_id, code_entite, intitule_entite,
        utilisateur_id, utilisateur_identifiant, utilisateur_nom,
        motif, perimetre_supprime_json, documents_r2_supprimes_json,
        details_verification_json, statut_resultat
      ) VALUES (
        ?, 'OPERATION_CENTRALE', 'op-test-audit', 'OPC-AUDIT-001', 'Opération Test Audit',
        'usr-proprietaire', 'proprietaire', 'Propriétaire Système',
        'Motif vérification immuabilité', '{"operations_centrales_provinces": 1}', '[]',
        '{"stock": 0}', 'SUCCES'
      )
    `).run(idAudit);

    // Tenter de modifier l'audit doit échouer à cause du trigger trg_audit_suppr_test_no_update
    assert.throws(() => {
      dbSync.prepare("UPDATE audits_suppression_donnees_test SET motif = 'Motif altéré' WHERE id = ?").run(idAudit);
    }, /strictement immuable/iu);

    // Tenter de supprimer l'audit doit échouer à cause du trigger trg_audit_suppr_test_no_delete
    assert.throws(() => {
      dbSync.prepare("DELETE FROM audits_suppression_donnees_test WHERE id = ?").run(idAudit);
    }, /ne peuvent pas être supprimés/iu);

    // Vérifier que la table demandes_reclassification_donnees existe
    const tableReclass = dbSync.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='demandes_reclassification_donnees'").get();
    assert.ok(tableReclass);
  });

  it("4. Analyse d'éligibilité : refus des opérations REEL et INDETERMINE", async () => {
    // Insérer une opération REEL
    const idReel = "op-reel-001";
    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable,
        statut, nature_donnees, cree_par
      ) VALUES (
        ?, 'OPC-REEL-001', 'Opération Réelle Production', '2026-2027', 'MASSNAH',
        'OUVERTE', 'REEL', 'usr-central'
      )
    `).run(idReel);

    const analyseReel = await analyserDependancesEtEligibilite(db, idReel);
    assert.equal(analyseReel.statut_eligibilite, "PROTEGE_REEL");
    assert.equal(analyseReel.eligible, false);
    assert.ok(analyseReel.motif_refus?.includes("classifiée REEL"));

    // Insérer une opération INDETERMINE (cas hérité Staging)
    const idIndet = "op-indet-001";
    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable,
        statut, nature_donnees, cree_par
      ) VALUES (
        ?, 'OPC-INDET-001', 'Opération Non Classifiée Staging', '2026-2027', 'MASSNAH',
        'BROUILLON', 'INDETERMINE', 'usr-central'
      )
    `).run(idIndet);

    const analyseIndet = await analyserDependancesEtEligibilite(db, idIndet);
    assert.equal(analyseIndet.statut_eligibilite, "NON_CONFIRME");
    assert.equal(analyseIndet.eligible, false);
    assert.ok(analyseIndet.motif_refus?.includes("non étiquetée"));
  });

  it("5. Reclassification administrative d'une opération INDETERMINE en TEST avec justification", async () => {
    const idIndet = "op-indet-001";

    // Échec si mauvais mot de passe
    await assert.rejects(
      async () => {
        await reclassifierOperation(
          db,
          utilisateurProprietaire,
          idIndet,
          {
            nature_cible: "TEST",
            motif: "Créée lors du test d'acceptation du module sur Staging sans mouvement physique",
            preuves_justificatives: "Réf PV test Staging session 2026-10-24 et arrêtés de test",
            mot_de_passe_confirmation: "Mauvais-MDP",
          },
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurDonneesTest && err.code === "MOT_DE_PASSE_PROPRIETAIRE_INCORRECT",
    );

    // Succès avec mot de passe valide
    const resultat = await reclassifierOperation(
      db,
      utilisateurProprietaire,
      idIndet,
      {
        nature_cible: "TEST",
        motif: "Créée lors du test d'acceptation du module sur Staging sans mouvement physique",
        preuves_justificatives: "Réf PV test Staging session 2026-10-24 et arrêtés de test",
        mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
      },
      "127.0.0.1",
    );

    assert.equal(resultat.nouveau_statut_nature, "TEST");

    // Vérifier en base la mise à jour
    const opMaj = dbSync.prepare("SELECT nature_donnees FROM operations_centrales_distribution WHERE id = ?").get(idIndet);
    assert.equal(opMaj.nature_donnees, "TEST");

    // Vérifier l'enregistrement de la demande de reclassification
    const traceReclass = dbSync.prepare("SELECT * FROM demandes_reclassification_donnees WHERE entite_id = ?").get(idIndet);
    assert.ok(traceReclass);
    assert.equal(traceReclass.nature_cible, "TEST");
    assert.equal(traceReclass.statut, "APPROUVEE");
  });

  it("6. Blocage d'éligibilité si distributions engagées ou validées sont rattachées", async () => {
    const idOpAvecDist = "op-test-stock-001";
    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable,
        statut, nature_donnees, cree_par
      ) VALUES (
        ?, 'OPC-TEST-STK', 'Opération Test avec Distribution Active', '2026-2027', 'MASSNAH',
        'OUVERTE', 'TEST', 'usr-central'
      )
    `).run(idOpAvecDist);

    // Rattacher une distribution provinciale active (non brouillon)
    dbSync.prepare(`
      INSERT INTO distributions_provinciales (
        id, reference_distribution, intitule_distribution, province_id, departement_id,
        nature_aide, objectif, nombre_menages_cibles, nombre_personnes_cibles,
        date_prevue, entrepot_id, statut, cree_par, operation_centrale_id, nature_donnees
      ) VALUES (
        'dist-act-001', 'DIST-SILA-ACT-01', 'Distribution Sila Validée', 'prov-sila', 'dep-djourf-al-ahmar',
        'VIVRES', 'Assistance', 100, 500,
        '2026-10-24', 'entrepot-sila', 'EN_EXECUTION', 'usr-central', ?, 'TEST'
      )
    `).run(idOpAvecDist);

    const analyse = await analyserDependancesEtEligibilite(db, idOpAvecDist);
    assert.equal(analyse.statut_eligibilite, "BLOQUE_DISTRIBUTIONS_VALIDEES");
    assert.equal(analyse.eligible, false);
    assert.ok(analyse.motif_refus?.includes("distributions ont été exécutées ou validées"));

    // Reclassification vers TEST d'une opération avec actes physiques doit échouer
    await assert.rejects(
      async () => {
        await reclassifierOperation(
          db,
          utilisateurProprietaire,
          idOpAvecDist,
          {
            nature_cible: "TEST",
            motif: "Tentative reclassification avec distribution active",
            preuves_justificatives: "Preuve insuffisante",
            mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
          },
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 409,
    );
  });

  it("7. Suppression sécurisée d'une opération de test éligible (avec documents R2 associés)", async () => {
    const idOpPurge = "op-test-purge-001";
    const codeOpPurge = "OPC-PURGE-999";
    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable,
        statut, nature_donnees, cree_par
      ) VALUES (
        ?, ?, 'Opération Test Destinée à la Purge', '2026-2027', 'MASSNAH',
        'BROUILLON', 'TEST', 'usr-central'
      )
    `).run(idOpPurge, codeOpPurge);

    // Rattacher une province et un dossier d'exécution
    dbSync.prepare(`
      INSERT INTO operations_centrales_provinces (id, operation_id, province_id, quantite_allouee_prevue)
      VALUES ('opp-001', ?, 'prov-sila', 500)
    `).run(idOpPurge);

    dbSync.prepare(`
      INSERT INTO dossiers_execution_provinciaux (id, operation_id, province_id, reference_dossier, statut_execution)
      VALUES ('doss-001', ?, 'prov-sila', 'DOSS-OPC-PURGE-SILA', 'ASSIGNE')
    `).run(idOpPurge);

    // Rattacher une approbation et un document avec clé R2
    dbSync.prepare(`
      INSERT INTO approbations_operations (
        id, operation_id, type_approbation, instance_decisionnaire, reference_acte,
        date_decision, signataire_nom, signataire_qualite, decision, enregistre_par
      ) VALUES (
        'appr-001', ?, 'VALIDATION_MINISTERIELLE', 'Cabinet MASSNAH', 'DEC-001-TEST',
        '2026-10-24', 'Ministre', 'Ministre', 'APPROUVE', 'usr-central'
      )
    `).run(idOpPurge);

    const cleR2Test = `operations/${idOpPurge}/documents/arrete-test.pdf`;
    await bucketMock.bucket.put(cleR2Test, "contenu-factice");
    dbSync.prepare(`
      INSERT INTO documents_operations (
        id, operation_id, categorie_document, intitule, cle_r2,
        nom_fichier_original, type_mime, taille_octets, televerse_par
      ) VALUES (
        'doc-001', ?, 'ARRETE_MINISTERIEL', 'Arrêté de test', ?,
        'arrete-test.pdf', 'application/pdf', 1234, 'usr-central'
      )
    `).run(idOpPurge, cleR2Test);

    // 7.1 Vérifier éligibilité
    const analyse = await analyserDependancesEtEligibilite(db, idOpPurge);
    assert.equal(analyse.statut_eligibilite, "ELIGIBLE");
    assert.equal(analyse.eligible, true);
    assert.equal(analyse.motif_refus, null);

    // 7.2 Échec si mauvais code de confirmation
    await assert.rejects(
      async () => {
        await supprimerOperationTest(
          db,
          bucketMock.bucket,
          utilisateurProprietaire,
          idOpPurge,
          {
            confirmation_code: "MAUVAIS-CODE",
            mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
            motif: "Nettoyage opération test de vérification d'intégration",
          },
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 400,
    );

    // 7.3 Échec si mot de passe propriétaire incorrect
    await assert.rejects(
      async () => {
        await supprimerOperationTest(
          db,
          bucketMock.bucket,
          utilisateurProprietaire,
          idOpPurge,
          {
            confirmation_code: codeOpPurge,
            mot_de_passe_confirmation: "Mauvais-MDP",
            motif: "Nettoyage opération test de vérification d'intégration",
          },
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurDonneesTest && err.code === "MOT_DE_PASSE_PROPRIETAIRE_INCORRECT",
    );

    // 7.4 Succès de la suppression
    const resultat = await supprimerOperationTest(
      db,
      bucketMock.bucket,
      utilisateurProprietaire,
      idOpPurge,
      {
        confirmation_code: codeOpPurge,
        mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
        motif: "Nettoyage opération test de vérification d'intégration",
      },
      "127.0.0.1",
    );

    assert.equal(resultat.succes, true);
    assert.equal(resultat.code_operation, codeOpPurge);
    assert.ok(resultat.perimetre_supprime.operations_centrales_distribution >= 1);
    assert.ok(resultat.perimetre_supprime.dossiers_execution_provinciaux >= 1);
    assert.ok(resultat.perimetre_supprime.documents_operations >= 1);
    assert.ok(resultat.fichiers_r2_supprimes.includes(cleR2Test));

    // 7.5 Vérifier la disparition en base de données
    const opApres = dbSync.prepare("SELECT * FROM operations_centrales_distribution WHERE id = ?").get(idOpPurge);
    assert.equal(opApres, undefined);

    const docApres = dbSync.prepare("SELECT * FROM documents_operations WHERE operation_id = ?").get(idOpPurge);
    assert.equal(docApres, undefined);

    // 7.6 Vérifier la purge effective dans R2
    assert.ok(bucketMock.suppressions.includes(cleR2Test));

    // 7.7 Vérifier la création de l'enregistrement d'audit immuable
    const audit = dbSync.prepare("SELECT * FROM audits_suppression_donnees_test WHERE entite_id = ?").get(idOpPurge);
    assert.ok(audit);
    assert.equal(audit.code_entite, codeOpPurge);
    assert.equal(audit.utilisateur_id, "usr-proprietaire");
  });

  it("8. Nettoyage par lot sécurisé (nettoyageLotDonneesTest)", async () => {
    const idLot1 = "op-lot-001";
    const idLot2 = "op-lot-002";
    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (id, code_operation, intitule, annee_campagne, institution_responsable, statut, nature_donnees, cree_par)
      VALUES (?, 'OPC-LOT-01', 'Opération Lot 1', '2026-2027', 'MASSNAH', 'BROUILLON', 'TEST', 'usr-central')
    `).run(idLot1);

    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (id, code_operation, intitule, annee_campagne, institution_responsable, statut, nature_donnees, cree_par)
      VALUES (?, 'OPC-LOT-02', 'Opération Lot 2', '2026-2027', 'MASSNAH', 'BROUILLON', 'TEST', 'usr-central')
    `).run(idLot2);

    // Rejet si phrase de confirmation inexacte
    await assert.rejects(
      async () => {
        await nettoyageLotDonneesTest(
          db,
          bucketMock.bucket,
          utilisateurProprietaire,
          {
            operation_ids: [idLot1, idLot2],
            confirmation_texte: "SUPPRIMER_MAUVAIS",
            mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
            motif: "Nettoyage global par lot de données test",
          },
          "127.0.0.1",
        );
      },
      (err) => err instanceof ErreurDonneesTest && err.statutHttp === 400,
    );

    // Succès avec la phrase exacte
    const resLot = await nettoyageLotDonneesTest(
      db,
      bucketMock.bucket,
      utilisateurProprietaire,
      {
        operation_ids: [idLot1, idLot2],
        confirmation_texte: "SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST",
        mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
        motif: "Nettoyage global par lot de données test",
      },
      "127.0.0.1",
    );

    assert.equal(resLot.succes, true);
    assert.equal(resLot.total_supprime, 2);
    assert.equal(resLot.operations_supprimees.length, 2);

    // Vérifier en base
    const op1 = dbSync.prepare("SELECT id FROM operations_centrales_distribution WHERE id = ?").get(idLot1);
    assert.equal(op1, undefined);
    const op2 = dbSync.prepare("SELECT id FROM operations_centrales_distribution WHERE id = ?").get(idLot2);
    assert.equal(op2, undefined);
  });

  it("9. Protection intégrale des référentiels critiques et des utilisateurs", () => {
    // Vérifier que les tables critiques n'ont subi aucune altération
    const totalComptes = dbSync.prepare("SELECT COUNT(*) AS total FROM utilisateurs").get().total;
    assert.ok(totalComptes >= 25, "Les comptes utilisateurs doivent demeurer intacts");

    const totalDepartements = dbSync.prepare("SELECT COUNT(*) AS total FROM departements").get().total;
    assert.ok(totalDepartements >= 1, "Les découpages départementaux doivent demeurer intacts");

    const totalEntrepots = dbSync.prepare("SELECT COUNT(*) AS total FROM entrepots").get().total;
    assert.ok(totalEntrepots >= 1, "Les entrepôts doivent demeurer intacts");

    const totalArticles = dbSync.prepare("SELECT COUNT(*) AS total FROM articles").get().total;
    assert.ok(totalArticles >= 1, "Le catalogue des articles doit demeurer intact");
  });

  it("10. Historique des suppressions immuable accessible en lecture seule", async () => {
    const historique = await listerHistoriqueSuppressions(db, utilisateurProprietaire, 10, 0);
    assert.ok(historique.total >= 3);
    assert.ok(historique.elements.length >= 3);

    const auditPurge = historique.elements.find((e) => e.code_entite === "OPC-PURGE-999");
    assert.ok(auditPurge);
    assert.equal(auditPurge.utilisateur_identifiant, "proprietaire");
    assert.equal(auditPurge.statut_resultat, "SUCCES");
  });

  it("11. Recherche et filtrage dans listerOperationsDonneesTest", async () => {
    const liste = await listerOperationsDonneesTest(db, utilisateurProprietaire, {
      limite: 10,
      decalage: 0,
      nature: "TOUTES",
    });

    assert.ok(liste.elements.length >= 2);
    const opReel = liste.elements.find((e) => e.id === "op-reel-001");
    assert.ok(opReel);
    assert.equal(opReel.nature_donnees, "REEL");
    assert.equal(opReel.statut_eligibilite, "PROTEGE_REEL");

    const opIndet = liste.elements.find((e) => e.id === "op-indet-001");
    assert.ok(opIndet);
    // op-indet-001 a été reclassifiée en TEST au test 5
    assert.equal(opIndet.nature_donnees, "TEST");
    assert.equal(opIndet.statut_eligibilite, "ELIGIBLE");
  });

  it("12. Simulation de panne R2 après validation D1 : persistance en file d'attente, statut ECHEC_PARTIEL, et reprise vérifiable", async () => {
    const idOpPanne = "op-test-r2-panne-001";
    const codeOpPanne = "OPC-R2-PANNE-001";
    const cleR2EnPanne = `operations/${idOpPanne}/documents/panne-simulee.pdf`;

    dbSync.prepare(`
      INSERT INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable,
        statut, nature_donnees, cree_par
      ) VALUES (
        ?, ?, 'Opération Test Panne R2 Simulée', '2026-2027', 'MASSNAH',
        'BROUILLON', 'TEST', 'usr-central'
      )
    `).run(idOpPanne, codeOpPanne);

    dbSync.prepare(`
      INSERT INTO documents_operations (
        id, operation_id, categorie_document, intitule, cle_r2,
        nom_fichier_original, type_mime, taille_octets, televerse_par
      ) VALUES (
        'doc-panne-001', ?, 'ARRETE_MINISTERIEL', 'Arrêté panne', ?,
        'panne.pdf', 'application/pdf', 2048, 'usr-central'
      )
    `).run(idOpPanne, cleR2EnPanne);

    // Mock de bucket R2 qui simule une panne sur cette clé
    let simulerPanneR2 = true;
    const bucketPanne = {
      async put() { return {}; },
      async delete(cle) {
        if (simulerPanneR2 && cle === cleR2EnPanne) {
          throw new Error("Panne réseau R2 simulée (503 Service Unavailable)");
        }
        return {};
      },
    };

    // Exécution de la suppression : la transaction D1 doit réussir, mais l'erreur R2 doit être capturée
    const res = await supprimerOperationTest(
      db,
      bucketPanne,
      utilisateurProprietaire,
      idOpPanne,
      {
        confirmation_code: codeOpPanne,
        mot_de_passe_confirmation: MOT_DE_PASSE_PROPRIETAIRE,
        motif: "Test de résilience face à une panne R2",
      },
      "127.0.0.1",
    );

    assert.equal(res.succes, true);
    assert.equal(res.fichiers_r2_supprimes.length, 0);
    assert.equal(res.fichiers_r2_echecs.length, 1);
    assert.equal(res.fichiers_r2_echecs[0].cle, cleR2EnPanne);

    // 12.1 Vérification en base D1 : l'opération est bien supprimée (cascade atomique)
    const opSupprimee = dbSync.prepare("SELECT COUNT(*) as c FROM operations_centrales_distribution WHERE id = ?").get(idOpPanne).c;
    assert.equal(opSupprimee, 0);

    // 12.2 Vérification dans le journal d'audit immuable : statut ECHEC_PARTIEL
    const auditRecord = dbSync.prepare("SELECT * FROM audits_suppression_donnees_test WHERE entite_id = ?").get(idOpPanne);
    assert.ok(auditRecord);
    assert.equal(auditRecord.statut_resultat, "ECHEC_PARTIEL");

    // 12.3 Vérification dans la file persistante de réconciliation
    const entreeFile = dbSync.prepare("SELECT * FROM file_reconciliation_r2_orphelins WHERE cle_r2 = ?").get(cleR2EnPanne);
    assert.ok(entreeFile);
    assert.equal(entreeFile.statut, "EN_ATTENTE");
    assert.equal(entreeFile.tentatives, 1);
    assert.ok(entreeFile.dernier_message_erreur.includes("503 Service Unavailable"));

    // 12.4 Consultation via listerFileReconciliationR2
    const file = await listerFileReconciliationR2(db, utilisateurProprietaire, "EN_ATTENTE");
    assert.ok(file.total >= 1);
    const elementQueue = file.elements.find((e) => e.cle_r2 === cleR2EnPanne);
    assert.ok(elementQueue);

    // 12.5 Rétablissement du service R2 et exécution de la reprise de réconciliation
    simulerPanneR2 = false; // Le service R2 refonctionne

    // On force la date prochaine_tentative au présent pour tester la reprise immédiate
    dbSync.prepare("UPDATE file_reconciliation_r2_orphelins SET prochaine_tentative = datetime('now', '-1 minute') WHERE id = ?").run(entreeFile.id);

    const reprise = await traiterFileReconciliationR2(db, bucketPanne, utilisateurProprietaire);
    assert.ok(reprise.total_traites >= 1);
    assert.ok(reprise.succes >= 1);

    // 12.6 Vérification du statut final de la file
    const entreePurgee = dbSync.prepare("SELECT * FROM file_reconciliation_r2_orphelins WHERE id = ?").get(entreeFile.id);
    assert.equal(entreePurgee.statut, "PURGEE");
    assert.ok(entreePurgee.purgee_le);
  });
});
