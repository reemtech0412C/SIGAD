import { Hono } from "hono";
import type { EnvironnementApplication } from "./bindings";
import { authMiddleware } from "./middlewares/auth.middleware";
import { csrfSessionMiddleware } from "./middlewares/csrf.middleware";
import { isolationProvinciale, exigerRoles } from "./middlewares/rbac.middleware";
import { routesAuth } from "./routes/auth.routes";
import { routesTerritoire } from "./routes/territoire.routes";
import { routesProprietaire } from "./routes/utilisateurs.routes";
import { routesValidationTerritoire } from "./routes/validation-territoire.routes";
import { routesGestion } from "./routes/gestion.routes";
import { routesStocks } from "./routes/stocks.routes";
import {
  routesApprovisionnementsCentrales,
  routesApprovisionnementsLecture,
  routesExpeditionsProvinciales,
} from "./routes/approvisionnements.routes";
import { routesControleDistributions, routesDistributions } from "./routes/distributions.routes";
import { routesControleCentral, routesControleProvincial, routesNotifications } from "./routes/controle.routes.ts";
import { routesRapports } from "./routes/rapports.routes.ts";
import { typeErreurSecurise } from "./services/fichiers-securite.service.ts";

const app = new Hono<EnvironnementApplication>();

app.use("*", async (c, suivant) => {
  await suivant();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self' blob:");
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
  if (c.env.ENVIRONMENT === "production") c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

app.onError((erreur, c) => {
  console.error(JSON.stringify({
    message: "Échec du traitement de la requête",
    type_erreur: typeErreurSecurise(erreur),
    chemin: c.req.path,
  }));
  return c.json({ erreur: "Une erreur inattendue est survenue. Réessayez plus tard." }, 500);
});

app.get("/api/sante", (c) => c.json({ statut: "operationnel" }));
app.route("/api/auth", routesAuth);

app.use("/api/rapports/*", authMiddleware);
app.use("/api/rapports/*", csrfSessionMiddleware);
app.use("/api/rapports/*", exigerRoles("PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"));
app.use("/api/rapports/archives/reconciliation*", exigerRoles("PROPRIETAIRE"));
app.route("/api/rapports", routesRapports);

app.use("/api/gestion/*", authMiddleware);
app.use("/api/gestion/*", csrfSessionMiddleware);
app.route("/api/gestion", routesGestion);

app.use("/api/stocks/*", authMiddleware);
app.use("/api/stocks/*", csrfSessionMiddleware);
app.route("/api/stocks", routesStocks);

app.use("/api/proprietaire/*", authMiddleware);
app.use("/api/proprietaire/*", csrfSessionMiddleware);
app.use("/api/proprietaire/*", exigerRoles("PROPRIETAIRE"));
app.route("/api/proprietaire", routesProprietaire);
app.route("/api/proprietaire", routesValidationTerritoire);

app.use("/api/central/*", authMiddleware);
app.use("/api/central/*", csrfSessionMiddleware);
app.use("/api/central/*", exigerRoles("ADMIN_CENTRAL"));
app.route("/api/central", routesValidationTerritoire);
app.route("/api/central/approvisionnements", routesApprovisionnementsCentrales);
app.route("/api/central/distributions", routesControleDistributions);
app.route("/api/central", routesControleCentral);

app.use("/api/provincial/*", authMiddleware);
app.use("/api/provincial/*", csrfSessionMiddleware);
app.use("/api/provincial/*", exigerRoles("DELEGUE_PROVINCIAL"));
app.use("/api/provincial/*", isolationProvinciale);
app.get("/api/provincial/:provinceId/profil", (c) => {
  const utilisateur = c.get("utilisateur");
  return c.json({
    province_id: utilisateur.province_id,
    nom_complet: utilisateur.nom_complet,
    identifiant: utilisateur.identifiant,
  });
});
app.route("/api/provincial/expeditions", routesExpeditionsProvinciales);
app.route("/api/provincial", routesControleProvincial);

app.use("/api/notifications", authMiddleware);
app.use("/api/notifications/*", authMiddleware);
app.use("/api/notifications", csrfSessionMiddleware);
app.use("/api/notifications/*", csrfSessionMiddleware);
app.route("/api/notifications", routesNotifications);

app.use("/api/distributions", authMiddleware);
app.use("/api/distributions/*", authMiddleware);
app.use("/api/distributions", csrfSessionMiddleware);
app.use("/api/distributions/*", csrfSessionMiddleware);
app.route("/api/distributions", routesDistributions);

app.use("/api/approvisionnements", authMiddleware);
app.use("/api/approvisionnements/*", authMiddleware);
app.route("/api/approvisionnements", routesApprovisionnementsLecture);

app.use("/api/territoire/*", authMiddleware);
app.use("/api/territoire/*", isolationProvinciale);
app.use("/api/territoire/*", csrfSessionMiddleware);
app.route("/api/territoire", routesTerritoire);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ erreur: "La ressource demandée est introuvable." }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
