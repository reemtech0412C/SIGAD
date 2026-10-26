import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  creerOperationCentrale,
  modifierOperationCentrale,
  changerStatutOperationCentrale,
  enregistrerApprobation,
} from "../../backend/src/services/operation-centrale.service";

describe("Chantier 03 — Gouvernance, Statut Brouillon et Circuit des Approbations", () => {
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

  function creerBaseMigree() {
    const dbSync = new DatabaseSync(":memory:");
    const dir = resolve(process.cwd(), "migrations");
    const sqlFiles = readdirSync(dir)
      .filter((f) => /^\d{4}_.*\.sql$/u.test(f))
      .sort((a, b) => a.localeCompare(b));

    for (const f of sqlFiles) {
      dbSync.exec(readFileSync(resolve(dir, f), "utf8"));
    }
    return { dbSync, db: adapterD1(dbSync) };
  }

  const adminSession = {
    id: "usr-central",
    identifiant: "central",
    nom_complet: "Administrateur central",
    role: "ADMIN_CENTRAL",
    province_id: null,
  };

  it("permet l'édition complète d'une opération en statut BROUILLON", async () => {
    const { dbSync, db } = creerBaseMigree();

    // 1. Création d'une opération en brouillon
    const creation = await creerOperationCentrale(
      db,
      adminSession,
      {
        intitule: "Campagne Urgence Sahel 2026",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026",
        institution_responsable: "MASSNAH",
        source_vivres: "ONASA",
        provinces: [{ province_id: "prov-sila", quantite_allouee_prevue: 500 }],
      },
      "cle-idempotence-0001",
      "127.0.0.1",
    );

    const opId = creation.corps.id;
    expect(opId).toBeDefined();

    // 2. Modification en brouillon
    await modifierOperationCentrale(
      db,
      adminSession,
      opId,
      {
        intitule: "Campagne Urgence Sahel 2026 — Version Révisée",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026",
        institution_responsable: "MASSNAH",
        source_vivres: "ONASA",
        provinces: [
          { province_id: "prov-sila", quantite_allouee_prevue: 600 },
          { province_id: "prov-ouaddai", quantite_allouee_prevue: 400 },
        ],
      },
      "cle-idempotence-0002",
      "127.0.0.1",
    );

    const row = dbSync.prepare("SELECT intitule FROM operations_centrales_distribution WHERE id = ?").get(opId);
    expect(row.intitule).toBe("Campagne Urgence Sahel 2026 — Version Révisée");

    const nbProv = dbSync.prepare("SELECT COUNT(*) AS total FROM operations_centrales_provinces WHERE operation_id = ?").get(opId).total;
    expect(nbProv).toBe(2);

    dbSync.close();
  });

  it("gère le circuit de retour pour correction SOUMISE_A_APPROBATION -> BROUILLON", async () => {
    const { dbSync, db } = creerBaseMigree();

    const creation = await creerOperationCentrale(
      db,
      adminSession,
      {
        intitule: "Campagne Fitri 2026",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026",
        institution_responsable: "MASSNAH",
        source_vivres: "ONASA",
        provinces: [{ province_id: "prov-batha", quantite_allouee_prevue: 300 }],
      },
      "cle-idempotence-0003",
      "127.0.0.1",
    );
    const opId = creation.corps.id;

    // Soumission à approbation
    await changerStatutOperationCentrale(
      db,
      adminSession,
      opId,
      {
        nouveau_statut: "SOUMISE_A_APPROBATION",
      },
      "cle-idempotence-0004",
      "127.0.0.1",
    );

    const statut1 = dbSync.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opId).statut;
    expect(statut1).toBe("SOUMISE_A_APPROBATION");

    // Rejet de modification directe tant qu'elle est soumise à approbation
    await expect(
      modifierOperationCentrale(
        db,
        adminSession,
        opId,
        {
          intitule: "Modification Interdite",
          type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
          annee_campagne: "2026",
          institution_responsable: "MASSNAH",
          source_vivres: "ONASA",
          provinces: [{ province_id: "prov-batha" }],
        },
        "cle-idempotence-0005",
        "127.0.0.1",
      ),
    ).rejects.toThrow("Seule une opération en statut BROUILLON peut être modifiée.");

    // Retour pour corrections en BROUILLON avec motif obligatoire
    await changerStatutOperationCentrale(
      db,
      adminSession,
      opId,
      {
        nouveau_statut: "BROUILLON",
        motif_ou_commentaire: "Revue requise : ajuster les prévisions pour inclure les personnes déplacées.",
      },
      "cle-idempotence-0006",
      "127.0.0.1",
    );

    const statut2 = dbSync.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opId).statut;
    expect(statut2).toBe("BROUILLON");

    // Vérifie l'historique de transition
    const histo = dbSync.prepare("SELECT statut_precedent, nouveau_statut, motif_ou_commentaire FROM historique_operations_centrales WHERE operation_id = ? ORDER BY rowid DESC LIMIT 1").get(opId);
    expect(histo.statut_precedent).toBe("SOUMISE_A_APPROBATION");
    expect(histo.nouveau_statut).toBe("BROUILLON");
    expect(histo.motif_ou_commentaire).toContain("Revue requise");

    // L'opération en brouillon est à nouveau modifiable !
    await modifierOperationCentrale(
      db,
      adminSession,
      opId,
      {
        intitule: "Campagne Fitri 2026 — Ajustée avec PDI",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026",
        institution_responsable: "MASSNAH",
        source_vivres: "ONASA",
        provinces: [{ province_id: "prov-batha", quantite_allouee_prevue: 450 }],
      },
      "cle-idempotence-0007",
      "127.0.0.1",
    );

    const rowAjustee = dbSync.prepare("SELECT intitule FROM operations_centrales_distribution WHERE id = ?").get(opId);
    expect(rowAjustee.intitule).toBe("Campagne Fitri 2026 — Ajustée avec PDI");

    dbSync.close();
  });

  it("distingue les actes constitutifs ministériels et approbations de pilotage", async () => {
    const { dbSync, db } = creerBaseMigree();

    const creation = await creerOperationCentrale(
      db,
      adminSession,
      {
        intitule: "Opération Nationale Barh El Gazel 2026",
        type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
        annee_campagne: "2026",
        institution_responsable: "MASSNAH",
        source_vivres: "ONASA",
        provinces: [{ province_id: "prov-barh-el-gazel", quantite_allouee_prevue: 800 }],
      },
      "cle-idempotence-0008",
      "127.0.0.1",
    );
    const opId = creation.corps.id;

    await changerStatutOperationCentrale(
      db,
      adminSession,
      opId,
      { nouveau_statut: "SOUMISE_A_APPROBATION" },
      "cle-idempotence-0009",
      "127.0.0.1",
    );

    // Tentative d'approbation sans acte -> Rejetée
    await expect(
      changerStatutOperationCentrale(
        db,
        adminSession,
        opId,
        { nouveau_statut: "APPROUVEE" },
        "cle-idempotence-0010",
        "127.0.0.1",
      ),
    ).rejects.toThrow("Au moins un acte d'approbation formel");

    // 1. Enregistrement Décision Ministérielle
    await enregistrerApprobation(
      db,
      adminSession,
      opId,
      {
        type_approbation: "VALIDATION_MINISTERIELLE",
        instance_decisionnaire: "Cabinet Ministre MASSNAH",
        reference_acte: "ARR-0033/PR/PM/MASSNAH/2026",
        date_decision: "2026-10-07",
        signataire_nom: "Ministre de l'Action Sociale",
        signataire_qualite: "Ministre",
        decision: "APPROUVE",
      },
      "cle-idempotence-0011",
      "127.0.0.1",
    );

    // 2. Enregistrement Comité de Pilotage
    await enregistrerApprobation(
      db,
      adminSession,
      opId,
      {
        type_approbation: "COMITE_PILOTAGE",
        instance_decisionnaire: "Comité National de Pilotage des Distributions",
        reference_acte: "PV-COPIL-2026-10",
        date_decision: "2026-10-15",
        signataire_nom: "Président du COPIL",
        signataire_qualite: "Secrétaire Général",
        decision: "APPROUVE",
      },
      "cle-idempotence-0012",
      "127.0.0.1",
    );

    // Maintenant, le passage à APPROUVEE est accepté !
    await changerStatutOperationCentrale(
      db,
      adminSession,
      opId,
      { nouveau_statut: "APPROUVEE" },
      "cle-idempotence-0013",
      "127.0.0.1",
    );

    const statutFinal = dbSync.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opId).statut;
    expect(statutFinal).toBe("APPROUVEE");

    dbSync.close();
  });
});
