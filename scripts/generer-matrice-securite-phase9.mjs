import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routes = resolve(racine, "backend/src/routes");
const destination = resolve(racine, "docs/matrice-securite-api-phase9.md");

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
  routesAdministrationTerritoriale: [{ prefixe: "/api/proprietaire/territoire", roles: "PROPRIETAIRE uniquement", province: "Sans restriction de province; administration nationale du référentiel territorial" }],
};

const fichiers = (await readdir(routes)).filter((nom) => nom.endsWith(".routes.ts")).sort();
const chemins = [...fichiers.map((nom) => resolve(routes, nom)), resolve(racine, "backend/src/index.ts")];
const lignes = [];
const expression = /\b([A-Za-z][A-Za-z0-9]*)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gu;

for (const fichier of chemins) {
  const source = await readFile(fichier, "utf8");
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
      lignes.push({ methode: methode.toUpperCase(), chemin: routeComplete, roles, province, csrf, controles });
    }
  }
}

lignes.sort((a, b) => a.chemin.localeCompare(b.chemin, "fr") || a.methode.localeCompare(b.methode, "fr"));
if (lignes.length === 0) throw new Error("Aucune route API n’a été trouvée.");

const tableau = lignes.map((ligne) => `| ${ligne.methode} | \`${ligne.chemin}\` | ${ligne.roles} | ${ligne.province} | ${ligne.csrf} | ${ligne.controles} |`);
const contenu = `# Matrice de sécurité API — Phase 9\n\nGénérée à partir des routes Hono de \`backend/src/routes\` et \`backend/src/index.ts\`. Une nouvelle route non associée à une politique bloque le générateur. Nombre de routes documentées : **${lignes.length}**.\n\nLes opérations déléguées doivent utiliser \`utilisateur.province_id\` issu de la session vérifiée. Un \`province_id\` fourni par le navigateur ne constitue jamais une autorité. Les détails de ressource (remises, allocations, pièces jointes et archives) sont relus par leur relation parente côté service.\n\n| Méthode | Chemin | Rôles admis | Portée et source de province_id | CSRF | Contrôle de sécurité à couvrir |\n|---|---|---|---|---|---|\n${tableau.join("\n")}\n\n## Limites de preuve\n\nLa suite locale d’intégration exerce les parcours d’authentification, des stocks, des approvisionnements, des distributions, des rapports, des archives, du CSRF, de l’idempotence, de la concurrence et de l’isolation Sila/Ouaddaï. Cette matrice décrit le contrôle requis route par route; elle ne transforme pas ces scénarios en preuve d’un appel négatif distinct sur chaque URL. L’audit exhaustif individuel de toutes les routes, notamment les variantes d’identifiants imbriqués, reste à compléter avant de considérer l’isolation de Phase 1 comme entièrement close.\n`;

if (process.argv.includes("--check")) {
  const existant = await readFile(destination, "utf8");
  if (existant !== contenu) throw new Error("La matrice versionnée ne correspond pas aux routes et politiques Hono réelles. Régénérez-la et revoyez chaque entrée.");
  console.log(`PASS — Matrice de sécurité synchronisée avec ${lignes.length} routes API déclarées.`);
} else {
  await writeFile(destination, contenu, "utf8");
  console.log(`Matrice écrite : ${lignes.length} routes API.`);
}
