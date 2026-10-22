import type { MiddlewareHandler } from "hono";
import type { EnvironnementApplication } from "../bindings";
import type { RoleUtilisateur } from "../../../shared/constantes/roles";

export function exigerRoles(...rolesAutorises: readonly RoleUtilisateur[]): MiddlewareHandler<EnvironnementApplication> {
  return async (c, suivant) => {
    const utilisateur = c.get("utilisateur");
    if (!rolesAutorises.includes(utilisateur.role)) {
      return c.json({ erreur: "Accès refusé." }, 403);
    }
    await suivant();
    return;
  };
}

export const isolationProvinciale: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role !== "DELEGUE_PROVINCIAL") return suivant();
  if (!utilisateur.province_id) return c.json({ erreur: "Aucune province n’est associée à votre compte." }, 403);

  const provinceRoute = c.req.param("provinceId") ?? new URL(c.req.url).pathname.match(/^\/api\/provincial\/(prov-[^/]+)(?:\/|$)/u)?.[1];
  const provinceRequete = c.req.query("province_id");
  if ((provinceRoute && provinceRoute !== utilisateur.province_id) || (provinceRequete && provinceRequete !== utilisateur.province_id)) {
    return c.json({ erreur: "Accès refusé." }, 403);
  }

  const typeContenu = c.req.header("Content-Type") ?? "";
  if (typeContenu.toLowerCase().includes("application/json") && c.req.method !== "GET") {
    try {
      const corps: unknown = await c.req.raw.clone().json();
      if (typeof corps === "object" && corps !== null && "province_id" in corps) return c.json({ erreur: "Accès refusé." }, 403);
    } catch {
      return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
    }
  } else if (typeContenu.toLowerCase().includes("application/x-www-form-urlencoded") || typeContenu.toLowerCase().includes("multipart/form-data")) {
    try {
      if ((await c.req.raw.clone().formData()).has("province_id")) return c.json({ erreur: "Accès refusé." }, 403);
    } catch {
      return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
    }
  }

  await suivant();
  return;
};
