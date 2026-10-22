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

const app = new Hono<EnvironnementApplication>();

app.onError((erreur, c) => {
  console.error(JSON.stringify({
    message: "Échec du traitement de la requête",
    erreur: erreur instanceof Error ? erreur.message : "Erreur non identifiée",
    chemin: c.req.path,
  }));
  return c.json({ erreur: "Une erreur inattendue est survenue. Réessayez plus tard." }, 500);
});

app.get("/api/sante", (c) => c.json({ statut: "operationnel" }));
app.route("/api/auth", routesAuth);

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
