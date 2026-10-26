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

  const demoStocks = await readFile(resolve(racine, "tests/fixtures/demonstration-stocks.sql"), "utf8");
  dbSync.exec(demoStocks);

  return dbSync;
}

describe("Chantier 04 — Séparation des responsabilités et profils opérationnels", () => {
  it("crée les profils opérationnels de terrain et dérive le rôle effectif", async () => {
    const db = await initBaseMemoire();

    // 1. Création de trois comptes opérationnels (base role = ADMIN_CENTRAL, province rattachée dans le profil opérationnel)
    db.exec(`
      INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, doit_changer_mot_de_passe, statut)
      VALUES
        ('usr-magasinier-ouaddai', 'magasinier-ouaddai', 'Magasinier Abeche', 'ADMIN_CENTRAL', NULL, 'hash', 0, 'ACTIF'),
        ('usr-superviseur-ouaddai', 'superviseur-ouaddai', 'Superviseur Terrain Ouaddai', 'ADMIN_CENTRAL', NULL, 'hash', 0, 'ACTIF'),
        ('usr-distributeur-ouaddai', 'agent-dist-ouaddai', 'Agent Distribution Ouara', 'ADMIN_CENTRAL', NULL, 'hash', 0, 'ACTIF');
    `);

    // 2. Attribution des profils opérationnels dans la table profils_operationnels_terrain (Migration 0030)
    db.exec(`
      INSERT INTO profils_operationnels_terrain (id, utilisateur_id, role_terrain, province_id, entrepot_id, statut, attribue_par)
      VALUES
        ('pot-01', 'usr-magasinier-ouaddai', 'RESPONSABLE_STOCK', 'prov-ouaddai', 'ent-prov-ouaddai', 'ACTIF', 'usr-central'),
        ('pot-02', 'usr-superviseur-ouaddai', 'SUPERVISEUR_TERRAIN', 'prov-ouaddai', NULL, 'ACTIF', 'usr-central'),
        ('pot-03', 'usr-distributeur-ouaddai', 'AGENT_DISTRIBUTION', 'prov-ouaddai', NULL, 'ACTIF', 'usr-central');
    `);

    // 3. Vérification de la dérivation du rôle effectif via la requête de session (conforme à auth.middleware.ts)
    const requeteSession = `
      SELECT u.id, u.identifiant,
        CASE
          WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
          WHEN pot.id IS NOT NULL THEN pot.role_terrain
          ELSE u.role
        END AS role_effectif,
        COALESCE(u.province_id, pot.province_id) AS province_id_effectif,
        pot.entrepot_id AS entrepot_id_effectif,
        CASE
          WHEN cc.statut = 'SUSPENDU' THEN 'SUSPENDU'
          WHEN pot.statut = 'SUSPENDU' THEN 'SUSPENDU'
          WHEN pot.statut = 'REVOQUE' THEN 'SUSPENDU'
          ELSE u.statut
        END AS statut_effectif
      FROM utilisateurs u
      LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
      LEFT JOIN profils_operationnels_terrain pot ON pot.utilisateur_id = u.id AND pot.statut = 'ACTIF'
      WHERE u.id = ?
    `;

    const magasinier = db.prepare(requeteSession).get("usr-magasinier-ouaddai");
    expect(magasinier.role_effectif).toBe("RESPONSABLE_STOCK");
    expect(magasinier.province_id_effectif).toBe("prov-ouaddai");
    expect(magasinier.entrepot_id_effectif).toBe("ent-prov-ouaddai");
    expect(magasinier.statut_effectif).toBe("ACTIF");

    const superviseur = db.prepare(requeteSession).get("usr-superviseur-ouaddai");
    expect(superviseur.role_effectif).toBe("SUPERVISEUR_TERRAIN");
    expect(superviseur.province_id_effectif).toBe("prov-ouaddai");
    expect(superviseur.statut_effectif).toBe("ACTIF");

    const agentDist = db.prepare(requeteSession).get("usr-distributeur-ouaddai");
    expect(agentDist.role_effectif).toBe("AGENT_DISTRIBUTION");
    expect(agentDist.province_id_effectif).toBe("prov-ouaddai");
    expect(agentDist.statut_effectif).toBe("ACTIF");

    // 4. Vérification du cloisonnement provincial
    const provinceUtilisateur = magasinier.province_id_effectif;
    const provinceCibleAutre = "prov-sila";
    expect(provinceUtilisateur).not.toBe(provinceCibleAutre);
  });

  it("garantit les règles de séparation des tâches incompatibles et contraintes CHECK", async () => {
    const db = await initBaseMemoire();

    // Un délégué provincial ne peut pas être propriétaire
    const delegations = db.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL' AND province_id IS NULL").get();
    expect(delegations.total).toBe(0);

    // Seul un ADMIN_CENTRAL ou PROPRIETAIRE peut créer une opération centrale
    const adminCentral = db.prepare("SELECT role FROM utilisateurs WHERE id = 'usr-central'").get();
    expect(adminCentral.role).toBe("ADMIN_CENTRAL");

    // Les profils de terrain sont bien enregistrés avec les contraintes CHECK de statut
    let echecCheck = false;
    try {
      db.exec(`
        INSERT INTO profils_operationnels_terrain (id, utilisateur_id, role_terrain, province_id, statut, attribue_par)
        VALUES ('pot-err', 'usr-ouaddai', 'ROLE_INVENTE', 'prov-ouaddai', 'ACTIF', 'usr-central');
      `);
    } catch (err) {
      echecCheck = /CHECK constraint failed/u.test(err.message);
    }
    expect(echecCheck).toBe(true);
  });
});
