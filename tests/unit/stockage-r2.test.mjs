import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { repererArchivesOrphelines, supprimerArchivesOrphelinesR2, televerserPuisReferencerR2 } from "../../backend/src/services/stockage-r2.service.ts";

function creerBucket(options = {}) {
  const objets = new Map();
  const suppressions = [];
  const bucket = {
    async put(cle, contenu) {
      if (options.echecTeleversement) throw new Error("Panne R2 simulée.");
      objets.set(cle, contenu);
      return {};
    },
    async delete(cle) {
      suppressions.push(cle);
      if (options.echecSuppression) throw new Error("Panne de suppression R2 simulée.");
      objets.delete(cle);
    },
  };
  return { bucket, objets, suppressions };
}

describe("Écriture d’objets R2 avec référence D1 compensée", () => {
  it("isole les seuls objets anciens sans référence D1 pour la réconciliation", () => {
    const dateLimite = Date.parse("2026-10-21T00:00:00.000Z");
    const objets = [
      { key: "archives/rapports/orphelin.csv", uploaded: new Date("2026-10-20T12:00:00.000Z"), size: 80 },
      { key: "archives/rapports/reference.pdf", uploaded: new Date("2026-10-20T12:00:00.000Z"), size: 160 },
      { key: "archives/rapports/recent.xlsx", uploaded: new Date("2026-10-22T12:00:00.000Z"), size: 240 },
    ];
    const orphelines = repererArchivesOrphelines(objets, new Set(["archives/rapports/reference.pdf"]), dateLimite);
    assert.deepEqual(orphelines.map((objet) => objet.key), ["archives/rapports/orphelin.csv"]);
  });

  it("supprime seulement les objets anciens réellement orphelins après une seconde vérification D1", async () => {
    const dateLimite = Date.parse("2026-10-21T00:00:00.000Z");
    const stockage = creerBucket();
    stockage.objets.set("archives/rapports/orphelin.csv", "ancien");
    stockage.objets.set("archives/rapports/reference.pdf", "référencé");
    stockage.objets.set("archives/rapports/recent.xlsx", "récent");
    const objets = [
      { key: "archives/rapports/orphelin.csv", uploaded: new Date("2026-10-20T12:00:00.000Z"), size: 80 },
      { key: "archives/rapports/reference.pdf", uploaded: new Date("2026-10-20T12:00:00.000Z"), size: 160 },
      { key: "archives/rapports/recent.xlsx", uploaded: new Date("2026-10-22T12:00:00.000Z"), size: 240 },
      { key: "archives/rapports/reference-concurrente.pdf", uploaded: new Date("2026-10-20T12:00:00.000Z"), size: 320 },
    ];
    const resultat = await supprimerArchivesOrphelinesR2({
      bucket: stockage.bucket,
      objets,
      referencesD1: new Set(["archives/rapports/reference.pdf"]),
      dateLimiteSecurite: dateLimite,
      referenceDejaPresente: async (cle) => cle === "archives/rapports/reference-concurrente.pdf",
    });
    assert.deepEqual(resultat, { supprimees: 1, echec: 0, verifiees: 2 });
    assert.deepEqual(stockage.suppressions, ["archives/rapports/orphelin.csv"]);
    assert.equal(stockage.objets.has("archives/rapports/reference.pdf"), true);
    assert.equal(stockage.objets.has("archives/rapports/reference-concurrente.pdf"), false);
    assert.equal(stockage.objets.has("archives/rapports/recent.xlsx"), true);
  });

  it("compte et signale un échec de suppression sans perdre le résultat de rapprochement", async () => {
    const stockage = creerBucket({ echecSuppression: true });
    const erreurs = [];
    const resultat = await supprimerArchivesOrphelinesR2({
      bucket: stockage.bucket,
      objets: [{ key: "archives/rapports/ancien.csv", uploaded: new Date("2026-10-20T12:00:00.000Z"), size: 80 }],
      referencesD1: new Set(),
      dateLimiteSecurite: Date.parse("2026-10-21T00:00:00.000Z"),
      referenceDejaPresente: async () => false,
      signalerEchec: (cle, erreur) => erreurs.push({ cle, message: erreur.message }),
    });
    assert.deepEqual(resultat, { supprimees: 0, echec: 1, verifiees: 1 });
    assert.deepEqual(erreurs, [{ cle: "archives/rapports/ancien.csv", message: "Panne de suppression R2 simulée." }]);
  });

  it("signale un échec de téléversement sans enregistrer une référence", async () => {
    const stockage = creerBucket({ echecTeleversement: true });
    let referencesEnregistrees = 0;
    await assert.rejects(() => televerserPuisReferencerR2({
      bucket: stockage.bucket,
      cle: "archives/rapport-echec.pdf",
      contenu: new Uint8Array([37, 80, 68, 70]),
      options: { httpMetadata: { contentType: "application/pdf" } },
      televerserObjet: true,
      referenceDejaPresente: async () => false,
      enregistrerReference: async () => { referencesEnregistrees += 1; },
    }), /Panne R2 simulée/u);
    assert.equal(referencesEnregistrees, 0);
    assert.equal(stockage.objets.size, 0);
  });

  it("supprime l’objet si l’écriture D1 échoue et qu’aucune référence n’existe", async () => {
    const stockage = creerBucket();
    await assert.rejects(() => televerserPuisReferencerR2({
      bucket: stockage.bucket,
      cle: "approvisionnements/prov-sila/exp-01/pv-01",
      contenu: new Uint8Array([37, 80, 68, 70]),
      options: { httpMetadata: { contentType: "application/pdf" } },
      televerserObjet: true,
      referenceDejaPresente: async () => false,
      enregistrerReference: async () => { throw new Error("Échec D1 simulé."); },
    }), /Échec D1 simulé/u);
    assert.deepEqual(stockage.suppressions, ["approvisionnements/prov-sila/exp-01/pv-01"]);
    assert.equal(stockage.objets.size, 0);
  });

  it("préserve un objet si une requête concurrente a déjà enregistré sa référence", async () => {
    const stockage = creerBucket();
    await assert.rejects(() => televerserPuisReferencerR2({
      bucket: stockage.bucket,
      cle: "distributions/prov-sila/dist-01/pv-01",
      contenu: new Uint8Array([37, 80, 68, 70]),
      options: { httpMetadata: { contentType: "application/pdf" } },
      televerserObjet: true,
      referenceDejaPresente: async () => true,
      enregistrerReference: async () => { throw new Error("Conflit D1 simulé."); },
    }), /Conflit D1 simulé/u);
    assert.equal(stockage.suppressions.length, 0);
    assert.equal(stockage.objets.size, 1);
  });

  it("conserve l’erreur D1 et signale l’objet orphelin si la compensation R2 échoue", async () => {
    const stockage = creerBucket({ echecSuppression: true });
    const erreursNettoyage = [];
    await assert.rejects(() => televerserPuisReferencerR2({
      bucket: stockage.bucket,
      cle: "archives/rapport-orphelin.csv",
      contenu: "données de test",
      options: { httpMetadata: { contentType: "text/csv" } },
      televerserObjet: true,
      referenceDejaPresente: async () => false,
      enregistrerReference: async () => { throw new Error("Échec de référence D1."); },
      signalerNettoyageImpossible: (phase, erreur) => erreursNettoyage.push({ phase, message: erreur.message }),
    }), /Échec de référence D1/u);
    assert.equal(stockage.objets.has("archives/rapport-orphelin.csv"), true);
    assert.deepEqual(erreursNettoyage, [{ phase: "suppression", message: "Panne de suppression R2 simulée." }]);
  });
});
