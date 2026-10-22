import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings.ts";
import { creerInstructionAudit } from "../middlewares/audit.middleware.ts";
import {
  ErreurRapport,
  listeRapportsGeneres,
  lireApercuRapport,
  lireDefinitionRapport,
  lireTableauDeBordRapports,
  listerFiltresRapports,
  preparerExportRapport,
} from "../services/rapports.service.ts";
import { creerFichierRapport } from "../services/rapports-export.service.ts";
import { typeErreurSecurise } from "../services/fichiers-securite.service.ts";
import {
  schemaExportRapport,
  schemaFiltresRapport,
  schemaFiltresTableauRapports,
  schemaPaginationArchives,
  schemaReconciliationArchives,
  TYPES_RAPPORT,
  type TypeRapport,
} from "../../../shared/validations/rapports.ts";

const PREFIXE_ARCHIVES = "archives/rapports/";
const DELAI_SECURITE_ORPHELIN_MS = 24 * 60 * 60 * 1000;
const VERSION_RAPPORT = "SIGAD 3.0";

export const routesRapports = new Hono<EnvironnementApplication>();

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
  try {
    const resultat = schema.safeParse(await c.req.json());
    return resultat.success ? resultat.data : null;
  } catch {
    return null;
  }
}

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurRapport) {
    const statut = erreur.statutHttp;
    return c.json({ erreur: erreur.message }, statut as 400 | 403 | 404 | 409 | 413 | 500 | 503);
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (/UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint|NOT NULL constraint/iu.test(message)) {
    return c.json({ erreur: "Une règle de cohérence a refusé l’opération." }, 409);
  }
  console.error(JSON.stringify({ action: "echec_rapports", chemin: c.req.path,
    type_erreur: typeErreurSecurise(erreur) }));
  return c.json({ erreur: "Le service de rapports n’a pas pu traiter la demande." }, 500);
}

function nomFichier(type: TypeRapport, reference: string, extension: string): string {
  const typeSecurise = TYPES_RAPPORT.includes(type) ? type.toLowerCase() : "rapport";
  return `sigad_${typeSecurise}_${reference}.${extension}`;
}

function valeurEntete(valeur: string): string {
  return encodeURIComponent(valeur).replaceAll("'", "%27").replaceAll("(", "%28").replaceAll(")", "%29");
}

function dateFichier(date: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Ndjamena", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function cleArchive(provinceId: string | null, date: Date, id: string, extension: string): string {
  const portee = provinceId ? `province/${provinceId}` : "national";
  return `${PREFIXE_ARCHIVES}${portee}/${dateFichier(date).slice(0, 4)}/${id}.${extension}`;
}

function obtenirDateEmission(date: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Ndjamena", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

async function enregistrerRapport(
  c: Context<EnvironnementApplication>,
  entree: {
    id: string;
    type: TypeRapport;
    perimetre: "NATIONAL" | "PROVINCIAL";
    provinceId: string | null;
    filtres: Record<string, string | undefined>;
    format: "PDF" | "EXCEL" | "CSV";
    cleR2: string | null;
    lignes: number;
    exportTronque: boolean;
    lignesLues: number;
    dureeMs: number;
  },
): Promise<void> {
  const utilisateur = c.get("utilisateur");
  const adresseIp = c.req.header("CF-Connecting-IP") ?? null;
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "RAPPORT_GENERE",
    entiteType: "RAPPORT",
    entiteId: entree.id,
    adresseIp,
    donneesApres: JSON.stringify({
      type: entree.type, perimetre: entree.perimetre, province_id: entree.provinceId,
      format: entree.format, nombre_lignes: entree.lignes, export_tronque: entree.exportTronque,
      lignes_d1_lues: entree.lignesLues, duree_requetes_ms: entree.dureeMs,
    }),
  });
  const insertion = c.env.DB.prepare(`INSERT INTO rapports_generes
      (id, type_rapport, intitule, perimetre, province_id, filtres_appliques_json,
       format_export, cle_r2_archive, genere_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(entree.id, entree.type, lireDefinitionRapport(entree.type).intitule,
      entree.perimetre, entree.provinceId, JSON.stringify(entree.filtres), entree.format,
      entree.cleR2, utilisateur.id);
  const resultats = await c.env.DB.batch([insertion, audit]);
  if (resultats.length !== 2 || resultats.some((resultat) => !resultat.success)) {
    throw new Error("RAPPORT_ENREGISTREMENT_INCOMPLET");
  }
}

routesRapports.get("/catalogue", (c) => c.json({ elements: TYPES_RAPPORT.map((type) => lireDefinitionRapport(type)) }));

routesRapports.get("/filtres", async (c) => {
  try {
    return c.json(await listerFiltresRapports(c.env.DB, c.get("utilisateur")));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesRapports.get("/tableau-de-bord", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresTableauRapports);
  if (!filtres) return c.json({ erreur: "Les filtres du tableau de bord sont invalides." }, 400);
  try {
    return c.json(await lireTableauDeBordRapports(c.env.DB, c.get("utilisateur"), filtres));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesRapports.get("/:type/apercu", async (c) => {
  const type = c.req.param("type") as TypeRapport;
  if (!TYPES_RAPPORT.includes(type)) return c.json({ erreur: "Le type de rapport demandé est inconnu." }, 404);
  const filtres = lireFiltres(c, schemaFiltresRapport);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination du rapport sont invalides." }, 400);
  try {
    const resultat = await lireApercuRapport(c.env.DB, type, c.get("utilisateur"), filtres);
    if (resultat.definition.donneesSensibles) {
      await c.env.DB.batch([creerInstructionAudit(c.env.DB, {
        utilisateur: c.get("utilisateur"), action: "RAPPORT_SENSIBLE_CONSULTE",
        entiteType: "RAPPORT", entiteId: crypto.randomUUID(),
        adresseIp: c.req.header("CF-Connecting-IP") ?? null,
        donneesApres: JSON.stringify({ type, province_id: c.get("utilisateur").province_id,
          nombre_lignes: resultat.elements.length }),
      })]);
    }
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesRapports.post("/:type/export", async (c) => {
  const type = c.req.param("type") as TypeRapport;
  if (!TYPES_RAPPORT.includes(type)) return c.json({ erreur: "Le type de rapport demandé est inconnu." }, 404);
  const corps = await lireCorps(c, schemaExportRapport);
  if (!corps) return c.json({ erreur: "Le format ou les paramètres d’export sont invalides." }, 400);
  let cleR2: string | null = null;
  const id = crypto.randomUUID();
  const maintenant = new Date();
  let referenceResultat: Awaited<ReturnType<typeof preparerExportRapport>> | null = null;
  let contenuExport: ReturnType<typeof creerFichierRapport> | null = null;
  try {
    referenceResultat = await preparerExportRapport(c.env.DB, type, c.get("utilisateur"), corps.filtres);
    contenuExport = creerFichierRapport(referenceResultat, corps.format, {
      reference: id,
      dateEmission: obtenirDateEmission(maintenant),
      emisPar: c.get("utilisateur").nom_complet,
      version: VERSION_RAPPORT,
    });
    if (contenuExport.contenu.byteLength > 18 * 1024 * 1024) {
      throw new ErreurRapport("Le fichier dépasse la taille maximale de 18 Mo. Réduisez la période ou ajoutez des filtres.", 413);
    }
    if (corps.archiver) {
      cleR2 = cleArchive(referenceResultat.contexte.province_id, maintenant, id, contenuExport.extension);
      await c.env.BUCKET.put(cleR2, contenuExport.contenu, {
        httpMetadata: { contentType: contenuExport.typeMime },
        customMetadata: { id_rapport: id, province_id: referenceResultat.contexte.province_id ?? "national" },
      });
    }
    await enregistrerRapport(c, {
      id, type, perimetre: referenceResultat.contexte.perimetre,
      provinceId: referenceResultat.contexte.province_id,
      filtres: corps.filtres, format: corps.format, cleR2,
      lignes: referenceResultat.elements.length, exportTronque: referenceResultat.export_tronque,
      lignesLues: referenceResultat.lignes_lues, dureeMs: referenceResultat.duree_requetes_ms,
    });
  } catch (erreur) {
    if (cleR2) {
      try { await c.env.BUCKET.delete(cleR2); }
      catch (erreurSuppression) {
        console.error(JSON.stringify({ action: "archive_rapport_orpheline_a_reconcilier", type_erreur: typeErreurSecurise(erreurSuppression) }));
      }
    }
    return reponseErreur(c, erreur);
  }
  if (!referenceResultat || !contenuExport) return c.json({ erreur: "La génération du rapport a échoué." }, 500);
  const nom = nomFichier(type, id, contenuExport.extension);
  c.header("Content-Type", contenuExport.typeMime);
  c.header("Content-Length", String(contenuExport.contenu.byteLength));
  c.header("Content-Disposition", `attachment; filename="${nom}"; filename*=UTF-8''${valeurEntete(nom)}`);
  c.header("Cache-Control", "private, no-store");
  c.header("X-Report-Id", id);
  c.header("X-Report-Rows", String(referenceResultat.elements.length));
  c.header("X-Report-Truncated", referenceResultat.export_tronque ? "true" : "false");
  const corpsFichier = new Blob([new Uint8Array(contenuExport.contenu).buffer as ArrayBuffer], {
    type: contenuExport.typeMime,
  });
  return c.body(corpsFichier);
});

routesRapports.get("/archives/reconciliation", async (c) => {
  const options = lireFiltres(c, schemaReconciliationArchives);
  if (!options) return c.json({ erreur: "Les paramètres de réconciliation sont invalides." }, 400);
  try {
    const page = await c.env.BUCKET.list({ prefix: PREFIXE_ARCHIVES, limit: options.limite,
      ...(options.curseur ? { cursor: options.curseur } : {}) });
    const ageMinimal = Date.now() - DELAI_SECURITE_ORPHELIN_MS;
    const candidats = page.objects.filter((objet) => objet.uploaded.getTime() <= ageMinimal);
    if (!candidats.length) return c.json({ candidats: [], suite_disponible: page.truncated,
      curseur: page.truncated ? page.cursor : null, delai_securite_heures: 24 });
    const references = await c.env.DB.prepare(`SELECT cle_r2_archive FROM rapports_generes
      WHERE cle_r2_archive IN (${candidats.map(() => "?").join(",")})`)
      .bind(...candidats.map((objet) => objet.key)).all<{ cle_r2_archive: string }>();
    const referencees = new Set(references.results.map((ligne) => ligne.cle_r2_archive));
    const orphelines = candidats.filter((objet) => !referencees.has(objet.key));
    return c.json({ candidats: orphelines.map((objet) => ({ cle: objet.key, taille_octets: objet.size,
      televerse_le: objet.uploaded.toISOString() })), suite_disponible: page.truncated,
      curseur: page.truncated ? page.cursor : null, delai_securite_heures: 24,
      suppression_effectuee: false });
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesRapports.post("/archives/reconciliation", async (c) => {
  const options = await lireCorps(c, schemaReconciliationArchives);
  if (!options || !options.confirmer_suppression) {
    return c.json({ erreur: "La confirmation explicite de suppression est requise." }, 400);
  }
  const utilisateur = c.get("utilisateur");
  const page = await c.env.BUCKET.list({ prefix: PREFIXE_ARCHIVES, limit: options.limite,
    ...(options.curseur ? { cursor: options.curseur } : {}) });
  const candidats = page.objects.filter((objet) => objet.uploaded.getTime() <= Date.now() - DELAI_SECURITE_ORPHELIN_MS);
  if (!candidats.length) return c.json({ supprimees: 0, echec: 0, suite_disponible: page.truncated,
    curseur: page.truncated ? page.cursor : null });
  try {
    const references = await c.env.DB.prepare(`SELECT cle_r2_archive FROM rapports_generes
      WHERE cle_r2_archive IN (${candidats.map(() => "?").join(",")})`)
      .bind(...candidats.map((objet) => objet.key)).all<{ cle_r2_archive: string }>();
    const referencees = new Set(references.results.map((ligne) => ligne.cle_r2_archive));
    const orphelines = candidats.filter((objet) => !referencees.has(objet.key));
    const actionId = crypto.randomUUID();
    await c.env.DB.batch([creerInstructionAudit(c.env.DB, {
      utilisateur, action: "RAPPROCHEMENT_ARCHIVES_DEMARRE", entiteType: "ARCHIVES_RAPPORTS",
      entiteId: actionId, adresseIp: c.req.header("CF-Connecting-IP") ?? null,
      donneesApres: JSON.stringify({ candidats: orphelines.length, curseur: options.curseur ?? null }),
    })]);
    let supprimees = 0;
    let echec = 0;
    for (const objet of orphelines) {
      try {
        const reference = await c.env.DB.prepare("SELECT id FROM rapports_generes WHERE cle_r2_archive = ?")
          .bind(objet.key).first<{ id: string }>();
        if (reference) continue;
        await c.env.BUCKET.delete(objet.key);
        supprimees += 1;
      } catch (erreur) {
        echec += 1;
        console.error(JSON.stringify({ action: "echec_suppression_archive_orpheline", type_erreur: typeErreurSecurise(erreur) }));
      }
    }
    await c.env.DB.batch([creerInstructionAudit(c.env.DB, {
      utilisateur, action: "RAPPROCHEMENT_ARCHIVES_TERMINE", entiteType: "ARCHIVES_RAPPORTS",
      entiteId: actionId, adresseIp: c.req.header("CF-Connecting-IP") ?? null,
      donneesApres: JSON.stringify({ supprimees, echec, verifiees: orphelines.length }),
    })]);
    return c.json({ supprimees, echec, suite_disponible: page.truncated,
      curseur: page.truncated ? page.cursor : null });
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesRapports.get("/archives", async (c) => {
  const options = lireFiltres(c, schemaPaginationArchives);
  if (!options) return c.json({ erreur: "Les paramètres de pagination des archives sont invalides." }, 400);
  try {
    return c.json(await listeRapportsGeneres(c.env.DB, c.get("utilisateur"), {
      limite: options.limite, decalage: options.decalage,
      ...(options.type_rapport ? { type_rapport: options.type_rapport } : {}),
    }));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesRapports.get("/archives/:id", async (c) => {
  const utilisateur = c.get("utilisateur");
  const rapport = await c.env.DB.prepare(`SELECT id, type_rapport, province_id, perimetre,
      format_export, cle_r2_archive FROM rapports_generes WHERE id = ?`)
    .bind(c.req.param("id")).first<{
      id: string; type_rapport: string; province_id: string | null; perimetre: string;
      format_export: "PDF" | "EXCEL" | "CSV"; cle_r2_archive: string | null;
    }>();
  if (!rapport || !rapport.cle_r2_archive) return c.json({ erreur: "L’archive demandée est introuvable." }, 404);
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && rapport.province_id !== utilisateur.province_id) {
    return c.json({ erreur: "Vous ne pouvez consulter que les archives de votre province." }, 403);
  }
  if (!TYPES_RAPPORT.includes(rapport.type_rapport as TypeRapport)) {
    return c.json({ erreur: "Le type de l’archive est invalide." }, 404);
  }
  try {
    const objet = await c.env.BUCKET.get(rapport.cle_r2_archive);
    if (!objet) return c.json({ erreur: "Le fichier archivé n’est plus disponible." }, 404);
    await c.env.DB.batch([creerInstructionAudit(c.env.DB, {
      utilisateur, action: "ARCHIVE_RAPPORT_TELECHARGEE", entiteType: "RAPPORT",
      entiteId: rapport.id, adresseIp: c.req.header("CF-Connecting-IP") ?? null,
      donneesApres: JSON.stringify({ type: rapport.type_rapport, province_id: rapport.province_id,
        format: rapport.format_export }),
    })]);
    const extension = rapport.format_export === "EXCEL" ? "xlsx" : rapport.format_export.toLowerCase();
    const nom = nomFichier(rapport.type_rapport as TypeRapport, rapport.id, extension);
    c.header("Content-Type", objet.httpMetadata?.contentType ?? "application/octet-stream");
    c.header("Content-Disposition", `attachment; filename="${nom}"; filename*=UTF-8''${valeurEntete(nom)}`);
    c.header("Cache-Control", "private, no-store");
    c.header("Content-Length", String(objet.size));
    return c.body(objet.body);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

export function estTypeRapport(valeur: string): valeur is TypeRapport {
  return TYPES_RAPPORT.includes(valeur as TypeRapport);
}
