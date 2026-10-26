import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creerUniteTerritorialeDynamique,
  ErreurCreationTerritorialeDynamique,
  listerPage,
} from "../../backend/src/services/territoire.service.ts";
import {
  obtenirTableauDeBordTerritorial,
  rechercherUnitesTerritoriales,
  supprimerUniteTerritoriale,
} from "../../backend/src/services/administration-territoriale.service.ts";
import { Hono } from "hono";
import { isolationProvinciale } from "../../backend/src/middlewares/rbac.middleware.ts";
import { routesTerritoire } from "../../backend/src/routes/territoire.routes.ts";

function wrapD1(syncDb) {
  return {
    prepare(query) {
      return {
        _query: query,
        _args: [],
        bind(...args) {
          const bound = Object.create(this);
          bound._args = args.map((a) => (a === undefined ? null : a));
          return bound;
        },
        async all() {
          const stmt = syncDb.prepare(query);
          const results = stmt.all(...this._args);
          return { results: results ?? [], success: true };
        },
        async first(col) {
          const stmt = syncDb.prepare(query);
          const row = stmt.get(...this._args);
          if (!row) return null;
          if (col && typeof col === "string") return row[col];
          return row;
        },
        async run() {
          const stmt = syncDb.prepare(query);
          const info = stmt.run(...this._args);
          return { success: true, meta: { changes: Number(info.changes) } };
        },
      };
    },
    async batch(statements) {
      syncDb.exec("BEGIN IMMEDIATE;");
      try {
        const out = [];
        for (const st of statements) {
          out.push(await st.run());
        }
        syncDb.exec("COMMIT;");
        return out;
      } catch (err) {
        syncDb.exec("ROLLBACK;");
        throw err;
      }
    },
  };
}

describe("SIGAD — Refonte territoriale dynamique sans communes (Migration 0035)", () => {
  let syncDb;
  let db;

  const proprietaire = {
    id: "usr-proprietaire",
    identifiant: "proprietaire",
    nom_complet: "Propriétaire SIGAD",
    role: "PROPRIETAIRE",
    province_id: null,
  };

  const adminCentral = {
    id: "usr-central",
    identifiant: "central",
    nom_complet: "Administrateur Central",
    role: "ADMIN_CENTRAL",
    province_id: null,
  };

  const delegueBatha = {
    id: "usr-batha",
    identifiant: "batha",
    nom_complet: "Délégué Batha",
    role: "DELEGUE_PROVINCIAL",
    province_id: "prov-batha",
  };

  const delegueNdjamena = {
    id: "usr-ndjamena",
    identifiant: "ndjamena",
    nom_complet: "Délégué N'Djaména",
    role: "DELEGUE_PROVINCIAL",
    province_id: "prov-ndjamena",
  };

  const consultation = {
    id: "usr-consult",
    identifiant: "consult",
    nom_complet: "Consultation Institutionnelle",
    role: "CONSULTATION_INSTITUTIONNELLE",
    province_id: null,
  };

  let depBatha1 = "";
  let depBatha2 = "";
  let villeCreeeId = "";
  let quartierCreeId = "";
  let carreCreeId = "";
  let sousPrefCreeeId = "";
  let cantonCreeId = "";
  let villageCreeId = "";
  let hameauCreeId = "";
  let ferrickCreeId = "";
  let campementCreeId = "";

  beforeAll(() => {
    syncDb = new DatabaseSync(":memory:");
    syncDb.exec("PRAGMA foreign_keys = ON;");

    const files = readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const f of files) {
      const sql = readFileSync(join("migrations", f), "utf8");
      syncDb.exec(sql);
    }

    const depsBatha = syncDb
      .prepare("SELECT id FROM departements WHERE province_id = 'prov-batha' ORDER BY id ASC")
      .all();
    depBatha1 = depsBatha[0].id;
    depBatha2 = depsBatha[1].id;

    // Créer les utilisateurs de test nécessaires aux clés étrangères d'audit et de ménages
    const insertUser = syncDb.prepare(`
      INSERT OR IGNORE INTO utilisateurs (
        id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe
      ) VALUES (?, ?, ?, ?, ?, 'hash-test', 'ACTIF', 0)
    `);
    insertUser.run(proprietaire.id, proprietaire.identifiant, proprietaire.nom_complet, proprietaire.role, null);
    insertUser.run(adminCentral.id, adminCentral.identifiant, adminCentral.nom_complet, adminCentral.role, null);
    insertUser.run(delegueBatha.id, delegueBatha.identifiant, delegueBatha.nom_complet, delegueBatha.role, delegueBatha.province_id);
    insertUser.run(delegueNdjamena.id, delegueNdjamena.identifiant, delegueNdjamena.nom_complet, delegueNdjamena.role, delegueNdjamena.province_id);
    insertUser.run(consultation.id, consultation.identifiant, consultation.nom_complet, consultation.role, null);

    db = wrapD1(syncDb);
  });

  it("01 — Vérifie la présence des 23 provinces actives", async () => {
    const total = syncDb.prepare("SELECT COUNT(*) AS c FROM provinces WHERE actif = 1").get().c;
    expect(total).toBe(23);
  });

  it("02 — Vérifie la présence et l'activation opérationnelle des 112 départements", async () => {
    const stats = syncDb
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN actif = 1 AND statut_validation = 'VALIDE' AND statut_operationnel = 'ACTIF' THEN 1 ELSE 0 END) AS actifs
         FROM departements`,
      )
      .get();
    expect(stats.total).toBe(112);
    expect(stats.actifs).toBe(112);
  });

  it("03 — Vérifie l'absence des 500 communes dans le référentiel opérationnel et les sélecteurs", async () => {
    const nbCommunes = syncDb.prepare("SELECT COUNT(*) AS c FROM communes").get().c;
    const nbRattachements = syncDb.prepare("SELECT COUNT(*) AS c FROM rattachements_territoriaux").get().c;
    expect(nbCommunes).toBe(0);
    expect(nbRattachements).toBe(0);

    const codeSelecteur = readFileSync(
      "frontend/src/components/territoire/SelecteurLocalisationDynamique.tsx",
      "utf8",
    );
    expect(codeSelecteur).not.toContain("/api/territoire/communes");
    expect(codeSelecteur).not.toContain("Rechercher une commune");
  });

  it("04 — Vérifie le parcours exclusif N'Djaména : Province → Arrondissement → Quartier → Carré (facultatif)", async () => {
    const ndjamena = syncDb
      .prepare("SELECT id, statut_particulier FROM provinces WHERE id = 'prov-ndjamena'")
      .get();
    expect(ndjamena.statut_particulier).toBe(1);

    const depsNdjamena = syncDb
      .prepare("SELECT COUNT(*) AS c FROM departements WHERE province_id = 'prov-ndjamena'")
      .get().c;
    expect(depsNdjamena).toBe(0);

    const arrondissements = await listerPage(
      db,
      "SELECT id, localite_id, code, nom FROM arrondissements WHERE localite_id = ? AND statut_validation = 'VALIDE' ORDER BY nom, id LIMIT ? OFFSET ?",
      "SELECT COUNT(*) AS total FROM arrondissements WHERE localite_id = ? AND statut_validation = 'VALIDE'",
      ["loc-ndjamena-ville"],
      { limite: 50, decalage: 0 },
    );
    expect(arrondissements.total).toBe(10);

    const premierArr = arrondissements.elements[0];
    const quartiers = await listerPage(
      db,
      "SELECT id, localite_id, arrondissement_id, nom, possede_carres FROM quartiers WHERE localite_id = ? AND arrondissement_id = ? AND statut_validation = 'VALIDE' ORDER BY nom, id LIMIT ? OFFSET ?",
      "SELECT COUNT(*) AS total FROM quartiers WHERE localite_id = ? AND arrondissement_id = ? AND statut_validation = 'VALIDE'",
      ["loc-ndjamena-ville", premierArr.id],
      { limite: 50, decalage: 0 },
    );
    expect(quartiers.total).toBeGreaterThan(0);

    // Ajout dynamique d'un carré facultatif sur un quartier de N'Djaména
    const carreNdj = await creerUniteTerritorialeDynamique(
      db,
      delegueNdjamena,
      {
        type: "CARRE",
        nom: "Carré 14-B",
        province_id: "prov-ndjamena",
        quartier_id: quartiers.elements[0].id,
      },
      "127.0.0.1",
    );
    expect(carreNdj.statut_validation).toBe("VALIDE");
    expect(carreNdj.provenance).toBe("AJOUT_DYNAMIQUE");

    // Refus de création d'un village rural dans N'Djaména
    await expect(
      creerUniteTerritorialeDynamique(
        db,
        delegueNdjamena,
        {
          type: "VILLAGE",
          nom: "Village Interdit Ndjamena",
          province_id: "prov-ndjamena",
        },
        "127.0.0.1",
      ),
    ).rejects.toThrow(ErreurCreationTerritorialeDynamique);
  });

  it("05 — Vérifie le parcours Urbain dans les 22 provinces : Province → Département → Urbain → Ville → Quartier → Carré (facultatif)", async () => {
    const ville = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "VILLE",
        nom: "Ati Centre Urbain",
        province_id: "prov-batha",
        departement_id: depBatha1,
        mode_decoupage_urbain: "SANS_ARRONDISSEMENT",
      },
      "127.0.0.1",
    );
    expect(ville.type).toBe("VILLE");

    const quartier = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "QUARTIER",
        nom: "Quartier Résidentiel Ati",
        province_id: "prov-batha",
        departement_id: depBatha1,
        localite_id: ville.id,
      },
      "127.0.0.1",
    );
    expect(quartier.type).toBe("QUARTIER");

    const carre = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "CARRE",
        nom: "Carré Nord 01",
        province_id: "prov-batha",
        departement_id: depBatha1,
        localite_id: ville.id,
        quartier_id: quartier.id,
      },
      "127.0.0.1",
    );
    expect(carre.type).toBe("CARRE");
  });

  it("06 — Vérifie le parcours Rural dans les 22 provinces avec ou sans sous-préfecture / canton", async () => {
    // Création directe d'un village rattaché au département sans sous-préfecture ni canton
    const villageDirect = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "VILLAGE",
        nom: "Village Direct Sans SP",
        province_id: "prov-batha",
        departement_id: depBatha1,
      },
      "127.0.0.1",
    );
    expect(villageDirect.statut_validation).toBe("VALIDE");
    expect(villageDirect.unite.departement_id).toBe(depBatha1);
    expect(villageDirect.unite.sous_prefecture_id).toBeNull();
    expect(villageDirect.unite.canton_id).toBeNull();
  });

  it("07 — Autorise la création dynamique d'un département par un rôle autorisé (PROPRIETAIRE / ADMIN_CENTRAL)", async () => {
    const depCree = await creerUniteTerritorialeDynamique(
      db,
      adminCentral,
      {
        type: "DEPARTEMENT",
        nom: "Département Test Dynamique",
        chef_lieu: "Chef-lieu Dynamique",
        province_id: "prov-batha",
      },
      "127.0.0.1",
    );
    expect(depCree.type).toBe("DEPARTEMENT");
    expect(depCree.statut_validation).toBe("VALIDE");
    expect(depCree.provenance).toBe("AJOUT_DYNAMIQUE");
    expect(depCree.doublon_existant).toBe(false);

    // Nettoyage sécurisé par le propriétaire pour conserver le compte de référence si nécessaire
    await supprimerUniteTerritoriale(
      db,
      proprietaire,
      "DEPARTEMENT",
      depCree.id,
      "Nettoyage du département de test unitaire",
      "127.0.0.1",
    );
  });

  it("08 — Refuse la création d'un département pour un rôle non autorisé (DELEGUE_PROVINCIAL / CONSULTATION)", async () => {
    await expect(
      creerUniteTerritorialeDynamique(
        db,
        delegueBatha,
        {
          type: "DEPARTEMENT",
          nom: "Département Non Autorisé",
          province_id: "prov-batha",
        },
        "127.0.0.1",
      ),
    ).rejects.toThrow(/autorisation Propriétaire ou Administration centrale/i);

    await expect(
      creerUniteTerritorialeDynamique(
        db,
        consultation,
        {
          type: "VILLAGE",
          nom: "Village Consultation Interdit",
          province_id: "prov-batha",
          departement_id: depBatha1,
        },
        "127.0.0.1",
      ),
    ).rejects.toThrow(/consultation institutionnelle ne permet pas/i);
  });

  it("09 — Création dynamique d'une ville", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "VILLE",
        nom: "Oum-Hadjer Ville",
        province_id: "prov-batha",
        departement_id: depBatha2,
      },
      "127.0.0.1",
    );
    villeCreeeId = res.id;
    expect(res.type).toBe("VILLE");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
    expect(res.doublon_existant).toBe(false);
  });

  it("10 — Création dynamique d'un quartier", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "QUARTIER",
        nom: "Quartier Salam Oum-Hadjer",
        province_id: "prov-batha",
        departement_id: depBatha2,
        localite_id: villeCreeeId,
      },
      "127.0.0.1",
    );
    quartierCreeId = res.id;
    expect(res.type).toBe("QUARTIER");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("11 — Création dynamique d'un carré", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "CARRE",
        nom: "Carré Est 04",
        province_id: "prov-batha",
        departement_id: depBatha2,
        localite_id: villeCreeeId,
        quartier_id: quartierCreeId,
      },
      "127.0.0.1",
    );
    carreCreeId = res.id;
    expect(res.type).toBe("CARRE");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("12 — Création dynamique d'une sous-préfecture", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "SOUS_PREFECTURE",
        nom: "Sous-préfecture d'Assinet",
        province_id: "prov-batha",
        departement_id: depBatha2,
      },
      "127.0.0.1",
    );
    sousPrefCreeeId = res.id;
    expect(res.type).toBe("SOUS_PREFECTURE");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("13 — Création dynamique d'un canton", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "CANTON",
        nom: "Canton Zioud",
        province_id: "prov-batha",
        departement_id: depBatha2,
        sous_prefecture_id: sousPrefCreeeId,
      },
      "127.0.0.1",
    );
    cantonCreeId = res.id;
    expect(res.type).toBe("CANTON");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("14 — Création dynamique d'un village", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "VILLAGE",
        nom: "Am-Sack",
        province_id: "prov-batha",
        departement_id: depBatha2,
        sous_prefecture_id: sousPrefCreeeId,
        canton_id: cantonCreeId,
      },
      "127.0.0.1",
    );
    villageCreeId = res.id;
    expect(res.type).toBe("VILLAGE");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("15 — Création dynamique d'un hameau", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "HAMEAU",
        nom: "Hameau Bir-Alali",
        province_id: "prov-batha",
        departement_id: depBatha2,
      },
      "127.0.0.1",
    );
    hameauCreeId = res.id;
    expect(res.type).toBe("HAMEAU");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("16 — Création dynamique d'un ferrick", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "FERRICK",
        nom: "Ferrick Al-Kheir",
        province_id: "prov-batha",
        departement_id: depBatha2,
      },
      "127.0.0.1",
    );
    ferrickCreeId = res.id;
    expect(res.type).toBe("FERRICK");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("17 — Création dynamique d'un campement", async () => {
    const res = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "CAMPEMENT",
        nom: "Campement Wadi-Rimé",
        province_id: "prov-batha",
        departement_id: depBatha2,
      },
      "127.0.0.1",
    );
    campementCreeId = res.id;
    expect(res.type).toBe("CAMPEMENT");
    expect(res.provenance).toBe("AJOUT_DYNAMIQUE");
  });

  it("18 — Sélection automatique de l'unité créée et persistance pour tous les utilisateurs du territoire", async () => {
    // Vérifie que la réponse contient l'unité complète prête à être sélectionnée immédiatement
    // et qu'elle est visible dans la recherche et les listes paginées pour d'autres utilisateurs
    const pageHameaux = await listerPage(
      db,
      "SELECT id, nom, type_localite FROM localites WHERE departement_id = ? AND type_localite = 'HAMEAU' AND statut_validation = 'VALIDE' LIMIT ? OFFSET ?",
      "SELECT COUNT(*) AS total FROM localites WHERE departement_id = ? AND type_localite = 'HAMEAU' AND statut_validation = 'VALIDE'",
      [depBatha2],
      { limite: 20, decalage: 0 },
    );
    expect(pageHameaux.total).toBe(1);
    expect(pageHameaux.elements[0].id).toBe(hameauCreeId);

    const recherche = await rechercherUnitesTerritoriales(db, {
      type: "HAMEAU",
      province_id: "prov-batha",
    });
    expect(recherche.total).toBe(1);
    expect(recherche.elements[0].id).toBe(hameauCreeId);
  });

  it("19 — Rejet de doublon sur le même rattachement (normalisation casse, accents, tirets, apostrophes) et retour de l'unité existante", async () => {
    const tentativeDoublon = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "VILLAGE",
        nom: "  àm sack  ", // Variante de "Am-Sack" créé à l'étape 14
        province_id: "prov-batha",
        departement_id: depBatha2,
      },
      "127.0.0.1",
    );
    expect(tentativeDoublon.doublon_existant).toBe(true);
    expect(tentativeDoublon.id).toBe(villageCreeId);

    const nbAmSack = syncDb
      .prepare(
        "SELECT COUNT(*) AS c FROM localites WHERE departement_id = ? AND type_localite = 'VILLAGE'",
      )
      .get(depBatha2).c;
    expect(nbAmSack).toBe(1);
  });

  it("20 — Autorisation d'homonymes dans deux départements différents", async () => {
    const homonymeAutreDep = await creerUniteTerritorialeDynamique(
      db,
      delegueBatha,
      {
        type: "VILLAGE",
        nom: "Am-Sack",
        province_id: "prov-batha",
        departement_id: depBatha1,
      },
      "127.0.0.1",
    );
    expect(homonymeAutreDep.doublon_existant).toBe(false);
    expect(homonymeAutreDep.id).not.toBe(villageCreeId);
  });

  it("21 — Création d'un ménage rattaché à une unité nouvellement créée (rurale et urbaine)", async () => {
    // 1. Ménage rattaché au hameau nouvellement créé (sans commune)
    syncDb
      .prepare(
        `INSERT INTO menages (
          id, code_menage, province_id, departement_id, localite_id,
          nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id,
          date_enregistrement, statut, statut_validation, cree_par
        ) VALUES (
          'men-test-hameau-0035', 'MEN-BA-2026-003501', 'prov-batha', ?, ?,
          'Halimé Mahamat', 'F', 6, 'cat-pop-autochtone',
          '2026-10-25', 'ACTIF', 'VALIDE', ?
        )`,
      )
      .run(depBatha2, hameauCreeId, delegueBatha.id);

    // 2. Ménage rattaché à la ville + quartier + carré nouvellement créés
    syncDb
      .prepare(
        `INSERT INTO menages (
          id, code_menage, province_id, departement_id, localite_id, quartier_id, carre_id,
          nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id,
          date_enregistrement, statut, statut_validation, cree_par
        ) VALUES (
          'men-test-urbain-0035', 'MEN-BA-2026-003502', 'prov-batha', ?, ?, ?, ?,
          'Moussa Oumar', 'M', 5, 'cat-pop-autochtone',
          '2026-10-25', 'ACTIF', 'VALIDE', ?
        )`,
      )
      .run(depBatha2, villeCreeeId, quartierCreeId, carreCreeId, delegueBatha.id);

    const nbMenages = syncDb
      .prepare("SELECT COUNT(*) AS c FROM menages WHERE id IN ('men-test-hameau-0035', 'men-test-urbain-0035')")
      .get().c;
    expect(nbMenages).toBe(2);
  });

  it("22 — Création et filtrage d'une distribution sur une unité nouvellement créée", async () => {
    syncDb
      .prepare(
        `INSERT OR IGNORE INTO entrepots (
          id, code_entrepot, nom, niveau, province_id, localite_id, actif
        ) VALUES (
          'ent-batha-test-0035', 'ENT-BA-0035', 'Entrepôt Provincial Batha', 'PROVINCIAL', 'prov-batha', ?, 1
        )`,
      )
      .run(villeCreeeId);

    syncDb
      .prepare(
        `INSERT INTO distributions_provinciales (
          id, reference_distribution, intitule_distribution, province_id, departement_id,
          sous_prefecture_id, commune_id, date_prevue, nature_aide, objectif, entrepot_id, statut,
          nombre_menages_cibles, nombre_personnes_cibles, cree_par
        ) VALUES (
          'dist-test-0035', 'DIST-BA-2026-0035', 'Distribution d''urgence Batha Est',
          'prov-batha', ?, ?, NULL, '2026-10-26', 'VIVRES', 'Assistance alimentaire Batha', 'ent-batha-test-0035', 'BROUILLON',
          10, 55, ?
        )`,
      )
      .run(depBatha2, sousPrefCreeeId, delegueBatha.id);

    syncDb
      .prepare(
        `INSERT INTO zones_distribution (
          id, distribution_id, province_id, localite_id, quartier_id, carre_id, nom_site_distribution
        ) VALUES (
          'zone-test-0035', 'dist-test-0035', 'prov-batha', ?, ?, ?, 'Point de distribution Salam Carré 04'
        )`,
      )
      .run(villeCreeeId, quartierCreeId, carreCreeId);

    const zoneCreee = syncDb
      .prepare(
        `SELECT zd.id, dp.reference_distribution, l.nom AS ville_nom, q.nom AS quartier_nom, c.code_ou_nom AS carre_nom
         FROM zones_distribution zd
         INNER JOIN distributions_provinciales dp ON dp.id = zd.distribution_id
         INNER JOIN localites l ON l.id = zd.localite_id
         INNER JOIN quartiers q ON q.id = zd.quartier_id
         INNER JOIN carres c ON c.id = zd.carre_id
         WHERE zd.id = 'zone-test-0035'`,
      )
      .get();

    expect(zoneCreee).toBeTruthy();
    expect(zoneCreee.ville_nom).toBe("Oum-Hadjer Ville");
    expect(zoneCreee.quartier_nom).toBe("Quartier Salam Oum-Hadjer");
    expect(zoneCreee.carre_nom).toBe("Carré Est 04");

    const statsFinales = await obtenirTableauDeBordTerritorial(db);
    expect(statsFinales.provinces).toBe(23);
    expect(statsFinales.departements).toBe(112);
    expect(statsFinales.communes).toBe(0);

    const auditsCreation = syncDb
      .prepare("SELECT COUNT(*) AS c FROM audits_territoire WHERE action = 'CREATION'")
      .get().c;
    expect(auditsCreation).toBeGreaterThanOrEqual(10);
  });

  it("23 — Vérifie que ADMIN_CENTRAL peut créer des unités et proposer des corrections dans toutes les provinces sans blocage 'Seul un délégué provincial'", async () => {
    const codeBackendIndex = readFileSync(join(process.cwd(), "backend/src/index.ts"), "utf8");
    expect(codeBackendIndex).not.toContain("Seul un délégué provincial peut proposer une modification territoriale.");

    const appTest = new Hono();
    appTest.use("/api/territoire/*", async (c, next) => {
      const roleHeader = c.req.header("x-test-role") || "ADMIN_CENTRAL";
      const provHeader = c.req.header("x-test-province") || null;
      const usrId =
        roleHeader === "ADMIN_CENTRAL"
          ? adminCentral.id
          : roleHeader === "PROPRIETAIRE"
            ? proprietaire.id
            : delegueBatha.id;
      c.set("utilisateur", {
        id: usrId,
        identifiant: roleHeader.toLowerCase(),
        nom_complet: `Test ${roleHeader}`,
        role: roleHeader,
        province_id: provHeader,
      });
      c.env = { DB: db };
      await next();
    });
    appTest.use("/api/territoire/*", isolationProvinciale);
    appTest.route("/api/territoire", routesTerritoire);

    // 1. ADMIN_CENTRAL propose une localité dans le Ouaddaï (prov-ouaddai)
    const depOuaddai = syncDb
      .prepare("SELECT id FROM departements WHERE province_id = 'prov-ouaddai' AND actif = 1 LIMIT 1")
      .get().id;

    const repPropLocaliteCentral = await appTest.request("/api/territoire/propositions/localites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "ADMIN_CENTRAL",
      },
      body: JSON.stringify({
        province_id: "prov-ouaddai",
        departement_id: depOuaddai,
        nom: "Village Proposé Par Central Ouaddaï",
        type_localite: "VILLAGE",
        source_documentation: "Note centrale de vérification",
      }),
    });
    expect(repPropLocaliteCentral.status).toBe(201);
    const jsonPropLocaliteCentral = await repPropLocaliteCentral.json();
    expect(jsonPropLocaliteCentral.province_id).toBe("prov-ouaddai");
    expect(jsonPropLocaliteCentral.statut_validation).toBe("PROPOSE");

    // 2. ADMIN_CENTRAL propose une correction d'intitulé sur une unité existante d'une autre province
    const repCorrectionCentral = await appTest.request("/api/territoire/propositions/corrections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "ADMIN_CENTRAL",
      },
      body: JSON.stringify({
        type_unite: "VILLE",
        unite_id: villeCreeeId,
        province_id: "prov-batha",
        nom_corrige: "Oum-Hadjer Centre",
        motif_correction: "Harmonisation orthographique centrale",
        source_documentation: "Référentiel national SIGAD",
      }),
    });
    expect(repCorrectionCentral.status).toBe(201);
    const jsonCorrectionCentral = await repCorrectionCentral.json();
    expect(jsonCorrectionCentral.statut_proposition).toBe("ENREGISTREE");
    expect(jsonCorrectionCentral.nom_corrige).toBe("Oum-Hadjer Centre");

    // 3. DELEGUE_PROVINCIAL (Batha) peut proposer une correction dans sa province (prov-batha)
    const repCorrectionDelegue = await appTest.request("/api/territoire/propositions/corrections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "DELEGUE_PROVINCIAL",
        "x-test-province": "prov-batha",
      },
      body: JSON.stringify({
        type_unite: "QUARTIER",
        unite_id: quartierCreeId,
        province_id: "prov-batha",
        nom_corrige: "Quartier Salam Est",
        motif_correction: "Précision du secteur par le délégué provincial",
      }),
    });
    expect(repCorrectionDelegue.status).toBe(201);

    // 4. DELEGUE_PROVINCIAL (Batha) est bloqué s'il tente de proposer une correction dans une autre province (prov-ouaddai)
    const repCorrectionHorsProvince = await appTest.request("/api/territoire/propositions/corrections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "DELEGUE_PROVINCIAL",
        "x-test-province": "prov-batha",
      },
      body: JSON.stringify({
        type_unite: "DEPARTEMENT",
        unite_id: depOuaddai,
        province_id: "prov-ouaddai",
        nom_corrige: "Ouara Corrigé Interdit",
        motif_correction: "Tentative hors périmètre provincial",
      }),
    });
    expect(repCorrectionHorsProvince.status).toBe(403);
  });
});
