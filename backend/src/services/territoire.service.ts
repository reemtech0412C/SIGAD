import type { UtilisateurSession } from "../bindings";

export interface PaginationTerritoriale {
  limite: number;
  decalage: number;
}

export interface PageTerritoriale<T> extends PaginationTerritoriale {
  elements: T[];
  total: number;
}

export type TypeRessourceTerritoriale =
  | "province"
  | "departement"
  | "sous_prefecture"
  | "commune"
  | "rattachement"
  | "canton"
  | "localite"
  | "arrondissement"
  | "quartier"
  | "carre"
  | "site_humanitaire";

export interface PorteeTerritoriale {
  autorisee: boolean;
  province_id: string | null;
}

export async function listerPage<T>(
  db: D1Database,
  requeteListe: string,
  requeteTotal: string,
  valeurs: readonly (string | number | null)[],
  pagination: PaginationTerritoriale,
): Promise<PageTerritoriale<T>> {
  const [liste, total] = await Promise.all([
    db.prepare(requeteListe).bind(...valeurs, pagination.limite, pagination.decalage).all<T>(),
    db.prepare(requeteTotal).bind(...valeurs).first<{ total: number }>(),
  ]);
  return {
    elements: liste.results,
    total: total?.total ?? 0,
    limite: pagination.limite,
    decalage: pagination.decalage,
  };
}

export function resoudrePorteeTerritoriale(
  utilisateur: UtilisateurSession,
  provinceDemandee?: string,
): PorteeTerritoriale {
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || (provinceDemandee && provinceDemandee !== utilisateur.province_id)) {
      return { autorisee: false, province_id: null };
    }
    return { autorisee: true, province_id: utilisateur.province_id };
  }
  return { autorisee: true, province_id: provinceDemandee ?? null };
}

export async function lireProvinceRessource(
  db: D1Database,
  type: TypeRessourceTerritoriale,
  identifiant: string,
): Promise<string | null> {
  const requetes: Record<TypeRessourceTerritoriale, string> = {
    province: "SELECT id AS province_id FROM provinces WHERE id = ?",
    departement: "SELECT province_id FROM departements WHERE id = ?",
    sous_prefecture: `SELECT d.province_id FROM sous_prefectures sp
      INNER JOIN departements d ON d.id = sp.departement_id WHERE sp.id = ?`,
    commune: "SELECT province_id FROM communes WHERE id = ?",
    rattachement: `SELECT c.province_id FROM rattachements_territoriaux rt
      INNER JOIN communes c ON c.id = rt.commune_id WHERE rt.id = ?`,
    canton: `SELECT d.province_id FROM cantons ca
      INNER JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
      INNER JOIN departements d ON d.id = sp.departement_id WHERE ca.id = ?`,
    localite: "SELECT province_id FROM localites WHERE id = ?",
    arrondissement: `SELECT l.province_id FROM arrondissements a
      INNER JOIN localites l ON l.id = a.localite_id WHERE a.id = ?`,
    quartier: `SELECT l.province_id FROM quartiers q
      INNER JOIN localites l ON l.id = q.localite_id WHERE q.id = ?`,
    carre: `SELECT l.province_id FROM carres ca
      INNER JOIN quartiers q ON q.id = ca.quartier_id
      INNER JOIN localites l ON l.id = q.localite_id WHERE ca.id = ?`,
    site_humanitaire: "SELECT province_id FROM sites_humanitaires WHERE id = ?",
  };
  const ligne = await db.prepare(requetes[type]).bind(identifiant).first<{ province_id: string }>();
  return ligne?.province_id ?? null;
}

export async function verifierPorteeRessource(
  db: D1Database,
  utilisateur: UtilisateurSession,
  type: TypeRessourceTerritoriale,
  identifiant: string,
): Promise<boolean> {
  const provinceId = await lireProvinceRessource(db, type, identifiant);
  if (!provinceId) return false;
  if (utilisateur.role !== "DELEGUE_PROVINCIAL") return true;
  return utilisateur.province_id !== null && utilisateur.province_id === provinceId;
}

export async function lireLocalitePourSelection(
  db: D1Database,
  utilisateur: UtilisateurSession,
  identifiant: string,
): Promise<{
  id: string;
  province_id: string;
  departement_id: string;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  nom: string;
  type_localite: string;
  mode_decoupage_urbain: string;
  statut_validation: string;
} | null> {
  const portee = resoudrePorteeTerritoriale(utilisateur);
  if (!portee.autorisee) return null;
  const provinceFilter = portee.province_id ? "AND province_id = ?" : "";
  const valeurs = portee.province_id ? [identifiant, portee.province_id] : [identifiant];
  return db.prepare(
    `SELECT id, province_id, departement_id, sous_prefecture_id, commune_id,
            nom, type_localite, mode_decoupage_urbain, statut_validation
     FROM localites WHERE id = ? ${provinceFilter}`,
  ).bind(...valeurs).first();
}
