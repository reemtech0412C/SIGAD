import { creerInstructionAudit } from "../middlewares/audit.middleware.ts";
import { creerInstructionNotification } from "./notifications.service.ts";
import { detecterTypeMimeDocument, typeErreurSecurise } from "./fichiers-securite.service.ts";
import { televerserPuisReferencerR2 } from "./stockage-r2.service.ts";
import { lireEtatClotureDistribution } from "./controle.service.ts";
import type { EnvironnementApplication, UtilisateurSession } from "../bindings.ts";
import { allouerLotsFefo, creerReference, executerOperationIdempotente, rejouerOperationIdempotente, type AllocationLot, type LotFefoD1 } from "./stock.service.ts";
import type {
  FiltresDistributions,
  PlanDistributionSaisi,
  RemiseDistributionSaisie,
} from "../../../shared/validations/distributions.ts";

const MAX_LOTS_PAR_OPERATION = 16;
const MAX_LOTS_PAR_REMISE = 12;
const EPSILON_QUANTITE = 0.000001;
const ROLES_LECTURE = ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;

type Database = EnvironnementApplication["Bindings"]["DB"];
type Ecriture = D1PreparedStatement;

async function avecContexteLecture<T>(contexte: string, lecture: () => Promise<T>): Promise<T> {
  try {
    return await lecture();
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur de lecture inconnue";
    throw new Error(`${contexte} : ${message}`);
  }
}

interface DistributionD1 {
  id: string;
  reference_distribution: string;
  intitule_distribution: string;
  province_id: string;
  province_nom: string;
  departement_id: string;
  departement_nom: string;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  nature_aide: string;
  bailleur_fonds_id: string | null;
  partenaire_execution_id: string | null;
  objectif: string;
  nombre_menages_cibles: number;
  nombre_personnes_cibles: number;
  date_prevue: string;
  entrepot_id: string;
  entrepot_nom: string;
  liste_beneficiaires_id: string | null;
  statut: string;
  version_plan: number;
  observations: string | null;
  cree_par: string;
  date_declaration_fin: string | null;
  cree_le: string;
  modifie_le: string;
}

interface ArticlePlanD1 {
  id: string;
  article_id: string;
  code_article: string;
  designation: string;
  unite: string;
  source_approvisionnement: "APPROVISIONNEMENT_CENTRAL" | "APPROVISIONNEMENT_DIRECT" | "STOCK_EXISTANT" | "MIXTE";
  ration_par_menage: number;
  quantite_totale_prevue: number;
  quantite_reservee: number;
  quantite_distribuee: number;
  decimales_autorisees: number;
}

interface AllocationD1 {
  id: string;
  menage_distribution_id: string;
  distribution_id: string;
  article_id: string;
  designation: string;
  quantite_prevue: number;
  quantite_servie: number;
}

interface MenageDistributionD1 {
  id: string;
  menage_id: string;
  code_menage: string;
  nom_chef_menage: string;
  nombre_personnes: number;
  province_id: string;
  zone_distribution_id: string | null;
  statut_service: "EN_ATTENTE" | "SERVI" | "PARTIELLEMENT_SERVI" | "ABSENT" | "NON_SERVI";
  date_service: string | null;
  motif_non_service: string | null;
}

interface ReservationD1 extends LotFefoD1 {
  lot_stock_id: string;
  reservation_id: string;
  quantite_reservee_reservation: number;
  quantite_consommee: number;
  quantite_liberee: number;
  statut_reservation: string;
}

interface PlanPrepare {
  id: string;
  reference: string;
  provinceId: string;
  departementId: string;
  nombrePersonnes: number;
  zones: Array<{
    id: string;
    index: number;
    localite_id: string | null;
    arrondissement_id: string | null;
    quartier_id: string | null;
    carre_id: string | null;
    site_humanitaire_id: string | null;
    nom_site_distribution: string;
  }>;
  menages: Array<{ id: string; menage_id: string; index_zone: number }>;
  articles: Array<{
    article_id: string;
    source_approvisionnement: ArticlePlanD1["source_approvisionnement"];
    ration_par_menage: number;
    quantite_totale_prevue: number;
  }>;
  allocations: Array<{
    id: string;
    menage_distribution_id: string;
    distribution_id: string;
    article_id: string;
    quantite_prevue: number;
    quantite_servie: number;
  }>;
  listeBeneficiairesId: string | null;
}

export class ErreurDistribution extends Error {
  readonly statutHttp: number;

  constructor(message: string, statutHttp = 409) {
    super(message);
    this.name = "ErreurDistribution";
    this.statutHttp = statutHttp;
  }
}

function preparerAudit(
  db: Database,
  utilisateur: UtilisateurSession,
  action: string,
  type: string,
  id: string,
  adresseIp: string | null,
  donnees: unknown,
): Ecriture {
  return creerInstructionAudit(db, {
    utilisateur,
    action,
    entiteType: type,
    entiteId: id,
    adresseIp,
    donneesApres: JSON.stringify(donnees),
  });
}

function exigerDelegue(utilisateur: UtilisateurSession): string {
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) {
    throw new ErreurDistribution("Cette opération est réservée au délégué provincial.", 403);
  }
  return utilisateur.province_id;
}

function verifierLecture(utilisateur: UtilisateurSession): void {
  if (!ROLES_LECTURE.includes(utilisateur.role)) throw new ErreurDistribution("Accès refusé.", 403);
}

function validerCleIdempotence(cle: string): void {
  if (!/^[A-Za-z0-9._:-]{16,160}$/u.test(cle)) {
    throw new ErreurDistribution("Une clé X-Idempotency-Key valide est obligatoire.", 400);
  }
}

async function rejouer<T>(
  db: Database,
  utilisateur: UtilisateurSession,
  routeApi: string,
  cle: string,
  chargeUtile: unknown,
): Promise<{ statutHttp: number; corps: T; rejouee: boolean } | null> {
  return rejouerOperationIdempotente<T>({ db, utilisateur, routeApi, cle, chargeUtile });
}

function creerReferenceDistribution(codeProvince: string, id: string): string {
  const annee = new Date().getUTCFullYear();
  return `DIST-${codeProvince.replace(/^TD-/u, "")}-${annee}-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

async function lireDistributionAutorisee(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
): Promise<DistributionD1> {
  verifierLecture(utilisateur);
  const provinceCondition = utilisateur.role === "DELEGUE_PROVINCIAL" ? " AND d.province_id = ?" : "";
  const valeurs: string[] = [distributionId];
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id) throw new ErreurDistribution("Aucune province n’est associée à votre compte.", 403);
    valeurs.push(utilisateur.province_id);
  }
  const distribution = await db.prepare(
    `SELECT d.id, d.reference_distribution, d.intitule_distribution, d.province_id,
       p.nom AS province_nom, d.departement_id, dep.nom AS departement_nom,
       d.sous_prefecture_id, d.commune_id, d.nature_aide, d.bailleur_fonds_id,
       d.partenaire_execution_id, d.objectif, d.nombre_menages_cibles,
       d.nombre_personnes_cibles, d.date_prevue, d.entrepot_id, e.nom AS entrepot_nom,
       d.liste_beneficiaires_id, d.statut, d.version_plan, d.observations,
       d.cree_par, d.date_declaration_fin, d.cree_le, d.modifie_le
     FROM distributions_provinciales d
     INNER JOIN provinces p ON p.id = d.province_id
     INNER JOIN departements dep ON dep.id = d.departement_id
     INNER JOIN entrepots e ON e.id = d.entrepot_id
     WHERE d.id = ?${provinceCondition}`,
  ).bind(...valeurs).first<DistributionD1>();
  if (!distribution) throw new ErreurDistribution("Distribution introuvable dans votre périmètre.", 404);
  return distribution;
}

async function validerPlanEtPreparer(
  db: Database,
  provinceId: string,
  plan: PlanDistributionSaisi,
): Promise<PlanPrepare> {
  const entrepot = await db.prepare(
    `SELECT id FROM entrepots
     WHERE id = ? AND niveau = 'PROVINCIAL' AND province_id = ? AND actif = 1`,
  ).bind(plan.entrepot_id, provinceId).first<{ id: string }>();
  if (!entrepot) throw new ErreurDistribution("L’entrepôt doit être actif et relever de votre province.", 403);

  const menagesJson = JSON.stringify(plan.menages.map((menage) => ({ id: menage.menage_id })));
  const resultatMenages = await avecContexteLecture("Vérification des ménages sélectionnés", () => db.prepare(
    `SELECT COUNT(*) AS nombre, COALESCE(SUM(m.nombre_personnes), 0) AS personnes
     FROM json_each(?) selection
     INNER JOIN menages m ON m.id = json_extract(selection.value, '$.id')
     WHERE m.province_id = ? AND m.departement_id = ? AND m.statut = 'ACTIF'`,
  ).bind(menagesJson, provinceId, plan.departement_id).first<{ nombre: number; personnes: number }>());
  if ((resultatMenages?.nombre ?? 0) !== plan.menages.length) {
    throw new ErreurDistribution("Un ménage est absent, inactif ou hors de votre périmètre territorial.", 400);
  }

  const articlesJson = JSON.stringify(plan.articles.map((article) => ({ id: article.article_id })));
  const articlesExistants = await avecContexteLecture("Vérification des articles sélectionnés", () => db.prepare(
    `SELECT a.id, u.decimales_autorisees
     FROM json_each(?) selection
     INNER JOIN articles a ON a.id = json_extract(selection.value, '$.id') AND a.actif = 1
     INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id`,
  ).bind(articlesJson).all<{ id: string; decimales_autorisees: number }>());
  if (articlesExistants.results.length !== plan.articles.length) {
    throw new ErreurDistribution("Un article est introuvable ou inactif.", 400);
  }
  const precisionParArticle = new Map(articlesExistants.results.map((article) => [article.id, article.decimales_autorisees]));
  for (const article of plan.articles) {
    const precision = precisionParArticle.get(article.article_id);
    if (precision === undefined || Math.abs(article.ration_par_menage * 10 ** precision - Math.round(article.ration_par_menage * 10 ** precision)) > EPSILON_QUANTITE) {
      throw new ErreurDistribution("Une ration dépasse la précision autorisée pour l’unité de mesure.", 400);
    }
  }

  const partenaires = [plan.bailleur_fonds_id, plan.partenaire_execution_id].filter((valeur): valeur is string => Boolean(valeur));
  if (partenaires.length > 0) {
    const partenairesUniques = [...new Set(partenaires)];
    const emplacements = partenairesUniques.map(() => "?").join(", ");
    const roles = await avecContexteLecture("Vérification des rôles des partenaires", () => db.prepare(
      `SELECT p.id, p.statut_validation, rp.role
       FROM partenaires p
       INNER JOIN roles_partenaires rp ON rp.partenaire_id = p.id
       WHERE p.id IN (${emplacements})`,
    ).bind(...partenairesUniques).all<{ id: string; statut_validation: string; role: string }>());
    const rolesParPartenaire = new Map<string, Set<string>>();
    for (const role of roles.results) {
      if (role.statut_validation !== "VALIDE") continue;
      const associes = rolesParPartenaire.get(role.id) ?? new Set<string>();
      associes.add(role.role);
      rolesParPartenaire.set(role.id, associes);
    }
    if (plan.bailleur_fonds_id && !["BAILLEUR_DE_FONDS", "DONATEUR"].some((role) => rolesParPartenaire.get(plan.bailleur_fonds_id ?? "")?.has(role))) {
      throw new ErreurDistribution("Le partenaire financier doit être validé comme bailleur ou donateur.", 400);
    }
    if (plan.partenaire_execution_id && !rolesParPartenaire.get(plan.partenaire_execution_id)?.has("PARTENAIRE_EXECUTION")) {
      throw new ErreurDistribution("Le partenaire d’exécution doit être validé dans ce rôle.", 400);
    }
  }

  if (plan.liste_beneficiaires_id) {
    const inscription = await avecContexteLecture("Vérification de la liste des bénéficiaires", () => db.prepare(
      `SELECT COUNT(*) AS nombre
       FROM listes_beneficiaires lb
       WHERE lb.id = ? AND lb.province_id = ? AND lb.statut IN ('PRETE', 'VERROUILLEE')
         AND (SELECT COUNT(*) FROM json_each(?) selection
              INNER JOIN inscriptions_beneficiaires ib ON ib.menage_id = json_extract(selection.value, '$.id')
              WHERE ib.liste_id = lb.id AND ib.statut_verification = 'VALIDE') = ?`,
    ).bind(plan.liste_beneficiaires_id, provinceId, menagesJson, plan.menages.length).first<{ nombre: number }>());
    if (inscription?.nombre !== 1) throw new ErreurDistribution("La liste prête ne contient pas tous les ménages sélectionnés.", 400);
  }

  const id = crypto.randomUUID();
  const reference = await db.prepare("SELECT code FROM provinces WHERE id = ? AND actif = 1").bind(provinceId).first<{ code: string }>();
  if (!reference) throw new ErreurDistribution("La province de session est introuvable ou inactive.", 403);
  const zones = plan.zones.map((zone, index) => ({
    id: crypto.randomUUID(),
    index,
    localite_id: zone.localite_id ?? null,
    arrondissement_id: zone.arrondissement_id ?? null,
    quartier_id: zone.quartier_id ?? null,
    carre_id: zone.carre_id ?? null,
    site_humanitaire_id: zone.site_humanitaire_id ?? null,
    nom_site_distribution: zone.nom_site_distribution,
  }));
  const menages = plan.menages.map((menage) => ({
    id: crypto.randomUUID(),
    menage_id: menage.menage_id,
    index_zone: menage.index_zone,
  }));
  const articlePlan = plan.articles.map((article) => ({
    article_id: article.article_id,
    source_approvisionnement: article.source_approvisionnement,
    ration_par_menage: article.ration_par_menage,
    quantite_totale_prevue: article.ration_par_menage * menages.length,
  }));
  const allocations = menages.flatMap((menage) => articlePlan.map((article) => ({
    id: crypto.randomUUID(),
    menage_distribution_id: menage.id,
    distribution_id: id,
    article_id: article.article_id,
    quantite_prevue: article.ration_par_menage,
    quantite_servie: 0,
  })));
  return {
    id,
    reference: creerReferenceDistribution(reference.code, id),
    provinceId,
    departementId: plan.departement_id,
    nombrePersonnes: resultatMenages?.personnes ?? 0,
    zones,
    menages,
    articles: articlePlan,
    allocations,
    listeBeneficiairesId: plan.liste_beneficiaires_id ?? null,
  };
}

function construireInstructionsCreation(
  db: Database,
  utilisateur: UtilisateurSession,
  plan: PlanDistributionSaisi,
  prepare: PlanPrepare,
  adresseIp: string | null,
): Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> {
  const maintenant = new Date().toISOString();
  return [
    {
      operation: "la création de la distribution",
      instruction: db.prepare(
        `INSERT INTO distributions_provinciales
         (id, reference_distribution, intitule_distribution, province_id, departement_id,
          sous_prefecture_id, commune_id, nature_aide, bailleur_fonds_id, partenaire_execution_id,
          objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue, entrepot_id,
          liste_beneficiaires_id, observations, cree_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        prepare.id, prepare.reference, plan.intitule_distribution, prepare.provinceId,
        plan.departement_id, plan.sous_prefecture_id ?? null, plan.commune_id ?? null,
        plan.nature_aide, plan.bailleur_fonds_id ?? null, plan.partenaire_execution_id ?? null,
        plan.objectif, prepare.menages.length, prepare.nombrePersonnes, plan.date_prevue,
        plan.entrepot_id, prepare.listeBeneficiairesId, plan.observations ?? null, utilisateur.id,
      ),
      changementsAttendus: 1,
    },
    {
      operation: "l’enregistrement des zones de distribution",
      instruction: db.prepare(
        `INSERT INTO zones_distribution
         (id, distribution_id, province_id, localite_id, arrondissement_id, quartier_id, carre_id, site_humanitaire_id, nom_site_distribution)
         SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.localite_id'),
           json_extract(value, '$.arrondissement_id'), json_extract(value, '$.quartier_id'),
           json_extract(value, '$.carre_id'), json_extract(value, '$.site_humanitaire_id'),
           json_extract(value, '$.nom_site_distribution') FROM json_each(?)`,
      ).bind(prepare.id, prepare.provinceId, JSON.stringify(prepare.zones.map((zone) => ({
        ...zone,
        nom_site_distribution: plan.zones[zone.index]?.nom_site_distribution,
      })))),
      changementsAttendus: prepare.zones.length,
    },
    {
      operation: "l’enregistrement des articles planifiés",
      instruction: db.prepare(
        `INSERT INTO articles_distribution
         (id, distribution_id, article_id, source_approvisionnement, ration_par_menage, quantite_totale_prevue)
         SELECT lower(hex(randomblob(16))), ?, json_extract(value, '$.article_id'),
           json_extract(value, '$.source_approvisionnement'), json_extract(value, '$.ration_par_menage'),
           json_extract(value, '$.quantite_totale_prevue') FROM json_each(?)`,
      ).bind(prepare.id, JSON.stringify(prepare.articles)),
      changementsAttendus: prepare.articles.length,
    },
    {
      operation: "l’enregistrement des ménages cibles",
      instruction: db.prepare(
        `INSERT INTO menages_distribution (id, distribution_id, province_id, menage_id, zone_distribution_id)
         SELECT json_extract(selection.value, '$.id'), ?, ?, json_extract(selection.value, '$.menage_id'),
           (SELECT json_extract(zone.value, '$.id') FROM json_each(?) zone
            WHERE CAST(json_extract(zone.value, '$.index') AS INTEGER) = CAST(json_extract(selection.value, '$.index_zone') AS INTEGER))
         FROM json_each(?) selection`,
      ).bind(prepare.id, prepare.provinceId, JSON.stringify(prepare.zones), JSON.stringify(prepare.menages)),
      changementsAttendus: prepare.menages.length,
    },
    {
      operation: "l’enregistrement des allocations individuelles",
      instruction: db.prepare(
        `INSERT INTO allocations_distribution
         (id, menage_distribution_id, distribution_id, article_id, quantite_prevue, quantite_servie)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.menage_distribution_id'),
           json_extract(value, '$.distribution_id'), json_extract(value, '$.article_id'),
           json_extract(value, '$.quantite_prevue'), json_extract(value, '$.quantite_servie')
         FROM json_each(?)`,
      ).bind(JSON.stringify(prepare.allocations)),
      changementsAttendus: prepare.allocations.length,
    },
    {
      operation: "l’historique initial de la distribution",
      instruction: db.prepare(
        `INSERT INTO historique_statuts
         (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
         VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, NULL, 'BROUILLON', 'Création du plan de distribution.', ?)`,
      ).bind(crypto.randomUUID(), prepare.id, utilisateur.id),
      changementsAttendus: 1,
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: preparerAudit(db, utilisateur, "CREATION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", prepare.id, adresseIp, {
        reference_distribution: prepare.reference,
        province_id: prepare.provinceId,
        nombre_menages_cibles: prepare.menages.length,
        nombre_articles: prepare.articles.length,
        cree_le: maintenant,
      }),
      changementsAttendus: 1,
    },
  ];
}

export async function creerDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  plan: PlanDistributionSaisi,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = "/api/distributions";
  const rejouee = await rejouer<{ id: string; reference_distribution: string; statut: string }>(db, utilisateur, routeApi, cle, plan);
  if (rejouee) return rejouee;
  let prepare: PlanPrepare;
  try {
    prepare = await validerPlanEtPreparer(db, provinceId, plan);
  } catch (erreur) {
    if (erreur instanceof ErreurDistribution) throw erreur;
    const message = erreur instanceof Error ? erreur.message : "Erreur de validation inconnue";
    throw new Error(`Prévalidation du plan impossible : ${message}`);
  }
  const reponse = { id: prepare.id, reference_distribution: prepare.reference, statut: "BROUILLON" };
  return executerOperationIdempotente({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: plan,
    statutHttp: 201,
    corps: reponse,
    instructions: construireInstructionsCreation(db, utilisateur, plan, prepare, adresseIp),
  });
}

export async function modifierDistributionBrouillon(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  plan: PlanDistributionSaisi,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const existante = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (existante.province_id !== provinceId || !["BROUILLON", "EN_PREPARATION"].includes(existante.statut)) {
    throw new ErreurDistribution("Seul un brouillon peut être modifié.", 409);
  }
  const routeApi = `/api/distributions/${distributionId}`;
  const rejouee = await rejouer<{ id: string; version_plan: number }>(db, utilisateur, routeApi, cle, plan);
  if (rejouee) return rejouee;
  const prepare = await validerPlanEtPreparer(db, provinceId, plan);
  prepare.id = distributionId;
  prepare.reference = existante.reference_distribution;
  prepare.menages = prepare.menages.map((menage, index) => ({ ...menage, id: `${distributionId}-menage-${index}-${crypto.randomUUID()}` }));
  prepare.allocations = prepare.menages.flatMap((menage) => prepare.articles.map((article) => ({
    id: crypto.randomUUID(),
    menage_distribution_id: menage.id,
    distribution_id: distributionId,
    article_id: article.article_id,
    quantite_prevue: article.ration_par_menage,
    quantite_servie: 0,
  })));
  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    { operation: "la suppression des anciennes allocations", instruction: db.prepare("DELETE FROM allocations_distribution WHERE distribution_id = ?").bind(distributionId) },
    { operation: "la suppression des anciens ménages cibles", instruction: db.prepare("DELETE FROM menages_distribution WHERE distribution_id = ?").bind(distributionId) },
    { operation: "la suppression des anciennes zones", instruction: db.prepare("DELETE FROM zones_distribution WHERE distribution_id = ?").bind(distributionId) },
    { operation: "la suppression des anciens articles", instruction: db.prepare("DELETE FROM articles_distribution WHERE distribution_id = ?").bind(distributionId) },
    {
      operation: "la mise à jour du brouillon",
      instruction: db.prepare(
        `UPDATE distributions_provinciales SET intitule_distribution = ?, departement_id = ?,
          sous_prefecture_id = ?, commune_id = ?, nature_aide = ?, bailleur_fonds_id = ?,
          partenaire_execution_id = ?, objectif = ?, nombre_menages_cibles = ?, nombre_personnes_cibles = ?,
          date_prevue = ?, entrepot_id = ?, liste_beneficiaires_id = ?, observations = ?,
          version_plan = version_plan + 1, modifie_le = datetime('now')
         WHERE id = ? AND province_id = ? AND statut IN ('BROUILLON', 'EN_PREPARATION')`,
      ).bind(
        plan.intitule_distribution, plan.departement_id, plan.sous_prefecture_id ?? null,
        plan.commune_id ?? null, plan.nature_aide, plan.bailleur_fonds_id ?? null,
        plan.partenaire_execution_id ?? null, plan.objectif, prepare.menages.length,
        prepare.nombrePersonnes, plan.date_prevue, plan.entrepot_id, prepare.listeBeneficiairesId,
        plan.observations ?? null, distributionId, provinceId,
      ),
      changementsAttendus: 1,
    },
    ...construireInstructionsCreation(db, utilisateur, plan, prepare, adresseIp).slice(1, 5),
    {
      operation: "l’enregistrement de la modification du brouillon",
      instruction: preparerAudit(db, utilisateur, "MODIFICATION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, { version_plan: existante.version_plan + 1 }),
      changementsAttendus: 1,
    },
  ];
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile: plan, statutHttp: 200, corps: { id: distributionId, version_plan: existante.version_plan + 1 },
    instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

export async function listerDistributions(
  db: Database,
  utilisateur: UtilisateurSession,
  filtres: FiltresDistributions,
) {
  verifierLecture(utilisateur);
  const delegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  if (delegue && (!utilisateur.province_id || (filtres.province_id && filtres.province_id !== utilisateur.province_id))) {
    throw new ErreurDistribution("Accès refusé hors de votre province.", 403);
  }
  const conditions: string[] = [];
  const valeurs: (string | number)[] = [];
  if (delegue) {
    conditions.push("d.province_id = ?");
    valeurs.push(utilisateur.province_id ?? "");
  } else if (filtres.province_id) {
    conditions.push("d.province_id = ?");
    valeurs.push(filtres.province_id);
  }
  if (filtres.statut) {
    conditions.push("d.statut = ?");
    valeurs.push(filtres.statut);
  }
  if (filtres.recherche) {
    conditions.push("(d.reference_distribution LIKE ? OR d.intitule_distribution LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [liste, total] = await Promise.all([
    db.prepare(
      `SELECT d.id, d.reference_distribution, d.intitule_distribution, d.province_id,
        p.nom AS province_nom, d.date_prevue, d.nature_aide, d.statut,
        d.nombre_menages_cibles, d.nombre_personnes_cibles, d.modifie_le,
        COUNT(DISTINCT md.id) AS menages_inscrits, COUNT(DISTINCT ad.id) AS nombre_articles
       FROM distributions_provinciales d
       INNER JOIN provinces p ON p.id = d.province_id
       LEFT JOIN menages_distribution md ON md.distribution_id = d.id
       LEFT JOIN articles_distribution ad ON ad.distribution_id = d.id
       ${where}
       GROUP BY d.id ORDER BY d.modifie_le DESC, d.id
       LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM distributions_provinciales d ${where}`).bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}

export async function lireDetailDistribution(db: Database, utilisateur: UtilisateurSession, distributionId: string) {
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  const [zones, articles, corrections] = await Promise.all([
    db.prepare(
      `SELECT z.id, z.localite_id, l.nom AS localite_nom, z.arrondissement_id, a.nom AS arrondissement_nom,
        z.quartier_id, q.nom AS quartier_nom, z.carre_id, c.code_ou_nom AS carre_nom,
        z.site_humanitaire_id, sh.nom AS site_humanitaire_nom, z.nom_site_distribution
       FROM zones_distribution z
       LEFT JOIN localites l ON l.id = z.localite_id
       LEFT JOIN arrondissements a ON a.id = z.arrondissement_id
       LEFT JOIN quartiers q ON q.id = z.quartier_id
       LEFT JOIN carres c ON c.id = z.carre_id
       LEFT JOIN sites_humanitaires sh ON sh.id = z.site_humanitaire_id
       WHERE z.distribution_id = ? ORDER BY z.nom_site_distribution, z.id`,
    ).bind(distributionId).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT ad.id, ad.article_id, a.code_article, a.designation, u.libelle AS unite,
        ad.source_approvisionnement, ad.ration_par_menage, ad.quantite_totale_prevue,
        ad.quantite_reservee, ad.quantite_distribuee
       FROM articles_distribution ad
       INNER JOIN articles a ON a.id = ad.article_id
       INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
       WHERE ad.distribution_id = ? ORDER BY a.designation, ad.id`,
    ).bind(distributionId).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT id, motif_retour, elements_a_corriger, statut, reponse_delegue, cree_le, resolu_le
       FROM demandes_correction WHERE distribution_id = ? ORDER BY cree_le DESC, id DESC`,
    ).bind(distributionId).all<Record<string, unknown>>(),
  ]);
  return { ...distribution, zones: zones.results, articles: articles.results, corrections: corrections.results };
}

export async function listerMenagesDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  limite: number,
  decalage: number,
) {
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  const [menages, total] = await Promise.all([
    db.prepare(
      `SELECT md.id, md.menage_id, m.code_menage, m.nom_chef_menage, m.nombre_personnes,
        md.zone_distribution_id, md.statut_service, md.date_service, md.motif_non_service
       FROM menages_distribution md INNER JOIN menages m ON m.id = md.menage_id
       WHERE md.distribution_id = ? AND md.province_id = ?
       ORDER BY m.code_menage, md.id LIMIT ? OFFSET ?`,
    ).bind(distributionId, distribution.province_id, limite, decalage).all<MenageDistributionD1>(),
    db.prepare("SELECT COUNT(*) AS total FROM menages_distribution WHERE distribution_id = ? AND province_id = ?")
      .bind(distributionId, distribution.province_id).first<{ total: number }>(),
  ]);
  return { elements: menages.results, total: total?.total ?? 0, limite, decalage };
}

export async function listerAllocationsMenage(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  menageDistributionId: string,
) {
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  const menage = await db.prepare(
    `SELECT id FROM menages_distribution
     WHERE id = ? AND distribution_id = ? AND province_id = ?`,
  ).bind(menageDistributionId, distributionId, distribution.province_id).first<{ id: string }>();
  if (!menage) throw new ErreurDistribution("Ménage cible introuvable dans votre périmètre.", 404);
  const allocations = await db.prepare(
    `SELECT a.id, a.article_id, ar.designation, u.libelle AS unite,
       a.quantite_prevue, a.quantite_servie, a.quantite_prevue - a.quantite_servie AS quantite_restante
     FROM allocations_distribution a
     INNER JOIN articles ar ON ar.id = a.article_id
     INNER JOIN unites_mesure u ON u.id = ar.unite_mesure_id
     WHERE a.distribution_id = ? AND a.menage_distribution_id = ?
     ORDER BY ar.designation, a.id`,
  ).bind(distributionId, menageDistributionId).all<AllocationD1 & { unite: string; quantite_restante: number }>();
  return allocations.results;
}

export async function listerMenagesCiblesDisponibles(
  db: Database,
  utilisateur: UtilisateurSession,
  filtres: { limite: number; decalage: number; recherche?: string | undefined; departement_id?: string | undefined; localite_id?: string | undefined; site_humanitaire_id?: string | undefined },
) {
  const provinceId = exigerDelegue(utilisateur);
  const conditions = ["m.province_id = ?", "m.statut = 'ACTIF'"];
  const valeurs: (string | number)[] = [provinceId];
  if (filtres.recherche) {
    conditions.push("(m.code_menage LIKE ? OR m.nom_chef_menage LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  if (filtres.departement_id) {
    conditions.push("m.departement_id = ?");
    valeurs.push(filtres.departement_id);
  }
  if (filtres.localite_id) {
    conditions.push("m.localite_id = ?");
    valeurs.push(filtres.localite_id);
  }
  if (filtres.site_humanitaire_id) {
    conditions.push("m.site_humanitaire_id = ?");
    valeurs.push(filtres.site_humanitaire_id);
  }
  const where = conditions.join(" AND ");
  const [liste, total] = await Promise.all([
    db.prepare(
      `SELECT m.id, m.code_menage, m.nom_chef_menage, m.nombre_personnes,
        m.departement_id, m.localite_id, l.nom AS localite_nom, m.site_humanitaire_id,
        sh.nom AS site_humanitaire_nom
       FROM menages m
       LEFT JOIN localites l ON l.id = m.localite_id
       LEFT JOIN sites_humanitaires sh ON sh.id = m.site_humanitaire_id
       WHERE ${where} ORDER BY m.code_menage, m.id LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM menages m WHERE ${where}`).bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}

export async function listerReferentielDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  filtres: { type: string; limite: number; decalage: number; recherche?: string | undefined },
) {
  const provinceId = exigerDelegue(utilisateur);
  const recherche = filtres.recherche ? `%${filtres.recherche}%` : "%";
  if (filtres.type === "entrepots") {
    const [liste, total] = await Promise.all([
      db.prepare(
        `SELECT id, code_entrepot, nom FROM entrepots
         WHERE niveau = 'PROVINCIAL' AND province_id = ? AND actif = 1 AND (nom LIKE ? OR code_entrepot LIKE ?)
         ORDER BY nom, id LIMIT ? OFFSET ?`,
      ).bind(provinceId, recherche, recherche, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
      db.prepare("SELECT COUNT(*) AS total FROM entrepots WHERE niveau = 'PROVINCIAL' AND province_id = ? AND actif = 1 AND (nom LIKE ? OR code_entrepot LIKE ?)")
        .bind(provinceId, recherche, recherche).first<{ total: number }>(),
    ]);
    return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
  }
  if (filtres.type === "articles") {
    const [liste, total] = await Promise.all([
      db.prepare(
        `SELECT a.id, a.code_article, a.designation, u.libelle AS unite, u.decimales_autorisees
         FROM articles a INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
         WHERE a.actif = 1 AND (a.designation LIKE ? OR a.code_article LIKE ?)
         ORDER BY a.designation, a.id LIMIT ? OFFSET ?`,
      ).bind(recherche, recherche, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
      db.prepare("SELECT COUNT(*) AS total FROM articles WHERE actif = 1 AND (designation LIKE ? OR code_article LIKE ?)")
        .bind(recherche, recherche).first<{ total: number }>(),
    ]);
    return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
  }
  if (filtres.type === "partenaires") {
    const [liste, total] = await Promise.all([
      db.prepare(
        `SELECT p.id, p.nom, p.sigle, rp.role FROM partenaires p
         INNER JOIN roles_partenaires rp ON rp.partenaire_id = p.id
         WHERE p.statut_validation = 'VALIDE' AND rp.role IN ('BAILLEUR_DE_FONDS', 'DONATEUR', 'PARTENAIRE_EXECUTION')
           AND p.nom LIKE ? ORDER BY p.nom, rp.role LIMIT ? OFFSET ?`,
      ).bind(recherche, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
      db.prepare(
        `SELECT COUNT(*) AS total FROM partenaires p
         WHERE p.statut_validation = 'VALIDE' AND p.nom LIKE ?
           AND EXISTS (SELECT 1 FROM roles_partenaires rp WHERE rp.partenaire_id = p.id
             AND rp.role IN ('BAILLEUR_DE_FONDS', 'DONATEUR', 'PARTENAIRE_EXECUTION'))`,
      ).bind(recherche).first<{ total: number }>(),
    ]);
    return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
  }
  if (filtres.type === "localites") {
    const [liste, total] = await Promise.all([
      db.prepare(
        `SELECT l.id, l.nom, l.type_localite, l.departement_id, d.nom AS departement_nom
         FROM localites l INNER JOIN departements d ON d.id = l.departement_id
         WHERE l.province_id = ? AND l.statut_validation = 'VALIDE' AND l.nom LIKE ?
         ORDER BY l.nom, l.id LIMIT ? OFFSET ?`,
      ).bind(provinceId, recherche, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
      db.prepare("SELECT COUNT(*) AS total FROM localites WHERE province_id = ? AND statut_validation = 'VALIDE' AND nom LIKE ?")
        .bind(provinceId, recherche).first<{ total: number }>(),
    ]);
    return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
  }
  if (filtres.type === "sites") {
    const [liste, total] = await Promise.all([
      db.prepare(
        `SELECT id, code_site, nom, categorie_site, departement_id
         FROM sites_humanitaires WHERE province_id = ? AND statut_validation = 'VALIDE' AND nom LIKE ?
         ORDER BY nom, id LIMIT ? OFFSET ?`,
      ).bind(provinceId, recherche, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
      db.prepare("SELECT COUNT(*) AS total FROM sites_humanitaires WHERE province_id = ? AND statut_validation = 'VALIDE' AND nom LIKE ?")
        .bind(provinceId, recherche).first<{ total: number }>(),
    ]);
    return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
  }
  const [liste, total] = await Promise.all([
    db.prepare(
      `SELECT id, reference_liste, intitule, nombre_menages_cibles, statut
       FROM listes_beneficiaires WHERE province_id = ? AND statut IN ('PRETE', 'VERROUILLEE') AND intitule LIKE ?
       ORDER BY cree_le DESC, id LIMIT ? OFFSET ?`,
    ).bind(provinceId, recherche, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS total FROM listes_beneficiaires WHERE province_id = ? AND statut IN ('PRETE', 'VERROUILLEE') AND intitule LIKE ?")
      .bind(provinceId, recherche).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}

async function lirePlanComplet(db: Database, distribution: DistributionD1) {
  const [articles, zones, menages, allocations, statistique] = await Promise.all([
    db.prepare(
      `SELECT ad.id, ad.article_id, a.code_article, a.designation, u.libelle AS unite,
        ad.source_approvisionnement, ad.ration_par_menage, ad.quantite_totale_prevue,
        ad.quantite_reservee, ad.quantite_distribuee, u.decimales_autorisees
       FROM articles_distribution ad INNER JOIN articles a ON a.id = ad.article_id
       INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
       WHERE ad.distribution_id = ? ORDER BY ad.article_id`,
    ).bind(distribution.id).all<ArticlePlanD1>(),
    db.prepare("SELECT * FROM zones_distribution WHERE distribution_id = ? ORDER BY id").bind(distribution.id).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT md.id, md.menage_id, m.code_menage, m.nom_chef_menage, m.nombre_personnes,
        md.zone_distribution_id, md.statut_service FROM menages_distribution md
       INNER JOIN menages m ON m.id = md.menage_id
       WHERE md.distribution_id = ? AND md.province_id = ? AND m.statut = 'ACTIF' ORDER BY md.id`,
    ).bind(distribution.id, distribution.province_id).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT a.id, a.menage_distribution_id, a.distribution_id, a.article_id, a.quantite_prevue, a.quantite_servie
       FROM allocations_distribution a WHERE a.distribution_id = ? ORDER BY a.article_id, a.menage_distribution_id`,
    ).bind(distribution.id).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT COUNT(DISTINCT md.id) AS nombre_menages,
        COALESCE(SUM(CASE WHEN md.statut_service <> 'EN_ATTENTE' THEN 1 ELSE 0 END), 0) AS services_commences
       FROM menages_distribution md INNER JOIN menages m ON m.id = md.menage_id
       WHERE md.distribution_id = ? AND md.province_id = ?`,
    ).bind(distribution.id, distribution.province_id).first<{ nombre_menages: number; services_commences: number }>(),
  ]);
  if (articles.results.length === 0 || menages.results.length !== distribution.nombre_menages_cibles
    || allocations.results.length !== menages.results.length * articles.results.length
    || (statistique?.services_commences ?? 0) !== 0) {
    throw new ErreurDistribution("Le plan a changé, comporte un doublon ou ne correspond plus aux ménages actifs.", 409);
  }
  return { articles: articles.results, zones: zones.results, menages: menages.results, allocations: allocations.results };
}

function verifierQuantitePrecision(quantite: number, decimales: number): boolean {
  return Math.abs(quantite * 10 ** decimales - Math.round(quantite * 10 ** decimales)) <= EPSILON_QUANTITE;
}

export async function preparerDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = `/api/distributions/${distributionId}/preparation`;
  const chargeUtile = { distribution_id: distributionId };
  const rejouee = await rejouer<{ id: string; statut: string }>(db, utilisateur, routeApi, cle, chargeUtile);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || distribution.statut !== "BROUILLON") {
    throw new ErreurDistribution("Seul un brouillon de votre province peut passer en préparation.");
  }
  const corps = { id: distributionId, statut: "EN_PREPARATION" };
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile, statutHttp: 200, corps,
    instructions: [
      {
        operation: "la transition du brouillon en préparation",
        instruction: db.prepare(
          `UPDATE distributions_provinciales SET statut = 'EN_PREPARATION', modifie_le = datetime('now')
           WHERE id = ? AND province_id = ? AND statut = 'BROUILLON'`,
        ).bind(distributionId, provinceId),
      },
      {
        operation: "l’historique de préparation",
        instruction: db.prepare(
          `INSERT INTO historique_statuts
           (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
           VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'BROUILLON', 'EN_PREPARATION', NULL, ?)`,
        ).bind(crypto.randomUUID(), distributionId, utilisateur.id),
      },
      {
        operation: "l’audit de la préparation",
        instruction: preparerAudit(db, utilisateur, "PREPARATION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, corps),
      },
    ],
  });
}

async function lireLotsEtSoldes(
  db: Database,
  distribution: DistributionD1,
  articles: ArticlePlanD1[],
): Promise<{ lots: LotFefoD1[]; soldes: Map<string, number> }> {
  const articleIds = [...new Set(articles.map((article) => article.article_id))];
  if (articleIds.length === 0) throw new ErreurDistribution("Le plan ne contient aucun article à réserver.", 409);
  const emplacements = articleIds.map(() => "?").join(", ");
  const lots = await db.prepare(
    `SELECT l.id, l.numero_lot, l.entrepot_id, l.province_id, l.article_id, l.source_type,
      l.source_reference_id, l.partenaire_bailleur_id, l.date_peremption, l.etat_qualite,
      l.quantite_physique, l.quantite_reservee
     FROM lots_stock l
     WHERE l.entrepot_id = ? AND l.province_id = ?
       AND l.article_id IN (${emplacements})
       AND l.etat_qualite = 'BON' AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
       AND l.quantite_physique > l.quantite_reservee
     ORDER BY CASE WHEN l.date_peremption IS NULL THEN 1 ELSE 0 END,
       l.date_peremption ASC, l.cree_le ASC, l.id ASC`,
  ).bind(distribution.entrepot_id, distribution.province_id, ...articleIds).all<LotFefoD1>();
  const soldesD1 = await db.prepare(
    `SELECT article_id, quantite_physique FROM soldes_stock
     WHERE entrepot_id = ? AND province_id = ?
       AND article_id IN (${emplacements})`,
  ).bind(distribution.entrepot_id, distribution.province_id, ...articleIds).all<{ article_id: string; quantite_physique: number }>();
  return { lots: lots.results, soldes: new Map(soldesD1.results.map((solde) => [solde.article_id, solde.quantite_physique])) };
}

function construireSnapshot(distribution: DistributionD1, plan: Awaited<ReturnType<typeof lirePlanComplet>>) {
  return {
    version: distribution.version_plan,
    distribution: {
      id: distribution.id,
      reference_distribution: distribution.reference_distribution,
      intitule_distribution: distribution.intitule_distribution,
      province_id: distribution.province_id,
      departement_id: distribution.departement_id,
      sous_prefecture_id: distribution.sous_prefecture_id,
      commune_id: distribution.commune_id,
      nature_aide: distribution.nature_aide,
      bailleur_fonds_id: distribution.bailleur_fonds_id,
      partenaire_execution_id: distribution.partenaire_execution_id,
      objectif: distribution.objectif,
      date_prevue: distribution.date_prevue,
      entrepot_id: distribution.entrepot_id,
      nombre_menages_cibles: distribution.nombre_menages_cibles,
      nombre_personnes_cibles: distribution.nombre_personnes_cibles,
      liste_beneficiaires_id: distribution.liste_beneficiaires_id,
    },
    zones: plan.zones,
    articles: plan.articles,
    menages: plan.menages,
    allocations: plan.allocations,
  };
}

export async function validerDistributionEtReserver(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = `/api/distributions/${distributionId}/validation`;
  const chargeUtile = { distribution_id: distributionId };
  const rejouee = await rejouer<{ id: string; statut: string; nombre_lots_reserves: number }>(db, utilisateur, routeApi, cle, chargeUtile);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || distribution.statut !== "EN_PREPARATION") {
    throw new ErreurDistribution("La distribution doit être en préparation dans votre province.");
  }
  const plan = await lirePlanComplet(db, distribution);
  const { lots, soldes } = await lireLotsEtSoldes(db, distribution, plan.articles);
  const parArticle = new Map<string, LotFefoD1[]>();
  for (const lot of lots) {
    const associes = parArticle.get(lot.article_id) ?? [];
    associes.push(lot);
    parArticle.set(lot.article_id, associes);
  }
  const reservations: Array<{
    id: string;
    distribution_id: string;
    entrepot_id: string;
    province_id: string;
    article_id: string;
    lot_stock_id: string;
    quantite_reservee: number;
    cree_par: string;
  }> = [];
  const mouvements: Ecriture[] = [];
  const totalLots = new Set<string>();
  for (const article of plan.articles) {
    const lotsCompatibles = (parArticle.get(article.article_id) ?? []).filter((lot) => {
      if (article.source_approvisionnement === "APPROVISIONNEMENT_CENTRAL") return lot.source_type === "APPROVISIONNEMENT_CENTRAL";
      if (article.source_approvisionnement === "APPROVISIONNEMENT_DIRECT") return lot.source_type === "APPROVISIONNEMENT_DIRECT";
      return true;
    });
    const allocations: AllocationLot[] = allouerLotsFefo(lotsCompatibles, article.quantite_totale_prevue, new Date().toISOString().slice(0, 10));
    const precision = article.decimales_autorisees;
    if (!verifierQuantitePrecision(article.quantite_totale_prevue, precision)) {
      throw new ErreurDistribution("Une quantité totale dépasse la précision autorisée.", 400);
    }
    for (const allocation of allocations) {
      totalLots.add(allocation.lot.id);
      reservations.push({
        id: crypto.randomUUID(), distribution_id: distributionId,
        entrepot_id: distribution.entrepot_id, province_id: provinceId,
        article_id: article.article_id, lot_stock_id: allocation.lot.id,
        quantite_reservee: allocation.quantite, cree_par: utilisateur.id,
      });
      const avant = soldes.get(article.article_id) ?? 0;
      mouvements.push(db.prepare(
        `INSERT INTO mouvements_stock
         (id, reference_mouvement, entrepot_id, province_id, article_id, lot_stock_id,
          type_mouvement, sens, quantite, solde_physique_avant, solde_physique_apres,
          document_source_type, document_source_id, motif, auteur_id)
         VALUES (?, ?, ?, ?, ?, ?, 'RESERVATION', 'NEUTRE_RESERVATION', ?, ?, ?, 'DISTRIBUTION_PROVINCIALE', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), creerReference("MVT", crypto.randomUUID()), distribution.entrepot_id,
        provinceId, article.article_id, allocation.lot.id, allocation.quantite, avant, avant,
        distributionId, `Réservation FEFO de la distribution ${distribution.reference_distribution}`, utilisateur.id,
      ));
    }
  }
  if (totalLots.size > MAX_LOTS_PAR_OPERATION) {
    throw new ErreurDistribution(`La validation utiliserait ${totalLots.size} lots. La limite transactionnelle locale est de ${MAX_LOTS_PAR_OPERATION} lots par opération.`, 400);
  }

  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [];
  if (reservations.length > 0) {
    instructions.push({
      operation: "la création des réservations de la distribution",
      instruction: db.prepare(
        `INSERT INTO reservations_stock
         (id, distribution_id, entrepot_id, province_id, article_id, lot_stock_id, quantite_reservee, cree_par)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.distribution_id'),
           json_extract(value, '$.entrepot_id'), json_extract(value, '$.province_id'),
           json_extract(value, '$.article_id'), json_extract(value, '$.lot_stock_id'),
           json_extract(value, '$.quantite_reservee'), json_extract(value, '$.cree_par')
         FROM json_each(?)`,
      ).bind(JSON.stringify(reservations)),
      changementsAttendus: reservations.length,
    });
  }
  for (let index = 0; index < reservations.length; index += 1) {
    const reservation = reservations[index];
    const allocation = reservation ? plan.articles.flatMap((article) => {
      const lot = (parArticle.get(article.article_id) ?? []).find((element) => element.id === reservation.lot_stock_id);
      return lot ? [{ article, lot }] : [];
    }).find((element) => element.article.article_id === reservation.article_id) : undefined;
    if (!reservation || !allocation) throw new ErreurDistribution("Une réservation de lot est incohérente.", 500);
    instructions.push({
      operation: "la réservation conditionnelle du lot",
      instruction: db.prepare(
        `UPDATE lots_stock SET quantite_reservee = quantite_reservee + ?
         WHERE id = ? AND entrepot_id = ? AND province_id = ? AND article_id = ?
           AND etat_qualite = 'BON' AND (date_peremption IS NULL OR date_peremption >= date('now'))
           AND quantite_reservee = ? AND quantite_physique - quantite_reservee >= ?`,
      ).bind(
        reservation.quantite_reservee, reservation.lot_stock_id, reservation.entrepot_id,
        reservation.province_id, reservation.article_id, allocation.lot.quantite_reservee,
        reservation.quantite_reservee,
      ),
      changementsAttendus: 1,
    });
    const mouvement = mouvements[index];
    if (!mouvement) throw new ErreurDistribution("Le mouvement de réservation est absent.", 500);
    instructions.push({ operation: "l’écriture du mouvement de réservation", instruction: mouvement, changementsAttendus: 1 });
  }
  const reservesJson = JSON.stringify(plan.articles.map((article) => ({
    article_id: article.article_id,
    quantite: reservations.filter((reservation) => reservation.article_id === article.article_id)
      .reduce((total, reservation) => total + reservation.quantite_reservee, 0),
  })));
  instructions.push({
    operation: "la mise à jour des quantités réservées du plan",
    instruction: db.prepare(
      `UPDATE articles_distribution SET quantite_reservee =
         CAST(json_extract((SELECT value FROM json_each(?) payload
           WHERE json_extract(payload.value, '$.article_id') = articles_distribution.article_id), '$.quantite') AS REAL)
       WHERE distribution_id = ?`,
    ).bind(reservesJson, distributionId),
    changementsAttendus: plan.articles.length,
  });
  const snapshot = construireSnapshot(distribution, plan);
  instructions.push(
    {
      operation: "l’archivage du plan validé",
      instruction: db.prepare(
        `INSERT INTO validations_distribution
         (id, distribution_id, province_id, version_validee, valide_par, snapshot_plan_json, observations)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      ).bind(crypto.randomUUID(), distributionId, provinceId, distribution.version_plan, utilisateur.id, JSON.stringify(snapshot)),
      changementsAttendus: 1,
    },
    {
      operation: "la validation provinciale",
      instruction: db.prepare(
        `UPDATE distributions_provinciales SET statut = 'VALIDEE_PROVINCE', modifie_le = datetime('now')
         WHERE id = ? AND province_id = ? AND statut = 'EN_PREPARATION' AND version_plan = ?`,
      ).bind(distributionId, provinceId, distribution.version_plan),
      changementsAttendus: 1,
    },
    {
      operation: "l’historique de validation provinciale",
      instruction: db.prepare(
        `INSERT INTO historique_statuts
         (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
         VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'EN_PREPARATION', 'VALIDEE_PROVINCE', NULL, ?)`,
      ).bind(crypto.randomUUID(), distributionId, utilisateur.id),
      changementsAttendus: 1,
    },
    {
      operation: "l’audit de validation provinciale",
      instruction: preparerAudit(db, utilisateur, "VALIDATION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, {
        version_plan: distribution.version_plan,
        nombre_reservations: reservations.length,
        quantite_totale_reservee: reservations.reduce((total, reservation) => total + reservation.quantite_reservee, 0),
      }),
      changementsAttendus: 1,
    },
  );
  const corps = { id: distributionId, statut: "VALIDEE_PROVINCE", nombre_lots_reserves: reservations.length };
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile,
    statutHttp: 200, corps, instructions,
  });
}

export async function demarrerExecutionDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = `/api/distributions/${distributionId}/execution`;
  const chargeUtile = { distribution_id: distributionId };
  const rejouee = await rejouer<{ id: string; statut: string }>(db, utilisateur, routeApi, cle, chargeUtile);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || distribution.statut !== "VALIDEE_PROVINCE") {
    throw new ErreurDistribution("Seule une distribution validée peut passer en exécution.");
  }
  const corps = { id: distributionId, statut: "EN_EXECUTION" };
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile, statutHttp: 200, corps,
    instructions: [
      { operation: "la transition vers l’exécution", instruction: db.prepare(
        `UPDATE distributions_provinciales SET statut = 'EN_EXECUTION', modifie_le = datetime('now')
         WHERE id = ? AND province_id = ? AND statut = 'VALIDEE_PROVINCE'`,
      ).bind(distributionId, provinceId), changementsAttendus: 1 },
      { operation: "l’historique de démarrage de l’exécution", instruction: db.prepare(
        `INSERT INTO historique_statuts
         (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
         VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'VALIDEE_PROVINCE', 'EN_EXECUTION', NULL, ?)`,
      ).bind(crypto.randomUUID(), distributionId, utilisateur.id), changementsAttendus: 1 },
      { operation: "l’audit du démarrage de l’exécution", instruction: preparerAudit(
        db, utilisateur, "EXECUTION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, corps,
      ), changementsAttendus: 1 },
    ],
  });
}

async function lireReservationsActivesPourArticle(db: Database, distributionId: string, articleId: string): Promise<ReservationD1[]> {
  const resultat = await db.prepare(
    `SELECT l.id, l.id AS lot_stock_id, l.numero_lot, l.entrepot_id, l.province_id, l.article_id, l.source_type,
      l.source_reference_id, l.partenaire_bailleur_id, l.date_peremption, l.etat_qualite,
      l.quantite_physique, l.quantite_reservee,
      r.id AS reservation_id, r.quantite_reservee AS quantite_reservee_reservation,
      r.quantite_consommee, r.quantite_liberee, r.statut AS statut_reservation
     FROM reservations_stock r INNER JOIN lots_stock l ON l.id = r.lot_stock_id
     WHERE r.distribution_id = ? AND r.article_id = ? AND r.statut = 'ACTIVE'
       AND r.quantite_reservee - r.quantite_consommee - r.quantite_liberee > 0.000001
     ORDER BY CASE WHEN l.date_peremption IS NULL THEN 1 ELSE 0 END,
       l.date_peremption ASC, l.cree_le ASC, l.id ASC`,
  ).bind(distributionId, articleId).all<ReservationD1>();
  return resultat.results;
}

export async function enregistrerRemiseDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  entree: RemiseDistributionSaisie,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = `/api/distributions/${distributionId}/remises`;
  const chargeUtile = { distribution_id: distributionId, ...entree };
  const rejouee = await rejouer<{ id: string; reference_remise: string; statut_service: string; nombre_lignes: number }>(
    db, utilisateur, routeApi, cle, chargeUtile,
  );
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || distribution.statut !== "EN_EXECUTION") {
    throw new ErreurDistribution("La distribution n’est pas ouverte aux remises dans votre province.");
  }
  const menage = await db.prepare(
    `SELECT id, menage_id, statut_service FROM menages_distribution
     WHERE id = ? AND distribution_id = ? AND province_id = ?`,
  ).bind(entree.menage_distribution_id, distributionId, provinceId).first<{
    id: string; menage_id: string; statut_service: MenageDistributionD1["statut_service"];
  }>();
  if (!menage) throw new ErreurDistribution("Ménage cible introuvable dans votre province.", 404);
  if (!["EN_ATTENTE", "PARTIELLEMENT_SERVI"].includes(menage.statut_service)) {
    throw new ErreurDistribution("Ce ménage a déjà un statut terminal dans la distribution.");
  }
  const allocationsResultat = await db.prepare(
    `SELECT a.id, a.menage_distribution_id, a.distribution_id, a.article_id,
      ar.designation, a.quantite_prevue, a.quantite_servie
     FROM allocations_distribution a INNER JOIN articles ar ON ar.id = a.article_id
     WHERE a.distribution_id = ? AND a.menage_distribution_id = ?`,
  ).bind(distributionId, entree.menage_distribution_id).all<AllocationD1>();
  const allocations = new Map(allocationsResultat.results.map((allocation) => [allocation.id, allocation]));
  const lignesPreparees: Array<{
    allocation_id: string;
    article_id: string;
    quantite_remise: number;
    quantite_avant: number;
    quantite_apres: number;
    lots: Array<{ reservation: ReservationD1; quantite: number; quantite_consommee_avant: number }>;
  }> = [];
  const lotsTotal = new Set<string>();
  for (const ligne of entree.lignes) {
    const allocation = allocations.get(ligne.allocation_id);
    if (!allocation) throw new ErreurDistribution("Une allocation demandée n’appartient pas à ce ménage.", 400);
    const quantiteApres = allocation.quantite_servie + ligne.quantite_remise;
    if (quantiteApres > allocation.quantite_prevue + EPSILON_QUANTITE) {
      throw new ErreurDistribution("La quantité remise dépasse l’allocation prévue pour ce ménage.", 409);
    }
    const reservations = await lireReservationsActivesPourArticle(db, distributionId, allocation.article_id);
    let restant = ligne.quantite_remise;
    const lots: Array<{ reservation: ReservationD1; quantite: number; quantite_consommee_avant: number }> = [];
    for (const reservation of reservations) {
      if (restant <= EPSILON_QUANTITE) break;
      const disponible = reservation.quantite_reservee_reservation - reservation.quantite_consommee - reservation.quantite_liberee;
      const quantite = Math.min(disponible, restant);
      if (quantite <= EPSILON_QUANTITE) continue;
      lots.push({ reservation, quantite, quantite_consommee_avant: reservation.quantite_consommee });
      lotsTotal.add(reservation.lot_stock_id);
      restant -= quantite;
    }
    if (restant > EPSILON_QUANTITE) throw new ErreurDistribution("La quantité réservée restante ne couvre pas cette remise.", 409);
    lignesPreparees.push({
      allocation_id: allocation.id,
      article_id: allocation.article_id,
      quantite_remise: ligne.quantite_remise,
      quantite_avant: allocation.quantite_servie,
      quantite_apres: quantiteApres,
      lots,
    });
  }
  if (lotsTotal.size > MAX_LOTS_PAR_REMISE) {
    throw new ErreurDistribution(`La remise utiliserait ${lotsTotal.size} lots. Fractionnez-la en remises partielles d’au plus ${MAX_LOTS_PAR_REMISE} lots.`, 400);
  }
  const toutesAllocationsTerminees = allocationsResultat.results.every((allocation) => {
    const livraison = lignesPreparees.find((ligne) => ligne.allocation_id === allocation.id)?.quantite_remise ?? 0;
    return allocation.quantite_servie + livraison >= allocation.quantite_prevue - EPSILON_QUANTITE;
  });
  const auMoinsUneQuantiteServie = allocationsResultat.results.some((allocation) => {
    const livraison = lignesPreparees.find((ligne) => ligne.allocation_id === allocation.id)?.quantite_remise ?? 0;
    return allocation.quantite_servie + livraison > EPSILON_QUANTITE;
  });
  if (entree.statut_service === "SERVI" && !toutesAllocationsTerminees) {
    throw new ErreurDistribution("Le statut servi exige que toutes les allocations du ménage soient complètes.", 400);
  }
  if (entree.statut_service === "PARTIELLEMENT_SERVI" && (!auMoinsUneQuantiteServie || toutesAllocationsTerminees)) {
    throw new ErreurDistribution("Le statut partiel doit correspondre à des allocations encore incomplètes.", 400);
  }
  if (["ABSENT", "NON_SERVI"].includes(entree.statut_service) && menage.statut_service !== "EN_ATTENTE") {
    throw new ErreurDistribution("Un ménage déjà partiellement servi ne peut pas être déclaré absent ou non servi.", 409);
  }
  if (["ABSENT", "NON_SERVI"].includes(entree.statut_service) && allocationsResultat.results.some((allocation) => allocation.quantite_servie > 0)) {
    throw new ErreurDistribution("Un ménage déjà servi partiellement ne peut pas être déclaré absent ou non servi.", 409);
  }

  const remiseId = crypto.randomUUID();
  const referenceRemise = creerReference("REM", remiseId);
  const valeursMouvementParArticle = new Map<string, number>();
  const idsArticles = [...new Set(lignesPreparees.map((ligne) => ligne.article_id))];
  if (idsArticles.length > 0) {
    const emplacementsArticles = idsArticles.map(() => "?").join(", ");
    const soldes = await db.prepare(
      `SELECT article_id, quantite_physique FROM soldes_stock WHERE entrepot_id = ?
       AND province_id = ? AND article_id IN (${emplacementsArticles})`,
    ).bind(distribution.entrepot_id, provinceId, ...idsArticles).all<{ article_id: string; quantite_physique: number }>();
    for (const solde of soldes.results) valeursMouvementParArticle.set(solde.article_id, solde.quantite_physique);
  }
  const lignesMouvement: Array<{
    id: string; remise_id: string; distribution_id: string; allocation_id: string;
    article_id: string; lot_stock_id: string; reservation_id: string; quantite_remise: number;
  }> = [];
  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [];
  for (const ligne of lignesPreparees) {
    for (const lot of ligne.lots) {
      const ligneRemiseId = crypto.randomUUID();
      lignesMouvement.push({
        id: ligneRemiseId, remise_id: remiseId, distribution_id: distributionId,
        allocation_id: ligne.allocation_id, article_id: ligne.article_id,
        lot_stock_id: lot.reservation.lot_stock_id, reservation_id: lot.reservation.reservation_id,
        quantite_remise: lot.quantite,
      });
      const avant = valeursMouvementParArticle.get(ligne.article_id) ?? 0;
      const apres = avant - lot.quantite;
      instructions.push({
        operation: "la consommation conditionnelle de la réservation",
        instruction: db.prepare(
          `UPDATE reservations_stock SET quantite_consommee = quantite_consommee + ?,
             statut = CASE WHEN quantite_consommee + ? + quantite_liberee >= quantite_reservee - 0.000001
               THEN 'CONSOMMEE' ELSE 'ACTIVE' END
           WHERE id = ? AND distribution_id = ? AND statut = 'ACTIVE'
             AND quantite_consommee = ? AND quantite_reservee - quantite_consommee - quantite_liberee >= ?`,
        ).bind(
          lot.quantite, lot.quantite, lot.reservation.reservation_id, distributionId,
          lot.quantite_consommee_avant, lot.quantite,
        ),
        changementsAttendus: 1,
      });
      instructions.push({
        operation: "la sortie conditionnelle du lot",
        instruction: db.prepare(
          `UPDATE lots_stock SET quantite_physique = quantite_physique - ?,
            quantite_reservee = quantite_reservee - ?
           WHERE id = ? AND entrepot_id = ? AND province_id = ? AND article_id = ?
             AND quantite_physique >= ? AND quantite_reservee >= ?
             AND EXISTS (SELECT 1 FROM reservations_stock r WHERE r.id = ?
               AND r.quantite_consommee = ? AND r.distribution_id = ?)`,
        ).bind(
          lot.quantite, lot.quantite, lot.reservation.lot_stock_id, distribution.entrepot_id,
          provinceId, ligne.article_id, lot.quantite, lot.quantite,
          lot.reservation.reservation_id, lot.quantite_consommee_avant + lot.quantite, distributionId,
        ),
        changementsAttendus: 1,
      });
      instructions.push({
        operation: "l’écriture du mouvement de sortie pour le lot",
        instruction: db.prepare(
          `INSERT INTO mouvements_stock
           (id, reference_mouvement, entrepot_id, province_id, article_id, lot_stock_id,
            type_mouvement, sens, quantite, solde_physique_avant, solde_physique_apres,
            document_source_type, document_source_id, motif, auteur_id)
           VALUES (?, ?, ?, ?, ?, ?, 'SORTIE_DISTRIBUTION', 'MOINS', ?, ?, ?,
             'REMISE_DISTRIBUTION', ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), creerReference("MVT", crypto.randomUUID()), distribution.entrepot_id,
          provinceId, ligne.article_id, lot.reservation.lot_stock_id, lot.quantite, avant, apres,
          remiseId, `Remise ${referenceRemise} au ménage ${menage.menage_id}`, utilisateur.id,
        ),
        changementsAttendus: 1,
      });
      valeursMouvementParArticle.set(ligne.article_id, apres);
    }
  }
  const statutAvant = menage.statut_service;
  const motifNonService = entree.motif_non_service ?? null;
  const identiteRecepteur = entree.identite_recepteur?.trim()
    || (entree.statut_service === "ABSENT" ? "Aucun : ménage absent" : "Aucun : ménage non servi");
  const prefixe: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    {
      operation: "l’enregistrement de la remise",
      instruction: db.prepare(
        `INSERT INTO remises_distribution
         (id, reference_remise, distribution_id, province_id, menage_distribution_id,
          menage_id, date_remise, identite_recepteur, emargement_reference, agent_distributeur_id, cle_idempotence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        remiseId, referenceRemise, distributionId, provinceId, menage.id, menage.menage_id,
        entree.date_remise, identiteRecepteur, entree.emargement_reference ?? null,
        utilisateur.id, cle,
      ),
      changementsAttendus: 1,
    },
    {
      operation: "l’enregistrement des lignes de remise",
      instruction: db.prepare(
        `INSERT INTO lignes_remise
         (id, remise_id, allocation_id, article_id, lot_stock_id, reservation_id, quantite_remise)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.remise_id'),
           json_extract(value, '$.allocation_id'), json_extract(value, '$.article_id'),
           json_extract(value, '$.lot_stock_id'), json_extract(value, '$.reservation_id'),
           json_extract(value, '$.quantite_remise') FROM json_each(?)`,
      ).bind(JSON.stringify(lignesMouvement)),
      changementsAttendus: lignesMouvement.length,
    },
    {
      operation: "la mise à jour du statut de service du ménage",
      instruction: db.prepare(
        `UPDATE menages_distribution SET statut_service = ?, date_service = ?, motif_non_service = ?
         WHERE id = ? AND distribution_id = ? AND province_id = ? AND statut_service = ?`,
      ).bind(
        entree.statut_service, entree.date_remise, motifNonService,
        menage.id, distributionId, provinceId, statutAvant,
      ),
      changementsAttendus: 1,
    },
  ];
  const allocationsJson = JSON.stringify(lignesPreparees.map((ligne) => ({
    allocation_id: ligne.allocation_id,
    quantite_avant: ligne.quantite_avant,
    quantite: ligne.quantite_remise,
  })));
  if (lignesPreparees.length > 0) {
    prefixe.push({
      operation: "la mise à jour conditionnelle des allocations remises",
      instruction: db.prepare(
        `UPDATE allocations_distribution SET quantite_servie = quantite_servie +
          CAST(json_extract((SELECT value FROM json_each(?) x WHERE json_extract(x.value, '$.allocation_id') = allocations_distribution.id), '$.quantite') AS REAL)
         WHERE distribution_id = ? AND menage_distribution_id = ?
           AND id IN (SELECT json_extract(value, '$.allocation_id') FROM json_each(?))
           AND quantite_servie = CAST(json_extract((SELECT value FROM json_each(?) x WHERE json_extract(x.value, '$.allocation_id') = allocations_distribution.id), '$.quantite_avant') AS REAL)
           AND quantite_servie + CAST(json_extract((SELECT value FROM json_each(?) x WHERE json_extract(x.value, '$.allocation_id') = allocations_distribution.id), '$.quantite') AS REAL) <= quantite_prevue + 0.000001`,
      ).bind(allocationsJson, distributionId, menage.id, allocationsJson, allocationsJson, allocationsJson),
      changementsAttendus: lignesPreparees.length,
    });
  }
  instructions.unshift(...prefixe);
  const quantitesDistribueesJson = JSON.stringify(planQuantitesDistribuees(lignesPreparees, allocationsResultat.results));
  instructions.push({
    operation: "la mise à jour du cumul distribué par article",
    instruction: db.prepare(
      `UPDATE articles_distribution SET quantite_distribuee = COALESCE((
         SELECT SUM(a.quantite_servie) FROM allocations_distribution a
         WHERE a.distribution_id = articles_distribution.distribution_id
           AND a.article_id = articles_distribution.article_id), 0)
       WHERE distribution_id = ? AND article_id IN (SELECT json_extract(value, '$.article_id') FROM json_each(?))`,
    ).bind(distributionId, quantitesDistribueesJson),
    changementsAttendus: linesDistinctArticles(lignesPreparees).length,
  });
  instructions.push({
    operation: "l’audit de la remise",
    instruction: preparerAudit(db, utilisateur, "REMISE_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, {
      remise_id: remiseId,
      reference_remise: referenceRemise,
      menage_id: menage.menage_id,
      statut_service: entree.statut_service,
      nombre_lignes: lignesMouvement.length,
      nombre_lots: lotsTotal.size,
    }),
    changementsAttendus: 1,
  });
  const corps = { id: remiseId, reference_remise: referenceRemise, statut_service: entree.statut_service, nombre_lignes: lignesMouvement.length };
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile, statutHttp: 201, corps,
    instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

function planQuantitesDistribuees(
  lignes: Array<{ article_id: string }>,
  allocations: AllocationD1[],
): Array<{ article_id: string; quantite: number }> {
  return [...new Set(lignes.map((ligne) => ligne.article_id))].map((articleId) => ({
    article_id: articleId,
    quantite: allocations.filter((allocation) => allocation.article_id === articleId)
      .reduce((total, allocation) => total + allocation.quantite_servie, 0),
  }));
}

function linesDistinctArticles(lignes: Array<{ article_id: string }>): string[] {
  return [...new Set(lignes.map((ligne) => ligne.article_id))];
}

export async function lireSyntheseDistribution(db: Database, utilisateur: UtilisateurSession, distributionId: string) {
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  const [menages, articles, mouvements] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN statut_service = 'SERVI' THEN 1 ELSE 0 END) AS servis,
        SUM(CASE WHEN statut_service = 'PARTIELLEMENT_SERVI' THEN 1 ELSE 0 END) AS partiels,
        SUM(CASE WHEN statut_service = 'ABSENT' THEN 1 ELSE 0 END) AS absents,
        SUM(CASE WHEN statut_service = 'NON_SERVI' THEN 1 ELSE 0 END) AS non_servis,
        SUM(CASE WHEN statut_service = 'EN_ATTENTE' THEN 1 ELSE 0 END) AS en_attente
       FROM menages_distribution WHERE distribution_id = ? AND province_id = ?`,
    ).bind(distributionId, distribution.province_id).first<Record<string, number>>(),
    db.prepare(
      `SELECT ad.article_id, ar.designation, u.libelle AS unite,
        ad.quantite_totale_prevue, ad.quantite_reservee, ad.quantite_distribuee,
        COALESCE((SELECT SUM(r.quantite_reservee - r.quantite_consommee - r.quantite_liberee)
          FROM reservations_stock r WHERE r.distribution_id = ad.distribution_id
            AND r.article_id = ad.article_id AND r.statut = 'ACTIVE'), 0) AS quantite_residuelle_reservee
       FROM articles_distribution ad INNER JOIN articles ar ON ar.id = ad.article_id
       INNER JOIN unites_mesure u ON u.id = ar.unite_mesure_id
       WHERE ad.distribution_id = ? ORDER BY ar.designation, ad.article_id`,
    ).bind(distributionId).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT COUNT(*) AS mouvements, COALESCE(SUM(quantite), 0) AS quantite_sortie
       FROM mouvements_stock WHERE type_mouvement = 'SORTIE_DISTRIBUTION'
         AND document_source_type = 'REMISE_DISTRIBUTION'
         AND document_source_id IN (SELECT id FROM remises_distribution WHERE distribution_id = ? AND province_id = ?)`,
    ).bind(distributionId, distribution.province_id).first<{ mouvements: number; quantite_sortie: number }>(),
  ]);
  return { distribution, menages: menages ?? {}, articles: articles.results, mouvements: mouvements ?? { mouvements: 0, quantite_sortie: 0 } };
}

export async function declarerFinDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  observations: string | null,
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = `/api/distributions/${distributionId}/declaration-fin`;
  const chargeUtile = { distribution_id: distributionId, observations };
  const rejouee = await rejouer<{ id: string; statut: string; pv_piece_jointe_id: string }>(db, utilisateur, routeApi, cle, chargeUtile);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || distribution.statut !== "EN_EXECUTION") {
    throw new ErreurDistribution("Seule une distribution en cours peut être déclarée terminée.");
  }
  const bilan = await db.prepare(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN statut_service = 'EN_ATTENTE' THEN 1 ELSE 0 END) AS en_attente
     FROM menages_distribution WHERE distribution_id = ? AND province_id = ?`,
  ).bind(distributionId, provinceId).first<{ total: number; en_attente: number }>();
  if (!bilan || bilan.total !== distribution.nombre_menages_cibles || bilan.en_attente > 0) {
    throw new ErreurDistribution("Tous les ménages doivent être servis, absents ou non servis avant la déclaration de fin.");
  }
  const pv = await db.prepare(
    `SELECT id FROM pieces_jointes WHERE entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
       AND entite_liee_id = ? AND province_id = ? AND categorie_document = 'PV_DISTRIBUTION'`,
  ).bind(distributionId, provinceId).first<{ id: string }>();
  if (!pv) throw new ErreurDistribution("Le procès-verbal de distribution doit être téléversé avant la déclaration de fin.", 400);
  const corps = { id: distributionId, statut: "TERMINEE_PROVINCE", pv_piece_jointe_id: pv.id };
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile, statutHttp: 200, corps,
    instructions: [
      { operation: "la déclaration de fin de distribution", instruction: db.prepare(
        `UPDATE distributions_provinciales SET statut = 'TERMINEE_PROVINCE', date_declaration_fin = datetime('now'),
           observations = COALESCE(?, observations), modifie_le = datetime('now')
         WHERE id = ? AND province_id = ? AND statut = 'EN_EXECUTION'`,
      ).bind(observations, distributionId, provinceId), changementsAttendus: 1 },
      { operation: "l’historique de déclaration de fin", instruction: db.prepare(
        `INSERT INTO historique_statuts
         (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
         VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'EN_EXECUTION', 'TERMINEE_PROVINCE', ?, ?)`,
      ).bind(crypto.randomUUID(), distributionId, observations, utilisateur.id), changementsAttendus: 1 },
      { operation: "l’audit de déclaration de fin", instruction: preparerAudit(
        db, utilisateur, "DECLARATION_FIN_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, corps,
      ), changementsAttendus: 1 },
      { operation: "la notification de fin d’exécution à l’administration centrale", instruction:
        creerInstructionNotification(db, { role: "ADMIN_CENTRAL" },
          "Distribution déclarée terminée",
          `La distribution ${distribution.reference_distribution} a été déclarée terminée et attend la clôture centrale.`,
          "ACTION_REQUISE", "/controle/fermetures"), changementsAttendus: 1 },
    ],
  });
}

export async function televerserPvDistribution(
  db: Database,
  bucket: R2Bucket,
  utilisateur: UtilisateurSession,
  distributionId: string,
  fichier: File,
  cleIdempotence: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cleIdempotence);
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || !["EN_EXECUTION", "TERMINEE_PROVINCE"].includes(distribution.statut)) {
    throw new ErreurDistribution("Le procès-verbal ne peut être joint à ce stade de la distribution.");
  }
  if (fichier.size < 1 || fichier.size > 10 * 1024 * 1024 || fichier.type !== "application/pdf") {
    throw new ErreurDistribution("Le procès-verbal doit être un fichier PDF de 1 octet à 10 Mo.", 400);
  }
  const contenu = new Uint8Array(await fichier.arrayBuffer());
  if (detecterTypeMimeDocument(contenu) !== "application/pdf") {
    throw new ErreurDistribution("Le contenu du procès-verbal n’est pas un document PDF valide.", 400);
  }
  const empreinteBuffer = await crypto.subtle.digest("SHA-256", contenu);
  const empreinte = Array.from(new Uint8Array(empreinteBuffer), (octet) => octet.toString(16).padStart(2, "0")).join("");
  const cleR2 = `distributions/${provinceId}/${distributionId}/${cleIdempotence}`;
  const existante = await db.prepare(
    `SELECT id, nom_fichier_original, type_mime, taille_octets, televerse_par
     FROM pieces_jointes WHERE cle_r2 = ?`,
  ).bind(cleR2).first<{ id: string; nom_fichier_original: string; type_mime: string; taille_octets: number; televerse_par: string }>();
  if (existante) {
    const objet = await bucket.head(cleR2);
    if (existante.televerse_par !== utilisateur.id || !objet || objet.customMetadata?.empreinte_sha256 !== empreinte) {
      throw new ErreurDistribution("Cette clé d’idempotence est déjà liée à un autre fichier.", 409);
    }
    return { id: existante.id, nom_fichier_original: existante.nom_fichier_original, type_mime: existante.type_mime, taille_octets: existante.taille_octets };
  }
  const objetExistant = await bucket.head(cleR2);
  if (objetExistant && objetExistant.customMetadata?.empreinte_sha256 !== empreinte) {
    throw new ErreurDistribution("Cette clé d’idempotence est déjà réservée à un autre fichier.", 409);
  }
  const id = crypto.randomUUID();
  const nom = fichier.name.replace(/[\\/\u0000-\u001f\u007f]/gu, "_").slice(0, 180) || "proces-verbal.pdf";
  try {
    await televerserPuisReferencerR2({
      bucket,
      cle: cleR2,
      contenu,
      options: {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { empreinte_sha256: empreinte },
      },
      televerserObjet: !objetExistant,
      referenceDejaPresente: async () => Boolean(await db.prepare(
        "SELECT 1 AS present FROM pieces_jointes WHERE cle_r2 = ?",
      ).bind(cleR2).first<{ present: number }>()),
      enregistrerReference: async () => {
        await db.batch([
          db.prepare(
            `INSERT INTO pieces_jointes
             (id, cle_r2, nom_fichier_original, type_mime, taille_octets, categorie_document,
              entite_liee_type, entite_liee_id, province_id, televerse_par)
             VALUES (?, ?, ?, 'application/pdf', ?, 'PV_DISTRIBUTION', 'DISTRIBUTION_PROVINCIALE', ?, ?, ?)`,
          ).bind(id, cleR2, nom, contenu.byteLength, distributionId, provinceId, utilisateur.id),
          preparerAudit(db, utilisateur, "TELEVERSEMENT_PV_DISTRIBUTION", "PIECE_JOINTE", id, adresseIp, {
            distribution_id: distributionId, taille_octets: contenu.byteLength, empreinte_sha256: empreinte,
          }),
        ]);
      },
      signalerNettoyageImpossible: (phase, erreurNettoyage) => console.error(JSON.stringify({
        action: "nettoyage_pv_distribution_echoue",
        phase,
        type_erreur: typeErreurSecurise(erreurNettoyage),
      })),
    });
  } catch (erreur) {
    throw new ErreurDistribution("Le procès-verbal n’a pas pu être enregistré avec son journal d’audit.", 500);
  }
  return { id, nom_fichier_original: nom, type_mime: "application/pdf", taille_octets: contenu.byteLength };
}

export async function obtenirPvDistribution(db: Database, bucket: R2Bucket, utilisateur: UtilisateurSession, distributionId: string) {
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  const piece = await db.prepare(
    `SELECT id, cle_r2, nom_fichier_original, type_mime, taille_octets
     FROM pieces_jointes WHERE entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
       AND entite_liee_id = ? AND province_id = ? AND categorie_document = 'PV_DISTRIBUTION'
     ORDER BY cree_le DESC, id DESC LIMIT 1`,
  ).bind(distributionId, distribution.province_id).first<{
    id: string; cle_r2: string; nom_fichier_original: string; type_mime: string; taille_octets: number;
  }>();
  if (!piece) throw new ErreurDistribution("Procès-verbal introuvable dans votre périmètre.", 404);
  const objet = await bucket.get(piece.cle_r2);
  if (!objet) throw new ErreurDistribution("Le fichier du procès-verbal est introuvable dans l’archive.", 404);
  return { corps: objet.body, type_mime: piece.type_mime, nom_fichier_original: piece.nom_fichier_original, taille_octets: piece.taille_octets };
}

export async function retournerPourCorrectionDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  entree: { motif_retour: string; elements_a_corriger: string[] },
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") throw new ErreurDistribution("Seule l’administration centrale peut retourner une distribution.", 403);
  validerCleIdempotence(cle);
  const routeApi = `/api/central/distributions/${distributionId}/retour-correction`;
  const rejouee = await rejouer<{ id: string; demande_correction_id: string; statut: string }>(db, utilisateur, routeApi, cle, entree);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.statut !== "TERMINEE_PROVINCE") throw new ErreurDistribution("Seule une distribution terminée par la province peut être retournée.");
  const champsAutorises = new Set(["intitule_distribution", "objectif", "date_prevue", "observations"]);
  if (entree.elements_a_corriger.length === 0 || entree.elements_a_corriger.some((champ) => !champsAutorises.has(champ))
      || new Set(entree.elements_a_corriger).size !== entree.elements_a_corriger.length) {
    throw new ErreurDistribution("La demande doit nommer des champs modifiables connus, sans doublons.", 400);
  }
  const demandeId = crypto.randomUUID();
  const valeursOriginales: Record<string, string | null> = {};
  for (const champ of entree.elements_a_corriger) {
    const valeur = Reflect.get(distribution, champ);
    if (typeof valeur !== "string" && valeur !== null) throw new ErreurDistribution("Une valeur originale ne peut pas être archivée.", 409);
    valeursOriginales[champ] = valeur;
  }
  const elementsJson = JSON.stringify({ champs_modifiables: entree.elements_a_corriger, valeurs_originales: valeursOriginales });
  const corps = { id: distributionId, demande_correction_id: demandeId, statut: "RETOURNEE_POUR_CORRECTION" };
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile: entree, statutHttp: 200, corps,
    instructions: [
      { operation: "l’enregistrement de la demande de correction", instruction: db.prepare(
        `INSERT INTO demandes_correction
         (id, distribution_id, province_id, motif_retour, elements_a_corriger, demande_par)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(demandeId, distributionId, distribution.province_id, entree.motif_retour, elementsJson, utilisateur.id), changementsAttendus: 1 },
      { operation: "la transition vers le retour pour correction", instruction: db.prepare(
        `UPDATE distributions_provinciales SET statut = 'RETOURNEE_POUR_CORRECTION', modifie_le = datetime('now')
         WHERE id = ? AND statut = 'TERMINEE_PROVINCE'`,
      ).bind(distributionId), changementsAttendus: 1 },
      { operation: "l’historique de retour pour correction", instruction: db.prepare(
        `INSERT INTO historique_statuts
         (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
         VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'TERMINEE_PROVINCE', 'RETOURNEE_POUR_CORRECTION', ?, ?)`,
      ).bind(crypto.randomUUID(), distributionId, entree.motif_retour, utilisateur.id), changementsAttendus: 1 },
      { operation: "l’audit du retour pour correction", instruction: preparerAudit(
        db, utilisateur, "RETOUR_CORRECTION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, corps,
      ), changementsAttendus: 1 },
      { operation: "la notification de la demande de correction à la délégation", instruction:
        creerInstructionNotification(db, { provinceId: distribution.province_id, role: "DELEGUE_PROVINCIAL" },
          "Correction de distribution demandée",
          `L’administration centrale a demandé une correction pour ${distribution.reference_distribution}.`,
          "DEMANDE_CORRECTION", "/distributions"), changementsAttendus: 1 },
    ],
  });
}

export async function soumettreCorrectionDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  entree: { reponse_delegue: string; corrections: Record<string, string | null> },
  cle: string,
  adresseIp: string | null,
) {
  const provinceId = exigerDelegue(utilisateur);
  validerCleIdempotence(cle);
  const routeApi = `/api/distributions/${distributionId}/corrections`;
  const rejouee = await rejouer<{ id: string; demande_correction_id: string; statut: string }>(db, utilisateur, routeApi, cle, entree);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.province_id !== provinceId || distribution.statut !== "RETOURNEE_POUR_CORRECTION") {
    throw new ErreurDistribution("Aucune demande de correction ouverte pour cette distribution.");
  }
  const demande = await db.prepare(
    `SELECT id, elements_a_corriger FROM demandes_correction
     WHERE distribution_id = ? AND province_id = ? AND statut = 'EN_ATTENTE_DELEGUE'
     ORDER BY cree_le DESC, id DESC LIMIT 1`,
  ).bind(distributionId, provinceId).first<{ id: string; elements_a_corriger: string }>();
  if (!demande) throw new ErreurDistribution("La demande de correction est introuvable.", 404);
  let autorises: unknown;
  try { autorises = JSON.parse(demande.elements_a_corriger); } catch { throw new ErreurDistribution("La liste des champs à corriger est invalide.", 500); }
  const champsSource = typeof autorises === "object" && autorises !== null ? Reflect.get(autorises, "champs_modifiables") : null;
  if (!Array.isArray(champsSource) || !champsSource.every((champ) => typeof champ === "string")) {
    throw new ErreurDistribution("La liste des champs à corriger est invalide.", 500);
  }
  const champsAutorises = new Set(champsSource as string[]);
  for (const champ of Object.keys(entree.corrections)) {
    if (!champsAutorises.has(champ) || !["intitule_distribution", "objectif", "date_prevue", "observations"].includes(champ)) {
      throw new ErreurDistribution("Une correction dépasse le périmètre autorisé par la demande.", 400);
    }
  }
  const colonnes: Record<string, string> = {
    intitule_distribution: "intitule_distribution",
    objectif: "objectif",
    date_prevue: "date_prevue",
    observations: "observations",
  };
  const affectations: string[] = [];
  const valeurs: (string | null)[] = [];
  const valeursCorrigees: Record<string, string | null> = {};
  for (const [champ, valeur] of Object.entries(entree.corrections)) {
    const colonne = colonnes[champ];
    if (!colonne) continue;
    if (valeur === null && champ !== "observations") throw new ErreurDistribution("Ce champ ne peut pas être vide.", 400);
    affectations.push(`${colonne} = ?`);
    valeurs.push(valeur);
    valeursCorrigees[champ] = valeur;
  }
  if (typeof autorises !== "object" || autorises === null || Array.isArray(autorises)) {
    throw new ErreurDistribution("La demande de correction est invalide.", 500);
  }
  const valeursOriginales = Reflect.get(autorises, "valeurs_originales");
  if (typeof valeursOriginales !== "object" || valeursOriginales === null || Array.isArray(valeursOriginales)) {
    throw new ErreurDistribution("L’instantané des valeurs originales est invalide.", 500);
  }
  const traceCorrection = JSON.stringify({
    champs_modifiables: champsSource,
    valeurs_originales: valeursOriginales,
    valeurs_corrigees: valeursCorrigees,
  });
  const corps = { id: distributionId, demande_correction_id: demande.id, statut: "TERMINEE_PROVINCE" };
  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [];
  if (affectations.length > 0) {
    instructions.push({
      operation: "la mise à jour des champs autorisés",
      instruction: db.prepare(
        `UPDATE distributions_provinciales SET ${affectations.join(", ")}, modifie_le = datetime('now')
         WHERE id = ? AND province_id = ? AND statut = 'RETOURNEE_POUR_CORRECTION'`,
      ).bind(...valeurs, distributionId, provinceId),
      changementsAttendus: 1,
    });
  }
  instructions.push(
    { operation: "l’enregistrement de la réponse provinciale", instruction: db.prepare(
      `UPDATE demandes_correction SET statut = 'CORRECTION_SOUMISE', traite_par_delegue = ?,
        reponse_delegue = ?, elements_a_corriger = ?
       WHERE id = ? AND province_id = ? AND statut = 'EN_ATTENTE_DELEGUE'`,
    ).bind(utilisateur.id, entree.reponse_delegue, traceCorrection, demande.id, provinceId), changementsAttendus: 1 },
    { operation: "la remise de la distribution au contrôle central", instruction: db.prepare(
      `UPDATE distributions_provinciales SET statut = 'TERMINEE_PROVINCE', modifie_le = datetime('now')
       WHERE id = ? AND province_id = ? AND statut = 'RETOURNEE_POUR_CORRECTION'`,
    ).bind(distributionId, provinceId), changementsAttendus: 1 },
    { operation: "l’historique de soumission de correction", instruction: db.prepare(
      `INSERT INTO historique_statuts
       (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
       VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'RETOURNEE_POUR_CORRECTION', 'TERMINEE_PROVINCE', ?, ?)`,
    ).bind(crypto.randomUUID(), distributionId, entree.reponse_delegue, utilisateur.id), changementsAttendus: 1 },
    { operation: "l’audit de soumission de correction", instruction: preparerAudit(
      db, utilisateur, "SOUMISSION_CORRECTION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, corps,
    ), changementsAttendus: 1 },
    { operation: "la notification de correction soumise à l’administration centrale", instruction:
      creerInstructionNotification(db, { role: "ADMIN_CENTRAL" },
        "Correction provinciale soumise",
        `La délégation de ${distribution.province_id} a répondu à une demande de correction pour ${distribution.reference_distribution}.`,
        "ACTION_REQUISE", "/controle/corrections"), changementsAttendus: 1 },
  );
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile: entree, statutHttp: 200, corps, instructions,
  });
}

export async function validerCorrectionDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  correctionId: string,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") throw new ErreurDistribution("Seule l’administration centrale peut valider une correction.", 403);
  validerCleIdempotence(cle);
  const routeApi = `/api/central/distributions/${distributionId}/corrections/${correctionId}/validation`;
  const chargeUtile = { correction_id: correctionId };
  const rejouee = await rejouer<{ id: string; statut: string }>(db, utilisateur, routeApi, cle, chargeUtile);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  const correction = await db.prepare(
    `SELECT id FROM demandes_correction WHERE id = ? AND distribution_id = ? AND statut = 'CORRECTION_SOUMISE'`,
  ).bind(correctionId, distributionId).first<{ id: string }>();
  if (!correction || distribution.statut !== "TERMINEE_PROVINCE") {
    throw new ErreurDistribution("La correction soumise est introuvable ou la distribution n’est pas terminée.");
  }
  const corps = { id: correctionId, statut: "VALIDEE_CENTRAL" };
  return executerOperationIdempotente({
    db, utilisateur, routeApi,
    cle, chargeUtile, statutHttp: 200, corps,
    instructions: [
      { operation: "la validation centrale de la correction", instruction: db.prepare(
        `UPDATE demandes_correction SET statut = 'VALIDEE_CENTRAL', resolu_le = datetime('now')
         WHERE id = ? AND distribution_id = ? AND statut = 'CORRECTION_SOUMISE'`,
      ).bind(correctionId, distributionId), changementsAttendus: 1 },
      { operation: "l’audit de validation de la correction", instruction: preparerAudit(
        db, utilisateur, "VALIDATION_CORRECTION_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, corps,
      ), changementsAttendus: 1 },
      { operation: "la notification de validation de correction à la délégation", instruction:
        creerInstructionNotification(db, { provinceId: distribution.province_id, role: "DELEGUE_PROVINCIAL" },
          "Correction de distribution validée",
          `La correction de la distribution ${distribution.reference_distribution} a été validée par l’administration centrale.`,
          "INFO", "/distributions"), changementsAttendus: 1 },
    ],
  });
}

export async function cloturerDistribution(
  db: Database,
  utilisateur: UtilisateurSession,
  distributionId: string,
  observations: string | null,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") throw new ErreurDistribution("Seule l’administration centrale peut clôturer une distribution.", 403);
  validerCleIdempotence(cle);
  const routeApi = `/api/central/distributions/${distributionId}/cloture`;
  const chargeUtile = { distribution_id: distributionId, observations };
  const rejouee = await rejouer<{ id: string; statut: string; lots_liberes: number }>(db, utilisateur, routeApi, cle, chargeUtile);
  if (rejouee) return rejouee;
  const distribution = await lireDistributionAutorisee(db, utilisateur, distributionId);
  if (distribution.statut !== "TERMINEE_PROVINCE") throw new ErreurDistribution("La distribution doit être déclarée terminée et contrôlée avant sa clôture.");
  const etatCloture = await lireEtatClotureDistribution(db, utilisateur, distributionId);
  if (!etatCloture.pret) throw new ErreurDistribution(`La clôture est bloquée : ${etatCloture.bloqueurs.join(" ")}`, 409);
  const correctionOuverte = await db.prepare(
    `SELECT id FROM demandes_correction WHERE distribution_id = ? AND statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE')`,
  ).bind(distributionId).first<{ id: string }>();
  if (correctionOuverte) throw new ErreurDistribution("La demande de correction doit être traitée par la province et validée par l’administration centrale.");
  const reliquats = await db.prepare(
    `SELECT r.id, r.article_id, r.lot_stock_id, r.quantite_reservee, r.quantite_consommee,
      r.quantite_liberee, r.statut, l.entrepot_id, l.quantite_physique, l.quantite_reservee AS lot_quantite_reservee
     FROM reservations_stock r INNER JOIN lots_stock l ON l.id = r.lot_stock_id
     WHERE r.distribution_id = ? AND r.province_id = ? AND r.statut = 'ACTIVE'
       AND r.quantite_reservee - r.quantite_consommee - r.quantite_liberee > 0.000001
     ORDER BY r.article_id, l.date_peremption, l.id`,
  ).bind(distributionId, distribution.province_id).all<{
    id: string; article_id: string; lot_stock_id: string; quantite_reservee: number;
    quantite_consommee: number; quantite_liberee: number; statut: string; entrepot_id: string;
    quantite_physique: number; lot_quantite_reservee: number;
  }>();
  if (reliquats.results.length > MAX_LOTS_PAR_OPERATION) {
    throw new ErreurDistribution(`La clôture doit libérer ${reliquats.results.length} lots. La limite transactionnelle est de ${MAX_LOTS_PAR_OPERATION} lots; la distribution doit respecter cette limite dès la validation.`, 409);
  }
  const articlesReliquats = [...new Set(reliquats.results.map((reservation) => reservation.article_id))];
  const emplacementsReliquats = articlesReliquats.map(() => "?").join(", ");
  const soldesReliquats = articlesReliquats.length > 0
    ? await db.prepare(
      `SELECT article_id, quantite_physique FROM soldes_stock
       WHERE entrepot_id = ? AND province_id = ?
         AND article_id IN (${emplacementsReliquats})`,
    ).bind(distribution.entrepot_id, distribution.province_id, ...articlesReliquats)
      .all<{ article_id: string; quantite_physique: number }>()
    : { results: [] as Array<{ article_id: string; quantite_physique: number }> };
  const soldeParArticle = new Map(soldesReliquats.results.map((solde) => [solde.article_id, solde.quantite_physique]));
  const synthese = await lireSyntheseDistribution(db, utilisateur, distributionId);
  const bilan = {
    articles: synthese.articles,
    reservations_liberees: reliquats.results.map((reservation) => ({
      article_id: reservation.article_id,
      lot_stock_id: reservation.lot_stock_id,
      quantite_liberee: reservation.quantite_reservee - reservation.quantite_consommee - reservation.quantite_liberee,
    })),
  };
  const fermetureId = crypto.randomUUID();
  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [];
  if (reliquats.results.length > 0) {
    instructions.push({
      operation: "la libération comptable des reliquats",
      instruction: db.prepare(
        `UPDATE reservations_stock SET quantite_liberee = quantite_reservee - quantite_consommee,
          statut = 'LIBEREE_CLOTURE'
         WHERE distribution_id = ? AND statut = 'ACTIVE'
           AND quantite_reservee - quantite_consommee - quantite_liberee > 0.000001`,
      ).bind(distributionId),
      changementsAttendus: reliquats.results.length,
    });
  }
  for (const reservation of reliquats.results) {
    const quantite = reservation.quantite_reservee - reservation.quantite_consommee - reservation.quantite_liberee;
    const avant = soldeParArticle.get(reservation.article_id) ?? 0;
    instructions.push({
      operation: "la remise à disposition du reliquat réservé",
      instruction: db.prepare(
        `UPDATE lots_stock SET quantite_reservee = quantite_reservee - ?
         WHERE id = ? AND entrepot_id = ? AND province_id = ? AND article_id = ?
           AND quantite_reservee >= ? AND EXISTS (SELECT 1 FROM reservations_stock r
             WHERE r.id = ? AND r.statut = 'LIBEREE_CLOTURE'
               AND r.quantite_liberee = r.quantite_reservee - r.quantite_consommee)`,
      ).bind(
        quantite, reservation.lot_stock_id, reservation.entrepot_id, distribution.province_id,
        reservation.article_id, quantite, reservation.id,
      ),
      changementsAttendus: 1,
    });
    instructions.push({
      operation: "l’écriture du mouvement de libération de réservation",
      instruction: db.prepare(
        `INSERT INTO mouvements_stock
         (id, reference_mouvement, entrepot_id, province_id, article_id, lot_stock_id,
          type_mouvement, sens, quantite, solde_physique_avant, solde_physique_apres,
          document_source_type, document_source_id, motif, auteur_id)
         VALUES (?, ?, ?, ?, ?, ?, 'LIBERATION_RESERVATION', 'NEUTRE_RESERVATION', ?, ?, ?,
           'CLOTURE_DISTRIBUTION', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), creerReference("MVT", crypto.randomUUID()), reservation.entrepot_id,
        distribution.province_id, reservation.article_id, reservation.lot_stock_id,
        quantite, avant, avant, distributionId,
        `Libération du reliquat de la distribution ${distribution.reference_distribution}`, utilisateur.id,
      ),
      changementsAttendus: 1,
    });
  }
  instructions.push(
    { operation: "la clôture de la distribution", instruction: db.prepare(
      `UPDATE distributions_provinciales SET statut = 'CLOTUREE_CENTRAL', modifie_le = datetime('now')
       WHERE id = ? AND statut = 'TERMINEE_PROVINCE'`,
    ).bind(distributionId), changementsAttendus: 1 },
    { operation: "l’enregistrement du bilan de clôture", instruction: db.prepare(
      `INSERT INTO clotures_distribution
       (id, distribution_id, province_id, total_menages_cibles, total_menages_servis,
        total_menages_partiels, total_menages_absents, total_menages_non_servis,
        bilan_articles_json, pv_distribution_piece_id, cloture_par, observations_finales)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
         (SELECT id FROM pieces_jointes WHERE entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
           AND entite_liee_id = ? AND categorie_document = 'PV_DISTRIBUTION'
           ORDER BY cree_le DESC, id DESC LIMIT 1), ?, ?)`,
    ).bind(
      fermetureId, distributionId, distribution.province_id, Number(synthese.menages.total ?? 0),
      Number(synthese.menages.servis ?? 0), Number(synthese.menages.partiels ?? 0),
      Number(synthese.menages.absents ?? 0), Number(synthese.menages.non_servis ?? 0),
      JSON.stringify(bilan), distributionId, utilisateur.id, observations,
    ), changementsAttendus: 1 },
    { operation: "l’historique de clôture centrale", instruction: db.prepare(
      `INSERT INTO historique_statuts
       (id, operation_type, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id)
       VALUES (?, 'DISTRIBUTION_PROVINCIALE', ?, 'TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL', ?, ?)`,
    ).bind(crypto.randomUUID(), distributionId, observations, utilisateur.id), changementsAttendus: 1 },
    { operation: "l’audit de clôture centrale", instruction: preparerAudit(
      db, utilisateur, "CLOTURE_DISTRIBUTION", "DISTRIBUTION_PROVINCIALE", distributionId, adresseIp, {
        id: fermetureId, observations, lots_liberes: reliquats.results.length,
      },
    ), changementsAttendus: 1 },
    { operation: "la notification de clôture à la délégation provinciale", instruction:
      creerInstructionNotification(db, { provinceId: distribution.province_id, role: "DELEGUE_PROVINCIAL" },
        "Distribution clôturée au niveau central",
        `La distribution ${distribution.reference_distribution} a été clôturée après contrôle.`,
        "CLOTURE", "/distributions"), changementsAttendus: 1 },
  );
  const corps = { id: distributionId, statut: "CLOTUREE_CENTRAL", lots_liberes: reliquats.results.length };
  return executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile, statutHttp: 200, corps,
    instructions,
  });
}
