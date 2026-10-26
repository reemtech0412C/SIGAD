import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { ROLES_PROPOSITION_MODIFICATION_TERRITORIALE } from "../../../shared/constantes/roles";
import {
  creerUniteTerritorialeDynamique,
  construireFiltreSQLPorteeLocalite,
  ErreurCreationTerritorialeDynamique,
  listerPage,
  lireLocalitePourSelection,
  lireProvinceRessource,
  resoudrePorteeTerritoriale,
  verifierPorteeRessource,
} from "../services/territoire.service";
import type {
  ArrondissementTerritorial,
  CarreTerritorial,
  CantonTerritorial,
  CommuneTerritoriale,
  DepartementTerritorial,
  LocaliteTerritoriale,
  ProvinceTerritoriale,
  QuartierTerritorial,
  RattachementTerritorial,
  SiteHumanitaireTerritorial,
  SousPrefectureTerritoriale,
} from "../../../shared/types/territoire";
import {
  schemaAjoutDynamiqueUniteTerritoriale,
  schemaFiltresTerritoriaux,
  schemaPropositionCorrectionTerritoriale,
  schemaPropositionLocalite,
  schemaPropositionQuartier,
  schemaPropositionSiteHumanitaire,
  type TypeUniteAjoutDynamique,
} from "../../../shared/validations/territoire";

const routesTerritoire = new Hono<EnvironnementApplication>();

type Filtres = ReturnType<typeof schemaFiltresTerritoriaux.parse>;

function lireFiltres(c: Context<EnvironnementApplication>): Filtres | null {
  const resultat = schemaFiltresTerritoriaux.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  return resultat.success ? resultat.data : null;
}

function reponsePaginationInvalide(c: Context<EnvironnementApplication>) {
  return c.json({ erreur: "Les filtres territoriaux ou les paramètres de pagination sont invalides." }, 400);
}

function reponsePorteeInterdite(c: Context<EnvironnementApplication>) {
  return c.json({ erreur: "Accès refusé hors de votre province de rattachement." }, 403);
}

function reponseRessourceIntrouvable(c: Context<EnvironnementApplication>) {
  return c.json({ erreur: "La ressource territoriale demandée est introuvable." }, 404);
}

function ajouterFiltre(
  conditions: string[],
  valeurs: (string | number | null)[],
  expression: string,
  valeur: string | number | null | undefined,
): void {
  if (valeur === undefined || valeur === null || valeur === "") return;
  conditions.push(expression);
  valeurs.push(valeur);
}

async function verifierParentsFiltres(
  c: Context<EnvironnementApplication>,
  filtres: Filtres,
): Promise<boolean> {
  const utilisateur = c.get("utilisateur");
  const parents = [
    ["departement", filtres.departement_id],
    ["sous_prefecture", filtres.sous_prefecture_id],
    ["commune", filtres.commune_id],
    ["canton", filtres.canton_id],
    ["localite", filtres.localite_id],
    ["arrondissement", filtres.arrondissement_id],
    ["quartier", filtres.quartier_id],
  ] as const;
  for (const [type, identifiant] of parents) {
    if (!identifiant) continue;
    if (!(await verifierPorteeRessource(c.env.DB, utilisateur, type, identifiant))) return false;
  }
  return true;
}

async function confirmerProvinceRessource(
  c: Context<EnvironnementApplication>,
  type: "departement" | "sous_prefecture" | "commune" | "canton" | "localite" | "arrondissement" | "quartier" | "carre" | "site_humanitaire",
  identifiant: string,
): Promise<boolean> {
  return verifierPorteeRessource(c.env.DB, c.get("utilisateur"), type, identifiant);
}

function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

async function lireCorps<T>(
  c: Context<EnvironnementApplication>,
  schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false } },
): Promise<T | null> {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return null;
  }
  const resultat = schema.safeParse(corps);
  return resultat.success ? resultat.data : null;
}

routesTerritoire.get("/provinces", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["actif = 1"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "id = ?", portee.province_id ?? undefined);
  const where = conditions.join(" AND ");
  const page = await listerPage<ProvinceTerritoriale>(
    c.env.DB,
    `SELECT id, code, nom, chef_lieu, statut_particulier FROM provinces WHERE ${where} ORDER BY nom, id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM provinces WHERE ${where}`,
    valeurs,
    filtres,
  );
  return c.json(page);
});

routesTerritoire.get("/departements", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["d.actif = 1"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "d.province_id = ?", portee.province_id ?? undefined);
  const where = conditions.join(" AND ");
  const page = await listerPage<DepartementTerritorial>(
    c.env.DB,
    `SELECT d.id, d.province_id, d.code, d.nom, d.chef_lieu, d.statut_validation, d.source_officielle FROM departements d WHERE ${where} ORDER BY d.nom, d.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM departements d WHERE ${where}`,
    valeurs,
    filtres,
  );
  return c.json(page);
});

routesTerritoire.get("/sous-prefectures", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  if (filtres.departement_id && !(await confirmerProvinceRessource(c, "departement", filtres.departement_id))) return reponseRessourceIntrouvable(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["sp.actif = 1", "d.actif = 1"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "d.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, "sp.departement_id = ?", filtres.departement_id);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<SousPrefectureTerritoriale>(
    c.env.DB,
    `SELECT sp.id, sp.departement_id, sp.code, sp.nom
     FROM sous_prefectures sp INNER JOIN departements d ON d.id = sp.departement_id
     WHERE ${where} ORDER BY sp.nom, sp.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM sous_prefectures sp
     INNER JOIN departements d ON d.id = sp.departement_id WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/communes", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  if (filtres.departement_id && !(await confirmerProvinceRessource(c, "departement", filtres.departement_id))) return reponseRessourceIntrouvable(c);
  if (filtres.sous_prefecture_id && !(await confirmerProvinceRessource(c, "sous_prefecture", filtres.sous_prefecture_id))) return reponseRessourceIntrouvable(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["c.actif = 1", "c.statut_validation = 'VALIDE'"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "c.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, `EXISTS (
    SELECT 1 FROM rattachements_territoriaux rt
    WHERE rt.commune_id = c.id AND rt.departement_id = ?
      AND rt.date_debut_validite <= date('now')
      AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
  )`, filtres.departement_id);
  ajouterFiltre(conditions, valeurs, `EXISTS (
    SELECT 1 FROM rattachements_territoriaux rt
    WHERE rt.commune_id = c.id AND rt.sous_prefecture_id = ?
      AND rt.date_debut_validite <= date('now')
      AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
  )`, filtres.sous_prefecture_id);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<CommuneTerritoriale>(
    c.env.DB,
    `SELECT c.id, c.province_id, c.code, c.nom, c.type_commune FROM communes c
     WHERE ${where} ORDER BY c.nom, c.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM communes c WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/rattachements-territoriaux", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  if (filtres.commune_id && !(await confirmerProvinceRessource(c, "commune", filtres.commune_id))) return reponseRessourceIntrouvable(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["rt.date_debut_validite <= date('now')", "(rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "c.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, "rt.commune_id = ?", filtres.commune_id);
  ajouterFiltre(conditions, valeurs, "rt.departement_id = ?", filtres.departement_id);
  ajouterFiltre(conditions, valeurs, "rt.sous_prefecture_id = ?", filtres.sous_prefecture_id);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<RattachementTerritorial>(
    c.env.DB,
    `SELECT rt.id, rt.commune_id, rt.departement_id, rt.sous_prefecture_id,
            rt.source_juridique, rt.date_debut_validite, rt.date_fin_validite, rt.est_principal
     FROM rattachements_territoriaux rt INNER JOIN communes c ON c.id = rt.commune_id
     WHERE ${where} ORDER BY rt.est_principal DESC, rt.date_debut_validite DESC, rt.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM rattachements_territoriaux rt
     INNER JOIN communes c ON c.id = rt.commune_id WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/cantons", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  if (filtres.departement_id && !(await confirmerProvinceRessource(c, "departement", filtres.departement_id))) return reponseRessourceIntrouvable(c);
  if (filtres.sous_prefecture_id && !(await confirmerProvinceRessource(c, "sous_prefecture", filtres.sous_prefecture_id))) return reponseRessourceIntrouvable(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["ca.statut_validation = 'VALIDE'"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "d.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, "d.id = ?", filtres.departement_id);
  ajouterFiltre(conditions, valeurs, "ca.sous_prefecture_id = ?", filtres.sous_prefecture_id);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<CantonTerritorial>(
    c.env.DB,
    `SELECT ca.id, d.id AS departement_id, ca.sous_prefecture_id, ca.nom FROM cantons ca
     LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
     INNER JOIN departements d ON d.id = COALESCE(ca.departement_id, sp.departement_id)
     WHERE ${where} ORDER BY ca.nom, ca.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM cantons ca
     LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
     INNER JOIN departements d ON d.id = COALESCE(ca.departement_id, sp.departement_id) WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/localites", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  if (filtres.statut_validation && c.get("utilisateur").role === "DELEGUE_PROVINCIAL" && filtres.statut_validation !== "VALIDE") {
    return reponsePorteeInterdite(c);
  }
  if (!(await verifierParentsFiltres(c, filtres))) return reponseRessourceIntrouvable(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const statut = filtres.statut_validation ?? "VALIDE";
  const conditions = ["l.statut_validation = ?"];
  const valeurs: (string | number | null)[] = [statut];
  ajouterFiltre(conditions, valeurs, "l.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, "l.departement_id = ?", filtres.departement_id);
  ajouterFiltre(conditions, valeurs, "l.sous_prefecture_id = ?", filtres.sous_prefecture_id);
  ajouterFiltre(conditions, valeurs, "l.commune_id = ?", filtres.commune_id);
  ajouterFiltre(conditions, valeurs, "l.canton_id = ?", filtres.canton_id);
  ajouterFiltre(conditions, valeurs, "l.type_localite = ?", filtres.type_localite);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<LocaliteTerritoriale>(
    c.env.DB,
    `SELECT l.id, l.province_id, l.departement_id, l.sous_prefecture_id, l.commune_id,
            l.canton_id, l.nom, l.type_localite, l.mode_decoupage_urbain
     FROM localites l WHERE ${where} ORDER BY l.nom, l.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM localites l WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/localites/:id", async (c) => {
  const localite = await lireLocalitePourSelection(c.env.DB, c.get("utilisateur"), c.req.param("id"));
  if (!localite || localite.statut_validation !== "VALIDE") return reponseRessourceIntrouvable(c);
  return c.json(localite);
});

routesTerritoire.get("/arrondissements", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres || !filtres.localite_id) return reponsePaginationInvalide(c);
  const filtrePortee = construireFiltreSQLPorteeLocalite(c.get("utilisateur"), "arrondissements.localite_id");
  if (!filtrePortee.autorisee) return reponseRessourceIntrouvable(c);
  const localite = await lireLocalitePourSelection(c.env.DB, c.get("utilisateur"), filtres.localite_id);
  if (!localite || localite.statut_validation !== "VALIDE") return reponseRessourceIntrouvable(c);
  if (localite.type_localite !== "VILLE" || localite.mode_decoupage_urbain !== "AVEC_ARRONDISSEMENTS") {
    return c.json({ erreur: "Cette ville ne possède pas de découpage en arrondissements." }, 409);
  }
  const valeurs: (string | number | null)[] = [filtres.localite_id, ...filtrePortee.valeurs];
  return c.json(await listerPage<ArrondissementTerritorial>(
    c.env.DB,
    `SELECT id, localite_id, commune_id, code, nom FROM arrondissements
     WHERE localite_id = ? AND statut_validation = 'VALIDE' ${filtrePortee.clause} ORDER BY nom, id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM arrondissements
     WHERE localite_id = ? AND statut_validation = 'VALIDE' ${filtrePortee.clause}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/quartiers", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres || !filtres.localite_id) return reponsePaginationInvalide(c);
  const filtrePortee = construireFiltreSQLPorteeLocalite(c.get("utilisateur"), "quartiers.localite_id");
  if (!filtrePortee.autorisee) return reponseRessourceIntrouvable(c);
  const localite = await lireLocalitePourSelection(c.env.DB, c.get("utilisateur"), filtres.localite_id);
  if (!localite || localite.statut_validation !== "VALIDE") return reponseRessourceIntrouvable(c);
  if (localite.type_localite !== "VILLE" || !["AVEC_ARRONDISSEMENTS", "SANS_ARRONDISSEMENT"].includes(localite.mode_decoupage_urbain)) {
    return c.json({ erreur: "Les quartiers ne sont disponibles que pour une ville référencée." }, 409);
  }
  if (localite.mode_decoupage_urbain === "AVEC_ARRONDISSEMENTS" && !filtres.arrondissement_id) {
    return c.json({ erreur: "Sélectionnez d’abord un arrondissement." }, 400);
  }
  if (localite.mode_decoupage_urbain === "SANS_ARRONDISSEMENT" && filtres.arrondissement_id) {
    return c.json({ erreur: "Cette ville ne possède pas d’arrondissements." }, 400);
  }
  if (filtres.arrondissement_id) {
    const arrondissement = await c.env.DB.prepare(
      "SELECT id FROM arrondissements WHERE id = ? AND localite_id = ? AND statut_validation = 'VALIDE'",
    ).bind(filtres.arrondissement_id, localite.id).first<{ id: string }>();
    if (!arrondissement) return c.json({ erreur: "L’arrondissement ne relève pas de la ville sélectionnée." }, 400);
  }
  const conditions = ["localite_id = ?", "statut_validation = 'VALIDE'"];
  const valeurs: (string | number | null)[] = [localite.id, ...filtrePortee.valeurs];
  if (filtrePortee.clause) conditions.push(filtrePortee.clause.replace(/^AND\s+/u, ""));
  ajouterFiltre(conditions, valeurs, "arrondissement_id = ?", filtres.arrondissement_id);
  if (localite.mode_decoupage_urbain === "SANS_ARRONDISSEMENT") conditions.push("arrondissement_id IS NULL");
  const where = conditions.join(" AND ");
  return c.json(await listerPage<QuartierTerritorial>(
    c.env.DB,
    `SELECT id, localite_id, arrondissement_id, nom, possede_carres FROM quartiers
     WHERE ${where} ORDER BY nom, id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM quartiers WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/carres", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres || !filtres.quartier_id) return reponsePaginationInvalide(c);
  if (!(await confirmerProvinceRessource(c, "quartier", filtres.quartier_id))) return reponseRessourceIntrouvable(c);
  const quartier = await c.env.DB.prepare(
    `SELECT id, possede_carres FROM quartiers WHERE id = ? AND statut_validation = 'VALIDE'
     AND (? IS NULL OR EXISTS (
       SELECT 1 FROM localites l WHERE l.id = quartiers.localite_id AND l.province_id = ?
     ))`,
  ).bind(filtres.quartier_id, c.get("utilisateur").province_id, c.get("utilisateur").province_id)
    .first<{ id: string; possede_carres: number }>();
  if (!quartier) return reponseRessourceIntrouvable(c);
  return c.json(await listerPage<CarreTerritorial>(
    c.env.DB,
    `SELECT id, quartier_id, code_ou_nom FROM carres
     WHERE quartier_id = ? AND statut_validation = 'VALIDE' ORDER BY code_ou_nom, id LIMIT ? OFFSET ?`,
    "SELECT COUNT(*) AS total FROM carres WHERE quartier_id = ? AND statut_validation = 'VALIDE'",
    [quartier.id],
    filtres,
  ));
});

routesTerritoire.get("/sites-humanitaires", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres) return reponsePaginationInvalide(c);
  if (filtres.departement_id && !(await confirmerProvinceRessource(c, "departement", filtres.departement_id))) return reponseRessourceIntrouvable(c);
  if (filtres.sous_prefecture_id && !(await confirmerProvinceRessource(c, "sous_prefecture", filtres.sous_prefecture_id))) return reponseRessourceIntrouvable(c);
  if (filtres.commune_id && !(await confirmerProvinceRessource(c, "commune", filtres.commune_id))) return reponseRessourceIntrouvable(c);
  if (filtres.statut_validation && c.get("utilisateur").role === "DELEGUE_PROVINCIAL" && filtres.statut_validation !== "VALIDE") {
    return reponsePorteeInterdite(c);
  }
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["s.statut_validation = ?"];
  const valeurs: (string | number | null)[] = [filtres.statut_validation ?? "VALIDE"];
  ajouterFiltre(conditions, valeurs, "s.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, "s.departement_id = ?", filtres.departement_id);
  ajouterFiltre(conditions, valeurs, "s.sous_prefecture_id = ?", filtres.sous_prefecture_id);
  ajouterFiltre(conditions, valeurs, "s.commune_id = ?", filtres.commune_id);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<SiteHumanitaireTerritorial>(
    c.env.DB,
    `SELECT s.id, s.province_id, s.departement_id, s.sous_prefecture_id, s.commune_id,
            s.localite_proche_id, s.code_site, s.nom, s.categorie_site
     FROM sites_humanitaires s WHERE ${where} ORDER BY s.nom, s.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM sites_humanitaires s WHERE ${where}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/sites-humanitaires/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!(await confirmerProvinceRessource(c, "site_humanitaire", c.req.param("id")))) return reponseRessourceIntrouvable(c);
  const provinceDelegate = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  const site = await c.env.DB.prepare(
    `SELECT id, province_id, departement_id, sous_prefecture_id, commune_id,
            localite_proche_id, code_site, nom, categorie_site
     FROM sites_humanitaires WHERE id = ? AND statut_validation = 'VALIDE'
       AND (? IS NULL OR province_id = ?)`,
  ).bind(c.req.param("id"), provinceDelegate, provinceDelegate).first<SiteHumanitaireTerritorial>();
  if (!site) return reponseRessourceIntrouvable(c);
  return c.json(site);
});

async function resoudreProvinceProposition(
  c: Context<EnvironnementApplication>,
  provinceExplicite: string | undefined,
  departementId: string | null | undefined,
): Promise<{ ok: true; provinceId: string } | { ok: false; reponse: Response }> {
  const utilisateur = c.get("utilisateur");
  if (!ROLES_PROPOSITION_MODIFICATION_TERRITORIALE.includes(utilisateur.role)) {
    return { ok: false, reponse: reponsePorteeInterdite(c) };
  }
  const provinceDepartement = departementId
    ? await lireProvinceRessource(c.env.DB, "departement", departementId)
    : null;

  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id) {
      return { ok: false, reponse: reponsePorteeInterdite(c) };
    }
    if (provinceExplicite && provinceExplicite !== utilisateur.province_id) {
      return { ok: false, reponse: reponsePorteeInterdite(c) };
    }
    if (departementId && provinceDepartement !== utilisateur.province_id) {
      return { ok: false, reponse: reponseRessourceIntrouvable(c) };
    }
    return { ok: true, provinceId: utilisateur.province_id };
  }

  if (departementId && !provinceDepartement) {
    return { ok: false, reponse: reponseRessourceIntrouvable(c) };
  }
  if (provinceExplicite && provinceDepartement && provinceExplicite !== provinceDepartement) {
    return {
      ok: false,
      reponse: c.json({ erreur: "Le département sélectionné ne relève pas de la province indiquée." }, 400),
    };
  }
  const provinceCible = provinceExplicite ?? provinceDepartement;
  if (!provinceCible) {
    return {
      ok: false,
      reponse: c.json({ erreur: "La province ou le département de rattachement est obligatoire." }, 400),
    };
  }
  const provinceActive = await c.env.DB.prepare(
    "SELECT id FROM provinces WHERE id = ? AND actif = 1 LIMIT 1",
  ).bind(provinceCible).first<{ id: string }>();
  if (!provinceActive) {
    return { ok: false, reponse: reponseRessourceIntrouvable(c) };
  }
  return { ok: true, provinceId: provinceCible };
}

async function lireUniteCibleCorrection(
  base: D1Database,
  typeUnite: TypeUniteAjoutDynamique,
  uniteId: string,
): Promise<{ id: string; nom: string; province_id: string } | null> {
  switch (typeUnite) {
    case "DEPARTEMENT":
      return base
        .prepare("SELECT id, nom, province_id FROM departements WHERE id = ? AND actif = 1 LIMIT 1")
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "SOUS_PREFECTURE":
      return base
        .prepare("SELECT id, nom, province_id FROM sous_prefectures WHERE id = ? AND actif = 1 LIMIT 1")
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "CANTON":
      return base
        .prepare(
          `SELECT ca.id, ca.nom, COALESCE(d.province_id, sp.province_id) AS province_id
           FROM cantons ca
           LEFT JOIN departements d ON d.id = ca.departement_id
           LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
           WHERE ca.id = ? AND ca.actif = 1 LIMIT 1`,
        )
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "VILLE":
    case "VILLAGE":
    case "HAMEAU":
    case "FERRICK":
    case "CAMPEMENT":
      return base
        .prepare("SELECT id, nom, province_id FROM localites WHERE id = ? AND actif = 1 LIMIT 1")
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "ARRONDISSEMENT":
      return base
        .prepare(
          `SELECT a.id, a.nom, l.province_id
           FROM arrondissements a
           INNER JOIN localites l ON l.id = a.localite_id
           WHERE a.id = ? AND a.actif = 1 LIMIT 1`,
        )
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "QUARTIER":
      return base
        .prepare(
          `SELECT q.id, q.nom, l.province_id
           FROM quartiers q
           INNER JOIN localites l ON l.id = q.localite_id
           WHERE q.id = ? AND q.actif = 1 LIMIT 1`,
        )
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "CARRE":
      return base
        .prepare(
          `SELECT c.id, c.nom, l.province_id
           FROM carres c
           INNER JOIN quartiers q ON q.id = c.quartier_id
           INNER JOIN localites l ON l.id = q.localite_id
           WHERE c.id = ? AND c.actif = 1 LIMIT 1`,
        )
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
    case "SITE_HUMANITAIRE":
      return base
        .prepare("SELECT id, nom, province_id FROM sites_humanitaires WHERE id = ? AND actif = 1 LIMIT 1")
        .bind(uniteId)
        .first<{ id: string; nom: string; province_id: string }>();
  }
}

routesTerritoire.post("/propositions/localites", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!ROLES_PROPOSITION_MODIFICATION_TERRITORIALE.includes(utilisateur.role)) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionLocalite);
  if (!proposition) return c.json({ erreur: "La proposition de localité est invalide ou contient des champs non autorisés." }, 400);
  const resolutionProvince = await resoudreProvinceProposition(c, proposition.province_id, proposition.departement_id);
  if (!resolutionProvince.ok) return resolutionProvince.reponse;
  const provinceCible = resolutionProvince.provinceId;
  if (proposition.sous_prefecture_id) {
    const sousPrefecture = await c.env.DB.prepare(
      "SELECT id FROM sous_prefectures WHERE id = ? AND departement_id = ? AND actif = 1",
    ).bind(proposition.sous_prefecture_id, proposition.departement_id).first<{ id: string }>();
    if (!sousPrefecture) return c.json({ erreur: "La sous-préfecture ne relève pas du département sélectionné." }, 400);
  }
  if (proposition.commune_id) {
    const rattachement = await c.env.DB.prepare(
      `SELECT 1 AS valide FROM communes c
       INNER JOIN rattachements_territoriaux rt ON rt.commune_id = c.id
       WHERE c.id = ? AND c.province_id = ? AND rt.departement_id = ?
         AND (? IS NULL OR rt.sous_prefecture_id = ?)
         AND rt.date_debut_validite <= date('now')
         AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))`,
    ).bind(proposition.commune_id, provinceCible, proposition.departement_id,
      proposition.sous_prefecture_id ?? null, proposition.sous_prefecture_id ?? null).first<{ valide: number }>();
    if (!rattachement) return c.json({ erreur: "La commune ne relève pas du rattachement administratif sélectionné." }, 400);
  }
  if (proposition.canton_id) {
    const canton = await c.env.DB.prepare(
      `SELECT ca.id, COALESCE(ca.departement_id, sp.departement_id) AS dep_id, ca.sous_prefecture_id
       FROM cantons ca
       LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
       WHERE ca.id = ? AND ca.statut_validation = 'VALIDE'`,
    ).bind(proposition.canton_id).first<{ id: string; dep_id: string; sous_prefecture_id: string | null }>();
    if (!canton || canton.dep_id !== proposition.departement_id) {
      return c.json({ erreur: "Le canton ne relève pas du département sélectionné." }, 400);
    }
    if (proposition.sous_prefecture_id && canton.sous_prefecture_id && canton.sous_prefecture_id !== proposition.sous_prefecture_id) {
      return c.json({ erreur: "Le canton ne relève pas de la sous-préfecture sélectionnée." }, 400);
    }
  }
  const id = crypto.randomUUID();
  const insertion = c.env.DB.prepare(
    `INSERT INTO localites
     (id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id, nom,
      type_localite, mode_decoupage_urbain, statut_validation, source_documentation, propose_par)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AUCUN', 'PROPOSE', ?, ?)`,
  ).bind(id, provinceCible, proposition.departement_id ?? null, proposition.sous_prefecture_id ?? null,
    proposition.commune_id ?? null, proposition.canton_id ?? null, proposition.nom,
    proposition.type_localite, proposition.source_documentation, utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "PROPOSITION_LOCALITE",
    entiteType: "LOCALITE",
    entiteId: id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ ...proposition, province_id: provinceCible, statut_validation: "PROPOSE" }),
  });
  try {
    await c.env.DB.batch([insertion, audit]);
  } catch {
    return c.json({ erreur: "La proposition est incompatible avec le référentiel territorial." }, 409);
  }
  return c.json({ id, province_id: provinceCible, statut_validation: "PROPOSE" }, 201);
});

routesTerritoire.post("/propositions/quartiers", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!ROLES_PROPOSITION_MODIFICATION_TERRITORIALE.includes(utilisateur.role)) return reponsePorteeInterdite(c);
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !utilisateur.province_id) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionQuartier);
  if (!proposition) return c.json({ erreur: "La proposition de quartier est invalide ou contient des champs non autorisés." }, 400);
  if (
    utilisateur.role === "DELEGUE_PROVINCIAL" &&
    proposition.province_id &&
    proposition.province_id !== utilisateur.province_id
  ) {
    return reponsePorteeInterdite(c);
  }
  const localite = await lireLocalitePourSelection(c.env.DB, utilisateur, proposition.localite_id);
  if (!localite || localite.statut_validation !== "VALIDE") return reponseRessourceIntrouvable(c);
  if (proposition.province_id && proposition.province_id !== localite.province_id) {
    return c.json({ erreur: "La ville sélectionnée ne relève pas de la province indiquée." }, 400);
  }
  if (localite.type_localite !== "VILLE") return c.json({ erreur: "Un quartier ne peut être proposé que pour une ville." }, 400);
  if (localite.mode_decoupage_urbain === "AVEC_ARRONDISSEMENTS") {
    if (!proposition.arrondissement_id) return c.json({ erreur: "La ville exige la sélection d’un arrondissement." }, 400);
    const arrondissement = await c.env.DB.prepare(
      "SELECT id FROM arrondissements WHERE id = ? AND localite_id = ? AND statut_validation = 'VALIDE'",
    ).bind(proposition.arrondissement_id, localite.id).first<{ id: string }>();
    if (!arrondissement) return c.json({ erreur: "L’arrondissement ne relève pas de la ville sélectionnée." }, 400);
  } else if (localite.mode_decoupage_urbain === "SANS_ARRONDISSEMENT") {
    if (proposition.arrondissement_id) return c.json({ erreur: "La ville ne possède pas d’arrondissements." }, 400);
  } else {
    return c.json({ erreur: "Le découpage urbain de la ville n’est pas renseigné." }, 409);
  }
  const id = crypto.randomUUID();
  const insertion = c.env.DB.prepare(
    `INSERT INTO quartiers (id, localite_id, arrondissement_id, nom, possede_carres, statut_validation, propose_par)
     VALUES (?, ?, ?, ?, ?, 'PROPOSE', ?)`,
  ).bind(id, localite.id, proposition.arrondissement_id ?? null, proposition.nom,
    proposition.possede_carres ? 1 : 0, utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "PROPOSITION_QUARTIER",
    entiteType: "QUARTIER",
    entiteId: id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ ...proposition, province_id: localite.province_id, statut_validation: "PROPOSE" }),
  });
  try {
    await c.env.DB.batch([insertion, audit]);
  } catch {
    return c.json({ erreur: "La proposition est incompatible avec le référentiel territorial." }, 409);
  }
  return c.json({ id, localite_id: localite.id, province_id: localite.province_id, statut_validation: "PROPOSE" }, 201);
});

routesTerritoire.post("/propositions/sites-humanitaires", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!ROLES_PROPOSITION_MODIFICATION_TERRITORIALE.includes(utilisateur.role)) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionSiteHumanitaire);
  if (!proposition) return c.json({ erreur: "La proposition de site humanitaire est invalide ou contient des champs non autorisés." }, 400);
  const resolutionProvince = await resoudreProvinceProposition(c, proposition.province_id, proposition.departement_id);
  if (!resolutionProvince.ok) return resolutionProvince.reponse;
  const provinceCible = resolutionProvince.provinceId;
  if (proposition.sous_prefecture_id) {
    const sousPrefecture = await c.env.DB.prepare(
      "SELECT id FROM sous_prefectures WHERE id = ? AND departement_id = ? AND actif = 1",
    ).bind(proposition.sous_prefecture_id, proposition.departement_id).first<{ id: string }>();
    if (!sousPrefecture) return c.json({ erreur: "La sous-préfecture ne relève pas du département sélectionné." }, 400);
  }
  if (proposition.commune_id) {
    const rattachement = await c.env.DB.prepare(
      `SELECT 1 AS valide FROM communes c
       INNER JOIN rattachements_territoriaux rt ON rt.commune_id = c.id
       WHERE c.id = ? AND c.province_id = ? AND rt.departement_id = ?
         AND (? IS NULL OR rt.sous_prefecture_id = ?)
         AND rt.date_debut_validite <= date('now')
         AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))`,
    ).bind(proposition.commune_id, provinceCible, proposition.departement_id,
      proposition.sous_prefecture_id ?? null, proposition.sous_prefecture_id ?? null).first<{ valide: number }>();
    if (!rattachement) return c.json({ erreur: "La commune ne relève pas du rattachement administratif sélectionné." }, 400);
  }
  if (proposition.localite_proche_id) {
    const localite = await lireLocalitePourSelection(c.env.DB, utilisateur, proposition.localite_proche_id);
    if (!localite || localite.statut_validation !== "VALIDE" || localite.departement_id !== proposition.departement_id) {
      return c.json({ erreur: "La localité de référence ne relève pas du département sélectionné." }, 400);
    }
    if (proposition.sous_prefecture_id && localite.sous_prefecture_id !== proposition.sous_prefecture_id) {
      return c.json({ erreur: "La localité de référence ne relève pas de la sous-préfecture sélectionnée." }, 400);
    }
    if (proposition.commune_id && localite.commune_id !== proposition.commune_id) {
      return c.json({ erreur: "La localité de référence ne relève pas de la commune sélectionnée." }, 400);
    }
  }
  const id = crypto.randomUUID();
  const insertion = c.env.DB.prepare(
    `INSERT INTO sites_humanitaires
     (id, province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id,
      nom, categorie_site, statut_validation, propose_par)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSE', ?)`,
  ).bind(id, provinceCible, proposition.departement_id ?? null, proposition.sous_prefecture_id ?? null,
    proposition.commune_id ?? null, proposition.localite_proche_id ?? null, proposition.nom,
    proposition.categorie_site, utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "PROPOSITION_SITE_HUMANITAIRE",
    entiteType: "SITE_HUMANITAIRE",
    entiteId: id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ ...proposition, province_id: provinceCible, statut_validation: "PROPOSE" }),
  });
  try {
    await c.env.DB.batch([insertion, audit]);
  } catch {
    return c.json({ erreur: "La proposition est incompatible avec le référentiel territorial." }, 409);
  }
  return c.json({ id, province_id: provinceCible, statut_validation: "PROPOSE" }, 201);
});

routesTerritoire.post("/propositions/corrections", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!ROLES_PROPOSITION_MODIFICATION_TERRITORIALE.includes(utilisateur.role)) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionCorrectionTerritoriale);
  if (!proposition) {
    return c.json(
      { erreur: "La proposition de correction territoriale est invalide ou incomplète." },
      400,
    );
  }
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || proposition.province_id !== utilisateur.province_id) {
      return reponsePorteeInterdite(c);
    }
  }
  const cible = await lireUniteCibleCorrection(c.env.DB, proposition.type_unite, proposition.unite_id);
  if (!cible) {
    return reponseRessourceIntrouvable(c);
  }
  if (cible.province_id !== proposition.province_id) {
    return utilisateur.role === "DELEGUE_PROVINCIAL"
      ? reponsePorteeInterdite(c)
      : c.json({ erreur: "L'unité territoriale sélectionnée ne relève pas de la province indiquée." }, 400);
  }

  const idProposition = crypto.randomUUID();
  const instructions: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO audits_territoire
       (id, action, entite_type, entite_id, utilisateur_id, anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id)
       VALUES (?, 'MODIFICATION', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      idProposition,
      proposition.type_unite,
      proposition.unite_id,
      utilisateur.id,
      JSON.stringify({ id: cible.id, nom: cible.nom, province_id: cible.province_id }),
      JSON.stringify({
        nom_corrige: proposition.nom_corrige,
        motif_correction: proposition.motif_correction,
        source_documentation: proposition.source_documentation ?? null,
        statut_proposition: "PROPOSE",
      }),
      proposition.source_documentation ?? "Proposition de correction territoriale",
      proposition.motif_correction,
      adresseIp(c.req.raw),
      c.get("requestId"),
    ),
    creerInstructionAudit(c.env.DB, {
      utilisateur,
      action: "PROPOSITION_CORRECTION_TERRITORIALE",
      entiteType: proposition.type_unite,
      entiteId: proposition.unite_id,
      adresseIp: adresseIp(c.req.raw),
      donneesAvant: JSON.stringify({ id: cible.id, nom: cible.nom, province_id: cible.province_id }),
      donneesApres: JSON.stringify({
        id_proposition: idProposition,
        nom_corrige: proposition.nom_corrige,
        motif_correction: proposition.motif_correction,
        source_documentation: proposition.source_documentation ?? null,
      }),
    }),
  ];

  try {
    await c.env.DB.batch(instructions);
  } catch {
    return c.json({ erreur: "Impossible d'enregistrer la proposition de correction territoriale." }, 409);
  }

  return c.json(
    {
      id: idProposition,
      type_unite: proposition.type_unite,
      unite_id: proposition.unite_id,
      province_id: cible.province_id,
      ancien_nom: cible.nom,
      nom_corrige: proposition.nom_corrige,
      statut_proposition: "ENREGISTREE",
    },
    201,
  );
});

routesTerritoire.post("/unites-dynamiques", async (c) => {
  const utilisateur = c.get("utilisateur");
  const donnee = await lireCorps(c, schemaAjoutDynamiqueUniteTerritoriale);
  if (!donnee) {
    return c.json(
      { erreur: "Les données de l'unité territoriale à ajouter sont invalides ou incomplètes." },
      400,
    );
  }
  try {
    const resultat = await creerUniteTerritorialeDynamique(
      c.env.DB,
      utilisateur,
      donnee,
      adresseIp(c.req.raw),
    );
    return c.json(resultat, resultat.doublon_existant ? 200 : 201);
  } catch (erreur) {
    if (erreur instanceof ErreurCreationTerritorialeDynamique) {
      return c.json(
        { erreur: erreur.message },
        erreur.statutHttp as 400 | 403 | 404 | 409,
      );
    }
    return c.json(
      { erreur: "Impossible d'enregistrer l'unité territoriale demandée." },
      500,
    );
  }
});

export { routesTerritoire };
