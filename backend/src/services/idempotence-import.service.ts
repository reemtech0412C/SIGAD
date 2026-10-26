import type { UtilisateurSession } from "../bindings";

const DUREE_REJEU_HEURES = 48;

interface LigneCleIdempotence {
  utilisateur_id: string;
  route_api: string;
  statut_http: number;
  reponse_json: string;
}

interface EnveloppeReponseImport<T> {
  version: 1;
  empreinte_requete: string;
  reponse: T;
}

export interface ResultatImportIdempotent<T> {
  statutHttp: number;
  corps: T;
  rejouee: boolean;
}

export class ErreurIdempotenceImport extends Error {
  readonly statutHttp: 400 | 409;

  constructor(message: string, statutHttp: 400 | 409) {
    super(message);
    this.name = "ErreurIdempotenceImport";
    this.statutHttp = statutHttp;
  }
}

function normaliserJson(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(normaliserJson);
  if (typeof valeur !== "object" || valeur === null) return valeur;
  const objet: Record<string, unknown> = {};
  for (const cle of Object.keys(valeur).sort()) objet[cle] = normaliserJson(Reflect.get(valeur, cle));
  return objet;
}

async function empreinteTexte(valeur: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valeur));
  return Array.from(new Uint8Array(digest), (octet) => octet.toString(16).padStart(2, "0")).join("");
}

async function creerCleStockee(utilisateur: UtilisateurSession, routeApi: string, cleRequete: string): Promise<string> {
  return empreinteTexte(`sigad-import-v1\u0000${utilisateur.id}\u0000${routeApi}\u0000${cleRequete}`);
}

async function empreinteChargeUtile(utilisateur: UtilisateurSession, chargeUtile: unknown): Promise<string> {
  const provinceSession = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  return empreinteTexte(JSON.stringify(normaliserJson({
    utilisateur_id: utilisateur.id,
    province_session: provinceSession,
    charge: chargeUtile,
  })));
}

function lireEnveloppe<T>(texte: string): EnveloppeReponseImport<T> {
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch {
    throw new ErreurIdempotenceImport("La réponse d’importation mémorisée est invalide.", 409);
  }
  if (typeof valeur !== "object" || valeur === null ||
      Reflect.get(valeur, "version") !== 1 ||
      typeof Reflect.get(valeur, "empreinte_requete") !== "string" ||
      !("reponse" in valeur)) {
    throw new ErreurIdempotenceImport("La réponse d’importation mémorisée est invalide.", 409);
  }
  return {
    version: 1,
    empreinte_requete: Reflect.get(valeur, "empreinte_requete") as string,
    reponse: Reflect.get(valeur, "reponse") as T,
  };
}

function verifierEtRejouer<T>(
  ligne: LigneCleIdempotence,
  utilisateur: UtilisateurSession,
  routeApi: string,
  empreinte: string,
): ResultatImportIdempotent<T> {
  const enveloppe = lireEnveloppe<T>(ligne.reponse_json);
  if (ligne.utilisateur_id !== utilisateur.id || ligne.route_api !== routeApi || enveloppe.empreinte_requete !== empreinte) {
    throw new ErreurIdempotenceImport("Cette clé d’importation a déjà été utilisée pour un contenu différent.", 409);
  }
  return { statutHttp: ligne.statut_http, corps: enveloppe.reponse, rejouee: true };
}

async function lireLigne(db: D1Database, cleStockee: string): Promise<LigneCleIdempotence | null> {
  return db.prepare(
    `SELECT utilisateur_id, route_api, statut_http, reponse_json
     FROM cles_idempotence WHERE cle = ? AND expire_le > datetime('now')`,
  ).bind(cleStockee).first<LigneCleIdempotence>();
}

async function contexteImport(
  utilisateur: UtilisateurSession,
  routeApi: string,
  cleRequete: string,
  chargeUtile: unknown,
): Promise<{ cleStockee: string; empreinte: string }> {
  if (!/^[\x21-\x7e]{16,200}$/u.test(cleRequete)) {
    throw new ErreurIdempotenceImport("L’en-tête X-Idempotency-Key doit contenir entre 16 et 200 caractères imprimables.", 400);
  }
  const [cleStockee, empreinte] = await Promise.all([
    creerCleStockee(utilisateur, routeApi, cleRequete),
    empreinteChargeUtile(utilisateur, chargeUtile),
  ]);
  return { cleStockee, empreinte };
}

export async function rejouerImportIdempotent<T>(options: {
  db: D1Database;
  utilisateur: UtilisateurSession;
  routeApi: string;
  cleRequete: string;
  chargeUtile: unknown;
}): Promise<ResultatImportIdempotent<T> | null> {
  const { cleStockee, empreinte } = await contexteImport(
    options.utilisateur, options.routeApi, options.cleRequete, options.chargeUtile,
  );
  const ligne = await lireLigne(options.db, cleStockee);
  return ligne ? verifierEtRejouer<T>(ligne, options.utilisateur, options.routeApi, empreinte) : null;
}

export async function executerImportIdempotent<T>(options: {
  db: D1Database;
  utilisateur: UtilisateurSession;
  routeApi: string;
  cleRequete: string;
  chargeUtile: unknown;
  statutHttp: number;
  corps: T;
  instructions: readonly D1PreparedStatement[];
}): Promise<ResultatImportIdempotent<T>> {
  const { cleStockee, empreinte } = await contexteImport(
    options.utilisateur, options.routeApi, options.cleRequete, options.chargeUtile,
  );
  const ligneExistante = await lireLigne(options.db, cleStockee);
  if (ligneExistante) return verifierEtRejouer<T>(ligneExistante, options.utilisateur, options.routeApi, empreinte);

  const enveloppe: EnveloppeReponseImport<T> = {
    version: 1,
    empreinte_requete: empreinte,
    reponse: options.corps,
  };
  const instructions = [
    options.db.prepare("DELETE FROM cles_idempotence WHERE cle = ? AND expire_le <= datetime('now')").bind(cleStockee),
    options.db.prepare(
      `INSERT INTO cles_idempotence (cle, utilisateur_id, route_api, statut_http, reponse_json, expire_le)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+${DUREE_REJEU_HEURES} hours'))`,
    ).bind(cleStockee, options.utilisateur.id, options.routeApi, options.statutHttp, JSON.stringify(enveloppe)),
    ...options.instructions,
  ];

  try {
    await options.db.batch(instructions);
  } catch (erreur) {
    const ligneConcurrente = await lireLigne(options.db, cleStockee);
    if (ligneConcurrente) return verifierEtRejouer<T>(ligneConcurrente, options.utilisateur, options.routeApi, empreinte);
    throw erreur;
  }

  return { statutHttp: options.statutHttp, corps: options.corps, rejouee: false };
}
