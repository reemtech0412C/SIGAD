import assert from "node:assert/strict";
import { Hono } from "hono";
import { describe, it, vi } from "vitest";
import {
  definirEtapeDiagnosticRecuperation,
  journaliserEchecRecuperation,
  middlewareDiagnosticRecuperation,
  traiterExceptionRecuperation,
} from "../../backend/src/services/diagnostic-recuperation.service.ts";

describe("diagnostic sécurisé de récupération propriétaire", () => {
  it("corrèle une exception sans exposer son message dans la réponse ou le journal", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const app = new Hono();
      app.onError((erreur, c) => traiterExceptionRecuperation(c, erreur) ?? c.json({ erreur: "Erreur." }, 500));
      app.post("/emission", middlewareDiagnosticRecuperation, (c) => {
        definirEtapeDiagnosticRecuperation(c, "HACHAGE_JETON");
        throw new Error("SECRET_CANARI_NE_DOIT_PAS_APPARAITRE");
      });

      const reponse = await app.request("/emission", { method: "POST" });
      const corps = await reponse.json();
      const correlationId = reponse.headers.get("X-Correlation-ID");
      assert.equal(reponse.status, 500);
      assert.match(correlationId ?? "", /^[0-9a-f-]{36}$/u);
      assert.equal(corps.reference, correlationId);
      assert.equal(JSON.stringify(corps).includes("SECRET_CANARI_NE_DOIT_PAS_APPARAITRE"), false);
      assert.equal(journal.mock.calls.length, 1);

      const evenement = JSON.parse(journal.mock.calls[0][0]);
      assert.deepEqual(Object.keys(evenement).sort(), [
        "code_erreur",
        "correlation_id",
        "etape",
        "evenement",
        "type_exception",
      ]);
      assert.equal(evenement.correlation_id, correlationId);
      assert.equal(evenement.etape, "HACHAGE_JETON");
      assert.equal(evenement.code_erreur, "RECUPERATION_ECHEC_INATTENDU");
      assert.equal(evenement.type_exception, "Error");
      assert.equal(JSON.stringify(evenement).includes("SECRET_CANARI_NE_DOIT_PAS_APPARAITRE"), false);
    } finally {
      journal.mockRestore();
    }
  });

  it("ignore un identifiant de corrélation fourni par le client", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const identifiantForge = "attacker-controlled-id";
    try {
      const app = new Hono();
      app.onError((erreur, c) => traiterExceptionRecuperation(c, erreur) ?? c.json({ erreur: "Erreur." }, 500));
      app.post("/emission", middlewareDiagnosticRecuperation, (c) => {
        definirEtapeDiagnosticRecuperation(c, "LECTURE_COMPTE_CIBLE");
        const erreur = new Error("DONNEE_SENSIBLE_NE_DOIT_PAS_APPARAITRE");
        erreur.name = "Nom\r\nInjecte_NE_DOIT_PAS_APPARAITRE";
        throw erreur;
      });

      const reponse = await app.request("/emission", {
        method: "POST",
        headers: { "X-Correlation-ID": identifiantForge },
      });
      const corps = await reponse.json();
      const correlationId = reponse.headers.get("X-Correlation-ID");
      assert.equal(reponse.status, 500);
      assert.match(correlationId ?? "", /^[0-9a-f-]{36}$/u);
      assert.notEqual(correlationId, identifiantForge);
      assert.equal(corps.reference, correlationId);
      const evenement = JSON.parse(journal.mock.calls[0][0]);
      assert.equal(evenement.correlation_id, correlationId);
      assert.equal(evenement.etape, "LECTURE_COMPTE_CIBLE");
      assert.equal(evenement.type_exception, "Erreur");
      const donneesObservees = JSON.stringify({ corps, evenement });
      assert.equal(donneesObservees.includes("DONNEE_SENSIBLE_NE_DOIT_PAS_APPARAITRE"), false);
      assert.equal(donneesObservees.includes("Injecte_NE_DOIT_PAS_APPARAITRE"), false);
      assert.equal(donneesObservees.includes("attacker-controlled-id"), false);
    } finally {
      journal.mockRestore();
    }
  });

  it("réduit une valeur levée non-Error à un type neutre", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      journaliserEchecRecuperation(
        { correlationId: crypto.randomUUID(), etape: "TRANSACTION_D1" },
        "RECUPERATION_TRANSACTION_D1_ECHOUEE",
        new Error("CANARI_D1_NE_DOIT_PAS_APPARAITRE"),
      );
      journaliserEchecRecuperation(
        { correlationId: crypto.randomUUID(), etape: "TRANSACTION_D1" },
        "RECUPERATION_NOMBRE_LIGNES_INATTENDU",
        { secret: "CANARI_NON_ERREUR" },
      );
      const evenements = journal.mock.calls.map(([ligne]) => JSON.parse(ligne));
      assert.equal(evenements[0].code_erreur, "RECUPERATION_TRANSACTION_D1_ECHOUEE");
      assert.equal(evenements[0].type_exception, "Error");
      assert.equal(evenements[1].type_exception, "ErreurNonIdentifiee");
      assert.equal(JSON.stringify(evenements).includes("CANARI_D1_NE_DOIT_PAS_APPARAITRE"), false);
      assert.equal(JSON.stringify(evenements).includes("CANARI_NON_ERREUR"), false);
    } finally {
      journal.mockRestore();
    }
  });
});
