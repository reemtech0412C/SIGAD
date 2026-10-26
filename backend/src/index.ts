import { Hono, type MiddlewareHandler } from "hono";
import type { EnvironnementApplication } from "./bindings";
import type { RoleUtilisateur } from "../../shared/constantes/roles";
import {
  ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE,
  ROLES_PROPOSITION_MODIFICATION_TERRITORIALE,
} from "../../shared/constantes/roles";
import { TYPES_RAPPORT, type TypeRapport } from "../../shared/validations/rapports";
import { authMiddleware } from "./middlewares/auth.middleware";
import { csrfPreAuthMiddleware, csrfSessionMiddleware } from "./middlewares/csrf.middleware";
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
import { environnementExigeTransportSecurise } from "./services/securite-http.service";
import { traiterExceptionRecuperation } from "./services/diagnostic-recuperation.service";
import { routesAdministrationComptes, routesInscriptionsDelegues, routesMonCompte } from "./routes/comptes.routes";
import { routesOperationsCentrales, routesOperationsProvinciales } from "./routes/operations-centrales.routes";
import { routesProprietaireDonneesTest } from "./routes/donnees-test.routes";
import { routesAdministrationTerritoriale } from "./routes/administration-territoriale.routes";
import { lireDefinitionRapport } from "./services/rapports.service";

const app = new Hono<EnvironnementApplication>();

app.use("*", async (c, suivant) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  await suivant();
  c.header("X-Request-ID", requestId);
});

const refuserAccesOperationnelConsultation: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (c.get("utilisateur").role === "CONSULTATION_INSTITUTIONNELLE") {
    return c.json({ erreur: "Votre compte est limité à la consultation des rapports autorisés et à la gestion de votre profil." }, 403);
  }
  return await suivant();
};

const limiterRapportsConsultation: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (c.get("utilisateur").role !== "CONSULTATION_INSTITUTIONNELLE") {
    return await suivant();
  }
  const chemin = c.req.path;
  const methode = c.req.method;
  const lectureCatalogue = methode === "GET" && chemin === "/api/rapports/catalogue";
  const consultationAgregee = methode === "GET" && [
    "/api/rapports/filtres", "/api/rapports/tableau-de-bord", "/api/rapports/indicateurs-carte",
  ].includes(chemin);
  const correspondance = chemin.match(/^\/api\/rapports\/([A-Z0-9_]+)\/(apercu|export)$/u);
  let rapportAutorise = false;
  if (correspondance && (methode === "GET" && correspondance[2] === "apercu"
    || methode === "POST" && correspondance[2] === "export")) {
    const type = correspondance[1] as TypeRapport;
    rapportAutorise = TYPES_RAPPORT.includes(type) && !lireDefinitionRapport(type).donneesSensibles;
  }
  if (!lectureCatalogue && !consultationAgregee && !rapportAutorise) {
    return c.json({ erreur: "Cette ressource n’est pas autorisée pour un compte de consultation." }, 403);
  }
  await suivant();
};

app.use("*", async (c, suivant) => {
  await suivant();
  const formulaireExportRapport = c.req.method === "POST"
    && /^\/api\/rapports\/[A-Z0-9_]+\/export$/u.test(c.req.path)
    && c.req.header("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/x-www-form-urlencoded";
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", formulaireExportRapport ? "SAMEORIGIN" : "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", formulaireExportRapport
    ? "default-src 'none'; frame-ancestors 'self'"
    : "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self' blob:");
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
  if (environnementExigeTransportSecurise(c.env.ENVIRONMENT)) c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

app.onError((erreur, c) => {
  const erreurRecuperation = traiterExceptionRecuperation(c, erreur);
  if (erreurRecuperation) return erreurRecuperation;
  console.error(JSON.stringify({
    message: "Échec du traitement de la requête",
    type_erreur: typeErreurSecurise(erreur),
    chemin: c.req.path,
  }));
  return c.json({ erreur: "Une erreur inattendue est survenue. Réessayez plus tard." }, 500);
});

app.get("/api/sante", (c) => c.json({ statut: "operationnel" }));
app.route("/api/auth", routesAuth);

app.use("/api/inscriptions/delegues", async (c, suivant) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return suivant();
  return csrfPreAuthMiddleware(c, suivant);
});
app.use("/api/inscriptions/delegues/*", async (c, suivant) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return suivant();
  return csrfPreAuthMiddleware(c, suivant);
});
app.route("/api/inscriptions/delegues", routesInscriptionsDelegues);

app.use("/api/compte/*", authMiddleware);
app.use("/api/compte/*", csrfSessionMiddleware);
app.use("/api/compte", authMiddleware);
app.use("/api/compte", csrfSessionMiddleware);
app.route("/api/compte", routesMonCompte);

app.use("/api/administration/comptes/*", authMiddleware);
app.use("/api/administration/comptes/*", csrfSessionMiddleware);
app.use("/api/administration/comptes/*", exigerRoles("ADMIN_CENTRAL"));
app.use("/api/administration/comptes", authMiddleware);
app.use("/api/administration/comptes", csrfSessionMiddleware);
app.use("/api/administration/comptes", exigerRoles("ADMIN_CENTRAL"));
app.route("/api/administration/comptes", routesAdministrationComptes);

app.use("/api/rapports/*", authMiddleware);
app.use("/api/rapports/*", csrfSessionMiddleware);
app.use("/api/rapports/*", exigerRoles("PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "CONSULTATION_INSTITUTIONNELLE"));
app.use("/api/rapports/archives/reconciliation*", exigerRoles("PROPRIETAIRE"));
app.use("/api/rapports/*", limiterRapportsConsultation);
app.route("/api/rapports", routesRapports);

app.use("/api/gestion/*", authMiddleware);
app.use("/api/gestion/*", csrfSessionMiddleware);
app.use("/api/gestion/*", refuserAccesOperationnelConsultation);
const limiterMutationsGestion: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    await suivant();
    return;
  }
  const chemin = c.req.path;
  const decisionMenageCentrale = /^\/api\/gestion\/menages\/[^/]+\/validation$/u.test(chemin);
  const revueDoublonCentrale = /^\/api\/gestion\/signalements-doublons\/[^/]+\/(?:decision|reouverture)$/u.test(chemin);
  const rolesAutorises: readonly RoleUtilisateur[] = chemin === "/api/gestion/partenaires"
    ? ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const
    : decisionMenageCentrale || revueDoublonCentrale
      ? ["ADMIN_CENTRAL"] as const
      : chemin.endsWith("/validation")
      ? ["PROPRIETAIRE", "ADMIN_CENTRAL"] as const
      : ["ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
  if (!rolesAutorises.includes(c.get("utilisateur").role)) {
    return c.json({ erreur: "Votre rôle ne permet pas cette opération de gestion." }, 403);
  }
  await suivant();
  return;
};
app.use("/api/gestion", limiterMutationsGestion);
app.use("/api/gestion/*", limiterMutationsGestion);
app.route("/api/gestion", routesGestion);

app.use("/api/stocks/*", authMiddleware);
app.use("/api/stocks/*", csrfSessionMiddleware);
app.use("/api/stocks/*", refuserAccesOperationnelConsultation);
const limiterMutationsStocks: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    await suivant();
    return;
  }
  const chemin = c.req.path;
  const reference = /^\/api\/stocks\/(categories-aide|unites-mesure|conditionnements|articles)(?:\/|$)/u.test(chemin);
  const rolesAutorises: readonly RoleUtilisateur[] = reference
    ? ["PROPRIETAIRE", "ADMIN_CENTRAL"] as const
    : ["ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
  if (!rolesAutorises.includes(c.get("utilisateur").role)) {
    return c.json({ erreur: "Votre rôle ne permet pas cette opération de stock." }, 403);
  }
  await suivant();
  return;
};
app.use("/api/stocks", limiterMutationsStocks);
app.use("/api/stocks/*", limiterMutationsStocks);
app.route("/api/stocks", routesStocks);

app.use("/api/proprietaire/*", authMiddleware);
app.use("/api/proprietaire/*", csrfSessionMiddleware);
app.use("/api/proprietaire/*", refuserAccesOperationnelConsultation);
app.use("/api/proprietaire/*", exigerRoles("PROPRIETAIRE"));
app.route("/api/proprietaire", routesProprietaire);
app.route("/api/proprietaire", routesValidationTerritoire);
app.route("/api/proprietaire/donnees-test", routesProprietaireDonneesTest);
app.route("/api/proprietaire/territoire", routesAdministrationTerritoriale);

app.use("/api/central/*", authMiddleware);
app.use("/api/central/*", csrfSessionMiddleware);
app.use("/api/central/*", refuserAccesOperationnelConsultation);
app.use("/api/central/*", exigerRoles("ADMIN_CENTRAL"));
app.route("/api/central", routesValidationTerritoire);
app.route("/api/central/approvisionnements", routesApprovisionnementsCentrales);
app.route("/api/central/distributions", routesControleDistributions);
app.route("/api/central", routesControleCentral);

app.use("/api/provincial/*", authMiddleware);
app.use("/api/provincial/*", csrfSessionMiddleware);
app.use("/api/provincial/*", refuserAccesOperationnelConsultation);
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
app.route("/api/provincial/operations-centrales", routesOperationsProvinciales);
app.route("/api/provincial", routesControleProvincial);

app.use("/api/notifications", authMiddleware);
app.use("/api/notifications/*", authMiddleware);
app.use("/api/notifications", csrfSessionMiddleware);
app.use("/api/notifications/*", csrfSessionMiddleware);
app.use("/api/notifications", refuserAccesOperationnelConsultation);
app.use("/api/notifications/*", refuserAccesOperationnelConsultation);
app.route("/api/notifications", routesNotifications);

app.use("/api/operations-centrales", authMiddleware);
app.use("/api/operations-centrales/*", authMiddleware);
app.use("/api/operations-centrales", csrfSessionMiddleware);
app.use("/api/operations-centrales/*", csrfSessionMiddleware);
app.use("/api/operations-centrales", refuserAccesOperationnelConsultation);
app.use("/api/operations-centrales/*", refuserAccesOperationnelConsultation);
const limiterMutationsOperationsCentrales: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.get("utilisateur").role !== "ADMIN_CENTRAL") {
    return c.json({ erreur: "Seule l’administration centrale peut administrer les opérations centrales de distribution." }, 403);
  }
  await suivant();
  return;
};
app.use("/api/operations-centrales", limiterMutationsOperationsCentrales);
app.use("/api/operations-centrales/*", limiterMutationsOperationsCentrales);
app.route("/api/operations-centrales", routesOperationsCentrales);

app.use("/api/distributions", authMiddleware);
app.use("/api/distributions/*", authMiddleware);
app.use("/api/distributions", csrfSessionMiddleware);
app.use("/api/distributions/*", csrfSessionMiddleware);
app.use("/api/distributions", refuserAccesOperationnelConsultation);
app.use("/api/distributions/*", refuserAccesOperationnelConsultation);
const limiterMutationsDistributions: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.get("utilisateur").role !== "DELEGUE_PROVINCIAL") {
    return c.json({ erreur: "Seul un délégué provincial peut modifier une distribution provinciale." }, 403);
  }
  await suivant();
  return;
};
app.use("/api/distributions", limiterMutationsDistributions);
app.use("/api/distributions/*", limiterMutationsDistributions);
app.route("/api/distributions", routesDistributions);

app.use("/api/approvisionnements", authMiddleware);
app.use("/api/approvisionnements/*", authMiddleware);
app.use("/api/approvisionnements", refuserAccesOperationnelConsultation);
app.use("/api/approvisionnements/*", refuserAccesOperationnelConsultation);
app.route("/api/approvisionnements", routesApprovisionnementsLecture);

app.use("/api/territoire/*", authMiddleware);
app.use("/api/territoire/*", refuserAccesOperationnelConsultation);
app.use(
  "/api/territoire/propositions/*",
  exigerRoles(...ROLES_PROPOSITION_MODIFICATION_TERRITORIALE),
);
app.use("/api/territoire/*", isolationProvinciale);
app.use("/api/territoire/*", csrfSessionMiddleware);
const limiterPropositionsTerritoriales: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const roleUtilisateur = c.get("utilisateur").role;
    if (c.req.path === "/api/territoire/unites-dynamiques") {
      if (!ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE.includes(roleUtilisateur)) {
        return c.json({ erreur: "Votre rôle ne permet pas d'ajouter une unité territoriale." }, 403);
      }
    } else {
      if (!ROLES_PROPOSITION_MODIFICATION_TERRITORIALE.includes(roleUtilisateur)) {
        return c.json(
          {
            erreur:
              "Seuls le Propriétaire, l'Administration centrale ou un Délégué provincial peuvent proposer une modification territoriale.",
          },
          403,
        );
      }
    }
  }
  await suivant();
  return;
};
app.use("/api/territoire/*", limiterPropositionsTerritoriales);
app.route("/api/territoire", routesTerritoire);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ erreur: "La ressource demandée est introuvable." }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
