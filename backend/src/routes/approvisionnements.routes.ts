import { Hono, type Context } from "hono";
import { z } from "zod";
import type { EnvironnementApplication, UtilisateurSession } from "../bindings";
import {
  cloturerApprovisionnementCentral,
  creerApprovisionnementCentral,
  creerExpeditionApprovisionnement,
  obtenirPvReception,
  rapprocherEcartsApprovisionnement,
  recevoirExpeditionProvinciale,
  televerserPvReception,
  validerApprovisionnementCentral,
} from "../services/approvisionnement.service";
import { ErreurStock } from "../services/stock.service";
import {
  schemaClotureApprovisionnement,
  schemaCreationApprovisionnement,
  schemaCreationExpedition,
  schemaPaginationApprovisionnements,
  schemaRapprochementApprovisionnement,
  schemaReceptionProvinciale,
} from "../../../shared/validations/approvisionnements";

const routesLecture = new Hono<EnvironnementApplication>();
const routesCentrales = new Hono<EnvironnementApplication>();
const routesProvinciales = new Hono<EnvironnementApplication>();
const ROLES_LECTURE = ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
const schemaPageExpedition = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(40).optional(),
  statut: z.enum(["EN_ROUTE", "RECEPTIONNEE", "RECEPTIONNEE_AVEC_ECART"]).optional(),
});
const schemaPageEntrepot = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(40).optional(),
});

interface Page<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface ApprovisionnementListeD1 {
  id: string;
  reference: string;
  intitule_operation: string;
  date_creation: string;
  source_articles: string;
  nature_aide: string;
  statut: string;
  nombre_destinations: number;
  nombre_expeditions: number;
}

function reponseInterdite(c: Context<EnvironnementApplication>) {
  return c.json({ erreur: "Accès refusé pour cette opération." }, 403);
}

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurStock) {
    return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (/UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint|APPROVISIONNEMENT_|EXPEDITION_|RECEPTION_PROVINCIALE_|LIGNE_|MOUVEMENT_SANS_MUTATION_EFFECTIVE/iu.test(message)) {
    return c.json({ erreur: "Les données ne respectent pas les règles de gestion ou une opération concurrente a été enregistrée." }, 409);
  }
  console.error(JSON.stringify({ action: "operation_approvisionnement_refusee", chemin: c.req.path,
    erreur: message }));
  return c.json({ erreur: "L’opération d’approvisionnement n’a pas pu être enregistrée." }, 500);
}

function lireCleIdempotence(c: Context<EnvironnementApplication>): string | null {
  const cle = c.req.header("X-Idempotency-Key");
  return cle && /^[A-Za-z0-9._:-]{16,160}$/u.test(cle) ? cle : null;
}

function lireFiltres<T>(
  c: Context<EnvironnementApplication>,
  schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false } },
): T | null {
  const resultat = schema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  return resultat.success ? resultat.data : null;
}

async function lireCorps<T>(
  c: Context<EnvironnementApplication>,
  schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false } },
): Promise<T | null> {
  let corps: unknown;
  try { corps = await c.req.json(); } catch { return null; }
  const resultat = schema.safeParse(corps);
  return resultat.success ? resultat.data : null;
}

function resultatOperation<T>(c: Context<EnvironnementApplication>, resultat: {
  statutHttp: number; corps: T; rejouee: boolean;
}) {
  c.header("Idempotency-Replayed", resultat.rejouee ? "true" : "false");
  return c.json(resultat.corps, resultat.statutHttp === 201 ? 201 : 200);
}

async function lirePage<T>(
  c: Context<EnvironnementApplication>,
  sqlListe: string,
  sqlTotal: string,
  valeursListe: readonly (string | number)[],
  valeursTotal: readonly (string | number)[],
  limite: number,
  decalage: number,
): Promise<Page<T>> {
  const [liste, total] = await Promise.all([
    c.env.DB.prepare(sqlListe).bind(...valeursListe, limite, decalage).all<T>(),
    c.env.DB.prepare(sqlTotal).bind(...valeursTotal).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite, decalage };
}

function autoriseLecture(utilisateur: UtilisateurSession): boolean {
  return ROLES_LECTURE.includes(utilisateur.role);
}

function reponsePage<T>(c: Context<EnvironnementApplication>, page: Page<T>) {
  return c.json(page);
}

routesLecture.get("/", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const filtres = lireFiltres(c, schemaPaginationApprovisionnements);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination ou de filtrage sont invalides." }, 400);
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  if (estDelegue && (!utilisateur.province_id || (filtres.province_id && filtres.province_id !== utilisateur.province_id))) {
    return reponseInterdite(c);
  }
  const provinceId = estDelegue ? utilisateur.province_id : filtres.province_id ?? null;
  const jointureProvince = provinceId ? " AND d.province_id = ?" : "";
  const valeursJointure = provinceId ? [provinceId] : [];
  const conditionsListe: string[] = [];
  const conditionsTotal: string[] = [];
  const valeursListe: (string | number)[] = [...valeursJointure];
  const valeursTotal: (string | number)[] = [];
  if (provinceId) {
    conditionsListe.push("d.id IS NOT NULL");
    conditionsTotal.push("EXISTS (SELECT 1 FROM destinations_approvisionnement dp WHERE dp.approvisionnement_id = a.id AND dp.province_id = ?)");
    valeursTotal.push(provinceId);
  }
  if (filtres.statut) {
    conditionsListe.push(estDelegue ? "d.statut_destination = ?" : "a.statut = ?");
    valeursListe.push(filtres.statut);
    if (estDelegue && provinceId) {
      conditionsTotal.push(`EXISTS (
        SELECT 1 FROM destinations_approvisionnement ds
        WHERE ds.approvisionnement_id = a.id AND ds.province_id = ? AND ds.statut_destination = ?
      )`);
      valeursTotal.push(provinceId, filtres.statut);
    } else {
      conditionsTotal.push("a.statut = ?");
      valeursTotal.push(filtres.statut);
    }
  }
  if (filtres.recherche) {
    conditionsListe.push("(a.reference LIKE ? OR a.intitule_operation LIKE ?)");
    valeursListe.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
    conditionsTotal.push("(a.reference LIKE ? OR a.intitule_operation LIKE ?)");
    valeursTotal.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const whereListe = conditionsListe.length > 0 ? `WHERE ${conditionsListe.join(" AND ")}` : "";
  const whereTotal = conditionsTotal.length > 0 ? `WHERE ${conditionsTotal.join(" AND ")}` : "";
  const statutSelection = estDelegue ? "COALESCE(d.statut_destination, 'PLANIFIEE')" : "a.statut";
  const liste = await lirePage<ApprovisionnementListeD1>(
    c,
    `SELECT a.id, a.reference, a.intitule_operation, a.date_creation, a.source_articles,
       a.nature_aide, ${statutSelection} AS statut,
       COUNT(DISTINCT d.id) AS nombre_destinations, COUNT(DISTINCT e.id) AS nombre_expeditions
     FROM approvisionnements_centraux a
     LEFT JOIN destinations_approvisionnement d ON d.approvisionnement_id = a.id${jointureProvince}
     LEFT JOIN expeditions e ON e.destination_id = d.id
     ${whereListe}
     GROUP BY a.id ORDER BY a.date_creation DESC, a.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM approvisionnements_centraux a ${whereTotal}`,
    valeursListe,
    valeursTotal,
    filtres.limite,
    filtres.decalage,
  );
  return reponsePage(c, liste);
});

routesLecture.get("/:id/destinations", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const filtres = lireFiltres(c, schemaPaginationApprovisionnements);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["d.approvisionnement_id = ?"];
  const valeurs: (string | number)[] = [c.req.param("id")];
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || (filtres.province_id && filtres.province_id !== utilisateur.province_id)) {
      return reponseInterdite(c);
    }
    conditions.push("d.province_id = ?");
    valeurs.push(utilisateur.province_id);
  } else if (filtres.province_id) {
    conditions.push("d.province_id = ?");
    valeurs.push(filtres.province_id);
  }
  const where = conditions.join(" AND ");
  return reponsePage(c, await lirePage(
    c,
    `SELECT d.id, d.province_id, p.nom AS province, d.statut_destination,
       COUNT(aa.id) AS nombre_articles
     FROM destinations_approvisionnement d
     INNER JOIN provinces p ON p.id = d.province_id
     LEFT JOIN articles_approvisionnement aa ON aa.destination_id = d.id
     WHERE ${where} GROUP BY d.id ORDER BY p.nom, d.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM destinations_approvisionnement d WHERE ${where}`,
    valeurs, valeurs, filtres.limite, filtres.decalage,
  ));
});

routesLecture.get("/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  const approvisionnement = await c.env.DB.prepare(
    `SELECT a.id, a.reference, a.intitule_operation, a.date_creation, a.description,
       a.source_articles, a.partenaire_id, a.nature_aide, a.date_prevue_expedition,
       a.instructions, ${estDelegue ? "d.statut_destination" : "a.statut"} AS statut,
       ${estDelegue ? "d.id AS destination_id, d.province_id" : "NULL AS destination_id, NULL AS province_id"}
     FROM approvisionnements_centraux a
     ${estDelegue ? "INNER JOIN destinations_approvisionnement d ON d.approvisionnement_id = a.id AND d.province_id = ?" : ""}
     WHERE a.id = ?`,
  ).bind(...(estDelegue ? [utilisateur.province_id, c.req.param("id")] : [c.req.param("id")])).first<Record<string, unknown>>();
  if (!approvisionnement) return c.json({ erreur: "Approvisionnement introuvable dans votre périmètre." }, 404);
  return c.json(approvisionnement);
});

routesLecture.get("/:id/repartition", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const filtres = lireFiltres(c, schemaPaginationApprovisionnements);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  if (estDelegue && !utilisateur.province_id) return reponseInterdite(c);
  if (estDelegue && filtres.province_id && filtres.province_id !== utilisateur.province_id) return reponseInterdite(c);
  const provinceId = estDelegue ? utilisateur.province_id : filtres.province_id ?? null;
  const conditions = ["aa.approvisionnement_id = ?"];
  const valeurs: (string | number)[] = [c.req.param("id")];
  if (provinceId) { conditions.push("aa.province_id = ?"); valeurs.push(provinceId); }
  const where = conditions.join(" AND ");
  const page = await lirePage(
    c,
    `SELECT aa.id, aa.destination_id, aa.province_id, p.nom AS province,
       aa.article_id, a.code_article, a.designation AS article, aa.quantite_allouee,
       aa.quantite_expediee, aa.quantite_receptionnee_acceptee,
       aa.quantite_allouee - aa.quantite_expediee AS quantite_restante
     FROM articles_approvisionnement aa
     INNER JOIN provinces p ON p.id = aa.province_id
     INNER JOIN articles a ON a.id = aa.article_id
     WHERE ${where} ORDER BY p.nom, a.designation, aa.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM articles_approvisionnement aa WHERE ${where}`,
    valeurs,
    valeurs,
    filtres.limite,
    filtres.decalage,
  );
  return reponsePage(c, page);
});

routesLecture.get("/:id/expeditions", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const filtres = lireFiltres(c, schemaPageExpedition);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  if (estDelegue && !utilisateur.province_id) return reponseInterdite(c);
  const conditions = ["e.approvisionnement_id = ?"];
  const valeurs: (string | number)[] = [c.req.param("id")];
  if (estDelegue) { conditions.push("e.province_destinataire_id = ?"); valeurs.push(utilisateur.province_id ?? ""); }
  if (filtres.statut) { conditions.push("e.statut_expedition = ?"); valeurs.push(filtres.statut); }
  if (filtres.recherche) {
    conditions.push("(e.reference_expedition LIKE ? OR e.reference_bordereau LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.join(" AND ");
  const page = await lirePage(
    c,
    `SELECT e.id, e.reference_expedition, e.province_destinataire_id, p.nom AS province,
       e.date_expedition, e.origine_expedition, e.reference_bordereau, e.statut_expedition,
       COUNT(DISTINCT le.id) AS nombre_lignes, r.id AS reception_id, r.statut_rapprochement
     FROM expeditions e INNER JOIN provinces p ON p.id = e.province_destinataire_id
     LEFT JOIN lignes_expedition le ON le.expedition_id = e.id
     LEFT JOIN receptions_provinciales r ON r.expedition_id = e.id
     WHERE ${where}
     GROUP BY e.id ORDER BY e.date_expedition DESC, e.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM expeditions e WHERE ${where}`,
    valeurs,
    valeurs,
    filtres.limite,
    filtres.decalage,
  );
  return reponsePage(c, page);
});

routesLecture.get("/:id/receptions", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const filtres = lireFiltres(c, schemaPageExpedition);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["r.approvisionnement_id = ?"];
  const valeurs: (string | number)[] = [c.req.param("id")];
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id) return reponseInterdite(c);
    conditions.push("r.province_id = ?");
    valeurs.push(utilisateur.province_id);
  }
  if (filtres.recherche) {
    conditions.push("(r.reference_reception_prov LIKE ? OR e.reference_expedition LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.join(" AND ");
  const page = await lirePage(
    c,
    `SELECT r.id, r.reference_reception_prov, r.expedition_id, r.province_id, p.nom AS province,
       r.date_reception, r.numero_pv_reception, r.comporte_ecarts, r.statut_rapprochement,
       e.reference_expedition, e.statut_expedition
     FROM receptions_provinciales r INNER JOIN expeditions e ON e.id = r.expedition_id
     INNER JOIN provinces p ON p.id = r.province_id
     WHERE ${where} ORDER BY r.date_reception DESC, r.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM receptions_provinciales r INNER JOIN expeditions e ON e.id = r.expedition_id WHERE ${where}`,
    valeurs,
    valeurs,
    filtres.limite,
    filtres.decalage,
  );
  return reponsePage(c, page);
});

routesLecture.get("/:id/receptions/:receptionId", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autoriseLecture(utilisateur)) return reponseInterdite(c);
  const provinceCondition = utilisateur.role === "DELEGUE_PROVINCIAL" ? " AND r.province_id = ?" : "";
  const parametres = utilisateur.role === "DELEGUE_PROVINCIAL"
    ? [c.req.param("receptionId"), c.req.param("id"), utilisateur.province_id]
    : [c.req.param("receptionId"), c.req.param("id")];
  const reception = await c.env.DB.prepare(
    `SELECT r.id, r.reference_reception_prov, r.expedition_id, r.approvisionnement_id,
       r.province_id, p.nom AS province, r.entrepot_recepteur_id, w.nom AS entrepot_recepteur,
       r.reception_stock_id, r.date_reception, r.numero_pv_reception, r.comporte_ecarts,
       r.statut_rapprochement, r.observations, r.pv_piece_jointe_id,
       e.reference_expedition, e.statut_expedition
     FROM receptions_provinciales r
     INNER JOIN expeditions e ON e.id = r.expedition_id
     INNER JOIN provinces p ON p.id = r.province_id
     INNER JOIN entrepots w ON w.id = r.entrepot_recepteur_id
     WHERE r.id = ? AND r.approvisionnement_id = ?${provinceCondition}`,
  ).bind(...parametres).first<Record<string, unknown>>();
  if (!reception) return c.json({ erreur: "Réception introuvable dans votre périmètre." }, 404);
  const lignes = await c.env.DB.prepare(
    `SELECT lr.id, lr.ligne_expedition_id, lr.article_id, a.code_article, a.designation AS article,
       lr.quantite_expediee, lr.quantite_recue_physique, lr.quantite_acceptee,
       lr.quantite_endommagee, lr.quantite_manquante, lr.lot_cree_id, lb.numero_lot AS lot_accepte,
       lr.lot_endommage_id, ld.numero_lot AS lot_endommage, lr.justification_ecart
     FROM lignes_reception_provinciale lr
     INNER JOIN articles a ON a.id = lr.article_id
     LEFT JOIN lots_stock lb ON lb.id = lr.lot_cree_id
     LEFT JOIN lots_stock ld ON ld.id = lr.lot_endommage_id
     WHERE lr.reception_provinciale_id = ? ORDER BY a.designation, lr.id`,
  ).bind(c.req.param("receptionId")).all<Record<string, unknown>>();
  return c.json({ ...reception, lignes: lignes.results });
});

routesCentrales.get("/referentiels/entrepots-centraux", async (c) => {
  const filtres = lireFiltres(c, schemaPageEntrepot);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["niveau = 'CENTRAL'", "actif = 1", "province_id IS NULL"];
  const valeurs: (string | number)[] = [];
  if (filtres.recherche) {
    conditions.push("(code_entrepot LIKE ? OR nom LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.join(" AND ");
  return reponsePage(c, await lirePage(
    c,
    `SELECT id, code_entrepot, nom FROM entrepots WHERE ${where} ORDER BY nom, id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM entrepots WHERE ${where}`,
    valeurs, valeurs, filtres.limite, filtres.decalage,
  ));
});

routesCentrales.post("/", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaCreationApprovisionnement);
  if (!entree) return c.json({ erreur: "Les données de l’approvisionnement sont invalides." }, 400);
  try {
    return resultatOperation(c, await creerApprovisionnementCentral(
      c.env.DB, c.get("utilisateur"), entree, cle, c.req.header("CF-Connecting-IP") ?? null,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesCentrales.post("/:id/validation", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return resultatOperation(c, await validerApprovisionnementCentral(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), cle, c.req.header("CF-Connecting-IP") ?? null,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesCentrales.post("/:id/expeditions", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaCreationExpedition);
  if (!entree) return c.json({ erreur: "Les données de l’expédition sont invalides." }, 400);
  try {
    return resultatOperation(c, await creerExpeditionApprovisionnement(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle,
      c.req.header("CF-Connecting-IP") ?? null,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesCentrales.post("/:id/receptions/:receptionId/rapprochement", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaRapprochementApprovisionnement);
  if (!entree) return c.json({ erreur: "Les justifications des écarts sont invalides." }, 400);
  try {
    return resultatOperation(c, await rapprocherEcartsApprovisionnement(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), c.req.param("receptionId"), entree,
      cle, c.req.header("CF-Connecting-IP") ?? null,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesCentrales.post("/:id/cloture", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaClotureApprovisionnement);
  if (!entree) return c.json({ erreur: "Les observations de clôture sont invalides." }, 400);
  try {
    return resultatOperation(c, await cloturerApprovisionnementCentral(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle,
      c.req.header("CF-Connecting-IP") ?? null,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesProvinciales.get("/", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) return reponseInterdite(c);
  const filtres = lireFiltres(c, schemaPageExpedition);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const conditions = ["e.province_destinataire_id = ?"];
  const valeurs: (string | number)[] = [utilisateur.province_id];
  if (filtres.statut) { conditions.push("e.statut_expedition = ?"); valeurs.push(filtres.statut); }
  if (filtres.recherche) {
    conditions.push("(e.reference_expedition LIKE ? OR e.reference_bordereau LIKE ? OR a.reference LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.join(" AND ");
  return reponsePage(c, await lirePage(
    c,
    `SELECT e.id, e.reference_expedition, e.approvisionnement_id, a.reference AS reference_approvisionnement,
       a.intitule_operation, e.date_expedition, e.origine_expedition, e.reference_bordereau,
       e.statut_expedition, COUNT(DISTINCT le.id) AS nombre_lignes,
       r.id AS reception_id, r.statut_rapprochement
     FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
     LEFT JOIN lignes_expedition le ON le.expedition_id = e.id
     LEFT JOIN receptions_provinciales r ON r.expedition_id = e.id
     WHERE ${where} GROUP BY e.id ORDER BY e.date_expedition DESC, e.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id WHERE ${where}`,
    valeurs, valeurs, filtres.limite, filtres.decalage,
  ));
});

routesProvinciales.get("/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) return reponseInterdite(c);
  const expedition = await c.env.DB.prepare(
    `SELECT e.id, e.reference_expedition, e.approvisionnement_id, a.reference AS reference_approvisionnement,
       a.intitule_operation, e.province_destinataire_id, e.date_expedition, e.origine_expedition,
       e.reference_bordereau, e.informations_transport, e.statut_expedition,
       r.id AS reception_id, r.reference_reception_prov, r.statut_rapprochement,
       r.numero_pv_reception, r.pv_piece_jointe_id
     FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
     LEFT JOIN receptions_provinciales r ON r.expedition_id = e.id
     WHERE e.id = ? AND e.province_destinataire_id = ?`,
  ).bind(c.req.param("id"), utilisateur.province_id).first<Record<string, unknown>>();
  if (!expedition) return c.json({ erreur: "Expédition introuvable dans votre province." }, 404);
  const lignes = await c.env.DB.prepare(
    `SELECT le.id, le.article_approvisionnement_id, le.article_id,
       a.code_article, a.designation AS article, le.numero_lot_fournisseur,
       COALESCE(le.date_peremption, l.date_peremption) AS date_peremption,
       le.quantite_expediee, le.lot_origine_id
     FROM lignes_expedition le INNER JOIN articles a ON a.id = le.article_id
     LEFT JOIN lots_stock l ON l.id = le.lot_origine_id
     WHERE le.expedition_id = ? ORDER BY a.designation, le.id`,
  ).bind(c.req.param("id")).all<Record<string, unknown>>();
  const reception = expedition.reception_id
    ? await c.env.DB.prepare(
      `SELECT lr.id, lr.ligne_expedition_id, lr.article_id, lr.quantite_expediee,
         lr.quantite_recue_physique, lr.quantite_acceptee, lr.quantite_endommagee,
         lr.quantite_manquante, lr.justification_ecart
       FROM lignes_reception_provinciale lr
       WHERE lr.reception_provinciale_id = ? ORDER BY lr.id`,
    ).bind(expedition.reception_id).all<Record<string, unknown>>()
    : null;
  return c.json({ ...expedition, lignes: lignes.results, reception: reception?.results ?? null });
});

routesProvinciales.post("/:id/pv", async (c) => {
  const utilisateur = c.get("utilisateur");
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  let formulaire: FormData;
  try { formulaire = await c.req.raw.formData(); } catch { return c.json({ erreur: "Le formulaire du procès-verbal est invalide." }, 400); }
  const fichier = formulaire.get("fichier");
  if (!(fichier instanceof File)) return c.json({ erreur: "Sélectionnez un fichier de procès-verbal." }, 400);
  try {
    const resultat = await televerserPvReception(
      c.env.DB, c.env.BUCKET, utilisateur, c.req.param("id"), fichier, cle,
      c.req.header("CF-Connecting-IP") ?? null,
    );
    c.header("Idempotency-Replayed", "false");
    return c.json(resultat, 201);
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesProvinciales.get("/:id/pv", async (c) => {
  const utilisateur = c.get("utilisateur");
  try {
    const pv = await obtenirPvReception(c.env.DB, c.env.BUCKET, utilisateur, c.req.param("id"));
    const nom = encodeURIComponent(pv.nom_fichier_original).replaceAll("%20", "%20");
    return new Response(pv.corps, {
      headers: {
        "Content-Type": pv.type_mime,
        "Content-Length": String(pv.taille_octets),
        "Content-Disposition": `attachment; filename*=UTF-8''${nom}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesProvinciales.post("/:id/reception", async (c) => {
  const utilisateur = c.get("utilisateur");
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaReceptionProvinciale);
  if (!entree) return c.json({ erreur: "Les données de réception sont invalides." }, 400);
  if (!utilisateur.province_id) return reponseInterdite(c);
  try {
    return resultatOperation(c, await recevoirExpeditionProvinciale(
      c.env.DB, utilisateur, c.req.param("id"), utilisateur.province_id, entree, cle,
      c.req.header("CF-Connecting-IP") ?? null,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

export { routesLecture as routesApprovisionnementsLecture, routesCentrales as routesApprovisionnementsCentrales,
  routesProvinciales as routesExpeditionsProvinciales };
