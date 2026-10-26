import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";

export function provinceSelectionnableDansCarte(
  role: UtilisateurAuthentifie["role"],
  provinceSessionId: string | null,
  provinceCibleId: string,
): boolean {
  if (role === "PROPRIETAIRE" || role === "ADMIN_CENTRAL") return true;
  return role === "DELEGUE_PROVINCIAL" && provinceSessionId !== null && provinceSessionId === provinceCibleId;
}
