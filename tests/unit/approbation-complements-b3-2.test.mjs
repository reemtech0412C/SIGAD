import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, test } from "vitest";
import { evaluerApprobation, evaluerCreationDemande } from "../../backend/src/core/approbation/politique-approbation.ts";
import { SQL_AUDIT_EXPIRATION_APPROBATIONS, SQL_EXPIRER_APPROBATIONS } from "../../backend/src/services/expiration-approbations.service.ts";
import { preparerProprietaireSecondaire, validerOptionsProprietaireSecondaire } from "../../backend/src/services/proprietaire-secondaire.ts";

const racine = resolve(import.meta.dirname, "../..");
let db;

function migrer() {
  const base = new DatabaseSync(":memory:");
  for (const nom of readdirSync(join(racine, "migrations")).filter((n) => /^\d{4}_.*\.sql$/u.test(n)).sort()) {
    base.exec(readFileSync(join(racine, "migrations", nom), "utf8"));
  }
  base.exec("PRAGMA foreign_keys = OFF");
  return base;
}

const compte = (id, role, statut = "ACTIF") => db.prepare(`INSERT INTO utilisateurs
  (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
  VALUES (?, ?, 'Fixture', ?, NULL, 'h', ?, 0)`).run(id, id, role, statut);

describe("expiration planifiée des demandes (D-17)", () => {
  beforeAll(() => {
    db = migrer();
    compte("p1", "PROPRIETAIRE");
    const demande = (id, creeDecalage, expireDecalage) => db.prepare(`INSERT INTO demandes_approbation
      (id, action_code, cible_type, cible_id, empreinte_action, motif, demandeur_id, role_approbateur_requis, cree_le, expire_le)
      VALUES (?, 'NETTOYER_DONNEES_TEST', 'LOT', ?, ?, 'Motif suffisamment long', 'p1', 'PROPRIETAIRE', datetime('now', ?), datetime('now', ?))`)
      .run(id, id, id.padEnd(64, "a").replaceAll(/[^0-9a-f]/gu, "a"), creeDecalage, expireDecalage);
    demande("e1", "-2 days", "-1 day"); // échue
    demande("e2", "+0 hours", "+2 hours"); // encore valable
  });

  test("seules les demandes échues expirent, avec un audit par demande dans la même opération", () => {
    db.exec(SQL_AUDIT_EXPIRATION_APPROBATIONS);
    db.exec(SQL_EXPIRER_APPROBATIONS);
    const statuts = Object.fromEntries(db.prepare("SELECT id, statut FROM demandes_approbation").all().map((l) => [l.id, l.statut]));
    assert.deepEqual(statuts, { e1: "EXPIREE", e2: "EN_ATTENTE" });
    const audits = db.prepare("SELECT entite_id, role_utilisateur FROM journaux_audit WHERE action = 'DEMANDE_APPROBATION_EXPIREE'").all();
    assert.deepEqual(audits.map((a) => [a.entite_id, a.role_utilisateur]), [["e1", "SYSTEME"]]);
    // Idempotent: une seconde passe n'ajoute rien.
    db.exec(SQL_AUDIT_EXPIRATION_APPROBATIONS);
    db.exec(SQL_EXPIRER_APPROBATIONS);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'DEMANDE_APPROBATION_EXPIREE'").get().total, 1);
  });
});

describe("exception d'accès nominatif: règles de la politique (D-17)", () => {
  const maintenant = "2026-10-31T10:00:00.000Z";
  const demande = {
    actionCode: "EXCEPTION_ACCES_NOMINATIF", cibleType: "ROUTE", cibleId: "GET /api/distributions/menages",
    empreinteAction: "a".repeat(64), demandeurId: "c1", statut: "EN_ATTENTE",
    creeLe: "2026-10-31T09:00:00.000Z", expireLe: "2026-10-31T21:00:00.000Z",
  };
  const approbateur = { id: "c2", role: "ADMIN_CENTRAL", actif: true, mfaVerifieeLe: "2026-10-31T09:55:00.000Z" };

  test("deux administrateurs centraux actifs sont requis, et seul un ADMIN_CENTRAL demande", () => {
    const deux = { maintenant, proprietairesActifs: 5, administrateursCentrauxActifs: 2 };
    assert.equal(evaluerCreationDemande("EXCEPTION_ACCES_NOMINATIF", { role: "ADMIN_CENTRAL", actif: true }, deux).autorise, true);
    assert.equal(evaluerCreationDemande("EXCEPTION_ACCES_NOMINATIF", { role: "ADMIN_CENTRAL", actif: true }, { maintenant, proprietairesActifs: 5, administrateursCentrauxActifs: 1 }).motif, "SECOND_ADMIN_CENTRAL_ABSENT");
    assert.equal(evaluerCreationDemande("EXCEPTION_ACCES_NOMINATIF", { role: "ADMIN_CENTRAL", actif: true }, { maintenant, proprietairesActifs: 5 }).autorise, false);
    assert.equal(evaluerCreationDemande("EXCEPTION_ACCES_NOMINATIF", { role: "PROPRIETAIRE", actif: true }, deux).motif, "DEMANDEUR_NON_HABILITE");
  });

  test("approbation: autre ADMIN_CENTRAL avec MFA fraîche; jamais le demandeur, jamais un propriétaire", () => {
    const deux = { maintenant, proprietairesActifs: 5, administrateursCentrauxActifs: 2 };
    assert.equal(evaluerApprobation(demande, approbateur, deux).autorise, true);
    assert.equal(evaluerApprobation(demande, { ...approbateur, id: "c1" }, deux).motif, "AUTO_APPROBATION_INTERDITE");
    assert.equal(evaluerApprobation(demande, { ...approbateur, role: "PROPRIETAIRE" }, deux).motif, "HABILITATION_INSUFFISANTE");
    assert.equal(evaluerApprobation(demande, approbateur, { ...deux, administrateursCentrauxActifs: 1 }).motif, "SECOND_ADMIN_CENTRAL_ABSENT");
    assert.equal(evaluerApprobation(demande, { ...approbateur, mfaVerifieeLe: null }, deux).motif, "MFA_NON_RECENTE");
  });

  test("table inerte: durée ≤ 24 h, route fermée, bénéficiaire ≠ accordeur, lignes immuables", () => {
    db = migrer();
    compte("c1", "ADMIN_CENTRAL"); compte("c2", "ADMIN_CENTRAL");
    db.prepare(`INSERT INTO demandes_approbation (id, action_code, cible_type, cible_id, empreinte_action, motif, demandeur_id, role_approbateur_requis, cree_le, expire_le)
      VALUES ('d1', 'EXCEPTION_ACCES_NOMINATIF', 'ROUTE', 'GET /api/distributions/menages', '${"b".repeat(64)}', 'Motif suffisamment long', 'c1', 'ADMIN_CENTRAL', datetime('now'), datetime('now', '+24 hours'))`).run();
    const accorder = (id, extra = {}) => db.prepare(`INSERT INTO exceptions_acces_nominatif (id, demande_id, beneficiaire_id, route_cible, finalite, accorde_par, accorde_le, expire_le)
      VALUES (?, ?, ?, ?, 'Finalité suffisamment longue', ?, datetime('now'), ?)`)
      .run(id, extra.demande ?? "d1", extra.beneficiaire ?? "c1", extra.route ?? "GET /api/distributions/menages", extra.accorde ?? "c2", extra.expire ?? "datetime-placeholder");
    assert.throws(() => accorder("x1", { expire: "2000-01-01 00:00:00" }));
    assert.throws(() => accorder("x2", { route: "GET /api/ailleurs" }));
    assert.throws(() => accorder("x3", { accorde: "c1", expire: new Date(Date.now() + 3600_000).toISOString().replace("T", " ").slice(0, 19) }));
    assert.throws(() => accorder("x4", { expire: new Date(Date.now() + 48 * 3600_000).toISOString().replace("T", " ").slice(0, 19) }));
    accorder("ok1", { expire: new Date(Date.now() + 3600_000).toISOString().replace("T", " ").slice(0, 19) });
    assert.throws(() => db.prepare("UPDATE exceptions_acces_nominatif SET expire_le = datetime('now', '+20 hours') WHERE id = 'ok1'").run(), /IMMUABLE/);
    db.prepare("UPDATE exceptions_acces_nominatif SET revoque_le = datetime('now') WHERE id = 'ok1'").run();
    assert.throws(() => db.prepare("UPDATE exceptions_acces_nominatif SET revoque_le = NULL WHERE id = 'ok1'").run(), /IMMUABLE/);
  });
});

describe("procédure du second propriétaire (D-17)", () => {
  const options = { identifiant: "garant.deux", nomComplet: "Garant Synthétique", operateur: "Opérateur test", motif: "Création du second propriétaire requise par D-17." };

  test("validation stricte des options", () => {
    assert.deepEqual(validerOptionsProprietaireSecondaire(options), []);
    assert.ok(validerOptionsProprietaireSecondaire({ ...options, identifiant: "proprietaire" }).includes("IDENTIFIANT_RESERVE"));
    assert.ok(validerOptionsProprietaireSecondaire({ ...options, identifiant: "Bad Id" }).includes("IDENTIFIANT_INVALIDE"));
    assert.ok(validerOptionsProprietaireSecondaire({ ...options, motif: "trop court" }).includes("MOTIF_TROP_COURT"));
  });

  test("le SQL n'embarque jamais le code d'activation et ses gardes empêchent amorçage à vide, doublon et excès", async () => {
    db = migrer();
    const prepare = await preparerProprietaireSecondaire(options);
    assert.ok(!prepare.sql.includes(prepare.codeActivation));
    // Aucun propriétaire actif: rien n'est créé (pas d'amorçage à vide).
    db.exec("UPDATE utilisateurs SET statut = 'SUSPENDU' WHERE role = 'PROPRIETAIRE'");
    db.exec(prepare.sql);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE identifiant = 'garant.deux'").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'CREATION_PROPRIETAIRE_SECONDAIRE'").get().total, 0);

    db.exec("UPDATE utilisateurs SET statut = 'ACTIF' WHERE role = 'PROPRIETAIRE'");
    db.exec(prepare.sql);
    db.exec(prepare.sql);
    const cree = db.prepare("SELECT role, statut, doit_changer_mot_de_passe AS changer, code_activation_hash FROM utilisateurs WHERE identifiant = 'garant.deux'").all();
    assert.equal(cree.length, 1);
    assert.deepEqual([cree[0].role, cree[0].statut, cree[0].changer], ["PROPRIETAIRE", "ACTIF", 1]);
    assert.ok(cree[0].code_activation_hash.startsWith("pbkdf2-sha256$"));
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'CREATION_PROPRIETAIRE_SECONDAIRE'").get().total, 1);

    // Plafond de trois propriétaires actifs.
    const troisieme = await preparerProprietaireSecondaire({ ...options, identifiant: "garant.trois" });
    db.exec(troisieme.sql);
    const quatrieme = await preparerProprietaireSecondaire({ ...options, identifiant: "garant.quatre" });
    db.exec(quatrieme.sql);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'PROPRIETAIRE'").get().total, 3);
  });
});
