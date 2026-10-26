import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import {
  ErreurAdministrationTerritoriale,
  obtenirTableauDeBordTerritorial,
  obtenirArborescenceTerritoriale,
  rechercherUnitesTerritoriales,
  ajouterUniteTerritoriale,
  modifierUniteTerritoriale,
  simulerRattachementTerritorial,
  modifierRattachementTerritorial,
  simulerFusionUnites,
  executerFusionUnites,
  archiverUniteTerritoriale,
  reactiverUniteTerritoriale,
  supprimerUniteTerritoriale,
  validerUniteTerritoriale,
  validerLotUnitesTerritoriales,
  detecterDoublonsTerritoriaux,
  previsualiserImportTerritoireFichier,
  executerImportTerritoire,
  exporterTerritoireCsv,
  exporterTerritoireXlsx,
  obtenirHistoriqueAuditsTerritoire,
} from "../services/administration-territoriale.service";
import {
  schemaCreationUniteTerritoriale,
  schemaModificationUniteTerritoriale,
  schemaModificationRattachementTerritorial,
  schemaFusionUnitesTerritoriales,
  schemaArchivageUniteTerritoriale,
  schemaValidationUniteTerritoriale,
  schemaValidationLotTerritoire,
  schemaFiltresRechercheTerritoire,
} from "../../../shared/validations/territoire";
import type { TypeUniteTerritoriale } from "../../../shared/types/territoire";

export const routesAdministrationTerritoriale = new Hono<EnvironnementApplication>();

function adresseIp(c: Context<EnvironnementApplication>): string | null {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurAdministrationTerritoriale) {
    return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  }
  const message = erreur instanceof Error ? erreur.message : "Erreur interne.";
  console.error(JSON.stringify({
    action: "erreur_administration_territoriale",
    chemin: c.req.path,
    message,
  }));
  return c.json({ erreur: "L’opération sur le référentiel territorial n’a pas pu être traitée." }, 500);
}

// 1. Tableau de bord territorial (statistiques réelles globales)
routesAdministrationTerritoriale.get("/tableau-de-bord", async (c) => {
  try {
    const stats = await obtenirTableauDeBordTerritorial(c.env.DB);
    return c.json(stats);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 2. Arborescence hiérarchique dynamique
routesAdministrationTerritoriale.get("/arborescence", async (c) => {
  try {
    const provinceId = c.req.query("province_id") || undefined;
    const arbre = await obtenirArborescenceTerritoriale(c.env.DB, provinceId);
    return c.json(arbre);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 3. Recherche multi-critères et filtrage
routesAdministrationTerritoriale.get("/recherche", async (c) => {
  const parseResult = schemaFiltresRechercheTerritoire.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams.entries())
  );
  if (!parseResult.success) {
    return c.json({ erreur: "Paramètres de recherche invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const resultats = await rechercherUnitesTerritoriales(c.env.DB, {
      recherche: parseResult.data.recherche || undefined,
      type: parseResult.data.type || undefined,
      province_id: parseResult.data.province_id || undefined,
      departement_id: parseResult.data.departement_id || undefined,
      statut_validation: parseResult.data.statut_validation || undefined,
      limite: parseResult.data.limite,
      decalage: parseResult.data.decalage,
    });
    return c.json(resultats);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 4. Création d'une nouvelle unité territoriale
routesAdministrationTerritoriale.post("/unites", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaCreationUniteTerritoriale.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de création territoriale invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await ajouterUniteTerritoriale(c.env.DB, utilisateur, parseResult.data, adresseIp(c));
    return c.json(resultat, 201);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 5. Modification d'une unité existante
routesAdministrationTerritoriale.put("/unites/:id", async (c) => {
  const id = c.req.param("id");
  const type = c.req.query("type") as TypeUniteTerritoriale;
  if (!type) {
    return c.json({ erreur: "Le paramètre query 'type' est requis." }, 400);
  }
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaModificationUniteTerritoriale.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de modification invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await modifierUniteTerritoriale(c.env.DB, utilisateur, type, id, parseResult.data, adresseIp(c));
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 6. Simulation du changement de rattachement
routesAdministrationTerritoriale.post("/unites/:id/simuler-rattachement", async (c) => {
  const id = c.req.param("id");
  const type = (c.req.query("type") as TypeUniteTerritoriale) || "VILLAGE";
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaModificationRattachementTerritorial.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de rattachement invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const simulation = await simulerRattachementTerritorial(
      c.env.DB,
      type,
      id,
      parseResult.data.nouveau_departement_id
    );
    return c.json(simulation);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 7. Exécution du changement de rattachement
routesAdministrationTerritoriale.post("/unites/:id/rattachement", async (c) => {
  const id = c.req.param("id");
  const type = (c.req.query("type") as TypeUniteTerritoriale) || "VILLAGE";
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaModificationRattachementTerritorial.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de rattachement invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await modifierRattachementTerritorial(
      c.env.DB,
      utilisateur,
      type,
      id,
      parseResult.data,
      adresseIp(c)
    );
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 8. Simulation de fusion de 2 unités (doublons)
routesAdministrationTerritoriale.post("/fusions/simulation", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaFusionUnitesTerritoriales.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de simulation de fusion invalides.", details: parseResult.error.flatten() }, 400);
  }
  const type = (c.req.query("type") as TypeUniteTerritoriale) || "VILLAGE";
  try {
    const simulation = await simulerFusionUnites(
      c.env.DB,
      type,
      parseResult.data.unite_principale_id,
      parseResult.data.unite_doublon_id
    );
    return c.json(simulation);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 9. Exécution de la fusion de 2 unités
routesAdministrationTerritoriale.post("/fusions/executer", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaFusionUnitesTerritoriales.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de fusion invalides.", details: parseResult.error.flatten() }, 400);
  }
  const type = (c.req.query("type") as TypeUniteTerritoriale) || "VILLAGE";
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await executerFusionUnites(
      c.env.DB,
      utilisateur,
      type,
      parseResult.data.unite_principale_id,
      parseResult.data.unite_doublon_id,
      parseResult.data.motif,
      parseResult.data.justificatif,
      adresseIp(c)
    );
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 10. Archivage d'une unité
routesAdministrationTerritoriale.post("/unites/:id/archiver", async (c) => {
  const id = c.req.param("id");
  const type = c.req.query("type") as TypeUniteTerritoriale;
  if (!type) {
    return c.json({ erreur: "Le paramètre de requête 'type' est requis." }, 400);
  }
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaArchivageUniteTerritoriale.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données d'archivage invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await archiverUniteTerritoriale(
      c.env.DB,
      utilisateur,
      type,
      id,
      parseResult.data.motif,
      adresseIp(c)
    );
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 11. Réactivation d'une unité archivée
routesAdministrationTerritoriale.post("/unites/:id/reactiver", async (c) => {
  const id = c.req.param("id");
  const type = c.req.query("type") as TypeUniteTerritoriale;
  if (!type) {
    return c.json({ erreur: "Le paramètre de requête 'type' est requis pour réactiver une unité." }, 400);
  }
  let motif = "Réactivation administrative par le Propriétaire";
  try {
    const corps = (await c.req.json()) as { motif?: string };
    if (corps?.motif && typeof corps.motif === "string" && corps.motif.trim().length >= 5) {
      motif = corps.motif.trim();
    }
  } catch {
    // Si pas de corps, utiliser motif par défaut
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await reactiverUniteTerritoriale(
      c.env.DB,
      utilisateur,
      type,
      id,
      motif,
      adresseIp(c)
    );
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 12. Suppression sécurisée d'une unité
routesAdministrationTerritoriale.delete("/unites/:id", async (c) => {
  const id = c.req.param("id");
  const type = c.req.query("type") as TypeUniteTerritoriale;
  if (!type) {
    return c.json({ erreur: "Le paramètre query 'type' est requis pour supprimer une unité." }, 400);
  }
  let motif = "Suppression administrative";
  try {
    const corps = await c.req.json() as { motif?: string };
    if (corps?.motif) motif = corps.motif;
  } catch {
    // Si pas de corps, utiliser motif par défaut
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await supprimerUniteTerritoriale(c.env.DB, utilisateur, type, id, motif, adresseIp(c));
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 13. Validation administrative formelle unitaire
routesAdministrationTerritoriale.post("/unites/:id/valider", async (c) => {
  const id = c.req.param("id");
  const type = (c.req.query("type") as TypeUniteTerritoriale) || "DEPARTEMENT";
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaValidationUniteTerritoriale.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de validation administrative invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await validerUniteTerritoriale(c.env.DB, utilisateur, type, id, parseResult.data, adresseIp(c));
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 14. Validation en lot (validation groupée de départements ou localités)
routesAdministrationTerritoriale.post("/unites/valider-lot", async (c) => {
  const type = (c.req.query("type") as TypeUniteTerritoriale) || "DEPARTEMENT";
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  const parseResult = schemaValidationLotTerritoire.safeParse(corps);
  if (!parseResult.success) {
    return c.json({ erreur: "Données de validation par lot invalides.", details: parseResult.error.flatten() }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await validerLotUnitesTerritoriales(c.env.DB, utilisateur, type, parseResult.data, adresseIp(c));
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 15. Détection de doublons toponymiques provinciaux
routesAdministrationTerritoriale.get("/doublons", async (c) => {
  const type = (c.req.query("type") as TypeUniteTerritoriale | undefined) ?? "VILLAGE";
  try {
    const doublons = await detecterDoublonsTerritoriaux(c.env.DB, type);
    return c.json({ doublons });
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 16. Prévisualisation d'un fichier CSV ou Excel (XLSX) d'unités territoriales
routesAdministrationTerritoriale.post("/import/previsualiser", async (c) => {
  const contentType = c.req.header("content-type") || "";
  
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await c.req.formData();
      const file = form.get("fichier") as File | null;
      if (!file) {
        return c.json({ erreur: "Le champ de fichier 'fichier' est requis dans le formulaire multipart." }, 400);
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      const previsualisation = await previsualiserImportTerritoireFichier(c.env.DB, buffer, file.name);
      return c.json(previsualisation);
    } catch (erreur) {
      return reponseErreur(c, erreur);
    }
  }

  let corps: { csv?: string; fichier_base64?: string; nom_fichier?: string };
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON ou multipart/form-data invalide." }, 400);
  }

  try {
    if (corps?.fichier_base64 && typeof corps.fichier_base64 === "string") {
      const binary = Uint8Array.from(atob(corps.fichier_base64), (ch) => ch.charCodeAt(0));
      const previsualisation = await previsualiserImportTerritoireFichier(c.env.DB, binary, corps.nom_fichier || "fichier.xlsx");
      return c.json(previsualisation);
    }

    if (corps?.csv && typeof corps.csv === "string") {
      const previsualisation = await previsualiserImportTerritoireFichier(c.env.DB, corps.csv, corps.nom_fichier || "import.csv");
      return c.json(previsualisation);
    }

    return c.json({ erreur: "Le contenu CSV ('csv') ou le fichier encodé ('fichier_base64') est requis." }, 400);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 17. Exécution d'un import en lot après validation
routesAdministrationTerritoriale.post("/import/executer", async (c) => {
  let corps: { lignes?: any[] };
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Corps de requête JSON invalide." }, 400);
  }
  if (!Array.isArray(corps?.lignes) || corps.lignes.length === 0) {
    return c.json({ erreur: "Une liste de lignes valides sous la clé 'lignes' est requise." }, 400);
  }
  try {
    const utilisateur = c.get("utilisateur");
    const resultat = await executerImportTerritoire(c.env.DB, utilisateur, corps.lignes, adresseIp(c));
    return c.json(resultat);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 18. Exportation CSV du référentiel territorial complet
routesAdministrationTerritoriale.get("/export", async (c) => {
  const type = c.req.query("type") as TypeUniteTerritoriale | undefined;
  const provinceId = c.req.query("province_id") || undefined;
  try {
    const csvContent = await exporterTerritoireCsv(c.env.DB, type, provinceId);
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="referentiel_territorial_sigad_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 18b. Exportation XLSX du référentiel territorial complet ou filtré
routesAdministrationTerritoriale.get("/export-xlsx", async (c) => {
  const type = c.req.query("type") as TypeUniteTerritoriale | undefined;
  const provinceId = c.req.query("province_id") || undefined;
  try {
    const xlsxBuffer = await exporterTerritoireXlsx(c.env.DB, type, provinceId);
    return new Response(xlsxBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="referentiel_territorial_sigad_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 19. Consultation du journal d'audit des modifications territoriales
routesAdministrationTerritoriale.get("/audits", async (c) => {
  const type = c.req.query("type") || undefined;
  const action = c.req.query("action") || undefined;
  const limite = Number(c.req.query("limite")) || 50;
  const decalage = Number(c.req.query("decalage")) || 0;
  try {
    const historique = await obtenirHistoriqueAuditsTerritoire(c.env.DB, {
      type,
      action,
      limite,
      decalage,
    });
    return c.json(historique);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});
