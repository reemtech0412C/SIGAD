import { Hono, type Context } from "hono";
import type { EnvironnementApplication, UtilisateurSession } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { typeErreurSecurise } from "../services/fichiers-securite.service.ts";
import {
  ErreurStock,
  enregistrerAjustementStock,
  enregistrerReceptionStock,
  enregistrerTransfertStock,
} from "../services/stock.service";
import {
  schemaAjustementStock,
  schemaArticle,
  schemaCategorieAide,
  schemaConditionnement,
  schemaEntrepot,
  schemaPaginationStocks,
  schemaReceptionStock,
  schemaTransfertStock,
  schemaUniteMesure,
} from "../../../shared/validations/stocks";

const routesStocks = new Hono<EnvironnementApplication>();
const ROLES_LECTURE = ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
const ROLES_OPERATIONNELS = ["ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
const ROLES_CENTRAUX = ["PROPRIETAIRE", "ADMIN_CENTRAL"] as const;

interface Page<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface FiltresStocks {
  limite: number;
  decalage: number;
  recherche?: string | undefined;
  province_id?: string | undefined;
  entrepot_id?: string | undefined;
  article_id?: string | undefined;
  categorie_id?: string | undefined;
  type_mouvement?: string | undefined;
  date_debut?: string | undefined;
  date_fin?: string | undefined;
}

interface EntreeListe {
  sql: string;
  sqlTotal: string;
  valeurs: (string | number)[];
  utilisateur: UtilisateurSession;
  filtres: FiltresStocks;
  db: D1Database;
  selection: string;
}

function reponseInterdite(c: Context<EnvironnementApplication>) {
  return c.json({ erreur: "Accès refusé pour cette opération." }, 403);
}

function autorise(utilisateur: UtilisateurSession, roles: readonly string[]): boolean {
  return roles.includes(utilisateur.role);
}

function extraireFiltres(c: Context<EnvironnementApplication>): FiltresStocks | null {
  const resultat = schemaPaginationStocks.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  return resultat.success ? resultat.data : null;
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

function ajouterCondition(conditions: string[], valeurs: (string | number)[], condition: string, valeur: string | undefined): void {
  if (valeur !== undefined && valeur !== "") {
    conditions.push(condition);
    valeurs.push(valeur);
  }
}

function appliquerPorteeProvince(
  c: Context<EnvironnementApplication>,
  filtres: FiltresStocks,
): { autorisee: boolean; provinceId: string | null } {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || (filtres.province_id && filtres.province_id !== utilisateur.province_id)) {
      return { autorisee: false, provinceId: null };
    }
    return { autorisee: true, provinceId: utilisateur.province_id };
  }
  return { autorisee: true, provinceId: filtres.province_id ?? null };
}

async function lirePage<T>(entree: EntreeListe): Promise<Page<T>> {
  const [resultat, total] = await Promise.all([
    entree.db.prepare(entree.sql).bind(...entree.valeurs, entree.filtres.limite, entree.filtres.decalage).all<T>(),
    entree.db.prepare(entree.sqlTotal).bind(...entree.valeurs).first<{ total: number }>(),
  ]);
  return {
    elements: resultat.results,
    total: total?.total ?? 0,
    limite: entree.filtres.limite,
    decalage: entree.filtres.decalage,
  };
}

function ajouterRecherche(conditions: string[], valeurs: (string | number)[], expression: string, recherche: string | undefined): void {
  if (!recherche) return;
  conditions.push(expression);
  valeurs.push(`%${recherche}%`);
}

function reponseErreurStock(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurStock) return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  const message = erreur instanceof Error ? erreur.message : "";
  if (/UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint|RATTACHEMENT_ENTREPOT_INVALIDE|MOUVEMENT_SANS_MUTATION_EFFECTIVE/iu.test(message)) {
    return c.json({ erreur: "Une référence existe déjà ou les données ne respectent pas les règles de gestion." }, 409);
  }
  console.error(JSON.stringify({ action: "operation_stock_refusee", chemin: c.req.path, type_erreur: typeErreurSecurise(erreur) }));
  return c.json({ erreur: "L’opération n’a pas pu être enregistrée." }, 500);
}

function lireCleIdempotence(c: Context<EnvironnementApplication>): string | null {
  const cle = c.req.header("X-Idempotency-Key");
  return cle && /^[A-Za-z0-9._:-]{16,160}$/u.test(cle) ? cle : null;
}

function construireAudit(
  c: Context<EnvironnementApplication>,
  action: string,
  entiteType: string,
  entiteId: string,
  donnees: unknown,
): D1PreparedStatement {
  return creerInstructionAudit(c.env.DB, {
    utilisateur: c.get("utilisateur"),
    action,
    entiteType,
    entiteId,
    adresseIp: c.req.header("CF-Connecting-IP") ?? null,
    donneesApres: JSON.stringify(donnees),
  });
}

function pageReponse<T>(c: Context<EnvironnementApplication>, page: Page<T>) {
  return c.json(page);
}

routesStocks.get("/categories-aide", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterRecherche(conditions, valeurs, "(code LIKE ? OR libelle LIKE ?)", filtres.recherche);
  if (filtres.recherche) valeurs.push(`%${filtres.recherche}%`);
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT id, code, libelle FROM categories_aide WHERE ${where} ORDER BY libelle LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM categories_aide WHERE ${where}`,
    selection: "categories_aide",
  }));
});

routesStocks.post("/categories-aide", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaCategorieAide);
  if (!entree) return c.json({ erreur: "Les données de la catégorie sont invalides." }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO categories_aide (id, code, libelle) VALUES (?, ?, ?)").bind(id, entree.code, entree.libelle),
      construireAudit(c, "CREATION_CATEGORIE_AIDE", "CATEGORIE_AIDE", id, entree),
    ]);
    return c.json({ id, ...entree }, 201);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.patch("/categories-aide/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaCategorieAide);
  if (!entree) return c.json({ erreur: "Les données de la catégorie sont invalides." }, 400);
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE categories_aide SET code = ?, libelle = ? WHERE id = ?").bind(entree.code, entree.libelle, c.req.param("id")),
      construireAudit(c, "MODIFICATION_CATEGORIE_AIDE", "CATEGORIE_AIDE", c.req.param("id"), entree),
    ]);
    if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Catégorie introuvable." }, 404);
    return c.json({ id: c.req.param("id"), ...entree });
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/unites-mesure", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  if (filtres.recherche) {
    conditions.push("(code LIKE ? OR libelle LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT id, code, libelle, decimales_autorisees FROM unites_mesure WHERE ${where} ORDER BY libelle LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM unites_mesure WHERE ${where}`,
    selection: "unites_mesure",
  }));
});

routesStocks.post("/unites-mesure", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaUniteMesure);
  if (!entree) return c.json({ erreur: "Les données de l’unité sont invalides." }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO unites_mesure (id, code, libelle, decimales_autorisees) VALUES (?, ?, ?, ?)")
        .bind(id, entree.code, entree.libelle, entree.decimales_autorisees),
      construireAudit(c, "CREATION_UNITE_MESURE", "UNITE_MESURE", id, entree),
    ]);
    return c.json({ id, ...entree }, 201);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.patch("/unites-mesure/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaUniteMesure);
  if (!entree) return c.json({ erreur: "Les données de l’unité sont invalides." }, 400);
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE unites_mesure SET code = ?, libelle = ?, decimales_autorisees = ? WHERE id = ?")
        .bind(entree.code, entree.libelle, entree.decimales_autorisees, c.req.param("id")),
      construireAudit(c, "MODIFICATION_UNITE_MESURE", "UNITE_MESURE", c.req.param("id"), entree),
    ]);
    if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Unité introuvable." }, 404);
    return c.json({ id: c.req.param("id"), ...entree });
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/conditionnements", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  if (filtres.recherche) { conditions.push("c.libelle LIKE ?"); valeurs.push(`%${filtres.recherche}%`); }
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT c.id, c.libelle, c.unite_base_id, u.code AS unite_code, u.libelle AS unite_libelle,
      c.facteur_conversion FROM conditionnements c INNER JOIN unites_mesure u ON u.id = c.unite_base_id
      WHERE ${where} ORDER BY c.libelle LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM conditionnements c WHERE ${where}`,
    selection: "conditionnements",
  }));
});

routesStocks.post("/conditionnements", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaConditionnement);
  if (!entree) return c.json({ erreur: "Les données du conditionnement sont invalides." }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO conditionnements (id, libelle, unite_base_id, facteur_conversion) VALUES (?, ?, ?, ?)")
        .bind(id, entree.libelle, entree.unite_base_id, entree.facteur_conversion),
      construireAudit(c, "CREATION_CONDITIONNEMENT", "CONDITIONNEMENT", id, entree),
    ]);
    return c.json({ id, ...entree }, 201);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.patch("/conditionnements/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaConditionnement);
  if (!entree) return c.json({ erreur: "Les données du conditionnement sont invalides." }, 400);
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE conditionnements SET libelle = ?, unite_base_id = ?, facteur_conversion = ? WHERE id = ?")
        .bind(entree.libelle, entree.unite_base_id, entree.facteur_conversion, c.req.param("id")),
      construireAudit(c, "MODIFICATION_CONDITIONNEMENT", "CONDITIONNEMENT", c.req.param("id"), entree),
    ]);
    if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Conditionnement introuvable." }, 404);
    return c.json({ id: c.req.param("id"), ...entree });
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/articles", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "a.categorie_id = ?", filtres.categorie_id);
  ajouterRecherche(conditions, valeurs, "(a.code_article LIKE ? OR a.designation LIKE ?)", filtres.recherche);
  if (filtres.recherche) valeurs.push(`%${filtres.recherche}%`);
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT a.id, a.code_article, a.designation, a.categorie_id, c.libelle AS categorie,
      a.unite_mesure_id, u.code AS unite_code, u.libelle AS unite, a.conditionnement_id,
      a.perissable, a.actif FROM articles a INNER JOIN categories_aide c ON c.id = a.categorie_id
      INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
      WHERE ${where} ORDER BY a.designation LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM articles a WHERE ${where}`,
    selection: "articles",
  }));
});

routesStocks.post("/articles", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaArticle);
  if (!entree) return c.json({ erreur: "Les données de l’article sont invalides." }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, conditionnement_id, perissable, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, entree.code_article, entree.designation, entree.categorie_id, entree.unite_mesure_id,
        entree.conditionnement_id ?? null, Number(entree.perissable), Number(entree.actif)),
      construireAudit(c, "CREATION_ARTICLE", "ARTICLE", id, entree),
    ]);
    return c.json({ id, ...entree }, 201);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.patch("/articles/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaArticle);
  if (!entree) return c.json({ erreur: "Les données de l’article sont invalides." }, 400);
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE articles SET code_article = ?, designation = ?, categorie_id = ?, unite_mesure_id = ?,
         conditionnement_id = ?, perissable = ?, actif = ? WHERE id = ?`,
      ).bind(entree.code_article, entree.designation, entree.categorie_id, entree.unite_mesure_id,
        entree.conditionnement_id ?? null, Number(entree.perissable), Number(entree.actif), c.req.param("id")),
      construireAudit(c, "MODIFICATION_ARTICLE", "ARTICLE", c.req.param("id"), entree),
    ]);
    if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Article introuvable." }, 404);
    return c.json({ id: c.req.param("id"), ...entree });
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/entrepots", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const portee = appliquerPorteeProvince(c, filtres);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "e.province_id = ?", portee.provinceId ?? undefined);
  ajouterRecherche(conditions, valeurs, "(e.code_entrepot LIKE ? OR e.nom LIKE ?)", filtres.recherche);
  if (filtres.recherche) valeurs.push(`%${filtres.recherche}%`);
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT e.id, e.code_entrepot, e.nom, e.niveau, e.province_id, p.nom AS province,
      e.localite_id, e.adresse_detaillee, e.capacite_indicative, e.responsable_nom,
      e.responsable_telephone, e.actif FROM entrepots e LEFT JOIN provinces p ON p.id = e.province_id
      WHERE ${where} ORDER BY e.niveau, e.nom LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM entrepots e WHERE ${where}`,
    selection: "entrepots",
  }));
});

routesStocks.post("/entrepots", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaEntrepot);
  if (!entree) return c.json({ erreur: "Les données de l’entrepôt sont invalides." }, 400);
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (Object.hasOwn(entree, "province_id")) return reponseInterdite(c);
    if (!utilisateur.province_id || entree.niveau !== "PROVINCIAL") return reponseInterdite(c);
  } else if (entree.niveau === "PROVINCIAL" && !entree.province_id) {
    return c.json({ erreur: "La province est obligatoire pour un entrepôt provincial." }, 400);
  } else if (entree.niveau === "CENTRAL" && (entree.province_id || entree.localite_id)) {
    return c.json({ erreur: "Un entrepôt central ne doit pas être rattaché à une province ou une localité." }, 400);
  }
  const id = crypto.randomUUID();
  const provinceId = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : (entree.province_id ?? null);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO entrepots
         (id, code_entrepot, nom, niveau, province_id, localite_id, adresse_detaillee,
          capacite_indicative, responsable_nom, responsable_telephone, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, entree.code_entrepot, entree.nom, entree.niveau, provinceId,
        entree.localite_id ?? null, entree.adresse_detaillee ?? null, entree.capacite_indicative ?? null,
        entree.responsable_nom ?? null, entree.responsable_telephone ?? null, Number(entree.actif)),
      construireAudit(c, "CREATION_ENTREPOT", "ENTREPOT", id, { ...entree, province_id: provinceId }),
    ]);
    return c.json({ id, ...entree, province_id: provinceId }, 201);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.patch("/entrepots/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const entree = await lireCorps(c, schemaEntrepot);
  if (!entree) return c.json({ erreur: "Les données de l’entrepôt sont invalides." }, 400);
  const avant = await c.env.DB.prepare(
    `SELECT id, niveau, province_id FROM entrepots
     WHERE id = ? AND (? <> 'DELEGUE_PROVINCIAL' OR province_id = ?)`
  ).bind(c.req.param("id"), utilisateur.role, utilisateur.province_id).first<{ id: string; niveau: string; province_id: string | null }>();
  if (!avant) return c.json({ erreur: "Entrepôt introuvable dans votre périmètre." }, 404);
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (Object.hasOwn(entree, "province_id") || entree.niveau !== "PROVINCIAL" || !utilisateur.province_id) return reponseInterdite(c);
  } else if ((entree.niveau === "PROVINCIAL" && !entree.province_id) || (entree.niveau === "CENTRAL" && (entree.province_id || entree.localite_id))) {
    return c.json({ erreur: "Le rattachement de l’entrepôt est invalide." }, 400);
  }
  const provinceId = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : (entree.province_id ?? null);
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE entrepots SET code_entrepot = ?, nom = ?, niveau = ?, province_id = ?, localite_id = ?,
         adresse_detaillee = ?, capacite_indicative = ?, responsable_nom = ?, responsable_telephone = ?, actif = ?
         WHERE id = ? AND (? <> 'DELEGUE_PROVINCIAL' OR province_id = ?)`,
      ).bind(entree.code_entrepot, entree.nom, entree.niveau, provinceId, entree.localite_id ?? null,
        entree.adresse_detaillee ?? null, entree.capacite_indicative ?? null, entree.responsable_nom ?? null,
        entree.responsable_telephone ?? null, Number(entree.actif), avant.id, utilisateur.role, utilisateur.province_id),
      construireAudit(c, "MODIFICATION_ENTREPOT", "ENTREPOT", avant.id, { ...entree, province_id: provinceId }),
    ]);
    if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Entrepôt introuvable dans votre périmètre." }, 404);
    return c.json({ id: avant.id, ...entree, province_id: provinceId });
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/lots-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const portee = appliquerPorteeProvince(c, filtres);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "l.province_id = ?", portee.provinceId ?? undefined);
  ajouterCondition(conditions, valeurs, "l.entrepot_id = ?", filtres.entrepot_id);
  ajouterCondition(conditions, valeurs, "l.article_id = ?", filtres.article_id);
  ajouterRecherche(conditions, valeurs, "(l.numero_lot LIKE ? OR a.code_article LIKE ? OR a.designation LIKE ?)", filtres.recherche);
  if (filtres.recherche) { valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`); }
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT l.id, l.numero_lot, l.article_id, a.code_article, a.designation AS article,
      l.entrepot_id, e.nom AS entrepot, l.province_id, l.source_type, l.source_reference_id,
      l.partenaire_bailleur_id, l.date_peremption, l.etat_qualite, l.quantite_initiale,
      l.quantite_physique, l.quantite_reservee, l.quantite_physique - l.quantite_reservee AS quantite_disponible,
      l.cree_le FROM lots_stock l INNER JOIN articles a ON a.id = l.article_id
      INNER JOIN entrepots e ON e.id = l.entrepot_id WHERE ${where}
      ORDER BY l.date_peremption IS NULL, l.date_peremption, l.cree_le DESC, l.id LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM lots_stock l INNER JOIN articles a ON a.id = l.article_id WHERE ${where}`,
    selection: "lots_stock",
  }));
});

routesStocks.get("/soldes-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const portee = appliquerPorteeProvince(c, filtres);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "s.province_id = ?", portee.provinceId ?? undefined);
  ajouterCondition(conditions, valeurs, "s.entrepot_id = ?", filtres.entrepot_id);
  ajouterCondition(conditions, valeurs, "s.article_id = ?", filtres.article_id);
  ajouterCondition(conditions, valeurs, "a.categorie_id = ?", filtres.categorie_id);
  ajouterRecherche(conditions, valeurs, "(a.code_article LIKE ? OR a.designation LIKE ? OR e.nom LIKE ?)", filtres.recherche);
  if (filtres.recherche) { valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`); }
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT s.id, s.entrepot_id, e.nom AS entrepot, s.province_id, s.article_id,
      a.code_article, a.designation AS article, c.libelle AS categorie, u.code AS unite,
      s.quantite_physique, s.quantite_reservee, s.quantite_disponible AS quantite_non_reservee,
      COALESCE(SUM(CASE WHEN l.etat_qualite = 'BON'
        AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
        THEN l.quantite_physique - l.quantite_reservee ELSE 0 END), 0) AS quantite_distribuable,
      s.seuil_alerte, s.derniere_maj
      FROM soldes_stock s INNER JOIN entrepots e ON e.id = s.entrepot_id
      INNER JOIN articles a ON a.id = s.article_id INNER JOIN categories_aide c ON c.id = a.categorie_id
      INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
      LEFT JOIN lots_stock l ON l.entrepot_id = s.entrepot_id AND l.article_id = s.article_id
      WHERE ${where} GROUP BY s.id, e.nom, a.code_article, a.designation, c.libelle, u.code
      ORDER BY e.nom, a.designation LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM soldes_stock s INNER JOIN entrepots e ON e.id = s.entrepot_id
      INNER JOIN articles a ON a.id = s.article_id WHERE ${where}`,
    selection: "soldes_stock",
  }));
});

routesStocks.get("/receptions-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const portee = appliquerPorteeProvince(c, filtres);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "r.province_id = ?", portee.provinceId ?? undefined);
  ajouterCondition(conditions, valeurs, "r.entrepot_id = ?", filtres.entrepot_id);
  ajouterRecherche(conditions, valeurs, "(r.reference_reception LIKE ? OR r.numero_bordereau_externe LIKE ?)", filtres.recherche);
  if (filtres.recherche) valeurs.push(`%${filtres.recherche}%`);
  ajouterCondition(conditions, valeurs, "r.date_reception >= ?", filtres.date_debut);
  ajouterCondition(conditions, valeurs, "r.date_reception <= ?", filtres.date_fin);
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT r.id, r.reference_reception, r.entrepot_id, e.nom AS entrepot, r.province_id,
      r.type_entree, r.partenaire_id, p.nom AS partenaire, r.date_reception, r.numero_bordereau_externe,
      r.observations, r.enregistre_par, u.nom_complet AS auteur, r.cree_le,
      (SELECT COUNT(*) FROM lignes_reception lr WHERE lr.reception_stock_id = r.id) AS nombre_lignes
      FROM receptions_stock r INNER JOIN entrepots e ON e.id = r.entrepot_id
      LEFT JOIN partenaires p ON p.id = r.partenaire_id INNER JOIN utilisateurs u ON u.id = r.enregistre_par
      WHERE ${where} ORDER BY r.date_reception DESC, r.id LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM receptions_stock r WHERE ${where}`,
    selection: "receptions_stock",
  }));
});

routesStocks.get("/receptions-stock/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const conditions = utilisateur.role === "DELEGUE_PROVINCIAL" ? " AND r.province_id = ?" : "";
  const valeurs = conditions ? [c.req.param("id"), utilisateur.province_id] : [c.req.param("id")];
  const reception = await c.env.DB.prepare(
    `SELECT r.id, r.reference_reception, r.entrepot_id, e.nom AS entrepot, r.province_id,
      r.type_entree, r.partenaire_id, p.nom AS partenaire, r.date_reception, r.numero_bordereau_externe,
      r.observations, r.enregistre_par, u.nom_complet AS auteur, r.cree_le
     FROM receptions_stock r INNER JOIN entrepots e ON e.id = r.entrepot_id
     LEFT JOIN partenaires p ON p.id = r.partenaire_id INNER JOIN utilisateurs u ON u.id = r.enregistre_par
     WHERE r.id = ?${conditions}`,
  ).bind(...valeurs).first<Record<string, unknown>>();
  if (!reception) return c.json({ erreur: "Réception introuvable dans votre périmètre." }, 404);
  const lignes = await c.env.DB.prepare(
    `SELECT lr.id, lr.article_id, a.code_article, a.designation AS article, lr.lot_stock_id,
      l.numero_lot, lr.quantite_recue, lr.quantite_acceptee, lr.quantite_endommagee, lr.date_peremption
     FROM lignes_reception lr INNER JOIN articles a ON a.id = lr.article_id
     INNER JOIN lots_stock l ON l.id = lr.lot_stock_id WHERE lr.reception_stock_id = ? ORDER BY lr.id`,
  ).bind(c.req.param("id")).all<Record<string, unknown>>();
  return c.json({ ...reception, lignes: lignes.results });
});

routesStocks.post("/receptions-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaReceptionStock);
  if (!entree) return c.json({ erreur: "Les données de la réception sont invalides." }, 400);
  try {
    const resultat = await enregistrerReceptionStock(c.env.DB, utilisateur, entree, cle, c.req.header("CF-Connecting-IP") ?? null);
    c.header("Idempotency-Replayed", resultat.rejouee ? "true" : "false");
    return c.json(resultat.corps, resultat.statutHttp === 201 ? 201 : 200);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/ajustements-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const portee = appliquerPorteeProvince(c, filtres);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "a.province_id = ?", portee.provinceId ?? undefined);
  ajouterCondition(conditions, valeurs, "a.entrepot_id = ?", filtres.entrepot_id);
  ajouterCondition(conditions, valeurs, "a.article_id = ?", filtres.article_id);
  ajouterRecherche(conditions, valeurs, "(a.reference_ajustement LIKE ? OR a.motif_detaille LIKE ?)", filtres.recherche);
  if (filtres.recherche) valeurs.push(`%${filtres.recherche}%`);
  ajouterCondition(conditions, valeurs, "a.cree_le >= ?", filtres.date_debut);
  ajouterCondition(conditions, valeurs, "a.cree_le <= ?", filtres.date_fin);
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT a.id, a.reference_ajustement, a.entrepot_id, e.nom AS entrepot, a.province_id,
      a.article_id, ar.code_article, ar.designation AS article, a.lot_stock_id, l.numero_lot,
      a.type_ajustement, a.ecart_quantite, a.motif_detaille, a.auteur_id, u.nom_complet AS auteur, a.cree_le
      FROM ajustements_stock a INNER JOIN entrepots e ON e.id = a.entrepot_id
      INNER JOIN articles ar ON ar.id = a.article_id INNER JOIN lots_stock l ON l.id = a.lot_stock_id
      INNER JOIN utilisateurs u ON u.id = a.auteur_id WHERE ${where}
      ORDER BY a.cree_le DESC, a.id LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM ajustements_stock a WHERE ${where}`,
    selection: "ajustements_stock",
  }));
});

routesStocks.post("/ajustements-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaAjustementStock);
  if (!entree) return c.json({ erreur: "Les données de l’ajustement sont invalides." }, 400);
  try {
    const resultat = await enregistrerAjustementStock(c.env.DB, utilisateur, entree, cle, c.req.header("CF-Connecting-IP") ?? null);
    c.header("Idempotency-Replayed", resultat.rejouee ? "true" : "false");
    return c.json(resultat.corps, resultat.statutHttp === 201 ? 201 : 200);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

routesStocks.get("/mouvements-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const portee = appliquerPorteeProvince(c, filtres);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "m.province_id = ?", portee.provinceId ?? undefined);
  ajouterCondition(conditions, valeurs, "m.entrepot_id = ?", filtres.entrepot_id);
  ajouterCondition(conditions, valeurs, "m.article_id = ?", filtres.article_id);
  ajouterCondition(conditions, valeurs, "m.type_mouvement = ?", filtres.type_mouvement);
  ajouterCondition(conditions, valeurs, "m.cree_le >= ?", filtres.date_debut);
  ajouterCondition(conditions, valeurs, "m.cree_le <= ?", filtres.date_fin);
  ajouterRecherche(conditions, valeurs, "(m.reference_mouvement LIKE ? OR m.motif LIKE ?)", filtres.recherche);
  if (filtres.recherche) valeurs.push(`%${filtres.recherche}%`);
  const where = conditions.join(" AND ");
  return pageReponse(c, await lirePage({
    db: c.env.DB, utilisateur, filtres, valeurs,
    sql: `SELECT m.id, m.reference_mouvement, m.entrepot_id, e.nom AS entrepot, m.province_id,
      m.article_id, a.code_article, a.designation AS article, m.lot_stock_id, l.numero_lot,
      m.type_mouvement, m.sens, m.quantite, m.solde_physique_avant, m.solde_physique_apres,
      m.document_source_type, m.document_source_id, m.motif, m.auteur_id, u.nom_complet AS auteur, m.cree_le
      FROM mouvements_stock m INNER JOIN entrepots e ON e.id = m.entrepot_id
      INNER JOIN articles a ON a.id = m.article_id INNER JOIN lots_stock l ON l.id = m.lot_stock_id
      INNER JOIN utilisateurs u ON u.id = m.auteur_id WHERE ${where}
      ORDER BY m.cree_le DESC, m.id LIMIT ? OFFSET ?`,
    sqlTotal: `SELECT COUNT(*) AS total FROM mouvements_stock m WHERE ${where}`,
    selection: "mouvements_stock",
  }));
});

routesStocks.get("/mouvements-stock/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const condition = utilisateur.role === "DELEGUE_PROVINCIAL" ? " AND m.province_id = ?" : "";
  const valeurs = condition ? [c.req.param("id"), utilisateur.province_id] : [c.req.param("id")];
  const mouvement = await c.env.DB.prepare(
    `SELECT m.id, m.reference_mouvement, m.entrepot_id, e.nom AS entrepot, m.province_id,
      m.article_id, a.code_article, a.designation AS article, m.lot_stock_id, l.numero_lot,
      m.type_mouvement, m.sens, m.quantite, m.solde_physique_avant, m.solde_physique_apres,
      m.document_source_type, m.document_source_id, m.motif, m.auteur_id, u.nom_complet AS auteur, m.cree_le
     FROM mouvements_stock m INNER JOIN entrepots e ON e.id = m.entrepot_id
     INNER JOIN articles a ON a.id = m.article_id INNER JOIN lots_stock l ON l.id = m.lot_stock_id
     INNER JOIN utilisateurs u ON u.id = m.auteur_id WHERE m.id = ?${condition}`,
  ).bind(...valeurs).first<Record<string, unknown>>();
  if (!mouvement) return c.json({ erreur: "Mouvement introuvable dans votre périmètre." }, 404);
  return c.json(mouvement);
});

routesStocks.post("/transferts-stock", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaTransfertStock);
  if (!entree) return c.json({ erreur: "Les données du transfert sont invalides." }, 400);
  try {
    const resultat = await enregistrerTransfertStock(c.env.DB, utilisateur, entree, cle, c.req.header("CF-Connecting-IP") ?? null);
    c.header("Idempotency-Replayed", resultat.rejouee ? "true" : "false");
    return c.json(resultat.corps, resultat.statutHttp === 201 ? 201 : 200);
  } catch (erreur) { return reponseErreurStock(c, erreur); }
});

export { routesStocks };
