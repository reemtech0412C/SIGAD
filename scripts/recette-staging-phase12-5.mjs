import { createHash, createHmac, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const racine = resolve(import.meta.dirname, "..");
const exiger = createRequire(join(racine, "package.json"));
const { chromium } = exiger("@playwright/test");
const qrcode = exiger("qrcode-generator");
const base = "https://sigad-staging.reemtech0412.workers.dev";
const fichierCodes = process.env.SIGAD_CODES_ACTIVATION;
const repertoirePrive = process.env.SIGAD_PHASE125_DIR;
const executableChrome = process.env.SIGAD_PLAYWRIGHT_EXECUTABLE;

if (base !== "https://sigad-staging.reemtech0412.workers.dev") throw new Error("Hôte Staging inattendu.");
if (!fichierCodes || !repertoirePrive || !executableChrome) {
  throw new Error("Définissez SIGAD_CODES_ACTIVATION, SIGAD_PHASE125_DIR et SIGAD_PLAYWRIGHT_EXECUTABLE.");
}

const fichierIdentifiants = join(repertoirePrive, "identifiants-staging-proteges.json");
const dossierCaptures = join(racine, "docs", "evidence", "phase-12-5-staging");
const configurationStaging = await readFile(join(racine, "wrangler.staging.toml"), "utf8");
if (!/^name\s*=\s*"sigad-staging"\s*$/mu.test(configurationStaging)
  || !/database_name\s*=\s*"sigad-staging-db"/u.test(configurationStaging)
  || !/database_id\s*=\s*"a54e1ea9-c49a-4729-ad06-a40ceb421127"/u.test(configurationStaging)
  || !/bucket_name\s*=\s*"sigad-staging-documents"/u.test(configurationStaging)
  || !/ENVIRONMENT\s*=\s*"staging"/u.test(configurationStaging)) {
  throw new Error("La configuration Staging ne correspond pas exactement aux ressources approuvées.");
}
if (existsSync(fichierIdentifiants)) {
  throw new Error("Un coffre de résultats existe déjà dans ce dossier ; aucune donnée d’identification ne sera écrasée.");
}
await mkdir(repertoirePrive, { recursive: true });
await mkdir(dossierCaptures, { recursive: true });

const attentes = [
  { identifiant: "central", role: "ADMIN_CENTRAL", provinceId: null, mfa: true },
  { identifiant: "proprietaire", role: "PROPRIETAIRE", provinceId: null, mfa: true },
  { identifiant: "sila", role: "DELEGUE_PROVINCIAL", provinceId: "prov-sila", mfa: false },
  { identifiant: "ouaddai", role: "DELEGUE_PROVINCIAL", provinceId: "prov-ouaddai", mfa: false },
];

const activation = JSON.parse(await readFile(fichierCodes, "utf8"));
if (!Array.isArray(activation)) throw new Error("Le fichier d’activation n’a pas le format attendu.");
const codesParIdentifiant = new Map(activation.map((ligne) => [ligne.identifiant, ligne.code_activation]));
for (const cible of attentes) {
  if (typeof codesParIdentifiant.get(cible.identifiant) !== "string") {
    throw new Error(`Code d’activation absent pour le compte de test ${cible.identifiant}.`);
  }
}

const identifiantsProteges = {};
async function protegerValeur(valeur) {
  const resultat = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-Command", "$v=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString $v -AsPlainText -Force)"],
    { input: valeur, encoding: "utf8", windowsHide: true },
  );
  if (resultat.status !== 0 || !resultat.stdout.trim()) throw new Error("Le chiffrement DPAPI d’un secret local a échoué.");
  return resultat.stdout.trim();
}

async function sauvegarderSecret(identifiant, cle, valeur) {
  const compte = identifiantsProteges[identifiant] ?? { identifiant };
  compte[cle] = await protegerValeur(valeur);
  identifiantsProteges[identifiant] = compte;
  await writeFile(fichierIdentifiants, `${JSON.stringify({ protection: "DPAPI-CurrentUser", comptes: identifiantsProteges }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function decoderBase32(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let tampon = 0;
  let bits = 0;
  const sortie = [];
  for (const caractere of secret.toUpperCase().replace(/=+$/u, "")) {
    const index = alphabet.indexOf(caractere);
    if (index < 0) throw new Error("Secret TOTP non conforme au format Base32.");
    tampon = (tampon << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      sortie.push((tampon >>> bits) & 255);
    }
  }
  return Buffer.from(sortie);
}

function codeTotp(secret, compteur) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(compteur));
  const empreinte = createHmac("sha1", decoderBase32(secret)).update(message).digest();
  const decalage = empreinte[empreinte.length - 1] & 15;
  const valeur = ((empreinte[decalage] & 127) << 24)
    | ((empreinte[decalage + 1] & 255) << 16)
    | ((empreinte[decalage + 2] & 255) << 8)
    | (empreinte[decalage + 3] & 255);
  return String(valeur % 1_000_000).padStart(6, "0");
}

function codeInvalide(secret) {
  const actuel = Math.floor(Date.now() / 30_000);
  const valides = new Set(Array.from({ length: 5 }, (_, index) => codeTotp(secret, actuel + index - 2)));
  for (let essai = 0; essai < 100; essai += 1) {
    const candidat = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
    if (!valides.has(candidat)) return candidat;
  }
  throw new Error("Impossible de produire un code TOTP négatif de test.");
}

class ClientApi {
  cookies = new Map();
  attributsCookies = new Map();
  jetonCsrf = "";

  async requete(chemin, { methode = "GET", corps, sansCsrf = false } = {}) {
    const entetes = new Headers({ accept: "application/json" });
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${valeur}`).join("; "));
    if (!sansCsrf && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    const options = { method: methode, headers: entetes, redirect: "manual" };
    if (corps !== undefined) {
      entetes.set("Content-Type", "application/json");
      options.body = JSON.stringify(corps);
    }
    const reponse = await fetch(`${base}${chemin}`, options);
    for (const ligne of reponse.headers.getSetCookie()) {
      const paire = ligne.split(";", 1)[0];
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = paire.slice(separateur + 1).trim();
      if (!valeur || /Max-Age=0/i.test(ligne)) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
      this.attributsCookies.set(nom, ligne);
    }
    const texte = await reponse.text();
    let donnees = null;
    if (texte) {
      try { donnees = JSON.parse(texte); } catch { donnees = null; }
    }
    return { statut: reponse.status, donnees, entetes: reponse.headers, texte };
  }

  async initialiserCsrf() {
    const resultat = await this.requete("/api/auth/csrf");
    if (resultat.statut !== 200 || typeof resultat.donnees?.jeton_csrf !== "string") {
      throw new Error(`Initialisation CSRF refusée (HTTP ${resultat.statut}).`);
    }
    this.jetonCsrf = resultat.donnees.jeton_csrf;
  }

  async session() {
    return this.requete("/api/auth/session");
  }

  async deconnexion() {
    const resultat = await this.requete("/api/auth/deconnexion", { methode: "POST", corps: {} });
    if (resultat.statut !== 200) throw new Error(`Déconnexion refusée (HTTP ${resultat.statut}).`);
    const session = await this.session();
    if (session.statut !== 401) throw new Error("La session est restée valide après la déconnexion.");
  }
}

function exigerStatut(resultat, statutAttendu, etape) {
  if (resultat.statut !== statutAttendu) throw new Error(`${etape} : HTTP ${resultat.statut}, attendu ${statutAttendu}.`);
}

async function connexionInitiale(cible, motDePasse) {
  const client = new ClientApi();
  await client.initialiserCsrf();
  const resultat = await client.requete("/api/auth/connexion", {
    methode: "POST",
    corps: { identifiant: cible.identifiant, mot_de_passe: motDePasse },
  });
  exigerStatut(resultat, 200, `Connexion initiale ${cible.identifiant}`);
  if (resultat.donnees?.utilisateur?.role !== cible.role || resultat.donnees?.utilisateur?.doit_changer_mot_de_passe !== true) {
    throw new Error(`Le rôle ou l’état initial du compte ${cible.identifiant} ne correspond pas à la matrice attendue.`);
  }
  if (cible.mfa && resultat.donnees.utilisateur.mfa_setup_requis !== true) {
    throw new Error(`La configuration MFA initiale n’est pas signalée pour ${cible.identifiant}.`);
  }
  if (resultat.donnees.utilisateur.province_id !== cible.provinceId) {
    throw new Error(`Le rattachement provincial du compte ${cible.identifiant} est incorrect.`);
  }
  return client;
}

async function terminerChangementInitial(client, cible) {
  const motDePasse = `Tchad-${randomBytes(24).toString("base64url")}Aa9`;
  await sauvegarderSecret(cible.identifiant, "mot_de_passe_dpapi", motDePasse);
  const resultat = await client.requete("/api/auth/changer-mot-de-passe-initial", {
    methode: "POST", corps: { nouveau_mot_de_passe: motDePasse },
  });
  exigerStatut(resultat, 200, `Changement initial de mot de passe ${cible.identifiant}`);
  return motDePasse;
}

async function enrôlerMfa(client, cible) {
  const initialisation = await client.requete("/api/auth/mfa/initialiser", { methode: "POST", corps: {} });
  exigerStatut(initialisation, 200, `Initialisation MFA ${cible.identifiant}`);
  const secret = initialisation.donnees?.secret_totp;
  const uri = initialisation.donnees?.uri_provisionnement;
  if (typeof secret !== "string" || typeof uri !== "string") throw new Error(`Paramètres MFA absents pour ${cible.identifiant}.`);
  await sauvegarderSecret(cible.identifiant, "secret_totp_dpapi", secret);
  await sauvegarderSecret(cible.identifiant, "uri_provisionnement_dpapi", uri);
  const codeQr = qrcode(0, "M");
  codeQr.addData(uri);
  codeQr.make();
  await writeFile(join(repertoirePrive, `mfa-${cible.identifiant}.svg`), codeQr.createSvgTag({ cellSize: 6, margin: 4, scalable: true }), { encoding: "utf8", mode: 0o600 });
  const compteur = Math.floor(Date.now() / 30_000);
  const confirmation = await client.requete("/api/auth/mfa/confirmer", {
    methode: "POST", corps: { code: codeTotp(secret, compteur) },
  });
  exigerStatut(confirmation, 200, `Confirmation MFA ${cible.identifiant}`);
  if (confirmation.donnees?.actif !== true || !Array.isArray(confirmation.donnees?.codes_recuperation)) {
    throw new Error(`Activation MFA ou codes de récupération absents pour ${cible.identifiant}.`);
  }
  await sauvegarderSecret(cible.identifiant, "codes_recuperation_dpapi", JSON.stringify(confirmation.donnees.codes_recuperation));
  return secret;
}

async function connexionAvecMfa(cible, motDePasse, secret) {
  const client = new ClientApi();
  await client.initialiserCsrf();
  const connexion = await client.requete("/api/auth/connexion", {
    methode: "POST", corps: { identifiant: cible.identifiant, mot_de_passe: motDePasse },
  });
  exigerStatut(connexion, 200, `Connexion avec MFA ${cible.identifiant}`);
  if (connexion.donnees?.mfa_requis !== true) throw new Error(`Le défi MFA n’a pas été exigé pour ${cible.identifiant}.`);
  const cookieDefi = client.attributsCookies.get("sigad_mfa_challenge") ?? "";
  if (!/Secure/i.test(cookieDefi) || !/HttpOnly/i.test(cookieDefi) || !/SameSite=Strict/i.test(cookieDefi)) {
    throw new Error(`Attributs de cookie du défi MFA incorrects pour ${cible.identifiant}.`);
  }
  const invalide = await client.requete("/api/auth/mfa/verifier", {
    methode: "POST", corps: { code: codeInvalide(secret) },
  });
  exigerStatut(invalide, 401, `Rejet du TOTP invalide ${cible.identifiant}`);
  let validation = null;
  for (let essai = 0; essai < 2; essai += 1) {
    const compteur = Math.floor(Date.now() / 30_000) + 1;
    validation = await client.requete("/api/auth/mfa/verifier", {
      methode: "POST", corps: { code: codeTotp(secret, compteur) },
    });
    if (validation.statut === 200) break;
  }
  exigerStatut(validation, 200, `Acceptation du TOTP valide ${cible.identifiant}`);
  const cookieSession = client.attributsCookies.get("sigad_session") ?? "";
  if (!/Secure/i.test(cookieSession) || !/HttpOnly/i.test(cookieSession) || !/SameSite=Lax/i.test(cookieSession)) {
    throw new Error(`Attributs du cookie de session incorrects pour ${cible.identifiant}.`);
  }
  const session = await client.session();
  exigerStatut(session, 200, `Lecture de session MFA ${cible.identifiant}`);
  if (session.donnees?.utilisateur?.role !== cible.role || session.donnees?.utilisateur?.double_facteur_actif !== true) {
    throw new Error(`La session MFA de ${cible.identifiant} ne reflète pas le rôle ou l’état MFA attendu.`);
  }
  const csrfRefuse = await client.requete("/api/auth/deconnexion", { methode: "POST", corps: {}, sansCsrf: true });
  exigerStatut(csrfRefuse, 403, `Refus de déconnexion sans jeton CSRF ${cible.identifiant}`);
  exigerStatut(await client.session(), 200, `Conservation de session après refus CSRF ${cible.identifiant}`);
  return client;
}

async function preparerCompteAdministratif(cible) {
  const activationDuCompte = codesParIdentifiant.get(cible.identifiant);
  const clientInitial = await connexionInitiale(cible, activationDuCompte);
  const motDePasse = await terminerChangementInitial(clientInitial, cible);
  const secret = await enrôlerMfa(clientInitial, cible);
  const sessionConfiguration = await clientInitial.session();
  exigerStatut(sessionConfiguration, 200, `Session après enrôlement ${cible.identifiant}`);
  await clientInitial.deconnexion();
  const client = await connexionAvecMfa(cible, motDePasse, secret);
  console.log(JSON.stringify({ etape: "AUTHENTIFICATION_MFA", compte: cible.identifiant, resultat: "PASS", role: cible.role }));
  return { client, motDePasse, secret };
}

async function preparerCompteProvincial(cible) {
  const code = codesParIdentifiant.get(cible.identifiant);
  const premiereSession = await connexionInitiale(cible, code);
  const motDePasse = await terminerChangementInitial(premiereSession, cible);
  await premiereSession.deconnexion();
  const client = new ClientApi();
  await client.initialiserCsrf();
  const connexion = await client.requete("/api/auth/connexion", {
    methode: "POST", corps: { identifiant: cible.identifiant, mot_de_passe: motDePasse },
  });
  exigerStatut(connexion, 200, `Connexion provinciale ${cible.identifiant}`);
  if (connexion.donnees?.utilisateur?.role !== cible.role || connexion.donnees?.utilisateur?.province_id !== cible.provinceId) {
    throw new Error(`Session provinciale incorrecte pour ${cible.identifiant}.`);
  }
  const session = await client.session();
  exigerStatut(session, 200, `Lecture session provinciale ${cible.identifiant}`);
  console.log(JSON.stringify({ etape: "AUTHENTIFICATION_PROVINCIALE", compte: cible.identifiant, resultat: "PASS", role: cible.role }));
  return client;
}

async function verifierIsolation(client, provincePropre, provinceAutre) {
  const propre = await client.requete(`/api/territoire/communes?province_id=${provincePropre}&limite=20&decalage=0`);
  exigerStatut(propre, 200, `Lecture du périmètre ${provincePropre}`);
  if (!Array.isArray(propre.donnees?.elements) || propre.donnees.elements.length !== 0) {
    throw new Error(`La liste des communes non validées n’est pas vide pour ${provincePropre}.`);
  }
  const autre = await client.requete(`/api/territoire/communes?province_id=${provinceAutre}&limite=20&decalage=0`);
  if (![403, 404].includes(autre.statut)) throw new Error(`La lecture interprovinciale ${provinceAutre} a renvoyé HTTP ${autre.statut}.`);
  if (JSON.stringify(autre.donnees ?? {}).includes(provinceAutre)) throw new Error("La réponse d’erreur révèle l’identifiant de la province ciblée.");
  const indicateurs = await client.requete(`/api/rapports/indicateurs-carte?province_id=${provincePropre}`);
  exigerStatut(indicateurs, 200, `Indicateurs du périmètre ${provincePropre}`);
  if (indicateurs.donnees?.perimetre !== "PROVINCIAL" || indicateurs.donnees?.province_id !== provincePropre) {
    throw new Error(`Les agrégats du compte provincial ${provincePropre} ne sont pas isolés.`);
  }
  if (indicateurs.texte.includes("nom_complet") || indicateurs.texte.includes("code_menage") || indicateurs.texte.includes("telephone")) {
    throw new Error("La réponse cartographique contient un champ nominatif non autorisé.");
  }
  const cross = await client.requete(`/api/rapports/indicateurs-carte?province_id=${provinceAutre}`);
  if (cross.statut !== 403) throw new Error(`La demande d’indicateurs hors périmètre a renvoyé HTTP ${cross.statut}.`);
  console.log(JSON.stringify({ etape: "ISOLATION_PROVINCIALE", province: provincePropre, tentativeAutreProvince: "REFUSEE", resultatsPropres: propre.donnees.total }));
}

async function verifierExpirationSession(client, identifiantCompte) {
  const jetonEncode = client.cookies.get("sigad_session");
  if (!jetonEncode) throw new Error(`Cookie de session absent pour le test d’expiration ${identifiantCompte}.`);
  const jeton = decodeURIComponent(jetonEncode);
  const empreinte = createHash("sha256").update(jeton).digest("base64url");
  const sql = `UPDATE sessions SET expire_le = datetime('now', '-1 minute') WHERE jeton_hash = '${empreinte}' AND revoquee = 0 RETURNING 'SESSION_TEST_EXPIREE' AS resultat`;
  const execution = spawnSync(process.execPath, [
    join(racine, "node_modules", "wrangler", "bin", "wrangler.js"),
    "d1", "execute", "sigad-staging-db", "--remote", "--config", join(racine, "wrangler.staging.toml"),
    "--command", sql, "--json", "--yes",
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (execution.status !== 0) {
    throw new Error("L’expiration ciblée de la session de test n’a pas pu être appliquée sur la D1 Staging vérifiée.");
  }
  let resultat;
  try {
    resultat = JSON.parse(execution.stdout);
  } catch {
    throw new Error("La confirmation de l’expiration de session n’a pas retourné un JSON Wrangler valide.");
  }
  const lignes = JSON.stringify(resultat);
  if (!lignes.includes("SESSION_TEST_EXPIREE") || !lignes.includes("\"changes\":1")) {
    throw new Error("La mise à jour ciblée n’a pas confirmé exactement une session de test expirée.");
  }
  const session = await client.session();
  exigerStatut(session, 401, `Refus de la session expirée ${identifiantCompte}`);
  console.log(JSON.stringify({ etape: "SESSION_EXPIRATION", compte: identifiantCompte, lignesModifiees: 1, sessionRefusee: "PASS" }));
}

async function testerInterface(client, cible, options) {
  const navigateur = await chromium.launch({ headless: true, executablePath: executableChrome });
  try {
    const contexte = await navigateur.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, locale: "fr-FR" });
    const donneesCookies = ["sigad_session", "sigad_csrf"].map((nom) => {
      const valeur = client.cookies.get(nom);
      if (!valeur) throw new Error(`Cookie de session ${nom} absent pour le navigateur.`);
      return {
        name: nom,
        value: decodeURIComponent(valeur),
        domain: "sigad-staging.reemtech0412.workers.dev",
        path: "/",
        secure: true,
        httpOnly: nom === "sigad_session",
        sameSite: "Lax",
      };
    });
    await contexte.addCookies(donneesCookies);
    const page = await contexte.newPage();
    const erreursPage = [];
    const erreursServeur = [];
    const reponsesPolices = [];
    page.on("pageerror", (erreur) => erreursPage.push(erreur.name));
    page.on("response", (reponse) => {
      if (reponse.url().startsWith(base) && reponse.status() >= 500) erreursServeur.push({ statut: reponse.status(), chemin: new URL(reponse.url()).pathname });
      if (/\/fonts\/dm-sans\//iu.test(reponse.url())) reponsesPolices.push({ statut: reponse.status(), chemin: new URL(reponse.url()).pathname });
    });
    const accueil = await page.goto(`${base}/tableau-de-bord`, { waitUntil: "networkidle", timeout: 45_000 });
    if (accueil?.status() !== 200) throw new Error(`Le tableau de bord n’a pas répondu en HTTP 200 (${accueil?.status() ?? "inconnu"}).`);
    await page.getByRole("heading", { name: /Tableau de bord/i }).waitFor({ state: "visible", timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const rendu = await page.evaluate(() => ({
      titre: document.title,
      police: getComputedStyle(document.body).fontFamily,
      policeChargee: document.fonts.check('400 16px "DM Sans"'),
      logoCharge: [...document.images].some((image) => image.src.endsWith("/images/sigad-logo.png") && image.complete && image.naturalWidth > 0),
      menu: document.querySelector('nav[aria-label="Navigation principale"]')?.innerText ?? "",
      donneesCarte: document.body.innerText.includes("Limites administratives indicatives"),
    }));
    if (!rendu.logoCharge) throw new Error("Le logo SIGAD n’est pas rendu dans le tableau de bord.");
    if (!rendu.police.includes("DM Sans") || !rendu.policeChargee || !reponsesPolices.length || reponsesPolices.some((police) => police.statut !== 200)) {
      throw new Error("La police DM Sans n’est pas servie localement en HTTP 200 ou n’est pas rendue dans Chrome.");
    }
    if (!rendu.donneesCarte) throw new Error("La mention de limites géographiques indicatives est absente.");
    await page.screenshot({ path: join(dossierCaptures, `${cible.identifiant}-tableau-1440.png`), fullPage: true });
    if (cible.role === "ADMIN_CENTRAL" && !rendu.menu.includes("Bénéficiaires")) throw new Error("Le menu central ne présente pas le module Bénéficiaires.");
    if (cible.role === "PROPRIETAIRE" && rendu.menu.includes("Bénéficiaires")) throw new Error("Le menu Propriétaire expose le module Bénéficiaires non autorisé.");

    const boutonClair = page.getByRole("button", { name: "Activer le mode clair" });
    await boutonClair.click();
    if (!await page.locator(".sigad-preview").evaluate((element) => !element.classList.contains("sigad-preview--sombre"))) {
      throw new Error("Le passage en mode clair n’a pas été appliqué.");
    }
    await page.getByRole("button", { name: "Activer le mode sombre" }).click();
    if (!await page.locator(".sigad-preview").evaluate((element) => element.classList.contains("sigad-preview--sombre"))) {
      throw new Error("Le retour au mode sombre n’a pas été appliqué.");
    }

    if (cible.role === "ADMIN_CENTRAL") {
      const chemins = [
        ["bénéficiaires", "/gestion/beneficiaires", "Gestion des bénéficiaires"],
        ["stocks", "/stocks", "Articles et stocks"],
        ["approvisionnements", "/approvisionnements", "Approvisionnements"],
        ["distributions", "/distributions", "Distributions provinciales"],
        ["contrôle", "/controle", "Contrôle et notifications"],
        ["rapports", "/rapports", "Rapports et tableaux de bord"],
      ];
      for (const [module, chemin, titreAttendu] of chemins) {
        const reponse = await page.goto(`${base}${chemin}`, { waitUntil: "networkidle", timeout: 45_000 });
        if (reponse?.status() !== 200) throw new Error(`Chargement du module ${module} : HTTP ${reponse?.status() ?? "inconnu"}.`);
        await page.locator('nav[aria-label="Navigation principale"]').waitFor({ state: "visible" });
        if (page.url() !== `${base}${chemin}`) throw new Error(`La navigation vers ${module} a été redirigée.`);
        const titre = await page.locator(".sigad-preview__fil-ariane strong").innerText();
        if (titre !== titreAttendu) throw new Error(`Le module ${module} affiche le titre inattendu « ${titre} ».`);
      }
      const retourDashboard = await page.goto(`${base}/tableau-de-bord`, { waitUntil: "networkidle", timeout: 45_000 });
      if (retourDashboard?.status() !== 200) throw new Error("Le retour au tableau de bord a échoué.");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "networkidle" });
      const menuMobile = page.getByRole("button", { name: "Ouvrir le menu principal" });
      await menuMobile.waitFor({ state: "visible" });
      await menuMobile.click();
      await page.locator('nav[aria-label="Navigation principale"]').getByRole("button", { name: "Rapports" }).waitFor({ state: "visible" });
      await page.screenshot({ path: join(dossierCaptures, "central-tableau-390.png"), fullPage: true });
      await page.getByRole("button", { name: "Fermer le menu principal" }).click();

      await page.goto(`${base}/gestion/beneficiaires`, { waitUntil: "networkidle", timeout: 45_000 });
      const rechercheCommune = page.getByLabel("Rechercher une commune");
      await rechercheCommune.waitFor({ state: "visible", timeout: 15_000 });
      await rechercheCommune.fill("Sila");
      await page.getByRole("status").filter({ hasText: "Aucune commune ne correspond" }).waitFor({ state: "visible", timeout: 10_000 });
      const resultatCommune = await client.requete("/api/territoire/communes?province_id=prov-sila&limite=100&decalage=0");
      exigerStatut(resultatCommune, 200, "Recherche de communes approuvées dans le périmètre autorisé");
      if (resultatCommune.donnees?.total !== 0) throw new Error("Des communes non validées sont exposées dans les choix opérationnels.");

      await page.goto(`${base}/rapports`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.getByRole("heading", { name: /Rapports et tableaux de bord/i }).waitFor({ state: "visible" });
      await page.getByLabel("Format d’export").selectOption("CSV");
      const telechargement = page.waitForEvent("download", { timeout: 60_000 });
      await page.getByRole("button", { name: "Exporter le rapport" }).click();
      const fichier = await telechargement;
      const cheminCsv = join(dossierCaptures, fichier.suggestedFilename().replace(/[^a-zA-Z0-9._-]/gu, "_"));
      await fichier.saveAs(cheminCsv);
      if (await fichier.failure()) throw new Error("Le navigateur a signalé un échec du téléchargement CSV.");
      const contenuCsv = await readFile(cheminCsv, "utf8");
      if (!contenuCsv.trim() || contenuCsv.trimStart().startsWith("{")) throw new Error("Le fichier CSV téléchargé est vide ou contient une réponse d’erreur JSON.");
      options.csv = { resultat: "PASS", fichier: cheminCsv, octets: Buffer.byteLength(contenuCsv), lignes: contenuCsv.split(/\r?\n/u).filter(Boolean).length };
      await page.locator(".sigad-preview__profil-declencheur").click();
      const deconnexion = page.getByRole("menuitem", { name: "Se déconnecter" });
      await deconnexion.waitFor({ state: "visible" });
      await deconnexion.click();
      await page.getByRole("heading", { name: "SIGAD" }).waitFor({ state: "visible", timeout: 15_000 });
      await page.screenshot({ path: join(dossierCaptures, "connexion-staging.png"), fullPage: true });
      exigerStatut(await client.session(), 401, `Invalidation après déconnexion Chrome ${cible.identifiant}`);
      options.logoutUi = "PASS";
    } else {
      const routeComptes = await page.goto(`${base}/administration/comptes`, { waitUntil: "networkidle", timeout: 45_000 });
      if (routeComptes?.status() !== 200) throw new Error("Le module de gestion des comptes n’a pas répondu en HTTP 200.");
      await page.locator('nav[aria-label="Navigation principale"]').waitFor({ state: "visible" });
      if (!page.url().endsWith("/administration/comptes")) throw new Error("Le Propriétaire n’a pas conservé l’accès à la gestion des comptes.");
      await page.screenshot({ path: join(dossierCaptures, "proprietaire-comptes-1440.png"), fullPage: true });
      await page.locator(".sigad-preview__profil-declencheur").click();
      await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
      await page.getByRole("heading", { name: "SIGAD" }).waitFor({ state: "visible", timeout: 15_000 });
      await page.screenshot({ path: join(dossierCaptures, "connexion-staging.png"), fullPage: true });
      exigerStatut(await client.session(), 401, "Invalidation après déconnexion Chrome proprietaire");
      options.logoutUi = "PASS";
    }

    if (erreursPage.length || erreursServeur.length) {
      throw new Error(`Erreurs navigateur=${erreursPage.length}, réponses serveur 5xx=${erreursServeur.length}.`);
    }
    options.interface = {
      resultat: "PASS",
      titre: rendu.titre,
      dmSans: rendu.policeChargee,
      chargementsPoliceHttp200: reponsesPolices.length,
      logoSigad: rendu.logoCharge,
      limitesIndicatives: rendu.donneesCarte,
      modulesCentraux: cible.role === "ADMIN_CENTRAL" ? 6 : 0,
      erreursPage: erreursPage.length,
      erreursServeur: erreursServeur.length,
    };
    console.log(JSON.stringify({ etape: "INTERFACE_CHROME_PLAYWRIGHT", compte: cible.identifiant, ...options.interface }));
  } finally {
    await navigateur.close();
  }
}

const sansSession = new ClientApi();
const sessionAnonyme = await sansSession.session();
exigerStatut(sessionAnonyme, 401, "Refus de session anonyme");
console.log(JSON.stringify({ etape: "SESSION_ANONYME", resultat: "PASS", statut: 401 }));

const compteCentral = attentes[0];
const compteProprietaire = attentes[1];
const compteSila = attentes[2];
const compteOuaddai = attentes[3];
const resultatCentral = {};
const central = await preparerCompteAdministratif(compteCentral);
const proprietaire = await preparerCompteAdministratif(compteProprietaire);
const comptesProprietaire = await proprietaire.client.requete("/api/proprietaire/utilisateurs?limite=50&decalage=0");
exigerStatut(comptesProprietaire, 200, "Droit Propriétaire de lire les comptes");
if (comptesProprietaire.donnees?.total !== 25) throw new Error("Le Propriétaire ne voit pas les 25 comptes Staging attendus.");
const comptesParCentral = await central.client.requete("/api/proprietaire/utilisateurs?limite=50&decalage=0");
exigerStatut(comptesParCentral, 403, "Refus du rôle central sur l’administration des comptes");
const centralParProprietaire = await proprietaire.client.requete("/api/central/approvisionnements?limite=10&decalage=0");
exigerStatut(centralParProprietaire, 403, "Refus du rôle Propriétaire sur une fonction centrale opérationnelle");
console.log(JSON.stringify({ etape: "RBAC_CENTRAL", proprietaireComptes: "PASS", centralComptes: "REFUSE", proprietaireOperationCentrale: "REFUSE" }));

const sila = await preparerCompteProvincial(compteSila);
await verifierIsolation(sila, "prov-sila", "prov-ouaddai");
await verifierExpirationSession(sila, compteSila.identifiant);
await verifierIsolation(await preparerCompteProvincial(compteOuaddai), "prov-ouaddai", "prov-sila");

await testerInterface(central.client, compteCentral, resultatCentral);
await testerInterface(proprietaire.client, compteProprietaire, {});

console.log(JSON.stringify({
  etape: "RECETTE_TERMINEE",
  comptesAdministratifs: "PASS",
  totp: "PASS",
  isolationProvinciale: "PASS",
  interface: "PASS",
  csv: resultatCentral.csv?.resultat ?? "BLOCKED",
  deconnexionInterface: resultatCentral.logoutUi ?? "BLOCKED",
  captures: dossierCaptures,
  identifiantsProteges: fichierIdentifiants,
}));
