import type { UtilisateurSession } from "../bindings";
import { ROLES_TERRAIN } from "../../../shared/constantes/roles";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import type { ReponseAjoutDynamiqueTerritoire } from "../../../shared/types/territoire";
import type { DonneesAjoutDynamiqueUniteTerritoriale } from "../../../shared/validations/territoire";
import { normaliserToponymeTerritorial } from "../../../shared/utils/localisation-dynamique";

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

export interface FiltreSQLPorteeLocalite {
  autorisee: boolean;
  clause: string;
  valeurs: readonly string[];
}

export class ErreurCreationTerritorialeDynamique extends Error {
  readonly statutHttp: number;
  constructor(message: string, statutHttp = 400) {
    super(message);
    this.name = "ErreurCreationTerritorialeDynamique";
    this.statutHttp = statutHttp;
  }
}

function genererIdentifiantStable(prefixe: string, nom: string): string {
  const slug = normaliserToponymeTerritorial(nom).replace(/\s+/gu, "-").slice(0, 24) || "unite";
  const suffixe = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefixe}-${slug}-${suffixe}`;
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
  if (utilisateur.role === "DELEGUE_PROVINCIAL" || (ROLES_TERRAIN as readonly string[]).includes(utilisateur.role)) {
    if (!utilisateur.province_id || (provinceDemandee && provinceDemandee !== utilisateur.province_id)) {
      return { autorisee: false, province_id: null };
    }
    return { autorisee: true, province_id: utilisateur.province_id };
  }
  return { autorisee: true, province_id: provinceDemandee ?? null };
}

export function construireFiltreSQLPorteeLocalite(
  utilisateur: UtilisateurSession,
  expressionLocalite: string,
): FiltreSQLPorteeLocalite {
  const portee = resoudrePorteeTerritoriale(utilisateur);
  if (!portee.autorisee) return { autorisee: false, clause: "", valeurs: [] };

  if (utilisateur.role === "RESPONSABLE_STOCK") {
    if (!utilisateur.entrepot_id || !portee.province_id) return { autorisee: false, clause: "", valeurs: [] };
    return {
      autorisee: true,
      clause: `AND EXISTS (
        SELECT 1 FROM entrepots e
        WHERE e.id = ? AND e.localite_id = ${expressionLocalite}
          AND e.province_id = ? AND e.niveau = 'PROVINCIAL' AND e.actif = 1
      )`,
      valeurs: [utilisateur.entrepot_id, portee.province_id],
    };
  }

  if (!portee.province_id) return { autorisee: true, clause: "", valeurs: [] };
  return {
    autorisee: true,
    clause: `AND EXISTS (SELECT 1 FROM localites l WHERE l.id = ${expressionLocalite} AND l.province_id = ?)`,
    valeurs: [portee.province_id],
  };
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
      LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
      INNER JOIN departements d ON d.id = COALESCE(ca.departement_id, sp.departement_id)
      WHERE ca.id = ?`,
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
  if (!resoudrePorteeTerritoriale(utilisateur, provinceId).autorisee) return false;
  if (utilisateur.role !== "RESPONSABLE_STOCK") return true;
  if (!utilisateur.entrepot_id) return false;

  const requetesLocalite: Partial<Record<TypeRessourceTerritoriale, string>> = {
    localite: "SELECT id AS localite_id FROM localites WHERE id = ?",
    arrondissement: "SELECT localite_id FROM arrondissements WHERE id = ?",
    quartier: "SELECT localite_id FROM quartiers WHERE id = ?",
    carre: `SELECT q.localite_id FROM carres ca
      INNER JOIN quartiers q ON q.id = ca.quartier_id WHERE ca.id = ?`,
  };
  const requeteLocalite = requetesLocalite[type];
  if (!requeteLocalite) return false;
  const ligneLocalite = await db.prepare(requeteLocalite).bind(identifiant).first<{ localite_id: string }>();
  if (!ligneLocalite?.localite_id) return false;
  const entrepot = await db.prepare(
    `SELECT 1 AS autorise FROM entrepots
     WHERE id = ? AND localite_id = ? AND province_id = ? AND niveau = 'PROVINCIAL' AND actif = 1`,
  ).bind(utilisateur.entrepot_id, ligneLocalite.localite_id, provinceId).first<{ autorise: number }>();
  return Boolean(entrepot);
}

export async function lireLocalitePourSelection(
  db: D1Database,
  utilisateur: UtilisateurSession,
  identifiant: string,
): Promise<{
  id: string;
  province_id: string;
  departement_id: string | null;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  nom: string;
  type_localite: string;
  mode_decoupage_urbain: string;
  statut_validation: string;
} | null> {
  const filtrePortee = construireFiltreSQLPorteeLocalite(utilisateur, "localites.id");
  if (!filtrePortee.autorisee) return null;
  return db.prepare(
    `SELECT id, province_id, departement_id, sous_prefecture_id, commune_id,
            nom, type_localite, mode_decoupage_urbain, statut_validation
     FROM localites WHERE id = ? ${filtrePortee.clause}`,
  ).bind(identifiant, ...filtrePortee.valeurs).first();
}

export async function creerUniteTerritorialeDynamique(
  db: D1Database,
  utilisateur: UtilisateurSession,
  donnee: DonneesAjoutDynamiqueUniteTerritoriale,
  adresseIp: string | null,
): Promise<ReponseAjoutDynamiqueTerritoire> {
  if (utilisateur.role === "CONSULTATION_INSTITUTIONNELLE") {
    throw new ErreurCreationTerritorialeDynamique(
      "Le profil de consultation institutionnelle ne permet pas d'ajouter des unités territoriales.",
      403,
    );
  }

  if (
    donnee.type === "DEPARTEMENT" &&
    utilisateur.role !== "PROPRIETAIRE" &&
    utilisateur.role !== "ADMIN_CENTRAL"
  ) {
    throw new ErreurCreationTerritorialeDynamique(
      "La création d'un département requiert une autorisation Propriétaire ou Administration centrale.",
      403,
    );
  }

  const portee = resoudrePorteeTerritoriale(utilisateur, donnee.province_id);
  if (!portee.autorisee) {
    throw new ErreurCreationTerritorialeDynamique(
      "Accès refusé hors de votre province de rattachement.",
      403,
    );
  }

  const province = await db
    .prepare("SELECT id, code, nom, statut_particulier, actif FROM provinces WHERE id = ? AND actif = 1")
    .bind(donnee.province_id)
    .first<{ id: string; code: string; nom: string; statut_particulier: number; actif: number }>();

  if (!province) {
    throw new ErreurCreationTerritorialeDynamique("La province sélectionnée est introuvable ou inactive.", 404);
  }

  const nomNettoye = donnee.nom.trim().replace(/\s+/g, " ");
  const nomNormalise = normaliserToponymeTerritorial(nomNettoye);
  if (nomNormalise.length < 2) {
    throw new ErreurCreationTerritorialeDynamique("Le nom de l'unité territoriale est invalide.", 400);
  }

  const estNdjamena = province.statut_particulier === 1 || province.id === "prov-ndjamena";
  const instructionsPréalables: D1PreparedStatement[] = [];
  let id = "";
  let instructionInsertion: D1PreparedStatement;
  let uniteCreee: Record<string, unknown> = {};

  switch (donnee.type) {
    case "DEPARTEMENT": {
      if (estNdjamena) {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville de N'Djaména à statut particulier ne comporte pas de département.",
          400,
        );
      }

      const existants = await db
        .prepare(
          `SELECT id, province_id, code, nom, chef_lieu, statut_validation, source_officielle, provenance
           FROM departements WHERE province_id = ? AND actif = 1 AND statut_validation = 'VALIDE'`,
        )
        .bind(province.id)
        .all<{
          id: string;
          province_id: string;
          code: string;
          nom: string;
          chef_lieu: string | null;
          statut_validation: "VALIDE";
          source_officielle: string | null;
          provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE";
        }>();

      const doublon = existants.results.find((d) => normaliserToponymeTerritorial(d.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "DEPARTEMENT",
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `Le département « ${doublon.nom} » existe déjà dans cette province et a été sélectionné.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      id = genererIdentifiantStable("dep", nomNettoye);
      const suffixeCode = id.split("-").pop()?.toUpperCase() ?? "DYN";
      const code = `DEP-${province.code.toUpperCase()}-${nomNormalise.slice(0, 8).toUpperCase()}-${suffixeCode}`;
      const chefLieu = donnee.chef_lieu?.trim() || nomNettoye;

      instructionInsertion = db
        .prepare(
          `INSERT INTO departements (
            id, province_id, code, nom, chef_lieu, actif, statut_validation, source_officielle,
            validation_administrative, validation_rattachement, validation_coordonnees,
            validation_limites_cartographiques, statut_operationnel, certification_juridique,
            active_par_proprietaire, date_activation_operationnelle, provenance, cree_par
          ) VALUES (
            ?, ?, ?, ?, ?, 1, 'VALIDE', 'Ajout dynamique opérationnel',
            'VALIDE', 'VALIDE', 'NON_RENSEIGNE',
            'NON_RENSEIGNE', 'ACTIF', 'NON_CERTIFIE',
            1, datetime('now'), 'AJOUT_DYNAMIQUE', ?
          )`,
        )
        .bind(id, province.id, code, nomNettoye, chefLieu, utilisateur.id);

      uniteCreee = {
        id,
        province_id: province.id,
        code,
        nom: nomNettoye,
        chef_lieu: chefLieu,
        statut_validation: "VALIDE",
        source_officielle: "Ajout dynamique opérationnel",
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "SOUS_PREFECTURE": {
      if (estNdjamena) {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville de N'Djaména ne comporte pas de sous-préfecture.",
          400,
        );
      }
      if (!donnee.departement_id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département de rattachement est obligatoire pour ajouter une sous-préfecture.",
          400,
        );
      }

      const dep = await db
        .prepare("SELECT id, province_id, code, nom FROM departements WHERE id = ? AND actif = 1")
        .bind(donnee.departement_id)
        .first<{ id: string; province_id: string; code: string; nom: string }>();
      if (!dep || dep.province_id !== province.id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département sélectionné n'appartient pas à la province indiquée.",
          400,
        );
      }

      const existantes = await db
        .prepare("SELECT id, departement_id, code, nom, provenance FROM sous_prefectures WHERE departement_id = ? AND actif = 1")
        .bind(dep.id)
        .all<{ id: string; departement_id: string; code: string; nom: string; provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE" }>();

      const doublon = existantes.results.find((sp) => normaliserToponymeTerritorial(sp.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "SOUS_PREFECTURE",
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `La sous-préfecture « ${doublon.nom} » existe déjà dans ce département et a été sélectionnée.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      id = genererIdentifiantStable("sp", nomNettoye);
      const suffixeCode = id.split("-").pop()?.toUpperCase() ?? "DYN";
      const code = `SP-${nomNormalise.slice(0, 8).toUpperCase()}-${suffixeCode}`;

      instructionInsertion = db
        .prepare(
          `INSERT INTO sous_prefectures (id, departement_id, code, nom, actif, provenance, cree_par)
           VALUES (?, ?, ?, ?, 1, 'AJOUT_DYNAMIQUE', ?)`,
        )
        .bind(id, dep.id, code, nomNettoye, utilisateur.id);

      uniteCreee = {
        id,
        departement_id: dep.id,
        code,
        nom: nomNettoye,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "CANTON": {
      if (estNdjamena) {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville de N'Djaména ne comporte pas de canton.",
          400,
        );
      }
      if (!donnee.departement_id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département de rattachement est obligatoire pour ajouter un canton ou groupement.",
          400,
        );
      }

      const dep = await db
        .prepare("SELECT id, province_id FROM departements WHERE id = ? AND actif = 1")
        .bind(donnee.departement_id)
        .first<{ id: string; province_id: string }>();
      if (!dep || dep.province_id !== province.id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département sélectionné n'appartient pas à la province indiquée.",
          400,
        );
      }

      if (donnee.sous_prefecture_id) {
        const sp = await db
          .prepare("SELECT id FROM sous_prefectures WHERE id = ? AND departement_id = ? AND actif = 1")
          .bind(donnee.sous_prefecture_id, dep.id)
          .first<{ id: string }>();
        if (!sp) {
          throw new ErreurCreationTerritorialeDynamique(
            "La sous-préfecture sélectionnée ne relève pas de ce département.",
            400,
          );
        }
      }

      const existants = await db
        .prepare(
          `SELECT ca.id, ca.departement_id, ca.sous_prefecture_id, ca.nom, ca.provenance
           FROM cantons ca
           LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
           WHERE COALESCE(ca.departement_id, sp.departement_id) = ?
             AND ca.statut_validation = 'VALIDE'`,
        )
        .bind(dep.id)
        .all<{
          id: string;
          departement_id: string | null;
          sous_prefecture_id: string | null;
          nom: string;
          provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE";
        }>();

      const doublon = existants.results.find((ca) => normaliserToponymeTerritorial(ca.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "CANTON",
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `Le canton « ${doublon.nom} » existe déjà dans ce département et a été sélectionné.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      id = genererIdentifiantStable("can", nomNettoye);
      instructionInsertion = db
        .prepare(
          `INSERT INTO cantons (id, departement_id, sous_prefecture_id, nom, statut_validation, provenance, cree_par)
           VALUES (?, ?, ?, ?, 'VALIDE', 'AJOUT_DYNAMIQUE', ?)`,
        )
        .bind(id, dep.id, donnee.sous_prefecture_id ?? null, nomNettoye, utilisateur.id);

      uniteCreee = {
        id,
        departement_id: dep.id,
        sous_prefecture_id: donnee.sous_prefecture_id ?? null,
        nom: nomNettoye,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "VILLE":
    case "VILLAGE":
    case "HAMEAU":
    case "FERRICK":
    case "CAMPEMENT": {
      if (estNdjamena) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le parcours géographique de N'Djaména est exclusivement urbain (Arrondissement → Quartier → Carré).",
          400,
        );
      }
      if (!donnee.departement_id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département de rattachement est obligatoire pour ajouter cette localité.",
          400,
        );
      }

      const dep = await db
        .prepare("SELECT id, province_id FROM departements WHERE id = ? AND actif = 1")
        .bind(donnee.departement_id)
        .first<{ id: string; province_id: string }>();
      if (!dep || dep.province_id !== province.id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département sélectionné n'appartient pas à la province indiquée.",
          400,
        );
      }

      if (donnee.sous_prefecture_id) {
        const sp = await db
          .prepare("SELECT id FROM sous_prefectures WHERE id = ? AND departement_id = ? AND actif = 1")
          .bind(donnee.sous_prefecture_id, dep.id)
          .first<{ id: string }>();
        if (!sp) {
          throw new ErreurCreationTerritorialeDynamique(
            "La sous-préfecture sélectionnée ne relève pas de ce département.",
            400,
          );
        }
      }

      if (donnee.canton_id) {
        const canton = await db
          .prepare(
            `SELECT ca.id, COALESCE(ca.departement_id, sp.departement_id) AS dep_id, ca.sous_prefecture_id
             FROM cantons ca
             LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
             WHERE ca.id = ? AND ca.statut_validation = 'VALIDE'`,
          )
          .bind(donnee.canton_id)
          .first<{ id: string; dep_id: string; sous_prefecture_id: string | null }>();
        if (!canton || canton.dep_id !== dep.id) {
          throw new ErreurCreationTerritorialeDynamique(
            "Le canton sélectionné ne relève pas de ce département.",
            400,
          );
        }
      }

      const existantes = await db
        .prepare(
          `SELECT id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id,
                  nom, type_localite, mode_decoupage_urbain, provenance
           FROM localites
           WHERE province_id = ? AND departement_id = ? AND type_localite = ? AND statut_validation = 'VALIDE'`,
        )
        .bind(province.id, dep.id, donnee.type)
        .all<{
          id: string;
          province_id: string;
          departement_id: string | null;
          sous_prefecture_id: string | null;
          commune_id: string | null;
          canton_id: string | null;
          nom: string;
          type_localite: string;
          mode_decoupage_urbain: string;
          provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE";
        }>();

      const doublon = existantes.results.find((l) => normaliserToponymeTerritorial(l.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: donnee.type,
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `L'unité « ${doublon.nom} » (${donnee.type}) existe déjà dans ce département et a été sélectionnée.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      const modeUrbain =
        donnee.type === "VILLE"
          ? donnee.mode_decoupage_urbain ?? "SANS_ARRONDISSEMENT"
          : "AUCUN";

      id = genererIdentifiantStable(`loc-${donnee.type.toLowerCase()}`, nomNettoye);
      instructionInsertion = db
        .prepare(
          `INSERT INTO localites (
            id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id,
            nom, type_localite, mode_decoupage_urbain, statut_validation,
            source_documentation, provenance, propose_par, valide_par, cree_par, cree_le
          ) VALUES (
            ?, ?, ?, ?, NULL, ?,
            ?, ?, ?, 'VALIDE',
            'Ajout dynamique opérationnel', 'AJOUT_DYNAMIQUE', ?, ?, ?, datetime('now')
          )`,
        )
        .bind(
          id,
          province.id,
          dep.id,
          donnee.sous_prefecture_id ?? null,
          donnee.canton_id ?? null,
          nomNettoye,
          donnee.type,
          modeUrbain,
          utilisateur.id,
          utilisateur.id,
          utilisateur.id,
        );

      uniteCreee = {
        id,
        province_id: province.id,
        departement_id: dep.id,
        sous_prefecture_id: donnee.sous_prefecture_id ?? null,
        commune_id: null,
        canton_id: donnee.canton_id ?? null,
        nom: nomNettoye,
        type_localite: donnee.type,
        mode_decoupage_urbain: modeUrbain,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "ARRONDISSEMENT": {
      const localiteId = donnee.localite_id ?? (estNdjamena ? "loc-ndjamena-ville" : null);
      if (!localiteId) {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville de rattachement est obligatoire pour ajouter un arrondissement.",
          400,
        );
      }

      const ville = await db
        .prepare(
          "SELECT id, province_id, type_localite, mode_decoupage_urbain, statut_validation FROM localites WHERE id = ? AND statut_validation = 'VALIDE'",
        )
        .bind(localiteId)
        .first<{ id: string; province_id: string; type_localite: string; mode_decoupage_urbain: string; statut_validation: string }>();

      if (!ville || ville.province_id !== province.id || ville.type_localite !== "VILLE") {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville sélectionnée est introuvable ou ne relève pas de cette province.",
          400,
        );
      }

      const existants = await db
        .prepare("SELECT id, localite_id, commune_id, code, nom, provenance FROM arrondissements WHERE localite_id = ? AND statut_validation = 'VALIDE'")
        .bind(ville.id)
        .all<{ id: string; localite_id: string; commune_id: string | null; code: string | null; nom: string; provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE" }>();

      const doublon = existants.results.find((a) => normaliserToponymeTerritorial(a.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "ARRONDISSEMENT",
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `L'arrondissement « ${doublon.nom} » existe déjà dans cette ville et a été sélectionné.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      if (ville.mode_decoupage_urbain !== "AVEC_ARRONDISSEMENTS") {
        instructionsPréalables.push(
          db.prepare("UPDATE localites SET mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS' WHERE id = ?").bind(ville.id),
        );
      }

      id = genererIdentifiantStable("arr", nomNettoye);
      const code = donnee.code?.trim() || `ARR-${nomNormalise.slice(0, 6).toUpperCase()}`;

      instructionInsertion = db
        .prepare(
          `INSERT INTO arrondissements (id, localite_id, commune_id, code, nom, statut_validation, provenance, cree_par)
           VALUES (?, ?, NULL, ?, ?, 'VALIDE', 'AJOUT_DYNAMIQUE', ?)`,
        )
        .bind(id, ville.id, code, nomNettoye, utilisateur.id);

      uniteCreee = {
        id,
        localite_id: ville.id,
        commune_id: null,
        code,
        nom: nomNettoye,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "QUARTIER": {
      const localiteId = donnee.localite_id ?? (estNdjamena ? "loc-ndjamena-ville" : null);
      if (!localiteId) {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville de rattachement est obligatoire pour ajouter un quartier.",
          400,
        );
      }

      const ville = await db
        .prepare(
          "SELECT id, province_id, type_localite, mode_decoupage_urbain, statut_validation FROM localites WHERE id = ? AND statut_validation = 'VALIDE'",
        )
        .bind(localiteId)
        .first<{ id: string; province_id: string; type_localite: string; mode_decoupage_urbain: string; statut_validation: string }>();

      if (!ville || ville.province_id !== province.id || ville.type_localite !== "VILLE") {
        throw new ErreurCreationTerritorialeDynamique(
          "La ville sélectionnée est introuvable ou ne relève pas de cette province.",
          400,
        );
      }

      if (estNdjamena && !donnee.arrondissement_id) {
        throw new ErreurCreationTerritorialeDynamique(
          "La sélection d'un arrondissement municipal est obligatoire à N'Djaména.",
          400,
        );
      }

      if (donnee.arrondissement_id) {
        const arr = await db
          .prepare("SELECT id FROM arrondissements WHERE id = ? AND localite_id = ? AND statut_validation = 'VALIDE'")
          .bind(donnee.arrondissement_id, ville.id)
          .first<{ id: string }>();
        if (!arr) {
          throw new ErreurCreationTerritorialeDynamique(
            "L'arrondissement sélectionné ne relève pas de cette ville.",
            400,
          );
        }
      }

      const existants = await db
        .prepare(
          `SELECT id, localite_id, arrondissement_id, nom, possede_carres, provenance
           FROM quartiers
           WHERE localite_id = ?
             AND COALESCE(arrondissement_id, '') = COALESCE(?, '')
             AND statut_validation = 'VALIDE'`,
        )
        .bind(ville.id, donnee.arrondissement_id ?? null)
        .all<{
          id: string;
          localite_id: string;
          arrondissement_id: string | null;
          nom: string;
          possede_carres: number;
          provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE";
        }>();

      const doublon = existants.results.find((q) => normaliserToponymeTerritorial(q.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "QUARTIER",
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `Le quartier « ${doublon.nom} » existe déjà sous ce rattachement et a été sélectionné.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      id = genererIdentifiantStable("qrt", nomNettoye);
      instructionInsertion = db
        .prepare(
          `INSERT INTO quartiers (
            id, localite_id, arrondissement_id, nom, possede_carres,
            statut_validation, provenance, propose_par, valide_par, cree_par
          ) VALUES (?, ?, ?, ?, 1, 'VALIDE', 'AJOUT_DYNAMIQUE', ?, ?, ?)`,
        )
        .bind(id, ville.id, donnee.arrondissement_id ?? null, nomNettoye, utilisateur.id, utilisateur.id, utilisateur.id);

      uniteCreee = {
        id,
        localite_id: ville.id,
        arrondissement_id: donnee.arrondissement_id ?? null,
        nom: nomNettoye,
        possede_carres: 1,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "CARRE": {
      if (!donnee.quartier_id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le quartier de rattachement est obligatoire pour ajouter un carré.",
          400,
        );
      }

      const quartier = await db
        .prepare(
          `SELECT q.id, q.localite_id, q.possede_carres, l.province_id
           FROM quartiers q
           INNER JOIN localites l ON l.id = q.localite_id
           WHERE q.id = ? AND q.statut_validation = 'VALIDE'`,
        )
        .bind(donnee.quartier_id)
        .first<{ id: string; localite_id: string; possede_carres: number; province_id: string }>();

      if (!quartier || quartier.province_id !== province.id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le quartier sélectionné est introuvable ou ne relève pas de cette province.",
          400,
        );
      }

      const existants = await db
        .prepare("SELECT id, quartier_id, code_ou_nom, provenance FROM carres WHERE quartier_id = ? AND statut_validation = 'VALIDE'")
        .bind(quartier.id)
        .all<{ id: string; quartier_id: string; code_ou_nom: string; provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE" }>();

      const doublon = existants.results.find((c) => normaliserToponymeTerritorial(c.code_ou_nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "CARRE",
          nom: doublon.code_ou_nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `Le carré « ${doublon.code_ou_nom} » existe déjà dans ce quartier et a été sélectionné.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      if (quartier.possede_carres !== 1) {
        instructionsPréalables.push(
          db.prepare("UPDATE quartiers SET possede_carres = 1 WHERE id = ?").bind(quartier.id),
        );
      }

      id = genererIdentifiantStable("car", nomNettoye);
      instructionInsertion = db
        .prepare(
          `INSERT INTO carres (id, quartier_id, code_ou_nom, statut_validation, type_subdivision, provenance, cree_par)
           VALUES (?, ?, ?, 'VALIDE', 'CARRE', 'AJOUT_DYNAMIQUE', ?)`,
        )
        .bind(id, quartier.id, nomNettoye, utilisateur.id);

      uniteCreee = {
        id,
        quartier_id: quartier.id,
        code_ou_nom: nomNettoye,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    case "SITE_HUMANITAIRE": {
      if (estNdjamena) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le parcours géographique de N'Djaména est exclusivement urbain.",
          400,
        );
      }
      if (!donnee.departement_id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département de rattachement est obligatoire pour ajouter un site humanitaire.",
          400,
        );
      }

      const dep = await db
        .prepare("SELECT id, province_id FROM departements WHERE id = ? AND actif = 1")
        .bind(donnee.departement_id)
        .first<{ id: string; province_id: string }>();
      if (!dep || dep.province_id !== province.id) {
        throw new ErreurCreationTerritorialeDynamique(
          "Le département sélectionné n'appartient pas à la province indiquée.",
          400,
        );
      }

      const existants = await db
        .prepare(
          `SELECT id, province_id, departement_id, sous_prefecture_id, commune_id,
                  localite_proche_id, code_site, nom, categorie_site, provenance
           FROM sites_humanitaires
           WHERE province_id = ? AND COALESCE(departement_id, '') = COALESCE(?, '') AND statut_validation = 'VALIDE'`,
        )
        .bind(province.id, dep.id)
        .all<{
          id: string;
          province_id: string;
          departement_id: string | null;
          sous_prefecture_id: string | null;
          commune_id: string | null;
          localite_proche_id: string | null;
          code_site: string | null;
          nom: string;
          categorie_site: string;
          provenance?: "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE";
        }>();

      const doublon = existants.results.find((s) => normaliserToponymeTerritorial(s.nom) === nomNormalise);
      if (doublon) {
        return {
          id: doublon.id,
          type: "SITE_HUMANITAIRE",
          nom: doublon.nom,
          statut_validation: "VALIDE",
          provenance: doublon.provenance ?? "SOCLE_INITIAL",
          doublon_existant: true,
          message: `Le site humanitaire « ${doublon.nom} » existe déjà dans ce département et a été sélectionné.`,
          unite: doublon as unknown as Record<string, unknown>,
        };
      }

      id = genererIdentifiantStable("site", nomNettoye);
      const categorie = donnee.categorie_site ?? "AUTRE_SITE";
      instructionInsertion = db
        .prepare(
          `INSERT INTO sites_humanitaires (
            id, province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id,
            code_site, nom, categorie_site, statut_validation, provenance, propose_par, valide_par, cree_par, cree_le
          ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'VALIDE', 'AJOUT_DYNAMIQUE', ?, ?, ?, datetime('now'))`,
        )
        .bind(
          id,
          province.id,
          dep.id,
          donnee.sous_prefecture_id ?? null,
          donnee.code ?? null,
          nomNettoye,
          categorie,
          utilisateur.id,
          utilisateur.id,
          utilisateur.id,
        );

      uniteCreee = {
        id,
        province_id: province.id,
        departement_id: dep.id,
        sous_prefecture_id: donnee.sous_prefecture_id ?? null,
        commune_id: null,
        localite_proche_id: null,
        code_site: donnee.code ?? null,
        nom: nomNettoye,
        categorie_site: categorie,
        provenance: "AJOUT_DYNAMIQUE",
      };
      break;
    }

    default:
      throw new ErreurCreationTerritorialeDynamique("Type d'unité territoriale non supporté.", 400);
  }

  const auditTerritoireId = crypto.randomUUID();
  const instructionAuditTerritoire = db
    .prepare(
      `INSERT INTO audits_territoire (
        id, action, entite_type, entite_id, utilisateur_id,
        anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip
      ) VALUES (?, 'CREATION', ?, ?, ?, NULL, ?, 'Ajout dynamique opérationnel', 'Création directe depuis le sélecteur géographique', ?)`,
    )
    .bind(
      auditTerritoireId,
      donnee.type,
      id,
      utilisateur.id,
      JSON.stringify({ ...uniteCreee, provenance: "AJOUT_DYNAMIQUE" }),
      adresseIp,
    );

  const instructionAuditGlobal = creerInstructionAudit(db, {
    utilisateur,
    action: "AJOUT_DYNAMIQUE_TERRITOIRE",
    entiteType: donnee.type,
    entiteId: id,
    adresseIp,
    donneesApres: JSON.stringify({ ...uniteCreee, provenance: "AJOUT_DYNAMIQUE" }),
  });

  await db.batch([...instructionsPréalables, instructionInsertion, instructionAuditTerritoire, instructionAuditGlobal]);

  return {
    id,
    type: donnee.type,
    nom: nomNettoye,
    statut_validation: "VALIDE",
    provenance: "AJOUT_DYNAMIQUE",
    doublon_existant: false,
    message: `L'unité « ${nomNettoye} » a été ajoutée et sélectionnée.`,
    unite: uniteCreee,
  };
}
