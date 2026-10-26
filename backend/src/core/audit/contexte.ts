import type { UtilisateurSession } from "../../bindings";

const requestIdsParUtilisateur = new WeakMap<UtilisateurSession, string>();

export function associerRequestIdAudit(utilisateur: UtilisateurSession, requestId: string): void {
  requestIdsParUtilisateur.set(utilisateur, requestId);
}

export function obtenirRequestIdAudit(utilisateur: UtilisateurSession): string | null {
  return requestIdsParUtilisateur.get(utilisateur) ?? null;
}
