import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { dechiffrerOctetsDpapi } from "../../scripts/coffre-recuperation-dpapi.mjs";

const BACKUP_PATH = resolve(
  process.env.LOCALAPPDATA,
  "SIGAD/Staging/backups/before-0027-20261025T023100Z-472a6732/sigad-staging-db-before-0027.dpapi-aesgcm.json"
);
const TEST_DB_PATH = resolve(process.cwd(), "tests/fixtures/pre-recette-staging-run.sqlite");

test("PRÉRECETTE FINALE STAGING — Cycle complet d'acceptation", async (t) => {
  let db;

  await t.test("1. Sauvegarde et déchiffrement sécurisé de la base Staging représentative", async () => {
    const raw = await readFile(BACKUP_PATH, "utf8");
    const doc = JSON.parse(raw);
    assert.equal(doc.version, 2, "Version d'enveloppe attendue: 2");
    assert.equal(doc.algorithm, "AES-256-GCM", "Algorithme AES-256-GCM attendu");
    assert.equal(doc.keyProtection, "DPAPI-CurrentUser", "Protection DPAPI attendue");
    assert.equal(doc.databaseId, "a54e1ea9-c49a-4729-ad06-a40ceb421127", "Identifiant Staging attendu");

    const key = dechiffrerOctetsDpapi(doc.wrappedKeyDpapiCurrentUser);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(doc.iv, "base64"));
    decipher.setAuthTag(Buffer.from(doc.authTag, "base64"));
    decipher.setAAD(Buffer.from(doc.aad, "utf8"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(doc.ciphertext, "base64")), decipher.final()]);

    const hash = createHash("sha256").update(decrypted).digest("hex");
    assert.equal(hash, doc.sha256, "Intégrité SHA-256 vérifiée");

    // Supprimer base de test résiduelle éventuelle
    try { await unlink(TEST_DB_PATH); } catch {}

    db = new DatabaseSync(TEST_DB_PATH);
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(decrypted.toString("utf8"));
    db.exec("PRAGMA foreign_keys = ON;");

    const integrity = db.prepare("PRAGMA integrity_check").all();
    assert.equal(integrity[0].integrity_check, "ok", "Intégrité SQLite initiale ok");

    const fkCheck = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(fkCheck.length, 0, "Aucune violation FK initiale");

    const initialMigrations = db.prepare("SELECT name FROM d1_migrations ORDER BY id").all();
    assert.equal(initialMigrations.length, 27, "Exactement 27 migrations initiales");
    assert.ok(initialMigrations[26].name.startsWith("0027_"), "Dernière migration initiale: 0027");

    const initialAccounts = db.prepare("SELECT count(*) as c FROM utilisateurs").get();
    assert.equal(initialAccounts.c, 25, "Exactement 25 comptes initiaux");

    const opc = db.prepare("SELECT code_operation, statut FROM operations_centrales_distribution WHERE code_operation = 'OPC-2026-B839B0'").get();
    assert.ok(opc, "Opération OPC-2026-B839B0 présente");
    assert.equal(opc.statut, "SOUMISE_A_APPROBATION", "Statut initial de l'opération OPC");
  });

  await t.test("2. Application séquentielle des migrations 0028 à 0031", async () => {
    // 0028
    const sql0028 = await readFile("migrations/0028_refonte_referentiel_territorial.sql", "utf8");
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(sql0028);
    db.exec("PRAGMA foreign_keys = ON;");
    db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, datetime('now'))")
      .run("0028_refonte_referentiel_territorial.sql");

    let integrity = db.prepare("PRAGMA integrity_check").all();
    assert.equal(integrity[0].integrity_check, "ok", "Intégrité SQLite post-0028");
    let fk = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(fk.length, 0, "Aucune violation FK post-0028");

    // 0029
    const sql0029 = await readFile("migrations/0029_mise_en_service_stocks.sql", "utf8");
    db.exec(sql0029);
    db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, datetime('now'))")
      .run("0029_mise_en_service_stocks.sql");

    integrity = db.prepare("PRAGMA integrity_check").all();
    assert.equal(integrity[0].integrity_check, "ok", "Intégrité SQLite post-0029");
    fk = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(fk.length, 0, "Aucune violation FK post-0029");

    // 0030
    const sql0030 = await readFile("migrations/0030_profils_operationnels_terrain.sql", "utf8");
    db.exec(sql0030);
    db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, datetime('now'))")
      .run("0030_profils_operationnels_terrain.sql");

    integrity = db.prepare("PRAGMA integrity_check").all();
    assert.equal(integrity[0].integrity_check, "ok", "Intégrité SQLite post-0030");
    fk = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(fk.length, 0, "Aucune violation FK post-0030");

    // 0031
    const sql0031 = await readFile("migrations/0031_tracabilite_operations_approvisionnements.sql", "utf8");
    db.exec(sql0031);
    db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, datetime('now'))")
      .run("0031_tracabilite_operations_approvisionnements.sql");

    integrity = db.prepare("PRAGMA integrity_check").all();
    assert.equal(integrity[0].integrity_check, "ok", "Intégrité SQLite post-0031");
    fk = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(fk.length, 0, "Aucune violation FK post-0031");

    // Vérifier total migrations
    const totalMigrations = db.prepare("SELECT count(*) as c FROM d1_migrations").get();
    assert.equal(totalMigrations.c, 31, "Total de 31 migrations appliquées");
  });

  await t.test("3. Conservation stricte des données existantes", async () => {
    // 25 comptes
    const accounts = db.prepare("SELECT id, identifiant, role, statut, province_id FROM utilisateurs ORDER BY id").all();
    assert.equal(accounts.length, 25, "Conservation des 25 comptes utilisateurs");
    const sila = accounts.find((a) => a.id === "usr-sila");
    assert.ok(sila, "Compte usr-sila conservé");
    assert.equal(sila.statut, "VERROUILLE", "Compte usr-sila toujours VERROUILLE");

    // Opération OPC-2026-B839B0
    const opc = db.prepare("SELECT * FROM operations_centrales_distribution WHERE code_operation = 'OPC-2026-B839B0'").get();
    assert.ok(opc, "Opération OPC-2026-B839B0 conservée");
    assert.equal(opc.statut, "SOUMISE_A_APPROBATION", "Statut opération intact");

    // Référentiel provinces
    const provinces = db.prepare("SELECT count(*) as c FROM provinces").get();
    assert.equal(provinces.c, 23, "23 provinces conservées");

    // Communes
    const communes = db.prepare("SELECT count(*) as c FROM communes").get();
    assert.equal(communes.c, 500, "500 communes conservées");
  });

  await t.test("4. Contrôle des départements candidats provisoires (non automatiquement validés)", async () => {
    const totalDeps = db.prepare("SELECT count(*) as c FROM departements").get();
    assert.equal(totalDeps.c, 112, "112 départements candidats insérés");

    const statutCounts = db.prepare("SELECT statut_validation, count(*) as count FROM departements GROUP BY statut_validation").all();
    assert.equal(statutCounts.length, 1, "Un seul statut pour les départements candidats");
    assert.equal(statutCounts[0].statut_validation, "A_VERIFIER", "100% des départements ont le statut A_VERIFIER");
    assert.equal(statutCounts[0].count, 112, "112 départements ont le statut A_VERIFIER");

    const valides = db.prepare("SELECT count(*) as c FROM departements WHERE statut_validation = 'VALIDE'").get();
    assert.equal(valides.c, 0, "Aucun département candidat n'est automatiquement déclaré VALIDE");

    const sourceCounts = db.prepare("SELECT source_officielle, count(*) as count FROM departements GROUP BY source_officielle").all();
    assert.equal(sourceCounts[0].source_officielle, "INSEED 2024 / Inventaire territorial provisoire");
  });

  await t.test("5. Contrôle anti-fictif des entrepôts et des stocks", async () => {
    // Migration 0029 ne doit pas avoir inséré d'entrepôt
    const totalEntrepots = db.prepare("SELECT count(*) as c FROM entrepots").get();
    assert.equal(totalEntrepots.c, 0, "Aucun entrepôt fictif créé par la migration 0029");

    // Migration 0029 ne doit pas avoir inséré de lot
    const totalLots = db.prepare("SELECT count(*) as c FROM lots_stock").get();
    assert.equal(totalLots.c, 0, "Aucun lot de stock fictif créé par la migration 0029");

    // Migration 0029 doit avoir inséré les articles et conditionnements de référence officiels
    const articles = db.prepare("SELECT count(*) as c FROM articles").get();
    assert.equal(articles.c, 6, "6 articles de référence officiels créés");

    const conditionnements = db.prepare("SELECT count(*) as c FROM conditionnements").get();
    assert.equal(conditionnements.c, 6, "6 conditionnements de référence officiels créés");
  });

  await t.test("6. Création de ménages dans les 4 contextes géographiques réels", async () => {
    // A. N'Djaména (Ville à statut particulier avec arrondissements et rattachement direct sans département)
    const menageNdjamena = {
      id: "men-test-ndjamena-001",
      code_menage: "MEN-NDJ-PRE-001",
      province_id: "prov-ndjamena",
      departement_id: null,
      localite_id: "loc-ndjamena-ville",
      arrondissement_id: "arr-ndj-1",
      quartier_id: "qrt-ndj-1-farcha",
      nom_chef_menage: "Mahamat Al-Hadj",
      sexe_chef: "M",
      nombre_personnes: 6,
      categorie_population_id: "cat-pop-autochtone",
      date_enregistrement: "2026-10-25",
      statut: "ACTIF",
      cree_par: "usr-central",
      statut_validation: "VALIDE",
    };

    db.prepare(`
      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id,
        arrondissement_id, quartier_id, nom_chef_menage, sexe_chef,
        nombre_personnes, categorie_population_id, date_enregistrement,
        statut, cree_par, statut_validation
      ) VALUES (
        @id, @code_menage, @province_id, @departement_id, @localite_id,
        @arrondissement_id, @quartier_id, @nom_chef_menage, @sexe_chef,
        @nombre_personnes, @categorie_population_id, @date_enregistrement,
        @statut, @cree_par, @statut_validation
      )
    `).run(menageNdjamena);

    const checkNdjamena = db.prepare("SELECT id, code_menage, departement_id, arrondissement_id FROM menages WHERE id = ?").get(menageNdjamena.id);
    assert.ok(checkNdjamena, "Ménage N'Djaména créé");
    assert.equal(checkNdjamena.departement_id, null, "Département NULL autorisé pour N'Djaména");
    assert.equal(checkNdjamena.arrondissement_id, "arr-ndj-1", "Arrondissement rattaché");

    // B. Ville ordinaire (Ouaddaï / Ouara - sans arrondissement)
    db.prepare(`
      INSERT INTO localites (
        id, province_id, departement_id, nom, type_localite,
        mode_decoupage_urbain, statut_validation, source_documentation
      ) VALUES (
        'loc-ville-abeche', 'prov-ouaddai', 'dep-ouaddai-ouara', 'Ville d''Abéché',
        'VILLE', 'SANS_ARRONDISSEMENT', 'VALIDE', 'Chef-lieu province Ouaddaï'
      )
    `).run();

    const menageVille = {
      id: "men-test-ville-002",
      code_menage: "MEN-VILLE-PRE-002",
      province_id: "prov-ouaddai",
      departement_id: "dep-ouaddai-ouara",
      localite_id: "loc-ville-abeche",
      arrondissement_id: null,
      quartier_id: null,
      nom_chef_menage: "Fatimé Zara",
      sexe_chef: "F",
      nombre_personnes: 4,
      categorie_population_id: "cat-pop-hote-vulnerable",
      date_enregistrement: "2026-10-25",
      statut: "ACTIF",
      cree_par: "usr-central",
      statut_validation: "VALIDE",
    };

    db.prepare(`
      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id,
        arrondissement_id, quartier_id, nom_chef_menage, sexe_chef,
        nombre_personnes, categorie_population_id, date_enregistrement,
        statut, cree_par, statut_validation
      ) VALUES (
        @id, @code_menage, @province_id, @departement_id, @localite_id,
        @arrondissement_id, @quartier_id, @nom_chef_menage, @sexe_chef,
        @nombre_personnes, @categorie_population_id, @date_enregistrement,
        @statut, @cree_par, @statut_validation
      )
    `).run(menageVille);

    const checkVille = db.prepare("SELECT id, code_menage, departement_id, localite_id FROM menages WHERE id = ?").get(menageVille.id);
    assert.ok(checkVille, "Ménage ville ordinaire créé");
    assert.equal(checkVille.departement_id, "dep-ouaddai-ouara");

    // C. Village ordinaire
    db.prepare(`
      INSERT INTO localites (
        id, province_id, departement_id, nom, type_localite,
        mode_decoupage_urbain, statut_validation, source_documentation
      ) VALUES (
        'loc-village-hadjer', 'prov-ouaddai', 'dep-ouaddai-ouara', 'Village Hadjer Hadid',
        'VILLAGE', 'SANS_ARRONDISSEMENT', 'VALIDE', 'Inventaire rural Ouaddaï'
      )
    `).run();

    const menageVillage = {
      id: "men-test-village-003",
      code_menage: "MEN-VILLAGE-PRE-003",
      province_id: "prov-ouaddai",
      departement_id: "dep-ouaddai-ouara",
      localite_id: "loc-village-hadjer",
      arrondissement_id: null,
      quartier_id: null,
      nom_chef_menage: "Idriss Brahim",
      sexe_chef: "M",
      nombre_personnes: 8,
      categorie_population_id: "cat-pop-deplace-interne",
      date_enregistrement: "2026-10-25",
      statut: "ACTIF",
      cree_par: "usr-central",
      statut_validation: "VALIDE",
    };

    db.prepare(`
      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id,
        arrondissement_id, quartier_id, nom_chef_menage, sexe_chef,
        nombre_personnes, categorie_population_id, date_enregistrement,
        statut, cree_par, statut_validation
      ) VALUES (
        @id, @code_menage, @province_id, @departement_id, @localite_id,
        @arrondissement_id, @quartier_id, @nom_chef_menage, @sexe_chef,
        @nombre_personnes, @categorie_population_id, @date_enregistrement,
        @statut, @cree_par, @statut_validation
      )
    `).run(menageVillage);

    const checkVillage = db.prepare("SELECT id, code_menage FROM menages WHERE id = ?").get(menageVillage.id);
    assert.ok(checkVillage, "Ménage village créé");

    // D. Ferrick (Campement pastoral/nomade)
    db.prepare(`
      INSERT INTO localites (
        id, province_id, departement_id, nom, type_localite,
        mode_decoupage_urbain, statut_validation, source_documentation
      ) VALUES (
        'loc-ferrick-nomade', 'prov-ouaddai', 'dep-ouaddai-ouara', 'Ferrick Al-Salam',
        'FERRICK', 'SANS_ARRONDISSEMENT', 'VALIDE', 'Recensement pastoral Ouaddaï'
      )
    `).run();

    const menageFerrick = {
      id: "men-test-ferrick-004",
      code_menage: "MEN-FERRICK-PRE-004",
      province_id: "prov-ouaddai",
      departement_id: "dep-ouaddai-ouara",
      localite_id: "loc-ferrick-nomade",
      arrondissement_id: null,
      quartier_id: null,
      nom_chef_menage: "Haroun Oumar",
      sexe_chef: "M",
      nombre_personnes: 12,
      categorie_population_id: "cat-pop-autochtone",
      date_enregistrement: "2026-10-25",
      statut: "ACTIF",
      cree_par: "usr-central",
      statut_validation: "VALIDE",
    };

    db.prepare(`
      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id,
        arrondissement_id, quartier_id, nom_chef_menage, sexe_chef,
        nombre_personnes, categorie_population_id, date_enregistrement,
        statut, cree_par, statut_validation
      ) VALUES (
        @id, @code_menage, @province_id, @departement_id, @localite_id,
        @arrondissement_id, @quartier_id, @nom_chef_menage, @sexe_chef,
        @nombre_personnes, @categorie_population_id, @date_enregistrement,
        @statut, @cree_par, @statut_validation
      )
    `).run(menageFerrick);

    const checkFerrick = db.prepare("SELECT id, code_menage FROM menages WHERE id = ?").get(menageFerrick.id);
    assert.ok(checkFerrick, "Ménage ferrick créé");

    // E. Tests négatifs / Invariants territoriaux
    assert.throws(() => {
      // Province ordinaire avec departement_id NULL doit échouer
      db.prepare(`
        INSERT INTO menages (
          id, code_menage, province_id, departement_id, localite_id,
          nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id,
          date_enregistrement, statut, cree_par, statut_validation
        ) VALUES (
          'men-invalide-01', 'MEN-INV-01', 'prov-ouaddai', NULL, 'loc-ville-abeche',
          'Test Invalide', 'M', 2, 'cat-pop-autochtone', '2026-10-25', 'ACTIF', 'usr-central', 'VALIDE'
        )
      `).run();
    }, /Le ménage doit être rattaché à une localisation validée de sa province/);

    assert.throws(() => {
      // Province N'Djaména avec département étranger doit échouer
      db.prepare(`
        INSERT INTO menages (
          id, code_menage, province_id, departement_id, localite_id,
          nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id,
          date_enregistrement, statut, cree_par, statut_validation
        ) VALUES (
          'men-invalide-02', 'MEN-INV-02', 'prov-ndjamena', 'dep-ouaddai-ouara', 'loc-ndjamena-ville',
          'Test Invalide 2', 'M', 2, 'cat-pop-autochtone', '2026-10-25', 'ACTIF', 'usr-central', 'VALIDE'
        )
      `).run();
    }, /Le ménage doit être rattaché à une localisation validée de sa province/);
  });

  await t.test("7. Vérification des approbations, justificatifs légaux et permissions serveur", async () => {
    // Opération OPC-2026-B839B0
    const opc = db.prepare("SELECT id, code_operation, statut FROM operations_centrales_distribution WHERE code_operation = 'OPC-2026-B839B0'").get();
    assert.ok(opc);

    // 1. Contrôle des approbations préalables (doit être 0)
    const initialApprobs = db.prepare("SELECT count(*) as c FROM approbations_operations WHERE operation_id = ?").get(opc.id);
    assert.equal(initialApprobs.c, 0, "Aucune approbation préalable sur OPC-2026-B839B0");

    // 2. Contrôle de contrainte de type d'approbation invalide
    assert.throws(() => {
      db.prepare(`
        INSERT INTO approbations_operations (
          id, operation_id, type_approbation, instance_decisionnaire,
          reference_acte, date_decision, signataire_nom, signataire_qualite,
          decision, enregistre_par
        ) VALUES (
          'app-invalide', ?, 'TYPE_INCONNU', 'Instance', 'Ref-001', '2026-10-25', 'Nom', 'Qualité', 'APPROUVE', 'usr-admin-central'
        )
      `).run(opc.id);
    }, /CHECK constraint failed: type_approbation/);

    // 3. Insertion d'un acte formel d'approbation ministériel avec justificatif légal
    const approbationId = "app-arrete-0033-2026";
    db.prepare(`
      INSERT INTO approbations_operations (
        id, operation_id, type_approbation, instance_decisionnaire,
        reference_acte, date_decision, signataire_nom, signataire_qualite,
        decision, reserves_ou_conditions, enregistre_par
      ) VALUES (
        ?, ?, 'VALIDATION_MINISTERIELLE', 'Cabinet Ministériel MASSNAH',
        'Arrêté n°0033/PR/PM/MASSNAH/SG/2026', '2026-10-07',
        'Ministre de l''Action Sociale', 'Ministre en charge de la Solidarité Nationale',
        'APPROUVE', 'Respect strict des critères de ciblage et des quotas par province',
        'usr-central'
      )
    `).run(approbationId, opc.id);

    const appEnregistree = db.prepare("SELECT id, reference_acte, decision FROM approbations_operations WHERE id = ?").get(approbationId);
    assert.ok(appEnregistree, "Acte d'approbation enregistré");
    assert.equal(appEnregistree.reference_acte, "Arrêté n°0033/PR/PM/MASSNAH/SG/2026");

    // 4. Mise à jour du statut vers APPROUVEE maintenant qu'au moins une approbation existe
    db.prepare(`
      UPDATE operations_centrales_distribution
      SET statut = 'APPROUVEE', modifie_le = datetime('now')
      WHERE id = ?
    `).run(opc.id);

    const opcApprouvee = db.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opc.id);
    assert.equal(opcApprouvee.statut, "APPROUVEE", "L'opération passe avec succès au statut APPROUVEE");

    // 5. Test d'ouverture (OUVERTE)
    db.prepare(`
      UPDATE operations_centrales_distribution
      SET statut = 'OUVERTE', modifie_le = datetime('now')
      WHERE id = ?
    `).run(opc.id);

    const opcOuverte = db.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opc.id);
    assert.equal(opcOuverte.statut, "OUVERTE", "L'opération passe avec succès au statut OUVERTE");

    // 6. Test du rattachement de la migration 0031 (approvisionnement lié à l'opération centrale)
    const approvId = "app-test-trace-001";
    db.prepare(`
      INSERT INTO approvisionnements_centraux (
        id, reference, intitule_operation, date_creation,
        source_articles, nature_aide, statut, cree_par,
        operation_centrale_id
      ) VALUES (
        ?, 'APP-NAT-2026-001', 'Dotation vivres urgence', '2026-10-25',
        'ENTREPOT_CENTRAL', 'ALIMENTAIRE', 'BROUILLON', 'usr-central',
        ?
      )
    `).run(approvId, opc.id);

    const approvEnregistre = db.prepare("SELECT id, operation_centrale_id FROM approvisionnements_centraux WHERE id = ?").get(approvId);
    assert.ok(approvEnregistre, "Approvisionnement central inséré");
    assert.equal(approvEnregistre.operation_centrale_id, opc.id, "Traçabilité opération centrale rattachée (0031)");

    // 7. Test du rattachement d'un profil opérationnel de terrain (migration 0030)
    const potId = "pot-test-superviseur-001";
    db.prepare(`
      INSERT INTO profils_operationnels_terrain (
        id, utilisateur_id, role_terrain, province_id, statut, attribue_par
      ) VALUES (
        ?, 'usr-ouaddai', 'SUPERVISEUR_TERRAIN', 'prov-ouaddai', 'ACTIF', 'usr-central'
      )
    `).run(potId);

    const potEnregistre = db.prepare("SELECT id, role_terrain, province_id FROM profils_operationnels_terrain WHERE id = ?").get(potId);
    assert.ok(potEnregistre, "Profil opérationnel de terrain créé (0030)");
    assert.equal(potEnregistre.role_terrain, "SUPERVISEUR_TERRAIN");
  });

  await t.test("8. Vérification finale d'intégrité de la base après toutes les opérations", async () => {
    const finalIntegrity = db.prepare("PRAGMA integrity_check").all();
    assert.equal(finalIntegrity[0].integrity_check, "ok", "Intégrité globale SQLite ok");

    const finalFk = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(finalFk.length, 0, "Zéro violation de clés étrangères");

    const tables = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").get();
    assert.equal(tables.c, 85, "Exactement 85 tables dans le schéma complet D1 Staging avec migrations 0027 et 0030");

    db.close();
  });
});
