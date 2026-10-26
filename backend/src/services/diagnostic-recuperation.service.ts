import type { Context, MiddlewareHandler } from "hono";
import type {
  DiagnosticRecuperation,
  EnvironnementApplication,
  EtapeDiagnosticRecuperation,
} from "../bindings";

export type CodeErreurRecuperation =
  | "RECUPERATION_ECHEC_INATTENDU"
  | "RECUPERATION_TRANSACTION_D1_ECHOUEE"
  | "RECUPERATION_NOMBRE_LIGNES_INATTENDU";

const TYPES_EXCEPTION_AUTORISES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "DOMException"]);

function typeExceptionSecurise(erreur: unknown): string {
  if (!(erreur instanceof Error)) return "ErreurNonIdentifiee";
  return TYPES_EXCEPTION_AUTORISES.has(erreur.name) ? erreur.name : "Erreur";
}

export const middlewareDiagnosticRecuperation: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  const diagnostic: DiagnosticRecuperation = {
    correlationId: crypto.randomUUID(),
    etape: "CONTROLE_CSRF",
  };
  c.set("diagnosticRecuperation", diagnostic);
  c.header("X-Correlation-ID", diagnostic.correlationId);
  await suivant();
};

export function definirEtapeDiagnosticRecuperation(
  c: Context<EnvironnementApplication>,
  etape: EtapeDiagnosticRecuperation,
): void {
  const diagnostic = c.get("diagnosticRecuperation");
  if (diagnostic) diagnostic.etape = etape;
}

export function journaliserEchecRecuperation(
  diagnostic: DiagnosticRecuperation | undefined,
  codeErreur: CodeErreurRecuperation,
  erreur?: unknown,
): void {
  if (!diagnostic) return;
  const evenement = {
    evenement: "echec_recuperation_proprietaire",
    correlation_id: diagnostic.correlationId,
    etape: diagnostic.etape,
    code_erreur: codeErreur,
    ...(erreur === undefined ? {} : { type_exception: typeExceptionSecurise(erreur) }),
  };
  try {
    console.error(JSON.stringify(evenement));
  } catch {
    // Une indisponibilité du journal ne doit pas modifier le résultat de l'opération.
  }
}

export function traiterExceptionRecuperation(
  c: Context<EnvironnementApplication>,
  erreur: unknown,
): Response | null {
  const diagnostic = c.get("diagnosticRecuperation");
  if (!diagnostic) return null;
  journaliserEchecRecuperation(diagnostic, "RECUPERATION_ECHEC_INATTENDU", erreur);
  c.header("X-Correlation-ID", diagnostic.correlationId);
  return c.json({
    erreur: "Une erreur inattendue est survenue pendant la récupération. Réessayez plus tard.",
    reference: diagnostic.correlationId,
  }, 500);
}
