import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, test } from "vitest";
import {
  ACTIONS_INTERDITES, CODES_DRAPEAUX_AUTORISATION, OPERATIONS_CLASSE_A, OPERATIONS_CLASSE_B,
  empreinteAction, evaluerApprobation, evaluerCreationDemande, evaluerExecution, roleApprobateurRequis,
} from "../../backend/src/core/approbation/politique-approbation.ts";

const racine = resolve(import.meta.dirname, "../..");
const maintenant = "2026-10-31T10:00:00.000Z";
const demandeBase = {
  actionCode: "NETTOYER_DONNEES_TEST", cibleType: "LOT", cibleId: "lot-1", empreinteAction: "a".repeat(64),
  demandeurId: "p1", statut: "EN_ATTENTE", creeLe: "2026-10-31T09:00:00.000Z", expireLe: "2026-10-31T21:00:00.000Z",
};
const approbateurBase = { id: "p2", role: "PROPRIETAIRE", actif: true, mfaVerifieeLe: "2026-10-31T09:55:00.000Z" };
const ctx = { maintenant, proprietairesActifs: 2 };

describe("D-16/D-17: politique d'approbation", () => {
  test("les classes sont disjointes et les actions interdites jamais approuvables", () => {
    const a = Object.keys(OPERATIONS_CLASSE_A);
    assert.ok(a.every((x) => !OPERATIONS_CLASSE_B.includes(x) && !ACTIONS_INTERDITES.includes(x)));
    for (const interdite of ACTIONS_INTERDITES) {
      assert.equal(evaluerCreationDemande(interdite, { role: "PROPRIETAIRE", actif: true }, ctx).autorise, false);
    }
    assert.equal(roleApprobateurRequis("EXCEPTION_ACCES_NOMINATIF"), "ADMIN_CENTRAL");
    assert.equal(roleApprobateurRequis("SUSPENDRE_COMPTE"), null);
  });

  test("un seul propriétaire actif: toute opération de plateforme de classe A échoue fermé", () => {
    const seul = { maintenant, proprietairesActifs: 1 };
    assert.equal(evaluerCreationDemande("NETTOYER_DONNEES_TEST", { role: "PROPRIETAIRE", actif: true }, seul).motif, "SECOND_PROPRIETAIRE_ABSENT");
    assert.equal(evaluerApprobation(demandeBase, approbateurBase, seul).autorise, false);
    // L'exception nominative relève de l'Administration centrale: elle ne dépend pas du second propriétaire,
    // mais exige un second administrateur central actif (échec fermé sinon).
    assert.equal(evaluerCreationDemande("EXCEPTION_ACCES_NOMINATIF", { role: "ADMIN_CENTRAL", actif: true }, { ...seul, administrateursCentrauxActifs: 2 }).autorise, true);
    assert.equal(evaluerCreationDemande("EXCEPTION_ACCES_NOMINATIF", { role: "ADMIN_CENTRAL", actif: true }, seul).motif, "SECOND_ADMIN_CENTRAL_ABSENT");
  });

  test("séparation des tâches, habilitation et fraîcheur MFA", () => {
    assert.equal(evaluerApprobation(demandeBase, approbateurBase, ctx).autorise, true);
    assert.equal(evaluerApprobation(demandeBase, { ...approbateurBase, id: "p1" }, ctx).motif, "AUTO_APPROBATION_INTERDITE");
    assert.equal(evaluerApprobation({ ...demandeBase, cibleType: "UTILISATEUR", cibleId: "p2" }, approbateurBase, ctx).motif, "APPROBATEUR_EST_LA_CIBLE");
    assert.equal(evaluerApprobation(demandeBase, { ...approbateurBase, role: "ADMIN_CENTRAL" }, ctx).motif, "HABILITATION_INSUFFISANTE");
    assert.equal(evaluerApprobation(demandeBase, { ...approbateurBase, mfaVerifieeLe: "2026-10-31T09:30:00.000Z" }, ctx).motif, "MFA_NON_RECENTE");
    assert.equal(evaluerApprobation(demandeBase, { ...approbateurBase, mfaVerifieeLe: null }, ctx).motif, "MFA_NON_RECENTE");
    assert.equal(evaluerApprobation(demandeBase, { ...approbateurBase, actif: false }, ctx).motif, "APPROBATEUR_INACTIF");
  });

  test("expiration, état de la demande et durée maximale", () => {
    assert.equal(evaluerApprobation(demandeBase, approbateurBase, { ...ctx, maintenant: "2026-10-31T21:00:00.000Z" }).motif, "DEMANDE_EXPIREE");
    assert.equal(evaluerApprobation({ ...demandeBase, statut: "APPROUVEE" }, approbateurBase, ctx).motif, "DEMANDE_NON_EN_ATTENTE");
    assert.equal(evaluerApprobation({ ...demandeBase, expireLe: "2026-11-02T09:00:00.000Z" }, approbateurBase, ctx).motif, "DUREE_DEMANDE_EXCESSIVE");
  });

  test("exécution: usage unique et empreinte exacte", async () => {
    const action = { actionCode: "NETTOYER_DONNEES_TEST", cibleType: "LOT", cibleId: "lot-1", parametres: { b: 2, a: 1 } };
    const empreinte = await empreinteAction(action);
    assert.equal(empreinte, await empreinteAction({ ...action, parametres: { a: 1, b: 2 } }));
    assert.notEqual(empreinte, await empreinteAction({ ...action, cibleId: "lot-2" }));
    const approuvee = { ...demandeBase, statut: "APPROUVEE", empreinteAction: empreinte };
    assert.equal(evaluerExecution(approuvee, empreinte, ctx).autorise, true);
    assert.equal(evaluerExecution(approuvee, "b".repeat(64), ctx).motif, "ACTION_DIFFERENTE_DE_CELLE_APPROUVEE");
    assert.equal(evaluerExecution({ ...approuvee, statut: "EXECUTEE" }, empreinte, ctx).motif, "DEMANDE_NON_APPROUVEE");
    assert.equal(evaluerExecution(approuvee, empreinte, { ...ctx, maintenant: "2026-11-01T00:00:00.000Z" }).motif, "APPROBATION_EXPIREE");
  });
});

describe("migration 0045: drapeaux et demandes d'approbation", () => {
  let db;
  const compte = (id, role, statut = "ACTIF") => db.prepare(`INSERT INTO utilisateurs
    (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
    VALUES (?, ?, 'Fixture', ?, NULL, 'h', ?, 0)`).run(id, id, role, statut);
  const demande = (id, extra = {}) => db.prepare(`INSERT INTO demandes_approbation
    (id, action_code, cible_type, cible_id, empreinte_action, motif, demandeur_id, role_approbateur_requis, cree_le, expire_le)
    VALUES (?, ?, 'LOT', ?, ?, 'Motif suffisamment long', ?, 'PROPRIETAIRE', '2026-10-31 09:00:00', ?)`)
    .run(id, extra.action ?? "NETTOYER_DONNEES_TEST", extra.cible ?? id, extra.empreinte ?? "c".repeat(64), extra.demandeur ?? "p1", extra.expire ?? "2026-10-31 20:00:00");

  beforeAll(() => {
    db = new DatabaseSync(":memory:");
    for (const nom of readdirSync(join(racine, "migrations")).filter((n) => /^\d{4}_.*\.sql$/u.test(n)).sort()) {
      db.exec(readFileSync(join(racine, "migrations", nom), "utf8"));
    }
    db.exec("PRAGMA foreign_keys = OFF");
    compte("p1", "PROPRIETAIRE"); compte("p2", "PROPRIETAIRE"); compte("p3", "PROPRIETAIRE", "SUSPENDU");
    compte("c1", "ADMIN_CENTRAL");
  });

  test("catalogue de drapeaux: 5 drapeaux, tous désactivés, autorisation toujours à double contrôle", () => {
    const lignes = db.prepare("SELECT code, categorie, actif, double_controle FROM drapeaux_plateforme ORDER BY code").all();
    assert.equal(lignes.length, 5);
    assert.ok(lignes.every((l) => l.actif === 0));
    assert.ok(lignes.filter((l) => l.categorie === "AUTORISATION").every((l) => l.double_controle === 1));
    for (const code of CODES_DRAPEAUX_AUTORISATION) {
      assert.equal(lignes.find((l) => l.code === code)?.categorie, "AUTORISATION");
    }
    assert.throws(() => db.prepare("INSERT INTO drapeaux_plateforme (code, categorie, description, double_controle) VALUES ('x_auth', 'AUTORISATION', 'd', 0)").run());
    assert.throws(() => db.prepare("INSERT INTO drapeaux_plateforme (code, categorie, description, double_controle) VALUES ('Mauvais-Code', 'TECHNIQUE', 'd', 0)").run());
  });

  test("création: durée maximale 24 h et statut initial imposé", () => {
    demande("d1");
    assert.throws(() => demande("d2", { expire: "2026-11-01 09:00:01" }), /CREATION_INVALIDE/);
    assert.throws(() => db.prepare(`INSERT INTO demandes_approbation (id, action_code, cible_type, cible_id, empreinte_action, motif, demandeur_id,
      role_approbateur_requis, statut, cree_le, expire_le) VALUES ('d3','NETTOYER_DONNEES_TEST','LOT','d3','${"c".repeat(64)}','Motif suffisamment long','p1','PROPRIETAIRE','APPROUVEE','2026-10-31 09:00:00','2026-10-31 20:00:00')`).run());
    assert.throws(() => db.prepare("UPDATE demandes_approbation SET motif = 'motif suffisamment modifie' WHERE id = 'd1'").run(), /IMMUABLE/);
    assert.throws(() => db.prepare("UPDATE demandes_approbation SET empreinte_action = ? WHERE id = 'd1'").run("d".repeat(64)), /IMMUABLE/);
  });

  test("décision: pas d'auto-approbation, rôle requis, compte actif, transitions et usage unique", () => {
    const decider = (id, par, statut = "APPROUVEE") => db.prepare("UPDATE demandes_approbation SET statut = ?, decide_par = ?, decide_le = '2026-10-31 10:00:00' WHERE id = ?").run(statut, par, id);
    assert.throws(() => decider("d1", "p1"));
    assert.throws(() => decider("d1", "c1"), /APPROBATEUR_INVALIDE/);
    assert.throws(() => decider("d1", "p3"), /APPROBATEUR_INVALIDE/);
    decider("d1", "p2");
    assert.equal(db.prepare("SELECT statut FROM demandes_approbation WHERE id = 'd1'").get().statut, "APPROUVEE");
    assert.throws(() => db.prepare("UPDATE demandes_approbation SET statut = 'REFUSEE' WHERE id = 'd1'").run(), /TRANSITION_INVALIDE/);
    db.prepare("UPDATE demandes_approbation SET statut = 'EXECUTEE', execute_le = '2026-10-31 10:05:00' WHERE id = 'd1'").run();
    assert.throws(() => db.prepare("UPDATE demandes_approbation SET statut = 'APPROUVEE' WHERE id = 'd1'").run(), /TRANSITION_INVALIDE/);
    // Une demande identique ouverte est unique; une fois exécutée, la même empreinte peut être redemandée.
    demande("d4", { cible: "d1", empreinte: "c".repeat(64) });
    assert.throws(() => demande("d5", { cible: "d1", empreinte: "c".repeat(64) }), /UNIQUE/);
  });
});
