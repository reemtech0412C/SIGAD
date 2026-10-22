import type { UtilisateurSession } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware.ts";
import type {
  AjustementStockSaisi,
  ReceptionStockSaisie,
  ReservationStockSaisie,
  TransfertStockSaisi,
} from "../../../shared/validations/stocks";

const DUREE_CLE_HEURES = 48;
const MAX_LOTS_PAR_RESERVATION = 40;

export class ErreurStock extends Error {
  readonly statutHttp: number;

  constructor(message: string, statutHttp: number) {
    super(message);
    this.name = "ErreurStock";
    this.statutHttp = statutHttp;
  }
}

export interface ResultatOperationStock<T> {
  statutHttp: number;
  corps: T;
  rejouee: boolean;
}

interface EntrepotD1 {
  id: string;
  niveau: "CENTRAL" | "PROVINCIAL";
  province_id: string | null;
  actif: number;
}

interface ArticleD1 {
  id: string;
  code_article: string;
  designation: string;
  decimales_autorisees: number;
  actif: number;
}

export interface LotFefoD1 {
  id: string;
  numero_lot: string;
  entrepot_id: string;
  province_id: string | null;
  article_id: string;
  source_type: string;
  source_reference_id: string | null;
  partenaire_bailleur_id: string | null;
  date_peremption: string | null;
  etat_qualite: string;
  quantite_physique: number;
  quantite_reservee: number;
}

interface LigneIdempotenceD1 {
  utilisateur_id: string;
  route_api: string;
  statut_http: number;
  reponse_json: string;
  expire_le: string;
}

interface EnveloppeIdempotence {
  version: 1;
  empreinte_requete: string;
  reponse: unknown;
}

export interface ResultatIdempotent<T> {
  statutHttp: number;
  corps: T;
  rejouee: boolean;
}

export interface EcritureCritique {
  instruction: D1PreparedStatement;
  operation: string;
  changementsAttendus?: number;
}

interface AllocationLot {
  lot: LotFefoD1;
  quantite: number;
}

function normaliserJson(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(normaliserJson);
  if (typeof valeur !== "object" || valeur === null) return valeur;
  const objet: Record<string, unknown> = {};
  for (const cle of Object.keys(valeur).sort()) objet[cle] = normaliserJson(Reflect.get(valeur, cle));
  return objet;
}

async function empreinteJson(valeur: unknown): Promise<string> {
  const texte = JSON.stringify(normaliserJson(valeur));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(digest), (octet) => octet.toString(16).padStart(2, "0")).join("");
}

function lireEnveloppeReponse(texte: string): EnveloppeIdempotence | null {
  try {
    const valeur: unknown = JSON.parse(texte);
    if (typeof valeur !== "object" || valeur === null) return null;
    const version = Reflect.get(valeur, "version");
    const empreinte = Reflect.get(valeur, "empreinte_requete");
    if (version !== 1 || typeof empreinte !== "string" || !("reponse" in valeur)) return null;
    return { version, empreinte_requete: empreinte, reponse: Reflect.get(valeur, "reponse") };
  } catch {
    throw new ErreurStock("La réponse mémorisée pour cette clé est invalide.", 409);
  }
}

function verifierRejeu<T>(ligne: LigneIdempotenceD1, utilisateur: UtilisateurSession, route: string, empreinte: string): ResultatIdempotent<T> {
  const enveloppe = lireEnveloppeReponse(ligne.reponse_json);
  if (ligne.utilisateur_id !== utilisateur.id || ligne.route_api !== route || enveloppe?.empreinte_requete !== empreinte) {
    throw new ErreurStock("Cette clé d’idempotence a déjà été utilisée pour une autre demande.", 409);
  }
  return {
    statutHttp: ligne.statut_http,
    corps: enveloppe.reponse as T,
    rejouee: true,
  };
}

async function lireCleIdempotence(db: D1Database, cle: string): Promise<LigneIdempotenceD1 | null> {
  return db.prepare(
    `SELECT utilisateur_id, route_api, statut_http, reponse_json, expire_le
     FROM cles_idempotence WHERE cle = ? AND expire_le > datetime('now')`,
  ).bind(cle).first<LigneIdempotenceD1>();
}

export async function rejouerOperationIdempotente<T>(options: {
  db: D1Database;
  utilisateur: UtilisateurSession;
  routeApi: string;
  cle: string;
  chargeUtile: unknown;
}): Promise<ResultatIdempotent<T> | null> {
  const empreinte = await empreinteJson(options.chargeUtile);
  const existante = await lireCleIdempotence(options.db, options.cle);
  return existante
    ? verifierRejeu<T>(existante, options.utilisateur, options.routeApi, empreinte)
    : null;
}

export async function executerOperationIdempotente<T>(options: {
  db: D1Database;
  utilisateur: UtilisateurSession;
  routeApi: string;
  cle: string;
  chargeUtile: unknown;
  statutHttp: number;
  corps: T;
  instructions: readonly EcritureCritique[];
}): Promise<ResultatIdempotent<T>> {
  const empreinte = await empreinteJson(options.chargeUtile);
  const existante = await lireCleIdempotence(options.db, options.cle);
  if (existante) return verifierRejeu<T>(existante, options.utilisateur, options.routeApi, empreinte);

  const instructions: D1PreparedStatement[] = [
    options.db.prepare("DELETE FROM cles_idempotence WHERE cle = ? AND expire_le <= datetime('now')").bind(options.cle),
    options.db.prepare(
      `INSERT INTO cles_idempotence
       (cle, utilisateur_id, route_api, statut_http, reponse_json, expire_le)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+${DUREE_CLE_HEURES} hours'))`,
    ).bind(options.cle, options.utilisateur.id, options.routeApi, options.statutHttp,
      JSON.stringify({ version: 1, empreinte_requete: empreinte, reponse: options.corps } satisfies EnveloppeIdempotence)),
  ];
  const indexesCritiques: { index: number; operation: string; changementsAttendus: number | undefined }[] = [];
  for (const ecriture of options.instructions) {
    indexesCritiques.push({
      index: instructions.length,
      operation: ecriture.operation,
      changementsAttendus: ecriture.changementsAttendus,
    });
    instructions.push(ecriture.instruction);
  }

  try {
    const resultats = await options.db.batch(instructions);
    for (const controle of indexesCritiques) {
      if (resultats[controle.index]?.meta.changes !== (controle.changementsAttendus ?? 1)) {
        throw new ErreurStock(`L’opération a été refusée car ${controle.operation} n’a pas été appliquée.`, 409);
      }
    }
  } catch (erreur) {
    const ligneConcurrente = await lireCleIdempotence(options.db, options.cle);
    if (ligneConcurrente) return verifierRejeu<T>(ligneConcurrente, options.utilisateur, options.routeApi, empreinte);
    if (erreur instanceof ErreurStock) throw erreur;
    const texte = erreur instanceof Error ? erreur.message : "";
    if (/STOCK_|PERIMETRE_|SOLDE_STOCK_|MOUVEMENT_STOCK_|MOUVEMENT_SANS_MUTATION_EFFECTIVE|APPROVISIONNEMENT_|DESTINATION_APPROVISIONNEMENT_|ARTICLE_DESTINATION_|EXPEDITION_|LIGNE_EXPEDITION_|RECEPTION_PROVINCIALE_|LIGNE_RECEPTION_PROVINCIALE_|JUSTIFICATION_ECART_|AUDIT_APPROVISIONNEMENT_|UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/iu.test(texte)) {
      throw new ErreurStock("Le stock a changé ou une contrainte de cohérence a refusé l’opération. Rechargez les données avant de réessayer.", 409);
    }
    throw new ErreurStock("L’opération de stock n’a pas pu être enregistrée.", 500);
  }

  return { statutHttp: options.statutHttp, corps: options.corps, rejouee: false };
}

export function construireInstructionMouvement(
  db: D1Database,
  utilisateur: UtilisateurSession,
  entree: {
    id: string;
    reference: string;
    entrepotId: string;
    provinceId: string | null;
    articleId: string;
    lotId: string;
    type: string;
    sens: "PLUS" | "MOINS" | "NEUTRE_RESERVATION";
    quantite: number;
    avant: number;
    apres: number;
    documentType: string;
    documentId: string;
    motif: string;
  },
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO mouvements_stock
     (id, reference_mouvement, entrepot_id, province_id, article_id, lot_stock_id,
      type_mouvement, sens, quantite, solde_physique_avant, solde_physique_apres,
      document_source_type, document_source_id, motif, auteur_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    entree.id,
    entree.reference,
    entree.entrepotId,
    entree.provinceId,
    entree.articleId,
    entree.lotId,
    entree.type,
    entree.sens,
    entree.quantite,
    entree.avant,
    entree.apres,
    entree.documentType,
    entree.documentId,
    entree.motif,
    utilisateur.id,
  );
}

function construireAudit(
  db: D1Database,
  utilisateur: UtilisateurSession,
  action: string,
  type: string,
  id: string,
  adresseIp: string | null,
  donnees: unknown,
): D1PreparedStatement {
  return creerInstructionAudit(db, {
    utilisateur,
    action,
    entiteType: type,
    entiteId: id,
    adresseIp,
    donneesApres: JSON.stringify(donnees),
  });
}

async function obtenirEntrepotAutorise(db: D1Database, utilisateur: UtilisateurSession, id: string): Promise<EntrepotD1> {
  const ligne = await db.prepare(
    `SELECT id, niveau, province_id, actif FROM entrepots
     WHERE id = ? AND actif = 1
       AND (? <> 'DELEGUE_PROVINCIAL' OR province_id = ?)`
  ).bind(id, utilisateur.role, utilisateur.province_id).first<EntrepotD1>();
  if (!ligne) throw new ErreurStock("Entrepôt introuvable dans votre périmètre.", 404);
  return ligne;
}

async function lireSoldesArticles(db: D1Database, entrepotId: string, articleIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(articleIds)];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const resultats = await db.prepare(
    `SELECT article_id, quantite_physique FROM soldes_stock
     WHERE entrepot_id = ? AND article_id IN (${placeholders})`,
  ).bind(entrepotId, ...ids).all<{ article_id: string; quantite_physique: number }>();
  return new Map(resultats.results.map((ligne) => [ligne.article_id, ligne.quantite_physique]));
}

async function lireArticlesActifs(db: D1Database, articleIds: readonly string[]): Promise<Map<string, ArticleD1>> {
  const ids = [...new Set(articleIds)];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const resultats = await db.prepare(
    `SELECT a.id, a.code_article, a.designation, a.actif, u.decimales_autorisees
     FROM articles a INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
     WHERE a.id IN (${placeholders}) AND a.actif = 1`,
  ).bind(...ids).all<ArticleD1>();
  return new Map(resultats.results.map((ligne) => [ligne.id, ligne]));
}

function verifierPrecision(valeur: number, decimales: number): boolean {
  const facteur = 10 ** decimales;
  return Math.abs(valeur * facteur - Math.round(valeur * facteur)) < 0.000001;
}

function validerPrecisionReception(ligne: ReceptionStockSaisie["lignes"][number], article: ArticleD1): void {
  if (![ligne.quantite_recue, ligne.quantite_acceptee, ligne.quantite_endommagee].every((valeur) => verifierPrecision(valeur, article.decimales_autorisees))) {
    throw new ErreurStock(`Les quantités de l’article ${article.code_article} dépassent la précision de son unité de mesure.`, 400);
  }
  if (Math.abs(ligne.quantite_acceptee + ligne.quantite_endommagee - ligne.quantite_recue) > 0.000001) {
    throw new ErreurStock("Pour chaque ligne, les quantités acceptée et endommagée doivent correspondre à la quantité reçue.", 400);
  }
}

export function creerReference(prefixe: string, id: string): string {
  return `${prefixe}-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

export async function enregistrerReceptionStock(
  db: D1Database,
  utilisateur: UtilisateurSession,
  entree: ReceptionStockSaisie,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; reference_reception: string; nombre_lignes: number }>> {
  const entrepot = await obtenirEntrepotAutorise(db, utilisateur, entree.entrepot_id);
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && entrepot.niveau !== "PROVINCIAL") {
    throw new ErreurStock("Un délégué provincial ne peut enregistrer que dans un entrepôt de sa province.", 403);
  }
  if (entree.type_entree === "APPROVISIONNEMENT_DIRECT_PARTENAIRE") {
    if (!entree.partenaire_id) throw new ErreurStock("Un partenaire validé est obligatoire pour une réception directe.", 400);
    const partenaire = await db.prepare(
      `SELECT p.id FROM partenaires p
       INNER JOIN roles_partenaires rp ON rp.partenaire_id = p.id
       WHERE p.id = ? AND p.statut_validation = 'VALIDE' AND rp.role IN ('FOURNISSEUR', 'DONATEUR', 'BAILLEUR_DE_FONDS')
       LIMIT 1`,
    ).bind(entree.partenaire_id).first<{ id: string }>();
    if (!partenaire) throw new ErreurStock("Le partenaire doit être validé et habilité comme fournisseur ou donateur.", 400);
  } else if (entree.partenaire_id) {
    throw new ErreurStock("Une entrée de stock initial ne doit pas comporter de partenaire.", 400);
  }

  const articles = await lireArticlesActifs(db, entree.lignes.map((ligne) => ligne.article_id));
  if (articles.size !== new Set(entree.lignes.map((ligne) => ligne.article_id)).size) {
    throw new ErreurStock("Un article est introuvable ou inactif.", 400);
  }
  for (const ligne of entree.lignes) {
    const article = articles.get(ligne.article_id);
    if (!article) throw new ErreurStock("Un article est introuvable ou inactif.", 400);
    validerPrecisionReception(ligne, article);
  }

  const soldes = await lireSoldesArticles(db, entrepot.id, entree.lignes.map((ligne) => ligne.article_id));
  const receptionId = crypto.randomUUID();
  const reference = creerReference("REC", receptionId);
  const sourceType = entree.type_entree === "STOCK_INITIAL" ? "STOCK_INITIAL" : "APPROVISIONNEMENT_DIRECT";
  const instructions: EcritureCritique[] = [
    {
      operation: "la création de la réception",
      instruction: db.prepare(
        `INSERT INTO receptions_stock
         (id, reference_reception, entrepot_id, province_id, type_entree, partenaire_id,
          date_reception, numero_bordereau_externe, observations, enregistre_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        receptionId,
        reference,
        entrepot.id,
        entrepot.province_id,
        entree.type_entree,
        entree.partenaire_id ?? null,
        entree.date_reception,
        entree.numero_bordereau_externe ?? null,
        entree.observations ?? null,
        utilisateur.id,
      ),
    },
  ];
  const soldesCalcul = new Map(soldes);
  const mouvements = { nombre: 0 };
  for (const ligne of entree.lignes) {
    const article = articles.get(ligne.article_id);
    if (!article) throw new ErreurStock("Un article est introuvable ou inactif.", 400);
    const avant = soldesCalcul.get(ligne.article_id) ?? 0;
    let lotBonId: string | null = null;
    let lotEndommageId: string | null = null;
    if (ligne.quantite_acceptee > 0) lotBonId = crypto.randomUUID();
    if (ligne.quantite_endommagee > 0) lotEndommageId = crypto.randomUUID();
    const lotReference = lotBonId ?? lotEndommageId;
    if (!lotReference) throw new ErreurStock("Chaque ligne de réception doit produire une quantité de stock positive.", 400);
    if (lotBonId) {
      instructions.push({
        operation: "la création du lot accepté",
        instruction: db.prepare(
          `INSERT INTO lots_stock
           (id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
            partenaire_bailleur_id, date_peremption, etat_qualite, quantite_initiale,
            quantite_physique, quantite_reservee)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        ).bind(
          lotBonId,
          ligne.numero_lot,
          ligne.article_id,
          entrepot.id,
          entrepot.province_id,
          sourceType,
          receptionId,
          entree.partenaire_id ?? null,
          ligne.date_peremption ?? null,
          ligne.date_peremption && ligne.date_peremption < new Date().toISOString().slice(0, 10) ? "PERIME" : "BON",
          ligne.quantite_acceptee,
        ),
      });
    }
    if (lotEndommageId) {
      instructions.push({
        operation: "la création du lot endommagé",
        instruction: db.prepare(
          `INSERT INTO lots_stock
           (id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
            partenaire_bailleur_id, date_peremption, etat_qualite, quantite_initiale,
            quantite_physique, quantite_reservee)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENDOMMAGE', ?, 0, 0)`,
        ).bind(
          lotEndommageId,
          `${ligne.numero_lot}-ENDOMMAGE`,
          ligne.article_id,
          entrepot.id,
          entrepot.province_id,
          sourceType,
          receptionId,
          entree.partenaire_id ?? null,
          ligne.date_peremption ?? null,
          ligne.quantite_endommagee,
        ),
      });
    }
    instructions.push({
      operation: "l’enregistrement de la ligne de réception",
      instruction: db.prepare(
        `INSERT INTO lignes_reception
         (id, reception_stock_id, article_id, lot_stock_id, quantite_recue,
          quantite_acceptee, quantite_endommagee, date_peremption)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), receptionId, ligne.article_id, lotReference,
        ligne.quantite_recue, ligne.quantite_acceptee, ligne.quantite_endommagee, ligne.date_peremption ?? null,
      ),
    });

    if (lotBonId) {
      const apres = avant + ligne.quantite_acceptee;
      instructions.push({
        operation: "l’ajout conditionnel de la quantité acceptée",
        instruction: db.prepare(
          `UPDATE lots_stock SET quantite_physique = quantite_physique + ?
           WHERE id = ? AND quantite_physique = 0 AND quantite_reservee = 0`,
        ).bind(ligne.quantite_acceptee, lotBonId),
      });
      instructions.push({
        operation: "l’écriture du mouvement de réception accepté",
        instruction: construireInstructionMouvement(db, utilisateur, {
          id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
          entrepotId: entrepot.id, provinceId: entrepot.province_id, articleId: ligne.article_id,
          lotId: lotBonId, type: "RECEPTION", sens: "PLUS", quantite: ligne.quantite_acceptee,
          avant, apres, documentType: "RECEPTION_STOCK", documentId: receptionId,
          motif: `Réception ${entree.type_entree.toLowerCase()} — lot ${ligne.numero_lot}`,
        }),
      });
      mouvements.nombre += 1;
      soldesCalcul.set(ligne.article_id, apres);
    }
    if (lotEndommageId) {
      const avantEndommage = soldesCalcul.get(ligne.article_id) ?? 0;
      const apresEndommage = avantEndommage + ligne.quantite_endommagee;
      instructions.push({
        operation: "l’ajout conditionnel de la quantité endommagée",
        instruction: db.prepare(
          `UPDATE lots_stock SET quantite_physique = quantite_physique + ?
           WHERE id = ? AND quantite_physique = 0 AND quantite_reservee = 0`,
        ).bind(ligne.quantite_endommagee, lotEndommageId),
      });
      instructions.push({
        operation: "l’écriture du mouvement du lot endommagé",
        instruction: construireInstructionMouvement(db, utilisateur, {
          id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
          entrepotId: entrepot.id, provinceId: entrepot.province_id, articleId: ligne.article_id,
          lotId: lotEndommageId, type: "RECEPTION", sens: "PLUS", quantite: ligne.quantite_endommagee,
          avant: avantEndommage, apres: apresEndommage, documentType: "RECEPTION_STOCK", documentId: receptionId,
          motif: `Quantité endommagée à isoler — lot ${ligne.numero_lot}`,
        }),
      });
      mouvements.nombre += 1;
      soldesCalcul.set(ligne.article_id, apresEndommage);
    }
  }
  instructions.push({
    operation: "l’écriture du journal d’audit",
    instruction: construireAudit(db, utilisateur, "RECEPTION_STOCK", "RECEPTION_STOCK", receptionId, adresseIp, {
      reference_reception: reference,
      type_entree: entree.type_entree,
      entrepot_id: entrepot.id,
      nombre_lignes: entree.lignes.length,
      nombre_mouvements: mouvements.nombre,
    }),
  });
  const corps = { id: receptionId, reference_reception: reference, nombre_lignes: entree.lignes.length };
  return executerOperationIdempotente({
    db, utilisateur, routeApi: "/api/stocks/receptions-stock", cle,
    chargeUtile: entree, statutHttp: 201, corps, instructions,
  });
}

export async function enregistrerAjustementStock(
  db: D1Database,
  utilisateur: UtilisateurSession,
  entree: AjustementStockSaisi,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; reference_ajustement: string; ecart_quantite: number }>> {
  const entrepot = await obtenirEntrepotAutorise(db, utilisateur, entree.entrepot_id);
  const lot = await db.prepare(
    `SELECT id, article_id, entrepot_id, province_id, quantite_physique, quantite_reservee, etat_qualite
     FROM lots_stock WHERE id = ? AND entrepot_id = ? AND article_id = ?
       AND province_id IS ? AND (? <> 'DELEGUE_PROVINCIAL' OR province_id = ?)`
  ).bind(entree.lot_stock_id, entrepot.id, entree.article_id, entrepot.province_id, utilisateur.role, utilisateur.province_id)
    .first<{ id: string; article_id: string; entrepot_id: string; province_id: string | null; quantite_physique: number; quantite_reservee: number; etat_qualite: string }>();
  if (!lot) throw new ErreurStock("Lot introuvable dans votre périmètre.", 404);
  const article = (await lireArticlesActifs(db, [entree.article_id])).get(entree.article_id);
  if (!article) throw new ErreurStock("L’article est introuvable ou inactif.", 400);
  if (!verifierPrecision(Math.abs(entree.ecart_quantite), article.decimales_autorisees)) {
    throw new ErreurStock("L’écart dépasse la précision autorisée pour l’unité de mesure.", 400);
  }
  if (entree.type_ajustement === "PERTE" && entree.ecart_quantite >= 0) {
    throw new ErreurStock("Une perte doit réduire la quantité physique.", 400);
  }
  if (entree.type_ajustement === "AVARIE" && entree.ecart_quantite >= 0) {
    throw new ErreurStock("Une avarie enregistrée comme perte doit réduire la quantité physique.", 400);
  }

  const soldes = await lireSoldesArticles(db, entrepot.id, [entree.article_id]);
  const avant = soldes.get(entree.article_id) ?? 0;
  const apres = avant + entree.ecart_quantite;
  if (apres < -0.000001) throw new ErreurStock("L’ajustement rendrait le stock négatif.", 409);
  const ajustementId = crypto.randomUUID();
  const reference = creerReference("AJU", ajustementId);
  const typeMouvement = entree.ecart_quantite > 0 ? "AJUSTEMENT_POSITIF" : (entree.type_ajustement === "PERTE" || entree.type_ajustement === "AVARIE" ? "PERTE" : "AJUSTEMENT_NEGATIF");
  const instructionMiseAJour = db.prepare(
    entree.ecart_quantite > 0
      ? `UPDATE lots_stock SET quantite_physique = quantite_physique + ?
         WHERE id = ? AND entrepot_id = ? AND province_id IS ?`
      : `UPDATE lots_stock SET quantite_physique = quantite_physique - ?
         WHERE id = ? AND entrepot_id = ? AND province_id IS ?
           AND quantite_physique - quantite_reservee >= ? AND quantite_physique >= ?`,
  ).bind(...(
    entree.ecart_quantite > 0
      ? [entree.ecart_quantite, lot.id, entrepot.id, entrepot.province_id]
      : [Math.abs(entree.ecart_quantite), lot.id, entrepot.id, entrepot.province_id, Math.abs(entree.ecart_quantite), Math.abs(entree.ecart_quantite)]
  ));
  const instructions: EcritureCritique[] = [
    {
      operation: "la création de l’ajustement",
      instruction: db.prepare(
        `INSERT INTO ajustements_stock
         (id, reference_ajustement, entrepot_id, province_id, article_id, lot_stock_id,
          type_ajustement, ecart_quantite, motif_detaille, auteur_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ajustementId, reference, entrepot.id, entrepot.province_id, entree.article_id,
        lot.id, entree.type_ajustement, entree.ecart_quantite, entree.motif_detaille, utilisateur.id,
      ),
    },
    { operation: "la mise à jour conditionnelle du lot", instruction: instructionMiseAJour },
    {
      operation: "l’écriture du mouvement d’ajustement",
      instruction: construireInstructionMouvement(db, utilisateur, {
        id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
        entrepotId: entrepot.id, provinceId: entrepot.province_id, articleId: entree.article_id,
        lotId: lot.id, type: typeMouvement, sens: entree.ecart_quantite > 0 ? "PLUS" : "MOINS",
        quantite: Math.abs(entree.ecart_quantite), avant, apres,
        documentType: "AJUSTEMENT_STOCK", documentId: ajustementId, motif: entree.motif_detaille,
      }),
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: construireAudit(db, utilisateur, "AJUSTEMENT_STOCK", "AJUSTEMENT_STOCK", ajustementId, adresseIp, entree),
    },
  ];
  const corps = { id: ajustementId, reference_ajustement: reference, ecart_quantite: entree.ecart_quantite };
  return executerOperationIdempotente({
    db, utilisateur, routeApi: "/api/stocks/ajustements-stock", cle,
    chargeUtile: entree, statutHttp: 201, corps, instructions,
  });
}

export function allouerLotsFefo(lots: readonly LotFefoD1[], quantiteDemandee: number, dateReference: string): AllocationLot[] {
  const eligibles = lots
    .filter((lot) => lot.etat_qualite === "BON" && (lot.date_peremption === null || lot.date_peremption >= dateReference))
    .filter((lot) => lot.quantite_physique - lot.quantite_reservee > 0)
    .sort((a, b) => {
      if (a.date_peremption === null && b.date_peremption !== null) return 1;
      if (b.date_peremption === null && a.date_peremption !== null) return -1;
      return (a.date_peremption ?? "").localeCompare(b.date_peremption ?? "") || a.id.localeCompare(b.id);
    });
  const allocations: AllocationLot[] = [];
  let restant = quantiteDemandee;
  for (const lot of eligibles) {
    if (restant <= 0.000001) break;
    const disponible = lot.quantite_physique - lot.quantite_reservee;
    const attribuee = Math.min(disponible, restant);
    if (attribuee > 0) allocations.push({ lot, quantite: attribuee });
    restant -= attribuee;
  }
  if (restant > 0.000001) throw new ErreurStock("La quantité disponible en lots sains et non périmés est insuffisante.", 409);
  if (allocations.length > MAX_LOTS_PAR_RESERVATION) {
    throw new ErreurStock("La réservation dépasse la limite transactionnelle de 40 lots. Répartissez la demande en opérations métier distinctes.", 400);
  }
  return allocations;
}

export async function reserverStockFefo(
  db: D1Database,
  utilisateur: UtilisateurSession,
  entree: ReservationStockSaisie,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; quantite_reservee: number; lots_utilises: number }>> {
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && entree.province_id !== utilisateur.province_id) {
    throw new ErreurStock("La province de réservation ne correspond pas à votre session.", 403);
  }
  const entrepot = await obtenirEntrepotAutorise(db, utilisateur, entree.entrepot_id);
  if (entrepot.province_id !== entree.province_id) throw new ErreurStock("L’entrepôt ne relève pas de la province de réservation.", 400);
  const article = (await lireArticlesActifs(db, [entree.article_id])).get(entree.article_id);
  if (!article) throw new ErreurStock("L’article est introuvable ou inactif.", 400);
  if (!verifierPrecision(entree.quantite, article.decimales_autorisees)) {
    throw new ErreurStock("La quantité dépasse la précision autorisée pour l’unité de mesure.", 400);
  }
  const lots = await db.prepare(
    `SELECT id, numero_lot, entrepot_id, province_id, article_id, source_type, source_reference_id,
      partenaire_bailleur_id, date_peremption, etat_qualite, quantite_physique, quantite_reservee
     FROM lots_stock
     WHERE entrepot_id = ? AND province_id = ? AND article_id = ?
       AND etat_qualite = 'BON'
       AND (date_peremption IS NULL OR date_peremption >= date('now'))
       AND quantite_physique > quantite_reservee
     ORDER BY CASE WHEN date_peremption IS NULL THEN 1 ELSE 0 END, date_peremption ASC, cree_le ASC, id ASC
     LIMIT ${MAX_LOTS_PAR_RESERVATION}`,
  ).bind(entrepot.id, entree.province_id, entree.article_id).all<LotFefoD1>();
  const allocations = allouerLotsFefo(lots.results, entree.quantite, new Date().toISOString().slice(0, 10));
  const reserveId = crypto.randomUUID();
  const instructions: EcritureCritique[] = [];
  const soldes = await lireSoldesArticles(db, entrepot.id, [entree.article_id]);
  const physique = soldes.get(entree.article_id) ?? 0;
  for (const allocation of allocations) {
    const reservationId = crypto.randomUUID();
    instructions.push({
      operation: "la création de la ligne de réservation",
      instruction: db.prepare(
        `INSERT INTO reservations_stock
         (id, distribution_id, entrepot_id, province_id, article_id, lot_stock_id,
          quantite_reservee, cree_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        reservationId, entree.distribution_id, entrepot.id, entree.province_id,
        entree.article_id, allocation.lot.id, allocation.quantite, utilisateur.id,
      ),
    });
    instructions.push({
      operation: "la réservation conditionnelle du lot",
      instruction: db.prepare(
        `UPDATE lots_stock SET quantite_reservee = quantite_reservee + ?
         WHERE id = ? AND entrepot_id = ? AND article_id = ? AND province_id = ?
           AND etat_qualite = 'BON'
           AND (date_peremption IS NULL OR date_peremption >= date('now'))
           AND quantite_physique - quantite_reservee >= ?`,
      ).bind(allocation.quantite, allocation.lot.id, entrepot.id, entree.article_id, entree.province_id, allocation.quantite),
    });
    instructions.push({
      operation: "l’écriture du mouvement de réservation",
      instruction: construireInstructionMouvement(db, utilisateur, {
        id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
        entrepotId: entrepot.id, provinceId: entree.province_id, articleId: entree.article_id,
        lotId: allocation.lot.id, type: "RESERVATION", sens: "NEUTRE_RESERVATION",
        quantite: allocation.quantite, avant: physique, apres: physique,
        documentType: "RESERVATION_STOCK", documentId: reserveId,
        motif: `Réservation de stock pour la distribution ${entree.distribution_id}`,
      }),
    });
  }
  instructions.push({
    operation: "l’écriture du journal d’audit",
    instruction: construireAudit(db, utilisateur, "RESERVATION_STOCK", "RESERVATION_STOCK", reserveId, adresseIp, {
      distribution_id: entree.distribution_id, province_id: entree.province_id,
      article_id: entree.article_id, quantite: entree.quantite,
      lots_utilises: allocations.length,
    }),
  });
  const corps = { id: reserveId, quantite_reservee: entree.quantite, lots_utilises: allocations.length };
  return executerOperationIdempotente({
    db, utilisateur, routeApi: "SERVICE:RESERVATION_STOCK_FEFO", cle,
    chargeUtile: entree, statutHttp: 201, corps, instructions,
  });
}

export async function enregistrerTransfertStock(
  db: D1Database,
  utilisateur: UtilisateurSession,
  entree: TransfertStockSaisi,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; nombre_lignes: number }>> {
  if (entree.entrepot_source_id === entree.entrepot_destination_id) throw new ErreurStock("Les entrepôts source et destination doivent être différents.", 400);
  const source = await obtenirEntrepotAutorise(db, utilisateur, entree.entrepot_source_id);
  const destination = await obtenirEntrepotAutorise(db, utilisateur, entree.entrepot_destination_id);
  if (source.province_id !== destination.province_id || source.niveau !== destination.niveau) {
    throw new ErreurStock("Un transfert interne doit relier deux entrepôts du même niveau et du même périmètre provincial.", 400);
  }
  const lotsIds = entree.lignes.map((ligne) => ligne.lot_stock_id);
  if (new Set(lotsIds).size !== lotsIds.length) throw new ErreurStock("Un lot ne peut apparaître qu’une fois dans un transfert.", 400);
  const placeholders = lotsIds.map(() => "?").join(", ");
  const lots = await db.prepare(
    `SELECT id, numero_lot, entrepot_id, province_id, article_id, source_type, source_reference_id,
      partenaire_bailleur_id, date_peremption, etat_qualite, quantite_physique, quantite_reservee
     FROM lots_stock WHERE id IN (${placeholders}) AND entrepot_id = ? AND province_id IS ?
       AND etat_qualite = 'BON' AND (date_peremption IS NULL OR date_peremption >= date('now'))`,
  ).bind(...lotsIds, source.id, source.province_id).all<LotFefoD1>();
  const lotParId = new Map(lots.results.map((lot) => [lot.id, lot]));
  if (lotParId.size !== entree.lignes.length) throw new ErreurStock("Un lot est absent, périmé, endommagé ou hors de l’entrepôt source.", 400);
  const articleParId = await lireArticlesActifs(db, entree.lignes.map((ligne) => lotParId.get(ligne.lot_stock_id)?.article_id ?? ""));
  const soldesSource = await lireSoldesArticles(db, source.id, entree.lignes.map((ligne) => lotParId.get(ligne.lot_stock_id)?.article_id ?? ""));
  const soldesDestination = await lireSoldesArticles(db, destination.id, entree.lignes.map((ligne) => lotParId.get(ligne.lot_stock_id)?.article_id ?? ""));
  const instructions: EcritureCritique[] = [];
  const sourceCalcul = new Map(soldesSource);
  const destinationCalcul = new Map(soldesDestination);
  const transfertId = crypto.randomUUID();
  for (const ligne of entree.lignes) {
    const lot = lotParId.get(ligne.lot_stock_id);
    if (!lot) throw new ErreurStock("Lot source introuvable.", 400);
    const article = articleParId.get(lot.article_id);
    if (!article || !verifierPrecision(ligne.quantite, article.decimales_autorisees)) {
      throw new ErreurStock("Une quantité de transfert dépasse la précision autorisée.", 400);
    }
    const disponible = lot.quantite_physique - lot.quantite_reservee;
    if (ligne.quantite > disponible + 0.000001) throw new ErreurStock("La quantité transférée dépasse le disponible du lot.", 409);
    const sourceAvant = sourceCalcul.get(lot.article_id) ?? 0;
    const sourceApres = sourceAvant - ligne.quantite;
    const destinationAvant = destinationCalcul.get(lot.article_id) ?? 0;
    const destinationApres = destinationAvant + ligne.quantite;
    instructions.push({
      operation: "le retrait conditionnel du lot source",
      instruction: db.prepare(
        `UPDATE lots_stock SET quantite_physique = quantite_physique - ?
         WHERE id = ? AND entrepot_id = ? AND province_id IS ?
           AND quantite_physique - quantite_reservee >= ?`,
      ).bind(ligne.quantite, lot.id, source.id, source.province_id, ligne.quantite),
    });
    instructions.push({
      operation: "l’écriture du mouvement sortant",
      instruction: construireInstructionMouvement(db, utilisateur, {
        id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
        entrepotId: source.id, provinceId: source.province_id, articleId: lot.article_id,
        lotId: lot.id, type: "TRANSFERT_SORTANT", sens: "MOINS", quantite: ligne.quantite,
        avant: sourceAvant, apres: sourceApres, documentType: "TRANSFERT_STOCK", documentId: transfertId,
        motif: entree.motif,
      }),
    });
    const lotDestinationId = crypto.randomUUID();
    instructions.push({
      operation: "la création du lot transféré",
      instruction: db.prepare(
        `INSERT INTO lots_stock
         (id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
          partenaire_bailleur_id, date_peremption, etat_qualite, quantite_initiale,
          quantite_physique, quantite_reservee)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      ).bind(
        lotDestinationId, lot.numero_lot, lot.article_id, destination.id, destination.province_id,
        lot.source_type, lot.source_reference_id, lot.partenaire_bailleur_id, lot.date_peremption,
        lot.etat_qualite, ligne.quantite,
      ),
    });
    instructions.push({
      operation: "l’ajout conditionnel du lot transféré",
      instruction: db.prepare(
        "UPDATE lots_stock SET quantite_physique = quantite_physique + ? WHERE id = ? AND quantite_physique = 0",
      ).bind(ligne.quantite, lotDestinationId),
    });
    instructions.push({
      operation: "l’écriture du mouvement entrant",
      instruction: construireInstructionMouvement(db, utilisateur, {
        id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
        entrepotId: destination.id, provinceId: destination.province_id, articleId: lot.article_id,
        lotId: lotDestinationId, type: "TRANSFERT_ENTRANT", sens: "PLUS", quantite: ligne.quantite,
        avant: destinationAvant, apres: destinationApres, documentType: "TRANSFERT_STOCK", documentId: transfertId,
        motif: entree.motif,
      }),
    });
    sourceCalcul.set(lot.article_id, sourceApres);
    destinationCalcul.set(lot.article_id, destinationApres);
  }
  instructions.push({
    operation: "l’écriture du journal d’audit",
    instruction: construireAudit(db, utilisateur, "TRANSFERT_STOCK", "TRANSFERT_STOCK", transfertId, adresseIp, {
      entrepot_source_id: source.id, entrepot_destination_id: destination.id,
      nombre_lignes: entree.lignes.length,
    }),
  });
  const corps = { id: transfertId, nombre_lignes: entree.lignes.length };
  return executerOperationIdempotente({
    db, utilisateur, routeApi: "/api/stocks/transferts-stock", cle,
    chargeUtile: entree, statutHttp: 201, corps, instructions,
  });
}

