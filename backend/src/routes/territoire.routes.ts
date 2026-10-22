import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import {
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
  schemaFiltresTerritoriaux,
  schemaPropositionLocalite,
  schemaPropositionQuartier,
  schemaPropositionSiteHumanitaire,
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
    `SELECT d.id, d.province_id, d.code, d.nom, d.chef_lieu FROM departements d WHERE ${where} ORDER BY d.nom, d.id LIMIT ? OFFSET ?`,
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
  if (filtres.sous_prefecture_id && !(await confirmerProvinceRessource(c, "sous_prefecture", filtres.sous_prefecture_id))) return reponseRessourceIntrouvable(c);
  const portee = resoudrePorteeTerritoriale(c.get("utilisateur"), filtres.province_id);
  if (!portee.autorisee) return reponsePorteeInterdite(c);
  const conditions = ["ca.statut_validation = 'VALIDE'"];
  const valeurs: (string | number | null)[] = [];
  ajouterFiltre(conditions, valeurs, "d.province_id = ?", portee.province_id ?? undefined);
  ajouterFiltre(conditions, valeurs, "ca.sous_prefecture_id = ?", filtres.sous_prefecture_id);
  const where = conditions.join(" AND ");
  return c.json(await listerPage<CantonTerritorial>(
    c.env.DB,
    `SELECT ca.id, ca.sous_prefecture_id, ca.nom FROM cantons ca
     INNER JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
     INNER JOIN departements d ON d.id = sp.departement_id
     WHERE ${where} ORDER BY ca.nom, ca.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM cantons ca
     INNER JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
     INNER JOIN departements d ON d.id = sp.departement_id WHERE ${where}`,
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
  const localite = await lireLocalitePourSelection(c.env.DB, c.get("utilisateur"), filtres.localite_id);
  if (!localite || localite.statut_validation !== "VALIDE") return reponseRessourceIntrouvable(c);
  if (localite.type_localite !== "VILLE" || localite.mode_decoupage_urbain !== "AVEC_ARRONDISSEMENTS") {
    return c.json({ erreur: "Cette ville ne possède pas de découpage en arrondissements." }, 409);
  }
  const provinceDelegate = c.get("utilisateur").role === "DELEGUE_PROVINCIAL" ? c.get("utilisateur").province_id : null;
  const filtreProvince = provinceDelegate ? "AND EXISTS (SELECT 1 FROM localites l WHERE l.id = arrondissements.localite_id AND l.province_id = ?)" : "";
  const valeurs: (string | number | null)[] = [filtres.localite_id];
  if (provinceDelegate) valeurs.push(provinceDelegate);
  return c.json(await listerPage<ArrondissementTerritorial>(
    c.env.DB,
    `SELECT id, localite_id, commune_id, code, nom FROM arrondissements
     WHERE localite_id = ? AND statut_validation = 'VALIDE' ${filtreProvince} ORDER BY nom, id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM arrondissements
     WHERE localite_id = ? AND statut_validation = 'VALIDE' ${filtreProvince}`,
    valeurs,
    filtres,
  ));
});

routesTerritoire.get("/quartiers", async (c) => {
  const filtres = lireFiltres(c);
  if (!filtres || !filtres.localite_id) return reponsePaginationInvalide(c);
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
  const valeurs: (string | number | null)[] = [localite.id];
  const provinceDelegate = c.get("utilisateur").role === "DELEGUE_PROVINCIAL" ? c.get("utilisateur").province_id : null;
  if (provinceDelegate) {
    conditions.push("EXISTS (SELECT 1 FROM localites l WHERE l.id = quartiers.localite_id AND l.province_id = ?)");
    valeurs.push(provinceDelegate);
  }
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
  if (quartier.possede_carres !== 1) return c.json({ erreur: "Ce quartier ne possède pas de carrés." }, 409);
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

routesTerritoire.post("/propositions/localites", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionLocalite);
  if (!proposition) return c.json({ erreur: "La proposition de localité est invalide ou contient des champs non autorisés." }, 400);
  const provinceDepartement = await lireProvinceRessource(c.env.DB, "departement", proposition.departement_id);
  if (provinceDepartement !== utilisateur.province_id) return reponseRessourceIntrouvable(c);
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
    ).bind(proposition.commune_id, utilisateur.province_id, proposition.departement_id,
      proposition.sous_prefecture_id ?? null, proposition.sous_prefecture_id ?? null).first<{ valide: number }>();
    if (!rattachement) return c.json({ erreur: "La commune ne relève pas du rattachement administratif sélectionné." }, 400);
  }
  if (proposition.canton_id) {
    if (!proposition.sous_prefecture_id) return c.json({ erreur: "Un canton exige la sélection de sa sous-préfecture." }, 400);
    const canton = await c.env.DB.prepare(
      "SELECT id FROM cantons WHERE id = ? AND sous_prefecture_id = ? AND statut_validation = 'VALIDE'",
    ).bind(proposition.canton_id, proposition.sous_prefecture_id).first<{ id: string }>();
    if (!canton) return c.json({ erreur: "Le canton ne relève pas de la sous-préfecture sélectionnée." }, 400);
  }
  const id = crypto.randomUUID();
  const insertion = c.env.DB.prepare(
    `INSERT INTO localites
     (id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id, nom,
      type_localite, mode_decoupage_urbain, statut_validation, source_documentation, propose_par)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AUCUN', 'PROPOSE', ?, ?)`,
  ).bind(id, utilisateur.province_id, proposition.departement_id, proposition.sous_prefecture_id ?? null,
    proposition.commune_id ?? null, proposition.canton_id ?? null, proposition.nom,
    proposition.type_localite, proposition.source_documentation, utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "PROPOSITION_LOCALITE",
    entiteType: "LOCALITE",
    entiteId: id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ ...proposition, province_id: utilisateur.province_id, statut_validation: "PROPOSE" }),
  });
  try {
    await c.env.DB.batch([insertion, audit]);
  } catch {
    return c.json({ erreur: "La proposition est incompatible avec le référentiel territorial." }, 409);
  }
  return c.json({ id, province_id: utilisateur.province_id, statut_validation: "PROPOSE" }, 201);
});

routesTerritoire.post("/propositions/quartiers", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionQuartier);
  if (!proposition) return c.json({ erreur: "La proposition de quartier est invalide ou contient des champs non autorisés." }, 400);
  const localite = await lireLocalitePourSelection(c.env.DB, utilisateur, proposition.localite_id);
  if (!localite || localite.statut_validation !== "VALIDE") return reponseRessourceIntrouvable(c);
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
    donneesApres: JSON.stringify({ ...proposition, province_id: utilisateur.province_id, statut_validation: "PROPOSE" }),
  });
  try {
    await c.env.DB.batch([insertion, audit]);
  } catch {
    return c.json({ erreur: "La proposition est incompatible avec le référentiel territorial." }, 409);
  }
  return c.json({ id, localite_id: localite.id, statut_validation: "PROPOSE" }, 201);
});

routesTerritoire.post("/propositions/sites-humanitaires", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) return reponsePorteeInterdite(c);
  const proposition = await lireCorps(c, schemaPropositionSiteHumanitaire);
  if (!proposition) return c.json({ erreur: "La proposition de site humanitaire est invalide ou contient des champs non autorisés." }, 400);
  if ((await lireProvinceRessource(c.env.DB, "departement", proposition.departement_id)) !== utilisateur.province_id) {
    return reponseRessourceIntrouvable(c);
  }
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
    ).bind(proposition.commune_id, utilisateur.province_id, proposition.departement_id,
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
  ).bind(id, utilisateur.province_id, proposition.departement_id, proposition.sous_prefecture_id ?? null,
    proposition.commune_id ?? null, proposition.localite_proche_id ?? null, proposition.nom,
    proposition.categorie_site, utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "PROPOSITION_SITE_HUMANITAIRE",
    entiteType: "SITE_HUMANITAIRE",
    entiteId: id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ ...proposition, province_id: utilisateur.province_id, statut_validation: "PROPOSE" }),
  });
  try {
    await c.env.DB.batch([insertion, audit]);
  } catch {
    return c.json({ erreur: "La proposition est incompatible avec le référentiel territorial." }, 409);
  }
  return c.json({ id, province_id: utilisateur.province_id, statut_validation: "PROPOSE" }, 201);
});

export { routesTerritoire };
