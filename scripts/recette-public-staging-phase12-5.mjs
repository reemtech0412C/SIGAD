import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const racine = resolve(import.meta.dirname, "..");
const exiger = createRequire(join(racine, "package.json"));
const { chromium } = exiger("@playwright/test");
const base = "https://sigad-staging.reemtech0412.workers.dev";
const executableChrome = process.env.SIGAD_PLAYWRIGHT_EXECUTABLE;
const dossierPreuves = join(racine, "docs", "evidence", "phase-12-5-staging");
const capture = join(dossierPreuves, "connexion-staging-verification-complete.png");

if (!executableChrome) throw new Error("Définissez SIGAD_PLAYWRIGHT_EXECUTABLE vers Chrome stable.");
if (existsSync(capture)) throw new Error("La capture existe déjà; aucune preuve précédente ne sera écrasée.");
await mkdir(dossierPreuves, { recursive: true });

const navigateur = await chromium.launch({ headless: true, executablePath: executableChrome });
try {
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 1000 }, locale: "fr-FR" });
  const page = await contexte.newPage();
  const ressources = [];
  page.on("response", (reponse) => {
    const url = new URL(reponse.url());
    if (url.origin !== base) return;
    const contenu = reponse.headers()["content-type"] ?? "";
    if (/\.(?:js|mjs)$/iu.test(url.pathname) || /\.(?:css|ttf|woff2?)$/iu.test(url.pathname) || /sigad-logo\.png$/iu.test(url.pathname)) {
      ressources.push({ chemin: url.pathname, statut: reponse.status(), contenu });
    }
  });

  const accueil = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (accueil?.status() !== 200 || !(accueil.headers()["content-type"] ?? "").includes("text/html")) {
    throw new Error("La page publique Staging n’a pas répondu en HTML HTTP 200.");
  }
  await page.getByRole("heading", { name: "SIGAD" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('img[alt="SIGAD"]').evaluate(async (image) => {
    await image.decode();
    return image.naturalWidth > 0;
  });
  await page.evaluate(() => document.fonts.ready);
  const rendu = await page.evaluate(() => ({
    titre: document.title,
    police: getComputedStyle(document.body).fontFamily,
    dmSansChargee: document.fonts.check('400 16px "DM Sans"'),
    fontesDeclarees: [...document.fonts].map((police) => ({ famille: police.family, statut: police.status, poids: police.weight })),
    logo: [...document.images].some((image) => image.complete && image.naturalWidth > 0 && image.alt.includes("SIGAD")),
    logoSrc: [...document.images].find((image) => image.alt.includes("SIGAD"))?.currentSrc ?? null,
    formulaires: [...document.querySelectorAll("input")].map((input) => input.getAttribute("aria-label") ?? input.name ?? input.id),
  }));
  const javascript = ressources.filter((ressource) => /\.(?:js|mjs)$/iu.test(ressource.chemin));
  const css = ressources.filter((ressource) => /\.css$/iu.test(ressource.chemin));
  const polices = ressources.filter((ressource) => /\.(?:ttf|woff2?)$/iu.test(ressource.chemin));
  const logo = ressources.find((ressource) => /sigad-logo\.png$/iu.test(ressource.chemin));
  const session = await page.evaluate(async () => {
    const reponse = await fetch("/api/auth/session", { credentials: "include" });
    return reponse.status;
  });
  const csrf = await contexte.request.get(`${base}/api/auth/csrf`);
  const csrfCookie = csrf.headers()["set-cookie"] ?? "";
  const csrfReponse = await csrf.json();
  const preauth = await contexte.request.post(`${base}/api/auth/connexion`, { data: { identifiant: "", mot_de_passe: "" } });
  await page.screenshot({ path: capture, fullPage: true });
  const resultats = {
    etape: "CHROME_STAGING_PUBLIC",
    resultat: "PASS",
    url: base,
    http: accueil.status(),
    sessionAnonyme: session,
    csrfInitialisation: csrf.status(),
    csrfCookieSecure: /(?:^|;\s*)Secure(?:;|$)/iu.test(csrfCookie),
    csrfCookieSameSiteLax: /SameSite=Lax/iu.test(csrfCookie),
    csrfTokenReturned: typeof csrfReponse.jeton_csrf === "string",
    connexionSansJetonCsrf: preauth.status(),
    logoHttp: logo?.statut ?? null,
    logoContentType: logo?.contenu ?? null,
    logoRendu: rendu.logo,
    logoSrc: rendu.logoSrc,
    dmSans: { familleRendue: rendu.police, chargee: rendu.dmSansChargee, fontes: rendu.fontesDeclarees, reponses: polices },
    javascript: javascript,
    css,
    capture,
  };
  console.log(JSON.stringify(resultats));
  if (!javascript.length || javascript.some((ressource) => ressource.statut !== 200 || !/(?:javascript|ecmascript)/iu.test(ressource.contenu))) {
    throw new Error("Un module JavaScript est absent, en échec ou servi avec un type MIME incorrect.");
  }
  if (!css.length || css.some((ressource) => ressource.statut !== 200 || !ressource.contenu.includes("text/css"))) {
    throw new Error("Une feuille CSS est absente, en échec ou servie avec un type MIME incorrect.");
  }
  if (!rendu.logo || logo?.statut !== 200 || !logo.contenu.startsWith("image/")) throw new Error("Le logo SIGAD n’est pas chargé en image HTTP 200.");
  if (!rendu.police.includes("DM Sans") || !rendu.dmSansChargee || !polices.some((police) => police.statut === 200)
    || polices.some((police) => ![200, 307].includes(police.statut))) {
    throw new Error("DM Sans n’est pas chargée localement et rendue par Chrome.");
  }
  if (!rendu.formulaires.includes("identifiant") || !rendu.formulaires.includes("mot-de-passe")) {
    throw new Error("Les champs de connexion attendus ne sont pas présents.");
  }
  if (session !== 401) throw new Error(`La session anonyme a renvoyé HTTP ${session}, attendu 401.`);
  if (csrf.status() !== 200 || !/Secure/iu.test(csrfCookie) || !/SameSite=Lax/iu.test(csrfCookie)
    || typeof csrfReponse.jeton_csrf !== "string" || preauth.status() !== 403) {
    throw new Error("Le contrôle CSRF anonyme ou les attributs du cookie sécurisé ne correspondent pas aux attentes.");
  }
} finally {
  await navigateur.close();
}
