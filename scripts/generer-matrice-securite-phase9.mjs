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
  routesDistributions: [{ prefixe: "/api/distributions", roles: "Lecture selon le rôle; création et exécution par DELEGUE_PROVINCIAL; opérations d’administration selon contrôle du service", province: "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants" }],
  routesControleDistributions: [{ prefixe: "/api/central/distributions", roles: "ADMIN_CENTRAL uniquement", province: "National; le dossier et ses lignes gardent la province enregistrée en base" }],
  routesRapports: [{ prefixe: "/api/rapports", roles: "PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL; rapprochement d’archives: PROPRIETAIRE uniquement", province: "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement" }],
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
        roles = routeComplete.endsWith("/csrf") || routeComplete.endsWith("/connexion")
          ? "Public; connexion protégée par CSRF pré-authentification et limitation des tentatives"
          : "Session authentifiée; changement initial et déconnexion exigent CSRF";
      } else if (variable === "routesStocks" && mutation && /^\/api\/stocks\/(categories-aide|unites-mesure|conditionnements|articles)/u.test(routeComplete)) {
        roles = "PROPRIETAIRE ou ADMIN_CENTRAL uniquement";
      } else if (variable === "routesStocks" && mutation) {
        roles = "ADMIN_CENTRAL ou DELEGUE_PROVINCIAL; opérations bornées à l’entrepôt autorisé";
      } else if (variable === "routesTerritoire" && mutation) {
        roles = "DELEGUE_PROVINCIAL uniquement pour soumettre une proposition; validation hors de ce routeur";
        province = "utilisateur.province_id de session; rattachement à une entité de la même province";
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

await writeFile(destination, contenu, "utf8");
console.log(`Matrice écrite : ${lignes.length} routes API.`);
