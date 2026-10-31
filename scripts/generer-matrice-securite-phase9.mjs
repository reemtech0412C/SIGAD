import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routes = resolve(racine, "backend/src/routes");
const destination = resolve(racine, "docs/matrice-securite-api-phase9.md");
const catalogueDestination = resolve(racine, "shared/permissions/catalogue.ts");

const rolesSIGAD = [
  "PROPRIETAIRE",
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
  "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN",
  "AGENT_DISTRIBUTION",
  "CONSULTATION_INSTITUTIONNELLE",
];

const montages = {
  app: [{ prefixe: "", roles: "Public pour la santé; profil délégué authentifié", province: "Session authentifiée pour le profil; aucune donnée métier pour la santé" }],
  routesAuth: [{ prefixe: "/api/auth", roles: "CSRF et connexion publics; session requise pour session, changement initial et déconnexion", province: "Aucune" }],
  routesTerritoire: [{ prefixe: "/api/territoire", roles: "PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL authentifiés", province: "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés" }],
  routesProprietaire: [{ prefixe: "/api/proprietaire", roles: "PROPRIETAIRE uniquement", province: "Sans restriction de province; périmètre technique national" }],
  routesValidationTerritoire: [
    { prefixe: "/api/proprietaire", roles: "PROPRIETAIRE uniquement par le middleware de montage", province: "Relecture nationale; décision liée au demandeur et aux règles territoriales" },
    { prefixe: "/api/central", roles: "ADMIN_CENTRAL uniquement par le middleware de montage", province: "Relecture nationale; décision liée au demandeur et aux règles territoriales" },
  ],
  routesGestion: [{ prefixe: "/api/gestion", roles: "Rôles vérifiés par chaque gestionnaire: PROPRIETAIRE, ADMIN_CENTRAL ou DELEGUE_PROVINCIAL; mutations opérationnelles limitées à ADMIN_CENTRAL et DELEGUE_PROVINCIAL", province: "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre" }],
  routesStocks: [{ prefixe: "/api/stocks", roles: "Lecture: trois rôles; référentiels centraux: PROPRIETAIRE ou ADMIN_CENTRAL; opérations stock: ADMIN_CENTRAL ou DELEGUE_PROVINCIAL", province: "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures" }],
  routesLecture: [{ prefixe: "/api/approvisionnements", roles: "PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL en lecture", province: "Délégué: utilisateur.province_id de session, y compris les ressources enfants" }],
  routesCentrales: [{ prefixe: "/api/central/approvisionnements", roles: "ADMIN_CENTRAL uniquement", province: "National; destinations et expéditions sont explicitement liées à chaque province" }],
  routesProvinciales: [{ prefixe: "/api/provincial/expeditions", roles: "DELEGUE_PROVINCIAL uniquement", province: "utilisateur.province_id de session; contrôlé par middleware et services" }],
  routesControleCentral: [{ prefixe: "/api/central", roles: "ADMIN_CENTRAL uniquement", province: "National; filtre provincial validé pour les dossiers ciblés" }],
  routesControleProvincial: [{ prefixe: "/api/provincial", roles: "DELEGUE_PROVINCIAL uniquement", province: "utilisateur.province_id de session et filtre SQL des observations, corrections et audits" }],
  routesNotifications: [{ prefixe: "/api/notifications", roles: "Session authentifiée; chaque notification est limitée à son destinataire", province: "Province et rôle du destinataire comparés à la session en base" }],
  routesDistributions: [{ prefixe: "/api/distributions", roles: "PROPRIETAIRE, ADMIN_CENTRAL et DELEGUE_PROVINCIAL selon le contrôle métier; création et exécution par DELEGUE_PROVINCIAL; administration centrale sous /api/central/distributions", province: "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants" }],
  routesControleDistributions: [{ prefixe: "/api/central/distributions", roles: "ADMIN_CENTRAL uniquement", province: "National; le dossier et ses lignes gardent la province enregistrée en base" }],
  routesRapports: [{ prefixe: "/api/rapports", roles: "PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL; rapprochement d’archives: PROPRIETAIRE uniquement", province: "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement" }],
  routesPublics: [{ prefixe: "/api/inscriptions/delegues", roles: "Public; validation CSRF pré-authentification et vérification e-mail; aucune session ni donnée métier avant approbation centrale", province: "Province reçue uniquement pour la demande; aucune autorisation provinciale avant création explicite du compte par ADMIN_CENTRAL" }],
  routesCompte: [{ prefixe: "/api/compte", roles: "Session authentifiée; chaque lecture et écriture porte uniquement sur l’utilisateur de la session; CSRF requis pour les mutations", province: "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1" }],
  routesAdministration: [{ prefixe: "/api/administration/comptes", roles: "ADMIN_CENTRAL authentifié avec MFA vérifiée; décisions motivées et auditées", province: "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel" }],
  routesOperationsCentrales: [{ prefixe: "/api/operations-centrales", roles: "Lecture: PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL, CONSULTATION_INSTITUTIONNELLE; Mutations: ADMIN_CENTRAL uniquement", province: "Délégué: provinces autorisées de sa session; Central/Propriétaire: national" }],
  routesOperationsProvinciales: [{ prefixe: "/api/provincial/operations-centrales", roles: "DELEGUE_PROVINCIAL uniquement", province: "utilisateur.province_id de session; vérifié par middleware et service" }],
  routesProprietaireDonneesTest: [{ prefixe: "/api/proprietaire/donnees-test", roles: "PROPRIETAIRE uniquement", province: "Sans restriction de province; gouvernance et purge des données de test" }],
  routesExceptionsNominatives: [{ prefixe: "/api/central", roles: "ADMIN_CENTRAL uniquement; exception d’accès nominatif à second approbateur (autre ADMIN_CENTRAL) avec MFA récente, durée ≤ 24 h, motif et audit; jamais d’auto-approbation", province: "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route" }],
  routesPlateforme: [{ prefixe: "/api/proprietaire", roles: "PROPRIETAIRE uniquement; mutations de classe A à second approbateur (autre PROPRIETAIRE) avec MFA récente, motif et audit; jamais d’auto-approbation", province: "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire" }],
  routesAdministrationTerritoriale: [{ prefixe: "/api/proprietaire/territoire", roles: "PROPRIETAIRE uniquement", province: "Sans restriction de province; administration nationale du référentiel territorial" }],
};

const fichiers = (await readdir(routes)).filter((nom) => nom.endsWith(".routes.ts")).sort();
const chemins = [...fichiers.map((nom) => resolve(routes, nom)), resolve(racine, "backend/src/index.ts")];
const lignes = [];
const expression = /\b([A-Za-z][A-Za-z0-9]*)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gu;
const declarationsRoutage = /\b((?:routes[A-Za-z0-9]*|app))\.(get|post|put|patch|delete|all|on|head|options)\s*\(/gu;

function rolesAutorises(politique, methode) {
  if (/Public|Défi MFA pré-authentifié|preuve opérateur|pré-authentification/iu.test(politique)) return [];
  const rubrique = methode === "GET" ? /Lecture\s*:\s*([^;]+)/iu : /Mutations?\s*:\s*([^;]+)/iu;
  const segment = politique.match(rubrique)?.[1] ?? politique;
  if (methode === "GET" && /trois rôles/iu.test(segment)) {
    return ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"];
  }
  const trouves = rolesSIGAD.filter((role) => segment.includes(role));
  if (/CONSULTATION_INSTITUTIONNELLE\s+(?:est\s+)?interdite/iu.test(segment)) {
    return trouves.filter((role) => role !== "CONSULTATION_INSTITUTIONNELLE");
  }
  if (trouves.length) return trouves;
  if (/session authentifiée|toute session/iu.test(segment)) return [...rolesSIGAD];
  return [];
}

function modeAcces(politique, rolesAutorisesRoute) {
  if (/\bPublic\b/iu.test(politique)) return "PUBLIC";
  if (/Défi MFA pré-authentifié|preuve opérateur|pré-authentification/iu.test(politique)) return "PREAUTH";
  if (/session authentifiée|toute session/iu.test(politique) && rolesAutorisesRoute.length === rolesSIGAD.length) return "SESSION";
  if (rolesAutorisesRoute.length) return "ROLE";
  throw new Error(`La politique ne définit ni rôle ni contrôle public/pré-authentifié : ${politique}`);
}

for (const fichier of chemins) {
  const source = await readFile(fichier, "utf8");
  const declarations = [...source.matchAll(declarationsRoutage)];
  const declarationsLitterales = [...source.matchAll(expression)]
    .filter(([, variable]) => variable?.startsWith("routes") || variable === "app");
  for (const [, variable, methode] of declarations) {
    if (!["get", "post", "put", "patch", "delete"].includes(methode)) {
      throw new Error(`La méthode de route ${variable}.${methode} n’est pas encore classée dans ${fichier}.`);
    }
  }
  if (declarations.length !== declarationsLitterales.length) {
    throw new Error(`Une déclaration de route n’utilise pas un chemin littéral vérifiable dans ${fichier}.`);
  }
  for (const correspondance of source.matchAll(expression)) {
    const [, variable, methode, chemin] = correspondance;
    if (!variable || !methode || !chemin) continue;
    if (!variable.startsWith("routes") && variable !== "app") continue;
    const politiques = montages[variable];
    if (!politiques) throw new Error(`Le routeur ${variable} n’a pas de règle documentée dans ${fichier}.`);
    for (const politique of politiques) {
      const routeComplete = `${politique.prefixe}${chemin === "/" ? "" : chemin}` || "/";
      const mutation = methode !== "get";
      let roles = politique.roles;
      let province = politique.province;
      if (variable === "app" && routeComplete === "/api/sante") {
        roles = "Public";
        province = "Aucune donnée métier";
      } else if (variable === "app" && routeComplete.endsWith("/profil")) {
        roles = "DELEGUE_PROVINCIAL uniquement";
        province = "province_id retourné depuis utilisateur.province_id de la session";
      } else if (variable === "routesAuth") {
        if (routeComplete.endsWith("/csrf")) {
          roles = "Public; émission du jeton CSRF sans données métier";
          province = "Aucune";
        } else if (routeComplete.includes("/recuperation-proprietaire")) {
          roles = "Preuve opérateur ES256 à usage unique et CSRF pré-authentification; récupération désactivée par défaut et limitée à Staging";
          province = "Compte propriétaire SIGAD fixé côté serveur; aucune donnée métier ni session complète";
        } else if (routeComplete.endsWith("/connexion")) {
          roles = "Public; connexion protégée par CSRF pré-authentification, limitation des tentatives et MFA obligatoire pour les comptes centraux";
          province = "Aucune avant authentification; province jointe depuis le compte en base";
        } else if (routeComplete.endsWith("/mfa/verifier")) {
          roles = "Défi MFA pré-authentifié uniquement; jeton de défi HttpOnly et CSRF pré-authentification requis";
          province = "Identité et province issues du défi associé au compte en base";
        } else if (routeComplete.includes("/mfa/reinitialiser/")) {
          roles = "PROPRIETAIRE uniquement; session MFA vérifiée et code TOTP frais requis";
          province = "Opération nationale auditée; le compte cible est résolu en base";
        } else if (routeComplete.endsWith("/mfa/statut")) {
          roles = "Toute session authentifiée; état technique sans donnée métier";
          province = "Aucune";
        } else if (routeComplete.includes("/mfa/")) {
          roles = "PROPRIETAIRE ou ADMIN_CENTRAL; session authentifiée et périmètre de configuration MFA restreint";
          province = "Compte de la session authentifiée";
        } else {
          roles = "Session authentifiée; changement initial et déconnexion exigent CSRF";
        }
      } else if (variable === "routesAdministration" && routeComplete.includes("/appareils")) {
        roles = "ADMIN_CENTRAL uniquement; approbation motivée sans auto-approbation; suspension et révocation invalidant les sessions liées";
        province = "Portée centrale nationale; délégué provincial non autorisé avant validation de D-04; propriétaire résolu depuis l’appareil en base";
      } else if (variable === "routesStocks" && mutation && /^\/api\/stocks\/(categories-aide|unites-mesure|conditionnements|articles)/u.test(routeComplete)) {
        roles = "PROPRIETAIRE ou ADMIN_CENTRAL uniquement";
      } else if (variable === "routesStocks" && mutation) {
        roles = "ADMIN_CENTRAL ou DELEGUE_PROVINCIAL; opérations bornées à l’entrepôt autorisé";
      } else if (variable === "routesTerritoire" && routeComplete.startsWith("/api/territoire/propositions/")) {
        roles = "PROPRIETAIRE, ADMIN_CENTRAL ou DELEGUE_PROVINCIAL pour soumettre une proposition; approbation distincte sous /api/proprietaire et /api/central";
        province = "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; DELEGUE_PROVINCIAL: utilisateur.province_id de session et rattachement à une entité de la même province";
      } else if (variable === "routesTerritoire" && routeComplete === "/api/territoire/unites-dynamiques") {
        roles = "PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL, RESPONSABLE_STOCK, SUPERVISEUR_TERRAIN ou AGENT_DISTRIBUTION pour la création directe; CONSULTATION_INSTITUTIONNELLE interdite";
        province = "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; rôles provinciaux: province issue de la session; création de département réservée aux rôles centraux";
      } else if (variable === "routesTerritoire" && mutation) {
        throw new Error(`La mutation territoriale ${routeComplete} n’est classée ni comme proposition ni comme création directe.`);
      } else if (variable === "routesGestion" && /^\/api\/gestion\/(?:menages\/[^/]+\/validation|signalements-doublons\/[^/]+\/(?:decision|reouverture))$/u.test(routeComplete)) {
        roles = "ADMIN_CENTRAL uniquement; décision motivée, auditée et conditionnelle";
        province = "Portée nationale d’examen; ménages et signalements résolus par leurs identifiants en base, sans province fournie par le client";
      } else if (variable === "routesGestion" && routeComplete.endsWith("/validation")) {
        roles = "PROPRIETAIRE ou ADMIN_CENTRAL uniquement";
      } else if (variable === "routesGestion" && mutation && routeComplete === "/api/gestion/partenaires") {
        roles = "PROPRIETAIRE, ADMIN_CENTRAL ou DELEGUE_PROVINCIAL; proposition provinciale ou validation centrale selon rôle";
      } else if (variable === "routesGestion" && mutation) {
        roles = "ADMIN_CENTRAL ou DELEGUE_PROVINCIAL; fonctions opérationnelles avec autorisation explicite par province";
      } else if (variable === "routesRapports" && routeComplete.includes("/archives/reconciliation")) {
        roles = "PROPRIETAIRE uniquement";
      } else if (variable === "routesDistributions" && mutation) {
        roles = "DELEGUE_PROVINCIAL uniquement; contrôle central publié sous /api/central/distributions";
      } else if ((variable === "routesCentrales" || variable === "routesControleCentral" || variable === "routesControleDistributions")
        && politique.prefixe.startsWith("/api/central")) {
        roles = "ADMIN_CENTRAL uniquement";
      } else if ((variable === "routesProvinciales" || variable === "routesControleProvincial")
        && politique.prefixe.startsWith("/api/provincial")) {
        roles = "DELEGUE_PROVINCIAL uniquement";
      }
      const csrf = variable === "app" && routeComplete === "/api/sante" ? "Non" : mutation ? "Oui, jeton CSRF requis" : "Non pour cette lecture";
      const controles = mutation
        ? `Refus du rôle hors périmètre; CSRF obligatoire; identifiants enfants vérifiés; ${province.toLowerCase().includes("session") ? "province d’une autre délégation rejetée" : "contrôle du périmètre métier"}`
        : `Lecture hors périmètre rejetée; ressource enfant vérifiée; pagination serveur si collection; ${province.toLowerCase().includes("session") ? "province d’une autre délégation rejetée" : "filtre et rôle vérifiés"}`;
      const methodeApi = methode.toUpperCase();
      const rolesRoute = rolesAutorises(roles, methodeApi);
      const accessMode = modeAcces(roles, rolesRoute);
      lignes.push({
        permission: `API:${methodeApi}:${routeComplete}`,
        methode: methodeApi,
        action: { get: "LECTURE", post: "COMMANDE", put: "REMPLACEMENT", patch: "MODIFICATION", delete: "SUPPRESSION" }[methode],
        chemin: routeComplete,
        accessMode,
        rolesAutorises: rolesRoute,
        rolesConditionnels: methodeApi === "POST" && routeComplete === "/api/rapports/:type/export"
          ? [{ role: "CONSULTATION_INSTITUTIONNELLE", condition: "RAPPORT_NON_SENSIBLE" }]
          : [],
        portee: province,
        csrf,
        roles,
        province,
        controles,
      });
    }
  }
}

lignes.sort((a, b) => a.chemin.localeCompare(b.chemin, "fr") || a.methode.localeCompare(b.methode, "fr"));
if (lignes.length === 0) throw new Error("Aucune route API n’a été trouvée.");

const tableau = lignes.map((ligne) => `| ${ligne.methode} | \`${ligne.chemin}\` | ${ligne.roles} | ${ligne.province} | ${ligne.csrf} | ${ligne.controles} |`);
const contenu = `# Matrice de sécurité API — Phase 9\n\nGénérée à partir des routes Hono de \`backend/src/routes\` et \`backend/src/index.ts\`. Une nouvelle route non associée à une politique bloque le générateur. Nombre de routes documentées : **${lignes.length}**.\n\nLes opérations déléguées doivent utiliser \`utilisateur.province_id\` issu de la session vérifiée. Un \`province_id\` fourni par le navigateur ne constitue jamais une autorité. Les détails de ressource (remises, allocations, pièces jointes et archives) sont relus par leur relation parente côté service.\n\n| Méthode | Chemin | Rôles admis | Portée et source de province_id | CSRF | Contrôle de sécurité à couvrir |\n|---|---|---|---|---|---|\n${tableau.join("\n")}\n\n## Accès conditionnel confirmé par le code\n\nLe middleware \`limiterRapportsConsultation\` de \`backend/src/index.ts\` autorise le rôle \`CONSULTATION_INSTITUTIONNELLE\` sur \`POST /api/rapports/{type}/export\` uniquement si la définition du rapport indique \`donneesSensibles === false\`. Il refuse les rapports sensibles avant l’exécution du gestionnaire. Le catalogue machine représente cet accès comme une règle conditionnelle; les essais B1.1 à corps vide ne suffisent pas à l’observer.\n\n## Limites de preuve\n\nLa suite locale d’intégration exerce les parcours d’authentification, des stocks, des approvisionnements, des distributions, des rapports, des archives, du CSRF, de l’idempotence, de la concurrence et de l’isolation Sila/Ouaddaï. Cette matrice décrit le contrôle requis route par route; elle ne transforme pas ces scénarios en preuve d’un appel négatif distinct sur chaque URL. L’audit exhaustif individuel de toutes les routes, notamment les variantes d’identifiants imbriqués, reste à compléter avant de considérer l’isolation de Phase 1 comme entièrement close.\n`;
const contenuCatalogue = `export type RoleSIGAD = ${rolesSIGAD.map((role) => `"${role}"`).join(" | ")};
export type ModeAccesPolitique = "PUBLIC" | "PREAUTH" | "SESSION" | "ROLE";
export type ActionPolitique = "LECTURE" | "COMMANDE" | "REMPLACEMENT" | "MODIFICATION" | "SUPPRESSION";

export interface PolitiqueRouteAPI {
  readonly permission: string;
  readonly methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly action: ActionPolitique;
  readonly chemin: string;
  readonly accessMode: ModeAccesPolitique;
  readonly rolesAutorises: readonly RoleSIGAD[];
  readonly rolesConditionnels: readonly { readonly role: RoleSIGAD; readonly condition: "RAPPORT_NON_SENSIBLE" }[];
  readonly portee: string;
  readonly csrf: boolean;
}

// Généré depuis backend/src/routes, backend/src/index.ts et les règles de montage ci-dessus.
// Une différence avec la matrice B1.1 exige une revue explicite avant régénération.
export const CATALOGUE_POLITIQUES_API = ${JSON.stringify(lignes.map(({ permission, methode, action, chemin, accessMode, rolesAutorises, rolesConditionnels, portee, csrf }) => ({
  permission, methode, action, chemin, accessMode, rolesAutorises, rolesConditionnels, portee, csrf: csrf === "Oui, jeton CSRF requis",
})), null, 2)} as const satisfies readonly PolitiqueRouteAPI[];
`;

if (process.argv.includes("--check")) {
  const existant = (await readFile(destination, "utf8")).replace(/\r\n?/gu, "\n");
  if (existant !== contenu) throw new Error("La matrice versionnée ne correspond pas aux routes et politiques Hono réelles. Régénérez-la et revoyez chaque entrée.");
  const catalogueExistant = (await readFile(catalogueDestination, "utf8")).replace(/\r\n?/gu, "\n");
  if (catalogueExistant !== contenuCatalogue) throw new Error("Le catalogue de politiques ne correspond pas aux routes et règles B1.1. Vérifiez toute différence avant régénération.");
  console.log(`PASS — Matrice de sécurité synchronisée avec ${lignes.length} routes API déclarées.`);
} else {
  await writeFile(destination, contenu, "utf8");
  await mkdir(resolve(racine, "shared/permissions"), { recursive: true });
  await writeFile(catalogueDestination, contenuCatalogue, "utf8");
  console.log(`Matrice écrite : ${lignes.length} routes API.`);
}
