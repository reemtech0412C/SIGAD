import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { hacherJeton, verifierMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { codeMfaInutilise, configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const cheminCodes = process.env.SIGAD_CODES_FILE;

function nouveauMotDePasse() {
  return `Sigad-${randomBytes(18).toString("base64url")}Aa9`;
}

function nouvelleCleImport() {
  return `test-import-${randomBytes(24).toString("base64url")}`;
}

function creerClasseurMenageExcel() {
  const chaines = [
    "departement_id", "nom_chef_menage", "sexe_chef", "nombre_personnes", "categorie_population_code", "date_enregistrement",
    "dep-test-sila", "Ménage Excel Sila", "F", "AUTOCHTONE",
  ];
  const xml = (contenu) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${contenu}`);
  return zipSync({
    "[Content_Types].xml": xml("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"xml\" ContentType=\"application/xml\"/></Types>"),
    "xl/workbook.xml": xml("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Ménages\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"),
    "xl/_rels/workbook.xml.rels": xml("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>"),
    "xl/sharedStrings.xml": xml(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${chaines.length}" uniqueCount="${chaines.length}">${chaines.map((chaine) => `<si><t>${chaine}</t></si>`).join("")}</sst>`),
    "xl/worksheets/sheet1.xml": xml("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c><c r=\"C1\" t=\"s\"><v>2</v></c><c r=\"D1\" t=\"s\"><v>3</v></c><c r=\"E1\" t=\"s\"><v>4</v></c><c r=\"F1\" t=\"s\"><v>5</v></c></row><row r=\"2\"><c r=\"A2\" t=\"s\"><v>6</v></c><c r=\"B2\" t=\"s\"><v>7</v></c><c r=\"C2\" t=\"s\"><v>8</v></c><c r=\"D2\"><v>3</v></c><c r=\"E2\" t=\"s\"><v>9</v></c><c r=\"F2\"><v>46317</v></c></row></sheetData></worksheet>"),
  });
}

function verifierFormatCodes(valeur) {
  if (!Array.isArray(valeur)) throw new Error("Le fichier des codes d’activation doit contenir une liste.");
  const codes = [];
  for (const element of valeur) {
    if (typeof element !== "object" || element === null) throw new Error("Une entrée du fichier des codes est invalide.");
    const identifiant = Reflect.get(element, "identifiant");
    const codeActivation = Reflect.get(element, "code_activation");
    if (typeof identifiant !== "string" || typeof codeActivation !== "string") {
      throw new Error("Une entrée du fichier des codes est invalide.");
    }
    codes.push({ identifiant, code_activation: codeActivation });
  }
  if (codes.length !== 25 || new Set(codes.map((code) => code.code_activation)).size !== 25) {
    throw new Error("Le seed local doit fournir 25 codes d’activation distincts.");
  }
  return codes;
}

async function verifierAbsenceCodesDansDepot(codes) {
  const extensionsTexte = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".sql", ".toml", ".ts", ".tsx", ".txt"]);
  const exclusions = new Set([".git", ".wrangler", "coverage", "frontend/dist", "node_modules", "test-results"]);
  const fichiers = [];
  const repertoires = [racine];
  while (repertoires.length > 0) {
    const dossier = repertoires.pop();
    if (!dossier) continue;
    for (const entree of await readdir(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      const relatif = chemin.slice(racine.length + 1).replaceAll("\\", "/");
      if (entree.isDirectory()) {
        if (!exclusions.has(entree.name) && !relatif.startsWith("frontend/dist/")) repertoires.push(chemin);
      } else if (entree.isFile() && extensionsTexte.has(entree.name.slice(entree.name.lastIndexOf(".")))) {
        fichiers.push(chemin);
      }
    }
  }
  for (const chemin of fichiers) {
    const contenu = await readFile(chemin, "utf8");
    for (const code of codes) assert.equal(contenu.includes(code.code_activation), false, "Un code d’activation en clair figure dans le dépôt.");
  }
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    const corpsFormulaire = options.corps instanceof FormData;
    if (options.corps !== undefined && !corpsFormulaire) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);
    if (this.cookies.size > 0) {
      entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    }
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: corpsFormulaire ? options.corps : JSON.stringify(options.corps) }),
    });
    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      if (!paire) continue;
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      const expiration = attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut));
      if (expiration || valeur === "") this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    const corpsTexte = await reponse.text();
    let donnees = null;
    try {
      donnees = JSON.parse(corpsTexte);
    } catch {
      donnees = null;
    }
    return { reponse, donnees, corpsTexte };
  }

  async initialiserCsrf() {
    const resultat = await this.requete("/api/auth/csrf");
    assert.equal(resultat.reponse.status, 200);
    assert.equal(typeof Reflect.get(resultat.donnees, "jeton_csrf"), "string");
    this.jetonCsrf = Reflect.get(resultat.donnees, "jeton_csrf");
  }

  async connexion(identifiant, motDePasse) {
    await this.initialiserCsrf();
    return this.requete("/api/auth/connexion", {
      methode: "POST",
      corps: { identifiant, mot_de_passe: motDePasse },
    });
  }

  async changerMotDePasse(motDePasse) {
    const resultat = await this.requete("/api/auth/changer-mot-de-passe-initial", {
      methode: "POST",
      corps: { nouveau_mot_de_passe: motDePasse },
    });
    assert.equal(resultat.reponse.status, 200);
  }
}

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const candidats = readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  for (const candidat of candidats) {
    const base = new DatabaseSync(join(dossierEtat, candidat));
    const existe = base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get();
    if (existe && Reflect.get(existe, "total") === 1) return base;
    base.close();
  }
  throw new Error("La base D1 locale SIGAD est introuvable.");
}

function codePour(codes, identifiant) {
  const entree = codes.find((code) => code.identifiant === identifiant);
  if (!entree) throw new Error(`Le code d’activation du compte ${identifiant} est absent.`);
  return entree.code_activation;
}

async function dernierCourrielPour(courriel) {
  const adresse = process.env.SIGAD_TEST_EMAIL_CAPTURE_URL;
  if (!adresse) throw new Error("Le service local de capture des e-mails de test est absent.");
  const reponse = await fetch(new URL("/__test/emails", adresse));
  assert.equal(reponse.status, 200, "Le Worker local du prestataire de test doit être disponible.");
  const messages = await reponse.json();
  assert.equal(Array.isArray(messages), true);
  return messages.reverse().find((message) => Array.isArray(message.to) && message.to.includes(courriel)) ?? null;
}

function preparerFixturesTerritoriales(base) {
  base.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
  try {
    const insererDepartement = base.prepare(
      "INSERT INTO departements (id, province_id, code, nom, chef_lieu) VALUES (?, ?, ?, ?, ?)",
    );
    insererDepartement.run("dep-test-sila", "prov-sila", "TEST-SI-01", "Département d’essai Sila", "Chef-lieu d’essai Sila");
    insererDepartement.run("dep-test-ouaddai", "prov-ouaddai", "TEST-OD-01", "Département d’essai Ouaddaï", "Chef-lieu d’essai Ouaddaï");

    const insererSousPrefecture = base.prepare(
      "INSERT INTO sous_prefectures (id, departement_id, code, nom) VALUES (?, ?, ?, ?)",
    );
    insererSousPrefecture.run("sp-test-sila", "dep-test-sila", "TEST-SI-SP", "Sous-préfecture d’essai Sila");
    insererSousPrefecture.run("sp-test-ouaddai", "dep-test-ouaddai", "TEST-OD-SP", "Sous-préfecture d’essai Ouaddaï");

    const insererCommune = base.prepare(
      "INSERT INTO communes (id, province_id, code, nom, type_commune) VALUES (?, ?, ?, ?, 'URBAINE')",
    );
    insererCommune.run("com-test-sila", "prov-sila", "TEST-SI-COM", "Commune d’essai Sila");
    insererCommune.run("com-test-ouaddai", "prov-ouaddai", "TEST-OD-COM", "Commune d’essai Ouaddaï");

    const insererRattachement = base.prepare(
      `INSERT INTO rattachements_territoriaux
       (id, commune_id, departement_id, sous_prefecture_id, source_juridique, date_debut_validite)
       VALUES (?, ?, ?, ?, ?, '2026-10-22')`,
    );
    insererRattachement.run("rat-test-sila", "com-test-sila", "dep-test-sila", "sp-test-sila", "Fixture synthétique de test");
    insererRattachement.run("rat-test-ouaddai", "com-test-ouaddai", "dep-test-ouaddai", "sp-test-ouaddai", "Fixture synthétique de test");

    const insererLocalite = base.prepare(
      `INSERT INTO localites
       (id, province_id, departement_id, sous_prefecture_id, commune_id, nom, type_localite,
        mode_decoupage_urbain, statut_validation, source_documentation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VALIDE', 'Fixture synthétique réservée aux tests automatisés')`,
    );
    insererLocalite.run("loc-test-avec", "prov-sila", "dep-test-sila", "sp-test-sila", "com-test-sila", "Ville d’essai avec arrondissements", "VILLE", "AVEC_ARRONDISSEMENTS");
    insererLocalite.run("loc-test-autre-ville", "prov-sila", "dep-test-sila", "sp-test-sila", "com-test-sila", "Autre ville d’essai avec arrondissements", "VILLE", "AVEC_ARRONDISSEMENTS");
    insererLocalite.run("loc-test-sans", "prov-sila", "dep-test-sila", "sp-test-sila", "com-test-sila", "Ville d’essai sans arrondissement", "VILLE", "SANS_ARRONDISSEMENT");
    insererLocalite.run("loc-test-village", "prov-sila", "dep-test-sila", "sp-test-sila", "com-test-sila", "Village d’essai", "VILLAGE", "AUCUN");
    insererLocalite.run("loc-test-ouaddai", "prov-ouaddai", "dep-test-ouaddai", "sp-test-ouaddai", "com-test-ouaddai", "Localité protégée d’essai Ouaddaï", "VILLAGE", "AUCUN");

    const insererArrondissement = base.prepare(
      "INSERT INTO arrondissements (id, localite_id, commune_id, nom) VALUES (?, ?, ?, ?)",
    );
    insererArrondissement.run("arr-test-sila", "loc-test-avec", "com-test-sila", "Arrondissement d’essai Sila");
    insererArrondissement.run("arr-test-autre-ville", "loc-test-autre-ville", "com-test-sila", "Autre arrondissement d’essai Sila");

    const insererQuartier = base.prepare(
      `INSERT INTO quartiers (id, localite_id, arrondissement_id, nom, possede_carres, statut_validation)
       VALUES (?, ?, ?, ?, ?, 'VALIDE')`,
    );
    insererQuartier.run("q-test-avec", "loc-test-avec", "arr-test-sila", "Quartier d’essai avec arrondissement", 1);
    insererQuartier.run("q-test-autre-ville", "loc-test-autre-ville", "arr-test-autre-ville", "Quartier d’une autre ville", 0);
    insererQuartier.run("q-test-sans", "loc-test-sans", null, "Quartier d’essai sans arrondissement", 0);

    base.prepare(
      "INSERT INTO carres (id, quartier_id, code_ou_nom, statut_validation) VALUES (?, ?, ?, 'VALIDE')",
    ).run("carre-test-sila", "q-test-avec", "Carré d’essai 01");
    base.prepare(
      `INSERT INTO sites_humanitaires
       (id, province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id, nom, categorie_site)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'SITE_DEPLACES')`,
    ).run("site-test-sila", "prov-sila", "dep-test-sila", "sp-test-sila", "com-test-sila", "loc-test-village", "Site humanitaire d’essai Sila");
    base.prepare(
      `INSERT INTO sites_humanitaires
       (id, province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id, nom, categorie_site)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CAMP_REFUGIES')`,
    ).run("site-test-ouaddai", "prov-ouaddai", "dep-test-ouaddai", "sp-test-ouaddai", "com-test-ouaddai", "loc-test-ouaddai", "Site protégé d’essai Ouaddaï");
    base.exec("COMMIT;");
  } catch (erreur) {
    base.exec("ROLLBACK;");
    throw erreur;
  }
}

if (!cheminCodes) throw new Error("Définissez SIGAD_CODES_FILE avec le chemin externe du fichier de codes local.");
const codes = verifierFormatCodes(JSON.parse(await readFile(cheminCodes, "utf8")));

test("Authentification et contrôles de sécurité dans le Worker Cloudflare local", async (t) => {
  await verifierAbsenceCodesDansDepot(codes);
  const sante = await fetch(new URL("/api/sante", adresseApi));
  assert.equal(sante.status, 200);
  assert.equal(sante.headers.get("x-content-type-options"), "nosniff");
  assert.equal(sante.headers.get("x-frame-options"), "DENY");
  assert.equal(sante.headers.get("referrer-policy"), "no-referrer");
  assert.match(sante.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  assert.equal(sante.headers.get("cache-control"), "no-store");
  const provincesInscription = await fetch(new URL("/api/inscriptions/delegues/provinces", adresseApi));
  assert.equal(provincesInscription.status, 200, "Le formulaire public doit lire la liste de provinces depuis D1.");
  const donneesProvinces = await provincesInscription.json();
  assert.equal(Array.isArray(donneesProvinces.elements), true);
  assert.equal(donneesProvinces.elements.length, 23, "Le formulaire public expose uniquement le référentiel validé des 23 provinces.");
  const baseFixtures = ouvrirD1Locale();
  try {
    preparerFixturesTerritoriales(baseFixtures);
  } finally {
    baseFixtures.close();
  }

  const proprietaire = new ClientLocal();
  const baseAuthentification = ouvrirD1Locale();
  const compteProprietaire = baseAuthentification.prepare(
    "SELECT mot_de_passe_hash, statut FROM utilisateurs WHERE identifiant = 'proprietaire'",
  ).get();
  baseAuthentification.close();
  assert.equal(compteProprietaire?.statut, "ACTIF");
  assert.equal(await verifierMotDePasse(codePour(codes, "proprietaire"), compteProprietaire?.mot_de_passe_hash), true,
    "Le code d’activation externe doit correspondre à l’empreinte générée dans le seed D1 local.");
  await proprietaire.initialiserCsrf();
  const connexionSansCsrf = await proprietaire.requete("/api/auth/connexion", {
    methode: "POST",
    corps: { identifiant: "proprietaire", mot_de_passe: codePour(codes, "proprietaire") },
    csrf: false,
  });
  assert.equal(connexionSansCsrf.reponse.status, 403, "La connexion doit exiger le jeton CSRF préalable.");

  const compteBatha = new ClientLocal();
  await compteBatha.initialiserCsrf();
  for (let tentative = 0; tentative < 5; tentative += 1) {
    const tentativeInvalide = await compteBatha.requete("/api/auth/connexion", {
      methode: "POST",
      corps: { identifiant: "batha", mot_de_passe: nouveauMotDePasse() },
    });
    assert.equal(tentativeInvalide.reponse.status, 401);
  }
  const connexionApresVerrouillage = await compteBatha.requete("/api/auth/connexion", {
    methode: "POST",
    corps: { identifiant: "batha", mot_de_passe: codePour(codes, "batha") },
  });
  assert.equal(connexionApresVerrouillage.reponse.status, 401, "Le cinquième échec doit verrouiller temporairement le compte.");

  const compteActivationExpiree = ouvrirD1Locale();
  compteActivationExpiree.prepare(
    "UPDATE utilisateurs SET code_activation_expire_le = datetime('now', '-1 second') WHERE identifiant = 'guera'",
  ).run();
  compteActivationExpiree.close();
  const clientActivationExpiree = new ClientLocal();
  const connexionActivationExpiree = await clientActivationExpiree.connexion("guera", codePour(codes, "guera"));
  assert.equal(connexionActivationExpiree.reponse.status, 401,
    "Une activation héritée avec une échéance explicite expirée doit rester refusée.");
  const controleActivationExpiree = ouvrirD1Locale();
  assert.equal(Reflect.get(controleActivationExpiree.prepare(
    "SELECT COUNT(*) AS total FROM sessions WHERE utilisateur_id = 'usr-guera' AND revoquee = 0",
  ).get(), "total"), 0, "Une activation expirée ne doit pas créer de session.");
  controleActivationExpiree.close();

  const connexionProprietaire = await proprietaire.requete("/api/auth/connexion", {
    methode: "POST",
    corps: { identifiant: "proprietaire", mot_de_passe: codePour(codes, "proprietaire") },
  });
  assert.equal(connexionProprietaire.reponse.status, 200, JSON.stringify(connexionProprietaire.donnees));
  assert.equal(Reflect.get(Reflect.get(connexionProprietaire.donnees, "utilisateur"), "doit_changer_mot_de_passe"), true);
  const accesAvantChangement = await proprietaire.requete("/api/proprietaire/utilisateurs");
  assert.equal(accesAvantChangement.reponse.status, 403, "Les fonctions doivent rester bloquées avant le changement initial du mot de passe.");

  const motDePasseProprietaire = nouveauMotDePasse();
  await proprietaire.changerMotDePasse(motDePasseProprietaire);
  const accesAvantMfaProprietaire = await proprietaire.requete("/api/proprietaire/utilisateurs");
  assert.equal(accesAvantMfaProprietaire.reponse.status, 403, "Le mot de passe seul ne doit pas ouvrir les fonctions du propriétaire.");
  await configurerMfaTest(proprietaire, "proprietaire");
  const sessionProprietaire = await proprietaire.requete("/api/auth/session");
  assert.equal(sessionProprietaire.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(sessionProprietaire.donnees, "utilisateur"), "doit_changer_mot_de_passe"), false);

  const mutationSansCsrf = await proprietaire.requete("/api/proprietaire/utilisateurs/usr-sila/statut", {
    methode: "PATCH",
    corps: { statut: "SUSPENDU" },
    csrf: false,
  });
  assert.equal(mutationSansCsrf.reponse.status, 403, "Une mutation sans jeton CSRF doit être refusée.");
  const pageProprietaire = await proprietaire.requete("/api/proprietaire/utilisateurs?limite=10&decalage=10");
  assert.equal(pageProprietaire.reponse.status, 200);
  assert.equal(Reflect.get(pageProprietaire.donnees, "total"), 25);
  assert.equal(Reflect.get(pageProprietaire.donnees, "elements").length, 10);

  const compteCentralLegacy = ouvrirD1Locale();
  const etatCentralAvantActivation = compteCentralLegacy.prepare(
    "SELECT doit_changer_mot_de_passe, code_activation_hash FROM utilisateurs WHERE id = 'usr-central'",
  ).get();
  assert.equal(Reflect.get(etatCentralAvantActivation, "doit_changer_mot_de_passe"), 1);
  assert.equal(typeof Reflect.get(etatCentralAvantActivation, "code_activation_hash"), "string");
  compteCentralLegacy.prepare(
    "UPDATE utilisateurs SET code_activation_expire_le = NULL WHERE id = 'usr-central' AND code_activation_recuperation_id IS NULL",
  ).run();
  compteCentralLegacy.close();

  let administrateurCentral = new ClientLocal();
  const connexionCentrale = await administrateurCentral.connexion("central", codePour(codes, "central"));
  assert.equal(connexionCentrale.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(connexionCentrale.donnees, "utilisateur"), "doit_changer_mot_de_passe"), true);
  assert.equal(Reflect.get(Reflect.get(connexionCentrale.donnees, "utilisateur"), "activation_initiale"), true,
    "Une activation héritée sans date d’expiration conserve son parcours initial limité.");
  const motDePasseCentral = nouveauMotDePasse();
  await administrateurCentral.changerMotDePasse(motDePasseCentral);
  const accesAvantMfaCentral = await administrateurCentral.requete("/api/central/controle/observations");
  assert.equal(accesAvantMfaCentral.reponse.status, 403, "Le mot de passe seul ne doit pas ouvrir les fonctions centrales.");
  const codesRecuperationCentraux = await configurerMfaTest(administrateurCentral, "central");
  const accesCentralAutorise = await administrateurCentral.requete("/api/central/approvisionnements");
  assert.equal(accesCentralAutorise.reponse.status, 404, "Le rôle central doit franchir le contrôle RBAC; le service métier sera livré dans sa phase dédiée.");

  const connexionMfa = new ClientLocal();
  const defiMfa = await connexionMfa.connexion("central", motDePasseCentral);
  assert.equal(defiMfa.reponse.status, 200);
  assert.equal(Reflect.get(defiMfa.donnees, "mfa_requis"), true, "La connexion avec MFA actif ne doit pas créer directement une session.");
  assert.equal(connexionMfa.cookies.has("sigad_session"), false, "Aucun cookie de session n’est émis avant le second facteur.");
  const accesAvecDefiSeulement = await connexionMfa.requete("/api/central/approvisionnements");
  assert.equal(accesAvecDefiSeulement.reponse.status, 401, "Le défi MFA ne doit pas remplacer une session authentifiée.");
  const codeTotpCentral = await codeMfaInutilise("central");
  const verificationMfa = await connexionMfa.requete("/api/auth/mfa/verifier", { methode: "POST", corps: { code: codeTotpCentral } });
  assert.equal(verificationMfa.reponse.status, 200, "Le second facteur valide ouvre la session.");
  const sessionsApresMfaValide = ouvrirD1Locale();
  const nombreSessionsApresMfa = Reflect.get(sessionsApresMfaValide.prepare("SELECT COUNT(*) AS total FROM sessions WHERE utilisateur_id = 'usr-central' AND revoquee = 0").get(), "total");
  sessionsApresMfaValide.close();

  const connexionRejeu = new ClientLocal();
  await connexionRejeu.connexion("central", motDePasseCentral);
  const rejeuTotp = await connexionRejeu.requete("/api/auth/mfa/verifier", { methode: "POST", corps: { code: codeTotpCentral } });
  assert.equal(rejeuTotp.reponse.status, 401, "Un compteur TOTP déjà accepté ne peut pas être rejoué.");
  const sessionsApresRejeu = ouvrirD1Locale();
  assert.equal(Reflect.get(sessionsApresRejeu.prepare("SELECT COUNT(*) AS total FROM sessions WHERE utilisateur_id = 'usr-central' AND revoquee = 0").get(), "total"), nombreSessionsApresMfa,
    "Le rejeu TOTP ne doit créer aucune session supplémentaire.");
  sessionsApresRejeu.close();

  const connexionRecuperation = new ClientLocal();
  await connexionRecuperation.connexion("central", motDePasseCentral);
  const codeRecuperation = codesRecuperationCentraux[0];
  assert.equal(typeof codeRecuperation, "string");
  const authentificationRecuperation = await connexionRecuperation.requete("/api/auth/mfa/verifier", {
    methode: "POST", corps: { code: codeRecuperation },
  });
  assert.equal(authentificationRecuperation.reponse.status, 200, "Un code de récupération valide est accepté.");
  const connexionRejeuRecuperation = new ClientLocal();
  await connexionRejeuRecuperation.connexion("central", motDePasseCentral);
  const rejeuRecuperation = await connexionRejeuRecuperation.requete("/api/auth/mfa/verifier", {
    methode: "POST", corps: { code: codeRecuperation },
  });
  assert.equal(rejeuRecuperation.reponse.status, 401, "Un code de récupération ne peut être utilisé qu’une fois.");

  const codeReinitialisation = await codeMfaInutilise("proprietaire");
  const reinitialisationMfa = await proprietaire.requete("/api/auth/mfa/reinitialiser/usr-central", {
    methode: "POST", corps: { code: codeReinitialisation },
  });
  assert.equal(reinitialisationMfa.reponse.status, 200, "Le propriétaire peut réinitialiser le MFA du compte central après une preuve fraîche.");
  const controleReinitialisationMfa = ouvrirD1Locale();
  try {
    const etatMfaCentral = controleReinitialisationMfa.prepare("SELECT double_facteur_actif FROM utilisateurs WHERE id = 'usr-central'").get();
    assert.equal(Reflect.get(etatMfaCentral, "double_facteur_actif"), 0);
    const sessionsRevoqueesCentral = controleReinitialisationMfa.prepare("SELECT COUNT(*) AS total FROM sessions WHERE utilisateur_id = 'usr-central' AND revoquee = 0").get();
    assert.equal(Reflect.get(sessionsRevoqueesCentral, "total"), 0, "La réinitialisation doit révoquer les sessions centrales.");
    const auditMfa = controleReinitialisationMfa.prepare("SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'REINITIALISATION_MFA' AND entite_id = 'usr-central'").get();
    assert.equal(Reflect.get(auditMfa, "total"), 1, "La réinitialisation MFA doit être auditée.");
  } finally {
    controleReinitialisationMfa.close();
  }
  administrateurCentral = new ClientLocal();
  await administrateurCentral.connexion("central", motDePasseCentral);
  await configurerMfaTest(administrateurCentral, "central");

  const delegueSila = new ClientLocal();
  const connexionSila = await delegueSila.connexion("sila", codePour(codes, "sila"));
  assert.equal(connexionSila.reponse.status, 200);
  const motDePasseSila = nouveauMotDePasse();
  await delegueSila.changerMotDePasse(motDePasseSila);

  const profilSila = await delegueSila.requete("/api/provincial/prov-sila/profil");
  assert.equal(profilSila.reponse.status, 200);
  assert.equal(Reflect.get(profilSila.donnees, "province_id"), "prov-sila");
  const profilOuaddai = await delegueSila.requete("/api/provincial/prov-ouaddai/profil");
  assert.equal(profilOuaddai.reponse.status, 403, "Le délégué de Sila ne doit pas accéder aux données du Ouaddaï.");
  const provinceQueryModifiee = await delegueSila.requete("/api/provincial/prov-sila/profil?province_id=prov-ouaddai");
  assert.equal(provinceQueryModifiee.reponse.status, 403, "La province issue de la requête ne doit pas remplacer la province de session.");
  const provinceCorpsModifiee = await delegueSila.requete("/api/provincial/prov-sila/ressource", {
    methode: "POST",
    corps: { province_id: "prov-ouaddai" },
  });
  assert.equal(provinceCorpsModifiee.reponse.status, 403, "Une province fournie dans le corps doit être refusée.");
  const mutationProvincialeSansCsrf = await delegueSila.requete("/api/provincial/prov-sila/profil", {
    methode: "POST",
    corps: {},
    csrf: false,
  });
  assert.equal(mutationProvincialeSansCsrf.reponse.status, 403, "Une mutation provinciale sans jeton CSRF doit être refusée.");
  const accesAdministrationCentrale = await delegueSila.requete("/api/central/approvisionnements");
  assert.equal(accesAdministrationCentrale.reponse.status, 403, "Le délégué provincial ne doit pas accéder aux fonctions centrales.");
  const accesProprietaire = await delegueSila.requete("/api/proprietaire/utilisateurs");
  assert.equal(accesProprietaire.reponse.status, 403, "Le délégué provincial ne doit pas accéder aux fonctions du propriétaire.");

  const lectureOuaddaiParRequete = await delegueSila.requete("/api/territoire/localites?province_id=prov-ouaddai");
  assert.equal(lectureOuaddaiParRequete.reponse.status, 403, "Le délégué de Sila ne peut pas demander les localités du Ouaddaï.");
  const lectureOuaddaiParIdentifiant = await delegueSila.requete("/api/territoire/localites/loc-test-ouaddai");
  assert.equal(lectureOuaddaiParIdentifiant.reponse.status, 404, "Une localité protégée hors province ne doit pas être révélée.");
  const listeSila = await delegueSila.requete(
    "/api/territoire/localites?province_id=prov-sila&departement_id=dep-test-sila&type_localite=VILLAGE&limite=1&decalage=0",
  );
  assert.equal(listeSila.reponse.status, 200);
  assert.equal(Reflect.get(listeSila.donnees, "total"), 1, "La liste filtrée est limitée au territoire issu de la session.");
  assert.equal(Reflect.get(listeSila.donnees, "elements").length, 1, "La liste applique la pagination serveur demandée.");

  const corpsProvinceModifie = await delegueSila.requete("/api/territoire/propositions/localites", {
    methode: "POST",
    corps: {
      province_id: "prov-ouaddai", departement_id: "dep-test-ouaddai", nom: "Lieu interdit",
      type_localite: "VILLAGE", source_documentation: "Pièce de contrôle",
    },
  });
  assert.equal(corpsProvinceModifie.reponse.status, 403, "Le corps ne peut pas remplacer la province de la session.");
  const propositionSurDepartementOuaddai = await delegueSila.requete("/api/territoire/propositions/localites", {
    methode: "POST",
    corps: {
      departement_id: "dep-test-ouaddai", nom: "Lieu hors province",
      type_localite: "VILLAGE", source_documentation: "Pièce de contrôle",
    },
  });
  assert.equal(propositionSurDepartementOuaddai.reponse.status, 404, "Un délégué ne peut pas créer un lieu dans un département hors province.");
  const sousPrefectureCroisee = await delegueSila.requete("/api/territoire/propositions/localites", {
    methode: "POST",
    corps: {
      departement_id: "dep-test-sila", sous_prefecture_id: "sp-test-ouaddai", nom: "Lieu avec parent incohérent",
      type_localite: "VILLAGE", source_documentation: "Pièce de contrôle",
    },
  });
  assert.equal(sousPrefectureCroisee.reponse.status, 400, "La relation département–sous-préfecture doit être vérifiée côté API.");

  const quartiersVilleSansArrondissement = await delegueSila.requete("/api/territoire/quartiers?localite_id=loc-test-sans");
  assert.equal(quartiersVilleSansArrondissement.reponse.status, 200, "Une ville sans arrondissements expose directement ses quartiers.");
  assert.equal(Reflect.get(Reflect.get(quartiersVilleSansArrondissement.donnees, "elements")[0], "id"), "q-test-sans");
  const quartiersVilleDiviseeSansChoix = await delegueSila.requete("/api/territoire/quartiers?localite_id=loc-test-avec");
  assert.equal(quartiersVilleDiviseeSansChoix.reponse.status, 400, "Une ville divisée exige d’abord un arrondissement.");
  const arrondissementsVilleDivisee = await delegueSila.requete("/api/territoire/arrondissements?localite_id=loc-test-avec");
  assert.equal(arrondissementsVilleDivisee.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(arrondissementsVilleDivisee.donnees, "elements")[0], "id"), "arr-test-sila");
  const quartiersVilleDivisee = await delegueSila.requete(
    "/api/territoire/quartiers?localite_id=loc-test-avec&arrondissement_id=arr-test-sila",
  );
  assert.equal(quartiersVilleDivisee.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(quartiersVilleDivisee.donnees, "elements")[0], "id"), "q-test-avec");
  const carresQuartier = await delegueSila.requete("/api/territoire/carres?quartier_id=q-test-avec");
  assert.equal(carresQuartier.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(carresQuartier.donnees, "elements")[0], "id"), "carre-test-sila");
  const arrondissementAutreVille = await delegueSila.requete(
    "/api/territoire/quartiers?localite_id=loc-test-avec&arrondissement_id=arr-test-autre-ville",
  );
  assert.equal(arrondissementAutreVille.reponse.status, 400, "Un arrondissement d’une autre ville doit être refusé.");
  const quartiersVillage = await delegueSila.requete("/api/territoire/quartiers?localite_id=loc-test-village");
  assert.equal(quartiersVillage.reponse.status, 409, "Les quartiers urbains sont masqués pour les villages.");
  const arrondissementsVillage = await delegueSila.requete("/api/territoire/arrondissements?localite_id=loc-test-village");
  assert.equal(arrondissementsVillage.reponse.status, 409, "Les arrondissements sont masqués pour les villages.");

  const sitesSila = await delegueSila.requete("/api/territoire/sites-humanitaires?province_id=prov-sila");
  assert.equal(sitesSila.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(sitesSila.donnees, "elements")[0], "id"), "site-test-sila");
  const villesSila = await delegueSila.requete("/api/territoire/localites?province_id=prov-sila&type_localite=VILLE");
  assert.equal(villesSila.reponse.status, 200);
  assert.equal(Reflect.get(villesSila.donnees, "elements").some((element) => Reflect.get(element, "id") === "loc-test-avec"), true);
  assert.equal(Reflect.get(villesSila.donnees, "elements").some((element) => Reflect.get(element, "id").startsWith("site-test")), false,
    "Le site humanitaire n’est pas traité comme une localité ou une commune.");
  const accesApprobationProvinciale = await delegueSila.requete(
    "/api/central/referentiel-territorial/propositions/LOCALITE/absent/decision",
    { methode: "POST", corps: { decision: "VALIDE", source_officielle: "Source officielle de test", date_effet: "2026-10-22" } },
  );
  assert.equal(accesApprobationProvinciale.reponse.status, 403, "Un délégué provincial ne peut pas approuver le référentiel national.");

  const propositionLocalite = await delegueSila.requete("/api/territoire/propositions/localites", {
    methode: "POST",
    corps: {
      departement_id: "dep-test-sila", sous_prefecture_id: "sp-test-sila", commune_id: "com-test-sila",
      nom: "Ferrick proposé pour l’essai", type_localite: "FERRICK", source_documentation: "Pièce synthétique d’essai",
    },
  });
  assert.equal(propositionLocalite.reponse.status, 201);
  assert.equal(Reflect.get(propositionLocalite.donnees, "statut_validation"), "PROPOSE");
  const localiteEnAttenteMasquee = await delegueSila.requete(
    "/api/territoire/localites?province_id=prov-sila&departement_id=dep-test-sila&type_localite=FERRICK",
  );
  assert.equal(Reflect.get(localiteEnAttenteMasquee.donnees, "total"), 0, "Une proposition ne devient pas une référence validée avant examen central.");
  const propositionsCentrales = await administrateurCentral.requete("/api/central/referentiel-territorial/propositions?limite=10");
  assert.equal(propositionsCentrales.reponse.status, 200);
  const idPropositionLocalite = Reflect.get(propositionLocalite.donnees, "id");
  const decisionSansCsrf = await administrateurCentral.requete(
    `/api/central/referentiel-territorial/propositions/LOCALITE/${idPropositionLocalite}/decision`,
    { methode: "POST", corps: { decision: "VALIDE", source_officielle: "Source officielle synthétique d’essai", date_effet: "2026-10-22" }, csrf: false },
  );
  assert.equal(decisionSansCsrf.reponse.status, 403, "La décision centrale exige le jeton CSRF de la session.");
  const validationLocalite = await administrateurCentral.requete(
    `/api/central/referentiel-territorial/propositions/LOCALITE/${idPropositionLocalite}/decision`,
    { methode: "POST", corps: { decision: "VALIDE", source_officielle: "Source officielle synthétique d’essai", date_effet: "2026-10-22" } },
  );
  assert.equal(validationLocalite.reponse.status, 200);
  const mutationPropositionSansCsrf = await delegueSila.requete("/api/territoire/propositions/sites-humanitaires", {
    methode: "POST",
    corps: {
      departement_id: "dep-test-sila", nom: "Site sans contrôle CSRF", categorie_site: "SITE_DEPLACES",
      source_documentation: "Pièce synthétique d’essai",
    },
    csrf: false,
  });
  assert.equal(mutationPropositionSansCsrf.reponse.status, 403, "Une proposition territoriale exige la protection CSRF.");

  const propositionQuartier = await delegueSila.requete("/api/territoire/propositions/quartiers", {
    methode: "POST",
    corps: {
      localite_id: "loc-test-sans", nom: "Quartier proposé pour l’essai", possede_carres: false,
      source_documentation: "Pièce synthétique d’essai",
    },
  });
  assert.equal(propositionQuartier.reponse.status, 201);
  assert.equal(Reflect.get(propositionQuartier.donnees, "statut_validation"), "PROPOSE");
  const idPropositionQuartier = Reflect.get(propositionQuartier.donnees, "id");
  const decisionQuartierSimultanee = await Promise.all([
    administrateurCentral.requete(
      `/api/central/referentiel-territorial/propositions/QUARTIER/${idPropositionQuartier}/decision`,
      { methode: "POST", corps: { decision: "VALIDE", source_officielle: "Source centrale synthétique", date_effet: "2026-10-22" } },
    ),
    administrateurCentral.requete(
      `/api/central/referentiel-territorial/propositions/QUARTIER/${idPropositionQuartier}/decision`,
      { methode: "POST", corps: { decision: "VALIDE", source_officielle: "Source centrale synthétique", date_effet: "2026-10-22" } },
    ),
  ]);
  assert.deepEqual(decisionQuartierSimultanee.map((resultat) => resultat.reponse.status).sort(), [200, 409],
    "Une seule décision simultanée peut valider la proposition.");

  const propositionSite = await delegueSila.requete("/api/territoire/propositions/sites-humanitaires", {
    methode: "POST",
    corps: {
      departement_id: "dep-test-sila", sous_prefecture_id: "sp-test-sila", commune_id: "com-test-sila",
      localite_proche_id: "loc-test-village", nom: "Site proposé pour l’essai", categorie_site: "CAMP_REFUGIES",
      source_documentation: "Pièce synthétique d’essai",
    },
  });
  assert.equal(propositionSite.reponse.status, 201);
  assert.equal(Reflect.get(propositionSite.donnees, "statut_validation"), "PROPOSE");
  const idPropositionSite = Reflect.get(propositionSite.donnees, "id");
  const rejetSite = await administrateurCentral.requete(
    `/api/central/referentiel-territorial/propositions/SITE_HUMANITAIRE/${idPropositionSite}/decision`,
    { methode: "POST", corps: { decision: "REJETE", source_officielle: "Source centrale synthétique", date_effet: "2026-10-22" } },
  );
  assert.equal(rejetSite.reponse.status, 200);
  assert.equal(Reflect.get(rejetSite.donnees, "statut_validation"), "FERME");

  const propositionPourProprietaire = await delegueSila.requete("/api/territoire/propositions/localites", {
    methode: "POST",
    corps: {
      departement_id: "dep-test-sila", nom: "Village proposé au propriétaire", type_localite: "VILLAGE",
      source_documentation: "Pièce synthétique d’essai",
    },
  });
  assert.equal(propositionPourProprietaire.reponse.status, 201);
  const decisionProprietaire = await proprietaire.requete(
    `/api/proprietaire/referentiel-territorial/propositions/LOCALITE/${Reflect.get(propositionPourProprietaire.donnees, "id")}/decision`,
    { methode: "POST", corps: { decision: "REJETE", source_officielle: "Décision synthétique du propriétaire", date_effet: "2026-10-22" } },
  );
  assert.equal(decisionProprietaire.reponse.status, 200, "Le propriétaire habilité peut également traiter une proposition.");

  const baseTerritoire = ouvrirD1Locale();
  try {
    const historique = baseTerritoire.prepare(
      "SELECT COUNT(*) AS total FROM historique_decoupages WHERE entite_type = 'LOCALITE' AND entite_id = ? AND type_modification = 'VALIDATION_PROPOSITION'",
    ).get(idPropositionLocalite);
    assert.equal(Reflect.get(historique, "total"), 1, "L’approbation doit être documentée dans l’historique territorial.");
    assert.throws(() => baseTerritoire.prepare(
      `INSERT INTO localites
       (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain)
       VALUES ('loc-test-invalide', 'prov-sila', 'dep-test-ouaddai', 'Localité interdite', 'VILLAGE', 'AUCUN')`,
    ).run(), /(?:Localité incohérente|Rattachement territorial de la localité incohérent)/u, "Une localité doit relever du département de sa province.");
    assert.throws(() => baseTerritoire.prepare(
      `INSERT INTO arrondissements (id, localite_id, nom)
       VALUES ('arr-test-invalide', 'loc-test-sans', 'Arrondissement interdit')`,
    ).run(), /arrondissement doit appartenir/u, "Une ville sans arrondissement ne peut pas recevoir de division.");
    assert.throws(() => baseTerritoire.prepare(
      `INSERT INTO quartiers (id, localite_id, arrondissement_id, nom)
       VALUES ('q-test-invalide', 'loc-test-avec', 'arr-test-autre-ville', 'Quartier interdit')`,
    ).run(), /quartier ne correspond pas/u, "Un quartier ne peut pas être rattaché à un arrondissement d’une autre ville.");
    const auditProposition = baseTerritoire.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'PROPOSITION_LOCALITE' AND entite_id = ?",
    ).get(idPropositionLocalite);
    assert.equal(Reflect.get(auditProposition, "total"), 1, "La proposition doit produire une entrée d’audit.");
    const historiquesQuartier = baseTerritoire.prepare(
      "SELECT COUNT(*) AS total FROM historique_decoupages WHERE entite_type = 'QUARTIER' AND entite_id = ?",
    ).get(idPropositionQuartier);
    assert.equal(Reflect.get(historiquesQuartier, "total"), 1, "La décision du quartier est historisée une seule fois malgré deux requêtes simultanées.");
    const statutSiteRejete = baseTerritoire.prepare(
      "SELECT statut_validation FROM sites_humanitaires WHERE id = ?",
    ).get(idPropositionSite);
    assert.equal(Reflect.get(statutSiteRejete, "statut_validation"), "FERME", "Le rejet respecte l’état autorisé par le schéma des sites.");
  } finally {
    baseTerritoire.close();
  }

  const mutationGestionSansCsrf = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: { menages: [] },
    csrf: false,
  });
  assert.equal(mutationGestionSansCsrf.reponse.status, 403, "Les mutations de gestion des bénéficiaires exigent un jeton CSRF.");

  const partenairePropose = await delegueSila.requete("/api/gestion/partenaires", {
    methode: "POST",
    corps: {
      nom: "Association synthétique Sila",
      sigle: "ASSI",
      type_organisation: "ONG nationale",
      contact_email: "contact@sila.test",
      contact_telephone: "+235 66 00 10 10",
      roles: ["PARTENAIRE_EXECUTION"],
    },
  });
  assert.equal(partenairePropose.reponse.status, 201);
  assert.equal(Reflect.get(partenairePropose.donnees, "statut_validation"), "PROPOSE");
  const idPartenairePropose = Reflect.get(partenairePropose.donnees, "id");
  const motDePasseOuaddaiPhase3 = nouveauMotDePasse();
  const delegueOuaddaiGestion = new ClientLocal();
  const connexionOuaddaiPhase3 = await delegueOuaddaiGestion.connexion("ouaddai", codePour(codes, "ouaddai"));
  assert.equal(connexionOuaddaiPhase3.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(connexionOuaddaiPhase3.donnees, "utilisateur"), "doit_changer_mot_de_passe"), true);
  await delegueOuaddaiGestion.changerMotDePasse(motDePasseOuaddaiPhase3);
  const partenaireProposeCache = await delegueOuaddaiGestion.requete(`/api/gestion/partenaires/${idPartenairePropose}`);
  assert.equal(partenaireProposeCache.reponse.status, 404, "Un délégué ne voit pas les propositions privées d’une autre province.");
  const propositionPartenaireProvinciale = await delegueSila.requete(`/api/gestion/partenaires/${idPartenairePropose}/validation`, {
    methode: "POST",
    corps: { decision: "VALIDE" },
  });
  assert.equal(propositionPartenaireProvinciale.reponse.status, 403, "Un délégué ne peut pas valider un partenaire au nom de l’administration centrale.");
  const validationPartenaireSansCsrf = await administrateurCentral.requete(`/api/gestion/partenaires/${idPartenairePropose}/validation`, {
    methode: "POST",
    corps: { decision: "VALIDE" },
    csrf: false,
  });
  assert.equal(validationPartenaireSansCsrf.reponse.status, 403, "La validation centrale d’un partenaire exige le contrôle CSRF.");
  const validationPartenaire = await administrateurCentral.requete(`/api/gestion/partenaires/${idPartenairePropose}/validation`, {
    methode: "POST",
    corps: { decision: "VALIDE" },
  });
  assert.equal(validationPartenaire.reponse.status, 200);
  const partenaireApprouveVisible = await delegueOuaddaiGestion.requete(`/api/gestion/partenaires/${idPartenairePropose}`);
  assert.equal(partenaireApprouveVisible.reponse.status, 200, "Un partenaire approuvé est visible dans le référentiel commun.");
  const creationPartenaireDuplique = await delegueOuaddaiGestion.requete("/api/gestion/partenaires", {
    methode: "POST",
    corps: {
      nom: "Association synthétique Sila",
      type_organisation: "ONG nationale",
      roles: ["PARTENAIRE_EXECUTION"],
    },
  });
  assert.equal(creationPartenaireDuplique.reponse.status, 409, "Le nom du partenaire doit être unique entre les provinces.");

  const corpsMenageSila = {
    departement_id: "dep-test-sila",
    sous_prefecture_id: "sp-test-sila",
    commune_id: "com-test-sila",
    localite_id: "loc-test-village",
    nom_chef_menage: "Chef de ménage synthétique Sila",
    sexe_chef: "F",
    nombre_personnes: 4,
    telephone: "+235 66 00 20 01",
    categorie_population_id: "cat-pop-autochtone",
    criteres_vulnerabilite: [],
    date_enregistrement: "2026-10-22",
    membres: [],
  };
  const creationMenageSila = await delegueSila.requete("/api/gestion/menages", {
    methode: "POST", corps: corpsMenageSila, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(creationMenageSila.reponse.status, 201);
  assert.equal(Reflect.get(creationMenageSila.donnees, "nombre_menages"), 1);
  const provinceForceeMenage = await delegueSila.requete("/api/gestion/menages", {
    methode: "POST",
    corps: { ...corpsMenageSila, province_id: "prov-ouaddai" },
  });
  assert.equal(provinceForceeMenage.reponse.status, 403, "La province d’un ménage provient de la session du délégué.");
  const departementHorsProvinceMenage = await delegueSila.requete("/api/gestion/menages", {
    methode: "POST",
    corps: { ...corpsMenageSila, departement_id: "dep-test-ouaddai", sous_prefecture_id: "sp-test-ouaddai", commune_id: "com-test-ouaddai", localite_id: "loc-test-ouaddai" },
  });
  assert.equal(departementHorsProvinceMenage.reponse.status, 400, "Un ménage de Sila ne peut pas être rattaché à un département du Ouaddaï.");
  const localiteHorsProvinceMenage = await delegueSila.requete("/api/gestion/menages", {
    methode: "POST",
    corps: { ...corpsMenageSila, nom_chef_menage: "Chef avec localité incohérente", telephone: "+235 66 00 20 02", localite_id: "loc-test-ouaddai" },
  });
  assert.equal(localiteHorsProvinceMenage.reponse.status, 400, "La localité doit appartenir à la province et au département du ménage.");
  const menageSilaSql = ouvrirD1Locale();
  let idMenageSila;
  try {
    idMenageSila = Reflect.get(menageSilaSql.prepare("SELECT id FROM menages WHERE code_menage = ?").get(Reflect.get(creationMenageSila.donnees, "codes_menage")[0]), "id");
  } finally {
    menageSilaSql.close();
  }
  assert.equal(typeof idMenageSila, "string");
  const menageOuaddai = await delegueOuaddaiGestion.requete("/api/gestion/menages", {
    methode: "POST",
    cleIdempotence: nouvelleCleImport(),
    corps: {
      ...corpsMenageSila,
      departement_id: "dep-test-ouaddai",
      sous_prefecture_id: "sp-test-ouaddai",
      commune_id: "com-test-ouaddai",
      localite_id: "loc-test-ouaddai",
      nom_chef_menage: "Chef de ménage synthétique Ouaddaï",
      telephone: "+235 66 00 30 01",
    },
  });
  assert.equal(menageOuaddai.reponse.status, 201);
  const menageOuaddaiSql = ouvrirD1Locale();
  let idMenageOuaddai;
  try {
    idMenageOuaddai = Reflect.get(menageOuaddaiSql.prepare("SELECT id FROM menages WHERE code_menage = ?").get(Reflect.get(menageOuaddai.donnees, "codes_menage")[0]), "id");
  } finally {
    menageOuaddaiSql.close();
  }
  const lectureMenageOuaddaiParSila = await delegueSila.requete(`/api/gestion/menages/${idMenageOuaddai}`);
  assert.equal(lectureMenageOuaddaiParSila.reponse.status, 404, "Un ménage du Ouaddaï ne doit pas être révélé à Sila.");
  const filtreMenagesOuaddaiParSila = await delegueSila.requete("/api/gestion/menages?province_id=prov-ouaddai");
  assert.equal(filtreMenagesOuaddaiParSila.reponse.status, 403, "Le filtre de province ne peut pas élargir la session de Sila.");
  const listeMenagesSila = await delegueSila.requete("/api/gestion/menages?limite=1&decalage=0");
  assert.equal(listeMenagesSila.reponse.status, 200);
  assert.equal(Reflect.get(listeMenagesSila.donnees, "total"), 1, "La liste paginée n’inclut que les ménages de Sila.");
  assert.equal(Reflect.get(listeMenagesSila.donnees, "elements").length, 1, "Le registre applique la pagination serveur.");

  const importCsv = new FormData();
  importCsv.append("fichier", new File([
    "departement_id,sous_prefecture_id,commune_id,localite_id,nom_chef_menage,sexe_chef,nombre_personnes,telephone,categorie_population_code,date_enregistrement\n" +
    "dep-test-sila,sp-test-sila,com-test-sila,loc-test-village,Ménage CSV synthétique,F,3,+235 66 00 20 03,AUTOCHTONE,2026-10-22",
  ], "menages-sila.csv", { type: "text/csv" }));
  const resultatImportCsv = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: importCsv, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(resultatImportCsv.reponse.status, 201, "L’import CSV doit fonctionner dans le Worker local.");
  assert.equal(Reflect.get(resultatImportCsv.donnees, "nombre_menages"), 1);
  const lotCinqCents = Array.from({ length: 500 }, (_, index) => ({
    ...corpsMenageSila,
    nom_chef_menage: `Ménage importé par lot ${String(index + 1).padStart(3, "0")}`,
    telephone: `+235 62 00 ${String(index).padStart(4, "0")}`,
  }));
  const resultatLotCinqCents = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: lotCinqCents }, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(resultatLotCinqCents.reponse.status, 201, "Un lot de 500 ménages doit être validé par l’import atomique D1.");
  assert.equal(Reflect.get(resultatLotCinqCents.donnees, "nombre_menages"), 500);
  await t.test("Mesures répétées de la liste des ménages sur D1 local et EXPLAIN QUERY PLAN", async () => {
    const baseInitiale = ouvrirD1Locale();
    const nombreInitial = Reflect.get(baseInitiale.prepare(
      "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND statut = 'ACTIF'",
    ).get(), "total");
    baseInitiale.close();
    const tailles = [...new Set([Math.max(500, nombreInitial), 1_500, 5_000])].filter((taille) => taille <= 5_000).sort((a, b) => a - b);
    let sequence = nombreInitial;
    for (const cible of tailles) {
      const baseMesure = ouvrirD1Locale();
      const nombreCourant = Reflect.get(baseMesure.prepare(
        "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND statut = 'ACTIF'",
      ).get(), "total");
      if (nombreCourant < cible) {
        const insertion = baseMesure.prepare(
          `INSERT INTO menages (id, code_menage, province_id, departement_id,
            nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id,
            date_enregistrement, statut, cree_par)
           VALUES (?, ?, 'prov-sila', 'dep-test-sila', ?, 'F', 3,
            'cat-pop-autochtone', '2026-10-22', 'ACTIF', 'usr-sila')`,
        );
        baseMesure.exec("BEGIN IMMEDIATE");
        try {
          for (; sequence < cible; sequence += 1) {
            const identifiant = crypto.randomUUID();
            insertion.run(identifiant, `PERF-SILA-${identifiant}`, `Ménage de mesure ${String(sequence).padStart(6, "0")}`);
          }
          baseMesure.exec("COMMIT");
        } catch (erreur) {
          baseMesure.exec("ROLLBACK");
          throw erreur;
        }
      }
      const plan = baseMesure.prepare(`EXPLAIN QUERY PLAN
        SELECT m.id, m.code_menage, m.province_id, m.departement_id, m.localite_id,
          m.nom_chef_menage, m.sexe_chef, m.nombre_personnes, m.telephone,
          m.categorie_population_id, cp.libelle AS categorie_population, m.statut, m.date_enregistrement
        FROM menages m INNER JOIN categories_population cp ON cp.id = m.categorie_population_id
        WHERE m.province_id = 'prov-sila' AND m.statut = 'ACTIF'
        ORDER BY m.date_enregistrement DESC, m.id LIMIT 25 OFFSET 0`).all()
        .map((ligne) => Reflect.get(ligne, "detail"));
      assert.ok(plan.some((detail) => typeof detail === "string" && detail.includes("idx_menages_province_statut_date")),
        `L’index attendu doit couvrir la province, le statut et l’ordre chronologique: ${JSON.stringify(plan)}`);
      assert.ok(!plan.some((detail) => typeof detail === "string" && detail.includes("USE TEMP B-TREE FOR ORDER BY")),
        "La page des ménages ne doit pas construire un tri temporaire.");
      baseMesure.close();

      const durees = [];
      for (let tentative = 0; tentative < 12; tentative += 1) {
        const debut = performance.now();
        const resultat = await delegueSila.requete("/api/gestion/menages?limite=25&decalage=0&statut=ACTIF");
        const duree = performance.now() - debut;
        assert.equal(resultat.reponse.status, 200, JSON.stringify(resultat.donnees));
        assert.ok(resultat.donnees.elements.length <= 25);
        if (tentative >= 2) durees.push(duree);
      }
      const triees = [...durees].sort((a, b) => a - b);
      const mediane = triees[Math.floor(triees.length / 2)] ?? 0;
      const p95 = triees[Math.min(triees.length - 1, Math.ceil(triees.length * 0.95) - 1)] ?? 0;
      console.log(`PERF — liste des ménages: ${cible} ménages actifs, 10 mesures après échauffement; médiane ${mediane.toFixed(2)} ms; p95 ${p95.toFixed(2)} ms; index idx_menages_province_statut_date.`);
    }
  });
  const fichierExcel = new FormData();
  fichierExcel.append("fichier", new File([creerClasseurMenageExcel()], "menages.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const resultatExcel = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: fichierExcel, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(resultatExcel.reponse.status, 201, "L’import d’un classeur Excel .xlsx doit fonctionner dans le Worker local.");
  assert.equal(Reflect.get(resultatExcel.donnees, "nombre_menages"), 1);
  const importAvecProvinceImposee = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: { menages: [{ ...corpsMenageSila, province_id: "prov-ouaddai" }] },
  });
  assert.equal(importAvecProvinceImposee.reponse.status, 403, "L’import ne peut pas remplacer la province issue de la session.");
  const importSansCle = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: [corpsMenageSila] },
  });
  assert.equal(importSansCle.reponse.status, 400, "L’import exige une clé de demande indépendante.");
  const importCsvColonneInconnue = new FormData();
  importCsvColonneInconnue.append("fichier", new File([
    "departement_id,province_admin,nom_chef_menage,sexe_chef,nombre_personnes,categorie_population_code,date_enregistrement\n" +
    "dep-test-sila,prov-ouaddai,Ménage hors schéma,F,2,AUTOCHTONE,2026-10-22",
  ], "colonnes-interdites.csv", { type: "text/csv" }));
  const importCsvInterdit = await delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: importCsvColonneInconnue });
  assert.equal(importCsvInterdit.reponse.status, 400, "Les colonnes CSV inconnues ou non autorisées sont refusées.");

  const corpsDoublons = (telephone) => ({
    ...corpsMenageSila,
    telephone,
    nom_chef_menage: "Ménage importé avec téléphone partagé",
  });
  const importDoublons = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: { menages: [corpsDoublons("+235 66 00 40 01"), { ...corpsDoublons("+235 66 00 40 01"), nom_chef_menage: "Second ménage au téléphone partagé" }] },
    cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(importDoublons.reponse.status, 201);
  assert.equal(Reflect.get(importDoublons.donnees, "doublons_signales"), 1, "Un doublon de l’import est signalé sans fusion automatique.");
  const importConcurrent = await Promise.all([
    delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: { menages: [corpsDoublons("+235 66 00 40 02")] }, cleIdempotence: nouvelleCleImport() }),
    delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: { menages: [{ ...corpsDoublons("+235 66 00 40 02"), nom_chef_menage: "Ménage concurrent doublon" }] }, cleIdempotence: nouvelleCleImport() }),
  ]);
  assert.deepEqual(importConcurrent.map((resultat) => resultat.reponse.status), [201, 201], "Les deux imports concurrents doivent aboutir atomiquement.");
  const controleDoublonsConcurrent = ouvrirD1Locale();
  try {
    const etats = controleDoublonsConcurrent.prepare(
      "SELECT statut, COUNT(*) AS nombre FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004002' GROUP BY statut ORDER BY statut",
    ).all();
    assert.deepEqual(etats.map((ligne) => [ligne.statut, ligne.nombre]), [["DOUBLON_SUSPECTE", 2]],
      "La protection D1 met les deux ménages concurrents en révision plutôt que d’en sélectionner un arbitrairement comme actif.");
    const signalements = controleDoublonsConcurrent.prepare(
      "SELECT COUNT(*) AS nombre FROM signalements_doublons WHERE province_id = 'prov-sila' AND motif_similitude = 'MEME_TELEPHONE' AND menage_source_id IN (SELECT id FROM menages WHERE telephone = '23566004002')",
    ).get();
    assert.equal(Reflect.get(signalements, "nombre"), 1, "Un rapprochement concurrent produit un signalement unique.");
  } finally {
    controleDoublonsConcurrent.close();
  }

  const menageImportUnique = {
    ...corpsDoublons("+235 66 00 40 10"),
    nom_chef_menage: "Ménage unique importé pour l’acceptation",
  };
  const chargeImportUnique = { menages: [menageImportUnique] };
  const cleImportUnique = nouvelleCleImport();
  const importNouveau = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: chargeImportUnique, cleIdempotence: cleImportUnique,
  });
  assert.equal(importNouveau.reponse.status, 201, "Un ménage inédit doit être importé.");
  const controleImportNouveau = ouvrirD1Locale();
  try {
    const etatNouveau = controleImportNouveau.prepare(
      "SELECT statut FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004010'",
    ).get();
    assert.equal(Reflect.get(etatNouveau, "statut"), "ACTIF", "Un ménage sans correspondance reste actif après son premier import.");
  } finally {
    controleImportNouveau.close();
  }
  const rejeuImport = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: chargeImportUnique, cleIdempotence: cleImportUnique,
  });
  assert.equal(rejeuImport.reponse.status, 201, "Une répétition avec la même clé rejoue la réponse mémorisée.");
  assert.deepEqual(rejeuImport.donnees, importNouveau.donnees, "Le rejeu retourne exactement le résultat du premier import.");
  const controleRejeuImport = ouvrirD1Locale();
  try {
    assert.equal(Reflect.get(controleRejeuImport.prepare(
      "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004010'",
    ).get(), "total"), 1, "Un rejeu ne crée aucun ménage supplémentaire.");
    assert.equal(Reflect.get(controleRejeuImport.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'IMPORTATION_MENAGES' AND entite_id = (SELECT id FROM menages WHERE telephone = '23566004010')",
    ).get(), "total"), 1, "Un rejeu ne duplique pas le journal d’audit.");
    const clePersistee = controleRejeuImport.prepare(
      "SELECT cle, reponse_json FROM cles_idempotence WHERE utilisateur_id = 'usr-sila' AND route_api = '/api/gestion/menages/importations'",
    ).all().find((ligne) => Reflect.get(ligne, "reponse_json").includes(importNouveau.donnees.codes_menage[0]));
    assert.ok(clePersistee, "L’idempotence de l’import est persistée dans D1.");
    assert.notEqual(Reflect.get(clePersistee, "cle"), cleImportUnique, "La clé fournie est hachée avant stockage.");
    assert.equal(Reflect.get(clePersistee, "reponse_json").includes(menageImportUnique.nom_chef_menage), false,
      "La réponse mémorisée ne contient pas les noms des ménages.");
    assert.equal(Reflect.get(clePersistee, "reponse_json").includes("23566004010"), false,
      "La réponse mémorisée ne contient pas le numéro de téléphone.");
  } finally {
    controleRejeuImport.close();
  }
  const conflitCleImport = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: { menages: [{ ...menageImportUnique, nom_chef_menage: "Contenu modifié sous la même clé" }] },
    cleIdempotence: cleImportUnique,
  });
  assert.equal(conflitCleImport.reponse.status, 409, "Une même clé ne peut pas être réutilisée avec un contenu différent.");

  const menageConcurrentIdempotent = {
    ...corpsDoublons("+235 66 00 40 12"),
    nom_chef_menage: "Ménage concurrent avec clé commune",
  };
  const chargeConcurrente = { menages: [menageConcurrentIdempotent] };
  const cleConcurrente = nouvelleCleImport();
  const baseAvantConcurrence = ouvrirD1Locale();
  const auditsAvantConcurrence = Reflect.get(baseAvantConcurrence.prepare(
    "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'IMPORTATION_MENAGES'",
  ).get(), "total");
  baseAvantConcurrence.close();
  const importConcurrentIdempotent = await Promise.all([
    delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: chargeConcurrente, cleIdempotence: cleConcurrente }),
    delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: chargeConcurrente, cleIdempotence: cleConcurrente }),
  ]);
  assert.deepEqual(importConcurrentIdempotent.map((resultat) => resultat.reponse.status), [201, 201],
    "Deux demandes concurrentes ayant la même clé produisent un succès et un rejeu.");
  assert.deepEqual(importConcurrentIdempotent[0]?.donnees, importConcurrentIdempotent[1]?.donnees,
    "Les deux réponses concurrentes sont identiques.");
  const controleConcurrenceIdempotente = ouvrirD1Locale();
  try {
    assert.equal(Reflect.get(controleConcurrenceIdempotente.prepare(
      "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004012'",
    ).get(), "total"), 1, "Une seule insertion subsiste après les deux appels concurrents.");
    assert.equal(Reflect.get(controleConcurrenceIdempotente.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'IMPORTATION_MENAGES'",
    ).get(), "total"), auditsAvantConcurrence + 1, "Une seule écriture d’audit est créée pour les appels concurrents.");
    assert.equal(Reflect.get(controleConcurrenceIdempotente.prepare(
      "SELECT COUNT(*) AS total FROM cles_idempotence WHERE cle = ?",
    ).get(cleConcurrente), "total"), 0, "La clé brute n’est pas persistée dans D1.");
  } finally {
    controleConcurrenceIdempotente.close();
  }

  const cleNouvelleImportationIntentionnelle = nouvelleCleImport();
  const importationIntentionnelle = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: chargeImportUnique, cleIdempotence: cleNouvelleImportationIntentionnelle,
  });
  assert.equal(importationIntentionnelle.reponse.status, 201,
    "Une clé nouvelle permet une importation intentionnelle distincte, même si les données sont semblables.");
  assert.equal(Reflect.get(importationIntentionnelle.donnees, "doublons_signales"), 1,
    "La ressemblance déclenche une revue sans assimiler les ménages comme identiques.");
  const controleRejeuIntentionnel = ouvrirD1Locale();
  try {
    const etatsRejeu = controleRejeuIntentionnel.prepare(
      "SELECT statut, COUNT(*) AS nombre FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004010' GROUP BY statut ORDER BY statut",
    ).all();
    assert.deepEqual(etatsRejeu.map((ligne) => [ligne.statut, ligne.nombre]), [["DOUBLON_SUSPECTE", 2]],
      "Deux demandes intentionnelles distinctes restent deux ménages conservés en revue, sans fusion ni approbation.");
  } finally {
    controleRejeuIntentionnel.close();
  }
  const baseDecisionDoublon = ouvrirD1Locale();
  const signalementDistinct = baseDecisionDoublon.prepare(
    `SELECT sd.id FROM signalements_doublons sd
     INNER JOIN menages source ON source.id = sd.menage_source_id
     WHERE sd.province_id = 'prov-sila' AND source.telephone = '23566004010'
       AND sd.statut_traitement = 'EN_ATTENTE' ORDER BY sd.id LIMIT 1`,
  ).get();
  baseDecisionDoublon.close();
  assert.ok(signalementDistinct?.id, "La répétition d’import doit laisser une proposition de rapprochement examinable.");
  const decisionDistincteProvinciale = await delegueSila.requete(`/api/gestion/signalements-doublons/${signalementDistinct.id}/decision`, {
    methode: "POST", corps: { decision: "CONFIRME_DISTINCT", observations: "Deux dossiers distincts confirmés pendant le test local." },
  });
  assert.equal(decisionDistincteProvinciale.reponse.status, 403,
    "Un délégué ne peut pas statuer sur un signalement de doublon réservé à l’autorité centrale.");
  const kpiAvantDecisionDistincte = await delegueSila.requete(
    "/api/rapports/indicateurs-carte?date_debut=2026-01-01&date_fin=2026-12-31",
  );
  assert.equal(kpiAvantDecisionDistincte.reponse.status, 200, "Le délégué reçoit les indicateurs de sa province avant décision.");
  assert.deepEqual(kpiAvantDecisionDistincte.donnees.provinces.map((province) => province.province_id), ["prov-sila"],
    "La réponse de la carte ne contient pas la province du Ouaddaï pour le délégué de Sila.");
  const kpiOuaddaiInterdit = await delegueSila.requete(
    "/api/rapports/indicateurs-carte?province_id=prov-ouaddai&date_debut=2026-01-01&date_fin=2026-12-31",
  );
  assert.equal(kpiOuaddaiInterdit.reponse.status, 403, "Le délégué Sila ne peut pas demander les indicateurs du Ouaddaï.");
  const projectionKpi = (donnees) => {
    const province = donnees.provinces.find((ligne) => ligne.province_id === "prov-sila");
    assert.ok(province, "L’agrégat Sila est présent.");
    return {
      distributions_realisees: province.distributions_realisees,
      distributions_en_cours: province.distributions_en_cours,
      menages_servis: province.menages_servis,
      stocks_disponibles: province.stocks_disponibles,
    };
  };
  const kpiAvantRevue = projectionKpi(kpiAvantDecisionDistincte.donnees);
  assert.equal(JSON.stringify(kpiAvantDecisionDistincte.donnees).includes(menageImportUnique.nom_chef_menage), false,
    "La réponse de la carte ne divulgue aucune donnée nominative de ménage.");
  const decisionSansMotif = await administrateurCentral.requete(`/api/gestion/signalements-doublons/${signalementDistinct.id}/decision`, {
    methode: "POST", corps: { decision: "CONFIRME_DISTINCT" },
  });
  assert.equal(decisionSansMotif.reponse.status, 400, "Une décision centrale sans justification est refusée.");
  const baseAuditDecisionAtomique = ouvrirD1Locale();
  baseAuditDecisionAtomique.exec(
    `CREATE TRIGGER refus_audit_decision_doublon_test BEFORE INSERT ON journaux_audit
     WHEN NEW.action = 'CONFIRME_DISTINCT'
     BEGIN SELECT RAISE(ABORT, 'TEST_AUDIT_DECISION_DOUBLON'); END`,
  );
  baseAuditDecisionAtomique.close();
  const decisionSansAudit = await administrateurCentral.requete(`/api/gestion/signalements-doublons/${signalementDistinct.id}/decision`, {
    methode: "POST", corps: { decision: "CONFIRME_DISTINCT", observations: "Échec d’audit atomique synthétique." },
  });
  assert.equal(decisionSansAudit.reponse.status, 500, "Un échec du journal d’audit fait échouer la décision dans la même transaction.");
  const controleRollbackDecision = ouvrirD1Locale();
  try {
    controleRollbackDecision.exec("DROP TRIGGER refus_audit_decision_doublon_test");
    assert.equal(Reflect.get(controleRollbackDecision.prepare("SELECT statut_traitement FROM signalements_doublons WHERE id = ?").get(signalementDistinct.id), "statut_traitement"), "EN_ATTENTE");
    assert.equal(Reflect.get(controleRollbackDecision.prepare("SELECT COUNT(*) AS total FROM menages WHERE id IN (SELECT menage_source_id FROM signalements_doublons WHERE id = ? UNION SELECT menage_suspect_id FROM signalements_doublons WHERE id = ?) AND statut = 'DOUBLON_SUSPECTE'").get(signalementDistinct.id, signalementDistinct.id), "total"), 2,
      "Le refus du journal ne laisse ni décision ni transition partielle des ménages.");
  } finally {
    controleRollbackDecision.close();
  }
  const decisionDistincte = await administrateurCentral.requete(`/api/gestion/signalements-doublons/${signalementDistinct.id}/decision`, {
    methode: "POST", corps: { decision: "CONFIRME_DISTINCT", observations: "Deux dossiers distincts confirmés pendant le test local." },
  });
  assert.equal(decisionDistincte.reponse.status, 200, `La décision centrale de ménages distincts reste disponible après l’import : ${JSON.stringify(decisionDistincte.donnees)}`);
  const kpiApresDecisionDistincte = await delegueSila.requete(
    "/api/rapports/indicateurs-carte?date_debut=2026-01-01&date_fin=2026-12-31",
  );
  assert.equal(kpiApresDecisionDistincte.reponse.status, 200);
  assert.deepEqual(projectionKpi(kpiApresDecisionDistincte.donnees), kpiAvantRevue,
    "Une décision de revue, sans preuve de distribution ni mouvement de stock, ne modifie aucun des quatre KPI.");
  console.info(`UI-MAP 1.8 — KPI Sila avant/après décision distincte : ${JSON.stringify({ avant: kpiAvantRevue, apres: projectionKpi(kpiApresDecisionDistincte.donnees) })}`);
  const controleDecisionDistincte = ouvrirD1Locale();
  try {
    const statutSignalementDistinct = controleDecisionDistincte.prepare(
      "SELECT statut_traitement FROM signalements_doublons WHERE id = ?",
    ).get(signalementDistinct.id);
    assert.equal(Reflect.get(statutSignalementDistinct, "statut_traitement"), "CONFIRME_DISTINCT");
    const etatsMenagesDistincts = controleDecisionDistincte.prepare(
      "SELECT statut, statut_validation, COUNT(*) AS nombre FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004010' GROUP BY statut, statut_validation ORDER BY statut, statut_validation",
    ).all();
    assert.deepEqual(etatsMenagesDistincts.map((ligne) => [ligne.statut, ligne.statut_validation, ligne.nombre]), [["INACTIF", "A_VERIFIER", 2]],
      "La confirmation distincte clôt le signalement et place les deux dossiers en vérification individuelle sans les activer.");
    assert.equal(Reflect.get(controleDecisionDistincte.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'CONFIRME_DISTINCT' AND entite_id = ?",
    ).get(signalementDistinct.id), "total"), 1, "La décision de revue reste auditée.");
    const auditDecision = controleDecisionDistincte.prepare(
      "SELECT utilisateur_id, cree_le, donnees_apres FROM journaux_audit WHERE action = 'CONFIRME_DISTINCT' AND entite_id = ?",
    ).get(signalementDistinct.id);
    assert.equal(Reflect.get(auditDecision, "utilisateur_id"), "usr-central");
    assert.ok(Reflect.get(auditDecision, "cree_le"), "La date de décision est conservée dans l’audit.");
    assert.match(Reflect.get(auditDecision, "donnees_apres"), /Deux dossiers distincts confirmés/u,
      "La justification de la décision est conservée dans l’audit.");
  } finally {
    controleDecisionDistincte.close();
  }

  const validationParDelegue = await delegueSila.requete(`/api/gestion/menages/${await (async () => {
    const base = ouvrirD1Locale();
    try { return base.prepare("SELECT id FROM menages WHERE telephone = '23566004010' ORDER BY id LIMIT 1").get().id; }
    finally { base.close(); }
  })()}/validation`, { methode: "POST", corps: { decision: "VALIDER", observations: "Tentative de validation provinciale" } });
  assert.equal(validationParDelegue.reponse.status, 403, "La validation individuelle est réservée à l’administration centrale.");
  const idMenageAValider = (() => {
    const base = ouvrirD1Locale();
    try { return base.prepare("SELECT id FROM menages WHERE telephone = '23566004010' ORDER BY id LIMIT 1").get().id; }
    finally { base.close(); }
  })();
  const validationParProprietaire = await proprietaire.requete(`/api/gestion/menages/${idMenageAValider}/validation`, {
    methode: "POST", corps: { decision: "VALIDER", observations: "Tentative du compte technique" },
  });
  assert.equal(validationParProprietaire.reponse.status, 403, "Le propriétaire technique ne valide pas les ménages au titre de l’administration.");
  const validationCentrale = await administrateurCentral.requete(`/api/gestion/menages/${idMenageAValider}/validation`, {
    methode: "POST", corps: { decision: "VALIDER", observations: "Dossier distinct vérifié selon la procédure centrale." },
  });
  assert.equal(validationCentrale.reponse.status, 200, "L’administration centrale peut valider individuellement un dossier après examen.");
  assert.equal(Reflect.get(validationCentrale.donnees, "statut"), "ACTIF");
  assert.equal(Reflect.get(validationCentrale.donnees, "statut_validation"), "VALIDE");
  const validationEnDouble = await administrateurCentral.requete(`/api/gestion/menages/${idMenageAValider}/validation`, {
    methode: "POST", corps: { decision: "VALIDER", observations: "Deuxième décision centrale non autorisée." },
  });
  assert.equal(validationEnDouble.reponse.status, 409, "Une validation individuelle déjà consommée ne peut pas être rejouée.");

  const reimportMemePreuve = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: chargeImportUnique, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(reimportMemePreuve.reponse.status, 201);
  assert.equal(Reflect.get(reimportMemePreuve.donnees, "doublons_signales"), 0,
    "Un nouvel import avec les mêmes critères ne rouvre pas la revue distincte.");
  assert.equal(Reflect.get(reimportMemePreuve.donnees, "menages_en_verification"), 1,
    "Le nouveau dossier reste en vérification et n’est pas activé automatiquement.");
  const controleMemePreuve = ouvrirD1Locale();
  try {
    assert.equal(Reflect.get(controleMemePreuve.prepare(
      "SELECT COUNT(*) AS total FROM signalements_doublons WHERE province_id = 'prov-sila' AND statut_traitement = 'EN_ATTENTE' AND (menage_source_id IN (SELECT id FROM menages WHERE telephone = '23566004010') OR menage_suspect_id IN (SELECT id FROM menages WHERE telephone = '23566004010'))",
    ).get(), "total"), 0, "La répétition des mêmes preuves ne crée pas un nouveau signalement.");
    assert.equal(Reflect.get(controleMemePreuve.prepare(
      "SELECT COUNT(*) AS total FROM menages WHERE telephone = '23566004010' AND statut_validation = 'A_VERIFIER'",
    ).get(), "total"), 2, "Les dossiers non examinés individuellement restent non validés.");
  } finally {
    controleMemePreuve.close();
  }

  const sourceNouveauCritere = { ...corpsDoublons("+235 66 00 40 14"), nom_chef_menage: "Ménage preuve nouvelle A" };
  const doublonAncienCritere = { ...sourceNouveauCritere, nom_chef_menage: "Ménage preuve nouvelle B" };
  const importSourceCritere = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: [sourceNouveauCritere] }, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(importSourceCritere.reponse.status, 201);
  const importTelephoneSeulement = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: [doublonAncienCritere] }, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(importTelephoneSeulement.reponse.status, 201);
  const baseRevueCritere = ouvrirD1Locale();
  const revueCriterePrecedente = baseRevueCritere.prepare(
    `SELECT id FROM signalements_doublons WHERE province_id = 'prov-sila' AND statut_traitement = 'EN_ATTENTE'
     AND (menage_source_id IN (SELECT id FROM menages WHERE telephone = '23566004014')
       OR menage_suspect_id IN (SELECT id FROM menages WHERE telephone = '23566004014')) ORDER BY id LIMIT 1`,
  ).get();
  baseRevueCritere.close();
  assert.ok(revueCriterePrecedente?.id);
  const decisionCriterePrecedente = await administrateurCentral.requete(
    `/api/gestion/signalements-doublons/${revueCriterePrecedente.id}/decision`,
    { methode: "POST", corps: { decision: "CONFIRME_DISTINCT", observations: "Les deux noms ne désignent pas la même famille." } },
  );
  assert.equal(decisionCriterePrecedente.reponse.status, 200);
  const importPreuveAdditionnelle = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: [sourceNouveauCritere] }, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(importPreuveAdditionnelle.reponse.status, 201);
  assert.equal(Reflect.get(importPreuveAdditionnelle.donnees, "doublons_signales"), 1,
    "Un critère de rapprochement HMAC absent du dossier précédent ouvre une revue liée.");
  const baseReouverture = ouvrirD1Locale();
  const revueReouverte = baseReouverture.prepare(
    `SELECT id, statut_traitement, reouverture_de_id, empreintes_preuve_json
     FROM signalements_doublons WHERE province_id = 'prov-sila' AND reouverture_de_id = ?`,
  ).get(revueCriterePrecedente.id);
  assert.equal(revueReouverte?.statut_traitement, "EN_ATTENTE");
  assert.equal(revueReouverte?.empreintes_preuve_json ? JSON.parse(revueReouverte.empreintes_preuve_json).length : 0, 2);
  baseReouverture.close();
  const decisionNouvelleRevue = await administrateurCentral.requete(
    `/api/gestion/signalements-doublons/${revueReouverte.id}/decision`,
    { methode: "POST", corps: { decision: "CONFIRME_DISTINCT", observations: "La preuve additionnelle ne change pas la distinction." } },
  );
  assert.equal(decisionNouvelleRevue.reponse.status, 200);
  const referenceManuelle = "Référence documentaire synthétique 2026-10-23";
  const reouvertureManuelle = await administrateurCentral.requete(
    `/api/gestion/signalements-doublons/${revueReouverte.id}/reouverture`,
    { methode: "POST", corps: { reference_preuve: referenceManuelle, date_preuve: "2026-10-23", observations: "Un document indépendant nouvellement reçu justifie une seconde revue." } },
  );
  assert.equal(reouvertureManuelle.reponse.status, 201, "Une référence nouvelle permet une réouverture explicitement motivée.");
  const reouvertureManuelleRejouee = await administrateurCentral.requete(
    `/api/gestion/signalements-doublons/${revueReouverte.id}/reouverture`,
    { methode: "POST", corps: { reference_preuve: referenceManuelle, date_preuve: "2026-10-23", observations: "Même preuve renvoyée une seconde fois." } },
  );
  assert.equal(reouvertureManuelleRejouee.reponse.status, 409, "La même référence de preuve ne peut pas rouvrir une affaire deux fois.");
  const controleReference = ouvrirD1Locale();
  try {
    assert.equal(Reflect.get(controleReference.prepare(
      "SELECT COUNT(*) AS total FROM signalements_doublons WHERE id = ? AND empreinte_reference_preuve IS NOT NULL AND reouverture_de_id = ?",
    ).get(Reflect.get(reouvertureManuelle.donnees, "id"), revueReouverte.id), "total"), 1);
    assert.equal(JSON.stringify(controleReference.prepare("SELECT empreinte_reference_preuve, observations FROM signalements_doublons WHERE id = ?").get(Reflect.get(reouvertureManuelle.donnees, "id"))).includes(referenceManuelle), false,
      "La valeur brute de la référence documentaire n’est pas conservée dans D1.");
    assert.equal(Reflect.get(controleReference.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'REOUVERTURE_REVUE_DOUBLON' AND entite_id = ?",
    ).get(Reflect.get(reouvertureManuelle.donnees, "id")), "total"), 1);
  } finally {
    controleReference.close();
  }

  const menageVraiDoublon = {
    ...corpsDoublons("+235 66 00 40 13"),
    nom_chef_menage: "Ménage à rapprocher sans fusion",
    membres: [{ nom_complet: "Membre synthétique de test", sexe: "F", lien_parente: "ENFANT" }],
  };
  const premierMenageDoublonReel = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: [menageVraiDoublon] }, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(premierMenageDoublonReel.reponse.status, 201);
  const baseMenageDoublonReel = ouvrirD1Locale();
  const idPremierMenageDoublonReel = Reflect.get(baseMenageDoublonReel.prepare(
    "SELECT id FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004013'",
  ).get(), "id");
  baseMenageDoublonReel.close();
  const listeHistoriqueDoublon = await delegueSila.requete("/api/gestion/listes-beneficiaires", {
    methode: "POST", corps: { intitule: "Liste synthétique avant rapprochement" },
  });
  assert.equal(listeHistoriqueDoublon.reponse.status, 201);
  const inscriptionHistoriqueDoublon = await delegueSila.requete(
    `/api/gestion/listes-beneficiaires/${listeHistoriqueDoublon.donnees.id}/inscriptions`,
    { methode: "POST", corps: { menage_ids: [idPremierMenageDoublonReel] } },
  );
  assert.equal(inscriptionHistoriqueDoublon.reponse.status, 200, "Le ménage source reçoit un lien historique avant la revue.");
  const secondMenageDoublonReel = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: { menages: [{ ...menageVraiDoublon, nom_chef_menage: "Ménage à rapprocher sans fusion — seconde saisie" }] },
    cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(secondMenageDoublonReel.reponse.status, 201);
  const baseAvantConfirmationDoublonReel = ouvrirD1Locale();
  const signalementDoublonReel = baseAvantConfirmationDoublonReel.prepare(
    `SELECT id, menage_source_id, menage_suspect_id FROM signalements_doublons
     WHERE province_id = 'prov-sila' AND statut_traitement = 'EN_ATTENTE'
       AND (menage_source_id = ? OR menage_suspect_id = ?) ORDER BY cree_le DESC, id LIMIT 1`,
  ).get(idPremierMenageDoublonReel, idPremierMenageDoublonReel);
  const historiqueAvantConfirmation = {
    menages: Reflect.get(baseAvantConfirmationDoublonReel.prepare(
      "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004013'",
    ).get(), "total"),
    membres: Reflect.get(baseAvantConfirmationDoublonReel.prepare(
      "SELECT COUNT(*) AS total FROM membres_menage WHERE menage_id IN (SELECT id FROM menages WHERE telephone = '23566004013')",
    ).get(), "total"),
    inscriptions: Reflect.get(baseAvantConfirmationDoublonReel.prepare(
      "SELECT COUNT(*) AS total FROM inscriptions_beneficiaires WHERE menage_id = ?",
    ).get(idPremierMenageDoublonReel), "total"),
    remises: Reflect.get(baseAvantConfirmationDoublonReel.prepare(
      "SELECT COUNT(*) AS total FROM remises_distribution WHERE menage_id IN (SELECT id FROM menages WHERE telephone = '23566004013')",
    ).get(), "total"),
    mouvements: Reflect.get(baseAvantConfirmationDoublonReel.prepare(
      "SELECT COUNT(*) AS total FROM mouvements_stock WHERE province_id = 'prov-sila'",
    ).get(), "total"),
  };
  baseAvantConfirmationDoublonReel.close();
  assert.ok(signalementDoublonReel?.id, "Le rapprochement confirmé reste lié aux deux dossiers existants.");
  assert.equal(signalementDoublonReel.menage_source_id, idPremierMenageDoublonReel);
  const confirmationDoublonReel = await administrateurCentral.requete(
    `/api/gestion/signalements-doublons/${signalementDoublonReel.id}/decision`,
    { methode: "POST", corps: { decision: "CONFIRME_DOUBLON", observations: "Les deux saisies correspondent au même ménage dans ce test synthétique." } },
  );
  assert.equal(confirmationDoublonReel.reponse.status, 200, "L’administration centrale peut confirmer un doublon sans fusionner les dossiers.");
  const baseApresConfirmationDoublonReel = ouvrirD1Locale();
  try {
    const historiqueApresConfirmation = {
      menages: Reflect.get(baseApresConfirmationDoublonReel.prepare(
        "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004013'",
      ).get(), "total"),
      membres: Reflect.get(baseApresConfirmationDoublonReel.prepare(
        "SELECT COUNT(*) AS total FROM membres_menage WHERE menage_id IN (SELECT id FROM menages WHERE telephone = '23566004013')",
      ).get(), "total"),
      inscriptions: Reflect.get(baseApresConfirmationDoublonReel.prepare(
        "SELECT COUNT(*) AS total FROM inscriptions_beneficiaires WHERE menage_id = ?",
      ).get(idPremierMenageDoublonReel), "total"),
      remises: Reflect.get(baseApresConfirmationDoublonReel.prepare(
        "SELECT COUNT(*) AS total FROM remises_distribution WHERE menage_id IN (SELECT id FROM menages WHERE telephone = '23566004013')",
      ).get(), "total"),
      mouvements: Reflect.get(baseApresConfirmationDoublonReel.prepare(
        "SELECT COUNT(*) AS total FROM mouvements_stock WHERE province_id = 'prov-sila'",
      ).get(), "total"),
    };
    assert.deepEqual(historiqueApresConfirmation, historiqueAvantConfirmation,
      "La confirmation ne fusionne ni ne supprime les dossiers, membres, liens historiques ou remises et ne modifie pas le stock.");
    assert.equal(historiqueApresConfirmation.menages, 2);
    assert.equal(historiqueApresConfirmation.inscriptions, 1);
    const etatsDoublonReel = baseApresConfirmationDoublonReel.prepare(
      "SELECT statut, COUNT(*) AS nombre FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004013' GROUP BY statut",
    ).all();
    assert.deepEqual(etatsDoublonReel.map((ligne) => [ligne.statut, ligne.nombre]), [["DOUBLON_SUSPECTE", 2]]);
    assert.equal(Reflect.get(baseApresConfirmationDoublonReel.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'CONFIRME_DOUBLON' AND entite_id = ?",
    ).get(signalementDoublonReel.id), "total"), 1, "La décision de doublon est auditée une seule fois.");
  } finally {
    baseApresConfirmationDoublonReel.close();
  }

  const menageSourceRollback = {
    ...corpsDoublons("+235 66 00 40 11"),
    nom_chef_menage: "Ménage source pour rollback d’import",
  };
  const importSourceRollback = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: [menageSourceRollback] }, cleIdempotence: nouvelleCleImport(),
  });
  assert.equal(importSourceRollback.reponse.status, 201);
  const controleAvantRollbackImport = ouvrirD1Locale();
  const auditsAvantRollbackImport = Reflect.get(controleAvantRollbackImport.prepare(
    "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'IMPORTATION_MENAGES'",
  ).get(), "total");
  controleAvantRollbackImport.exec(
    `CREATE TRIGGER refus_audit_importation_test BEFORE INSERT ON journaux_audit
     WHEN NEW.action = 'IMPORTATION_MENAGES'
     BEGIN SELECT RAISE(ABORT, 'TEST_AUDIT_IMPORTATION'); END`,
  );
  controleAvantRollbackImport.close();
  const cleRepriseRollback = nouvelleCleImport();
  const chargeEchecImport = { menages: [{ ...menageSourceRollback, nom_chef_menage: "Ménage doublon dont l’import échoue" }] };
  const importEnEchec = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: chargeEchecImport,
    cleIdempotence: cleRepriseRollback,
  });
  assert.equal(importEnEchec.reponse.status, 500, "L’échec simulé du journal doit faire échouer la requête d’import.");
  const controleApresRollbackImport = ouvrirD1Locale();
  try {
    controleApresRollbackImport.exec("DROP TRIGGER refus_audit_importation_test");
    const etatSourceRollback = controleApresRollbackImport.prepare(
      "SELECT statut FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004011'",
    ).get();
    assert.equal(Reflect.get(etatSourceRollback, "statut"), "ACTIF",
      "Le marquage du ménage source est annulé si l’audit final échoue.");
    assert.equal(Reflect.get(controleApresRollbackImport.prepare(
      "SELECT COUNT(*) AS total FROM menages WHERE province_id = 'prov-sila' AND telephone = '23566004011'",
    ).get(), "total"), 1, "L’insertion du doublon échouée est entièrement annulée.");
    assert.equal(Reflect.get(controleApresRollbackImport.prepare(
      "SELECT COUNT(*) AS total FROM signalements_doublons WHERE province_id = 'prov-sila' AND menage_source_id IN (SELECT id FROM menages WHERE telephone = '23566004011')",
    ).get(), "total"), 0, "Le signalement prévu est lui aussi annulé.");
    assert.equal(Reflect.get(controleApresRollbackImport.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'IMPORTATION_MENAGES'",
    ).get(), "total"), auditsAvantRollbackImport, "Aucun audit partiel ne subsiste après l’échec du lot D1.");
  } finally {
    controleApresRollbackImport.close();
  }
  const nouvelEssaiApresRollback = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: chargeEchecImport,
    cleIdempotence: cleRepriseRollback,
  });
  assert.equal(nouvelEssaiApresRollback.reponse.status, 201, "La même donnée peut être retentée après le rollback complet.");
  assert.equal(Reflect.get(nouvelEssaiApresRollback.donnees, "doublons_signales"), 1);

  const provinceInterditeListe = await delegueSila.requete("/api/gestion/listes-beneficiaires", {
    methode: "POST", corps: { intitule: "Liste interprovinciale interdite", province_id: "prov-ouaddai" },
  });
  assert.equal(provinceInterditeListe.reponse.status, 403, "Un délégué ne peut pas créer une liste au nom d’une autre province.");
  const listeCreee = await delegueSila.requete("/api/gestion/listes-beneficiaires", {
    methode: "POST", corps: { intitule: "Liste de contrôle bénéficiaire Sila" },
  });
  assert.equal(listeCreee.reponse.status, 201);
  const idListeSila = Reflect.get(listeCreee.donnees, "id");
  const inscriptionCroisee = await delegueSila.requete(`/api/gestion/listes-beneficiaires/${idListeSila}/inscriptions`, {
    methode: "POST", corps: { menage_ids: [idMenageOuaddai] },
  });
  assert.equal(inscriptionCroisee.reponse.status, 400, "Un ménage du Ouaddaï ne peut pas être inscrit dans une liste de Sila.");
  const inscriptionSila = await delegueSila.requete(`/api/gestion/listes-beneficiaires/${idListeSila}/inscriptions`, {
    methode: "POST", corps: { menage_ids: [idMenageSila] },
  });
  assert.equal(inscriptionSila.reponse.status, 200);
  const cookiesSila = [...delegueSila.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; ");
  const exportSila = await fetch(new URL(`/api/gestion/listes-beneficiaires/${idListeSila}/export`, adresseApi), {
    headers: { Accept: "text/csv", Cookie: cookiesSila },
  });
  assert.equal(exportSila.status, 200, "Le délégué peut extraire sa liste bénéficiaire en CSV.");
  assert.match(exportSila.headers.get("content-type") ?? "", /text\/csv/iu);
  const contenuExportSila = await exportSila.text();
  assert.match(contenuExportSila, /Référence du ménage/u, "L’export présente des en-têtes en français.");
  assert.match(contenuExportSila, /Chef de ménage synthétique Sila/u, "L’export contient les ménages inscrits.");
  const cookiesOuaddai = [...delegueOuaddaiGestion.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; ");
  const exportHorsProvince = await fetch(new URL(`/api/gestion/listes-beneficiaires/${idListeSila}/export`, adresseApi), {
    headers: { Accept: "text/csv", Cookie: cookiesOuaddai },
  });
  assert.equal(exportHorsProvince.status, 404, "Un délégué ne peut pas exporter une liste d’une autre province.");
  const inscriptionSilaDupliquee = await delegueSila.requete(`/api/gestion/listes-beneficiaires/${idListeSila}/inscriptions`, {
    methode: "POST", corps: { menage_ids: [idMenageSila] },
  });
  assert.equal(inscriptionSilaDupliquee.reponse.status, 409, "Un ménage ne peut être inscrit deux fois à la même liste.");
  const lectureListeSilaParOuaddai = await delegueOuaddaiGestion.requete(`/api/gestion/listes-beneficiaires/${idListeSila}/menages`);
  assert.equal(lectureListeSilaParOuaddai.reponse.status, 404, "Une liste provinciale hors périmètre reste masquée.");
  const listesInterdites = await delegueSila.requete("/api/gestion/listes-beneficiaires?province_id=prov-ouaddai");
  assert.equal(listesInterdites.reponse.status, 403);

  const deconnexionSansCsrf = await delegueSila.requete("/api/auth/deconnexion", { methode: "POST", csrf: false });
  assert.equal(deconnexionSansCsrf.reponse.status, 403);
  const deconnexionSila = await delegueSila.requete("/api/auth/deconnexion", { methode: "POST" });
  assert.equal(deconnexionSila.reponse.status, 200);
  const sessionApresDeconnexion = await delegueSila.requete("/api/auth/session");
  assert.equal(sessionApresDeconnexion.reponse.status, 401, "La session doit être invalidée après la déconnexion.");

  const sessionSilaActive = new ClientLocal();
  const reconnexionSila = await sessionSilaActive.connexion("sila", motDePasseSila);
  assert.equal(reconnexionSila.reponse.status, 200);
  const suspensionSansCsrf = await proprietaire.requete("/api/proprietaire/utilisateurs/usr-sila/statut", {
    methode: "PATCH",
    corps: { statut: "SUSPENDU" },
    csrf: false,
  });
  assert.equal(suspensionSansCsrf.reponse.status, 403);
  const suspensionSila = await proprietaire.requete("/api/proprietaire/utilisateurs/usr-sila/statut", {
    methode: "PATCH",
    corps: { statut: "SUSPENDU" },
  });
  assert.equal(suspensionSila.reponse.status, 200);
  const sessionApresSuspension = await sessionSilaActive.requete("/api/auth/session");
  assert.equal(sessionApresSuspension.reponse.status, 401, "La suspension doit invalider immédiatement toutes les sessions.");
  const connexionCompteSuspendu = await new ClientLocal().connexion("sila", motDePasseSila);
  assert.equal(connexionCompteSuspendu.reponse.status, 401, "Un compte suspendu ne doit plus pouvoir se connecter.");

  const baseLocale = ouvrirD1Locale();
  try {
    const sessionsNonRevoquees = baseLocale.prepare(
      "SELECT COUNT(*) AS total FROM sessions WHERE utilisateur_id = 'usr-sila' AND revoquee = 0",
    ).get();
    assert.equal(Reflect.get(sessionsNonRevoquees, "total"), 0, "Les sessions du compte suspendu doivent être révoquées en base.");
    const auditSuspension = baseLocale.prepare(
      "SELECT COUNT(*) AS total FROM journaux_audit WHERE action = 'SUSPENSION_COMPTE' AND entite_id = 'usr-sila'",
    ).get();
    assert.equal(Reflect.get(auditSuspension, "total"), 1, "La suspension doit produire une entrée d’audit.");

    const delegueOuaddai = new ClientLocal();
    const connexionOuaddai = await delegueOuaddai.connexion("ouaddai", motDePasseOuaddaiPhase3);
    assert.equal(connexionOuaddai.reponse.status, 200);
    const jetonSession = delegueOuaddai.cookies.get("sigad_session");
    assert.ok(jetonSession);
    const empreinte = await hacherJeton(jetonSession);
    const expirationForcee = baseLocale.prepare(
      "UPDATE sessions SET expire_le = datetime('now', '-1 second') WHERE jeton_hash = ? AND revoquee = 0",
    ).run(empreinte);
    assert.equal(Reflect.get(expirationForcee, "changes"), 1, "La session à expirer doit exister dans D1 local.");
    const sessionExpiree = await delegueOuaddai.requete("/api/auth/session");
    assert.equal(sessionExpiree.reponse.status, 401, "Le Worker doit refuser une session expirée.");
  } finally {
    baseLocale.close();
  }

  const emailsDelegues = [
    `delegue-${randomBytes(10).toString("hex")}@example.com`,
    `delegue-${randomBytes(10).toString("hex")}@example.com`,
  ];
  const inscrirePourTest = async (courriel) => {
    const client = new ClientLocal();
    await client.initialiserCsrf();
    const motDePasse = nouveauMotDePasse();
    const reponse = await client.requete("/api/inscriptions/delegues", {
      methode: "POST",
      corps: {
        nom_complet: "Délégué de test vérifié",
        province_id: "prov-ouaddai",
        courriel,
        telephone: "+235 66 00 00 00",
        mot_de_passe: motDePasse,
        confirmation_mot_de_passe: motDePasse,
      },
    });
    return { client, reponse, motDePasse };
  };
  const demandesDelegues = await Promise.all(emailsDelegues.map(inscrirePourTest));
  assert.deepEqual(demandesDelegues.map((demande) => demande.reponse.reponse.status), [202, 202],
    "Deux demandes concurrentes peuvent être enregistrées sans réserver la province.");
  const idsDemandes = demandesDelegues.map((demande) => Reflect.get(demande.reponse.donnees, "reference"));
  assert.ok(idsDemandes.every((id) => typeof id === "string"));
  const baseDemandesAvantVerification = ouvrirD1Locale();
  const demandesStockees = baseDemandesAvantVerification.prepare(`SELECT id, statut, conflit_delegation
    FROM inscriptions_delegues WHERE id IN (?, ?) ORDER BY id`).all(...idsDemandes);
  assert.equal(demandesStockees.length, 2);
  assert.ok(demandesStockees.every((demande) => demande.statut === "EMAIL_NON_VERIFIE" && demande.conflit_delegation === 1),
    "La demande en conflit est conservée sans accorder ni réserver un rôle provincial.");
  baseDemandesAvantVerification.close();

  for (let index = 0; index < demandesDelegues.length; index += 1) {
    const courriel = emailsDelegues[index];
    const message = await dernierCourrielPour(courriel);
    assert.ok(message && typeof message.text === "string", "Le prestataire local doit recevoir chaque e-mail de vérification.");
    const code = message.text.match(/code de vérification SIGAD est\s*:\s*(\d{6})/iu)?.[1];
    assert.ok(code, "Le message de test doit contenir un code à six chiffres.");
    const client = demandesDelegues[index].client;
    const id = idsDemandes[index];
    const codeInvalide = code === "000000" ? "000001" : "000000";
    const refusCode = await client.requete("/api/inscriptions/delegues/verifier-courriel", {
      methode: "POST", jetonCsrf: client.jetonCsrf, corps: { inscription_id: id, code: codeInvalide },
    });
    assert.equal(refusCode.reponse.status, 400, "Un code incorrect est refusé.");
    let codeAValider = code;
    if (index === 0) {
      const baseExpirationOtp = ouvrirD1Locale();
      const expirationForcee = baseExpirationOtp.prepare(`UPDATE verifications_courriel
        SET cree_le = datetime('now', '-10 minutes'), expire_le = datetime('now', '-1 second')
        WHERE inscription_id = ? AND consomme_le IS NULL`).run(id);
      assert.equal(expirationForcee.changes, 1, "Le code synthétique doit pouvoir être expiré pour le test local.");
      baseExpirationOtp.close();
      const refusCodeExpire = await client.requete("/api/inscriptions/delegues/verifier-courriel", {
        methode: "POST", jetonCsrf: client.jetonCsrf, corps: { inscription_id: id, code },
      });
      assert.equal(refusCodeExpire.reponse.status, 400, "Un code OTP expiré est refusé.");
      const renvoi = await client.requete("/api/inscriptions/delegues/renvoyer-code", {
        methode: "POST", jetonCsrf: client.jetonCsrf, corps: { courriel },
      });
      assert.equal(renvoi.reponse.status, 202, "Une nouvelle demande peut recevoir un nouveau code après expiration.");
      const nouveauMessage = await dernierCourrielPour(courriel);
      assert.ok(nouveauMessage && typeof nouveauMessage.text === "string", "Le prestataire local doit recevoir le nouveau code.");
      codeAValider = nouveauMessage.text.match(/code de vérification SIGAD est\s*:\s*(\d{6})/iu)?.[1];
      assert.ok(codeAValider, "Le code renvoyé doit rester un code à six chiffres.");
    }
    const verification = await client.requete("/api/inscriptions/delegues/verifier-courriel", {
      methode: "POST", jetonCsrf: client.jetonCsrf, corps: { inscription_id: id, code: codeAValider },
    });
    assert.equal(verification.reponse.status, 200, "Le code à usage unique vérifie l’adresse.");
  }
  const baseDemandesVerifiees = ouvrirD1Locale();
  const verificationsTerminees = baseDemandesVerifiees.prepare(`SELECT COUNT(*) AS total FROM inscriptions_delegues
    WHERE id IN (?, ?) AND statut = 'EN_ATTENTE_APPROBATION' AND courriel_verifie_le IS NOT NULL`).get(...idsDemandes);
  assert.equal(verificationsTerminees.total, 2);
  const comptesAvantApprobation = baseDemandesVerifiees.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE courriel IN (?, ?)").get(...emailsDelegues);
  assert.equal(comptesAvantApprobation.total, 0, "La vérification e-mail seule ne crée aucune session ni aucun compte actif.");
  const empreintesOtp = baseDemandesVerifiees.prepare(`SELECT v.empreinte_code FROM verifications_courriel v
    WHERE v.inscription_id IN (?, ?)`).all(...idsDemandes);
  assert.ok(empreintesOtp.every((ligne) => /^[A-Za-z0-9_-]{43}$/u.test(ligne.empreinte_code)),
    "D1 ne conserve que des empreintes HMAC et jamais les codes à six chiffres.");
  baseDemandesVerifiees.close();

  const connexionAvantApprobation = new ClientLocal();
    const accesAvantApprobation = await connexionAvantApprobation.connexion(emailsDelegues[0], demandesDelegues[0].motDePasse);
  assert.equal(accesAvantApprobation.reponse.status, 401, "Une demande en attente ne peut pas ouvrir une session.");
  const demandeAvantDecision = await administrateurCentral.requete(
    `/api/administration/comptes/delegues?statut=EN_ATTENTE_APPROBATION&limite=50&decalage=0`,
  );
  assert.equal(demandeAvantDecision.reponse.status, 200, "L’administration centrale peut consulter la file paginée.");
  assert.ok(demandeAvantDecision.donnees.elements.some((element) => element.id === idsDemandes[0]));
  const motifDecision = { motif: "Remplacement approuvé après examen du dossier." };
  const decisionsConcurrentes = await Promise.all([
    administrateurCentral.requete(`/api/administration/comptes/delegues/${idsDemandes[0]}/remplacer/usr-ouaddai`, {
      methode: "POST", corps: { ...motifDecision, verification_identite_administrative: true },
    }),
    administrateurCentral.requete(`/api/administration/comptes/delegues/${idsDemandes[1]}/approuver`, {
      methode: "POST", corps: { motif: "Demande concurrente sans transfert de responsabilité.", verification_identite_administrative: true },
    }),
  ]);
  assert.deepEqual(decisionsConcurrentes.map((decision) => decision.reponse.status).sort(), [201, 409],
    "Une seule demande peut devenir le délégué actif lors de deux décisions concurrentes.");
  const idApprouve = decisionsConcurrentes[0].reponse.status === 201 ? idsDemandes[0] : idsDemandes[1];
  const baseApresApprobation = ouvrirD1Locale();
  const deleguesOuaddaiActifs = baseApresApprobation.prepare(`SELECT COUNT(*) AS total FROM utilisateurs
    WHERE province_id = 'prov-ouaddai' AND role = 'DELEGUE_PROVINCIAL' AND statut = 'ACTIF'`).get();
  assert.equal(deleguesOuaddaiActifs.total, 1, "L’index D1 préserve l’unicité du délégué actif par province.");
  const ancienDelegueRemplace = baseApresApprobation.prepare("SELECT statut FROM utilisateurs WHERE id = 'usr-ouaddai'").get();
  assert.equal(ancienDelegueRemplace.statut, "SUSPENDU", "Le remplacement suspend l’ancien compte sans le supprimer.");
  const nouveauDelegue = baseApresApprobation.prepare(`SELECT u.id, u.courriel, u.statut, u.doit_changer_mot_de_passe
    FROM utilisateurs u INNER JOIN inscriptions_delegues i ON i.utilisateur_cree_id = u.id WHERE i.id = ?`).get(idApprouve);
  const idNouvelUtilisateur = nouveauDelegue?.id;
  assert.ok(idNouvelUtilisateur);
  assert.equal(nouveauDelegue?.statut, "ACTIF");
  assert.equal(nouveauDelegue?.doit_changer_mot_de_passe, 1);
  const activations = baseApresApprobation.prepare("SELECT COUNT(*) AS total FROM decisions_comptes WHERE inscription_id = ? AND action = 'REMPLACEMENT_DELEGUE'").get(idApprouve);
  assert.equal(activations.total, 1, "Le remplacement est inscrit dans l’historique des décisions.");
  baseApresApprobation.close();

  const activationDelegue = await dernierCourrielPour(nouveauDelegue.courriel);
  assert.ok(activationDelegue, "Une invitation d’activation doit être remise après l’approbation.");
  const reponseApprobation = decisionsConcurrentes.find((decision) => decision.reponse.status === 201);
  assert.equal(Object.hasOwn(reponseApprobation.donnees, "code_activation"), false, "L’API ne retourne jamais le code d’activation.");

  const creationConsultation = await administrateurCentral.requete("/api/administration/comptes/consultation", {
    methode: "POST",
    corps: {
      nom_complet: "Responsable de consultation synthétique",
      institution: "Institution de test",
      fonction: "Analyste",
      courriel: `consultation-${randomBytes(10).toString("hex")}@example.com`,
      perimetre: "PROVINCIAL",
      provinces: ["prov-sila"],
      motif: "Création d’un compte consultatif de test.",
    },
  });
  assert.equal(creationConsultation.reponse.status, 201, "L’administration peut créer une invitation consultative.");
  const identifiantConsultation = creationConsultation.donnees.identifiant;
  const baseCompteConsultation = ouvrirD1Locale();
  const ligneConsultation = baseCompteConsultation.prepare(`SELECT u.id, u.courriel, cc.id AS compte_id
    FROM utilisateurs u INNER JOIN comptes_consultation cc ON cc.utilisateur_id = u.id WHERE u.identifiant = ?`).get(identifiantConsultation);
  baseCompteConsultation.close();
  assert.ok(ligneConsultation);
  const invitationConsultation = await dernierCourrielPour(ligneConsultation.courriel);
  const codeActivationConsultation = invitationConsultation?.text?.match(/Code d’activation\s*:\s*([^\s]+)/iu)?.[1];
  assert.ok(codeActivationConsultation);
  const clientConsultation = new ClientLocal();
  const connexionInvitation = await clientConsultation.connexion(identifiantConsultation, codeActivationConsultation);
  assert.equal(connexionInvitation.reponse.status, 200);
  assert.equal(Reflect.get(connexionInvitation.donnees.utilisateur, "doit_changer_mot_de_passe"), true);
  let motDePasseConsultation = nouveauMotDePasse();
  await clientConsultation.changerMotDePasse(motDePasseConsultation);
  await configurerMfaTest(clientConsultation, identifiantConsultation);
  const sessionConsultation = await clientConsultation.requete("/api/auth/session");
  assert.equal(sessionConsultation.reponse.status, 200);
  assert.equal(sessionConsultation.donnees.utilisateur.role, "CONSULTATION_INSTITUTIONNELLE");
  assert.equal(sessionConsultation.donnees.utilisateur.perimetre_consultation, "PROVINCIAL");
  assert.deepEqual(sessionConsultation.donnees.utilisateur.provinces_autorisees, ["prov-sila"]);
  const profilConsultation = await clientConsultation.requete("/api/compte");
  assert.equal(profilConsultation.reponse.status, 200);
  const tentativeEscaladeProfil = await clientConsultation.requete("/api/compte", {
    methode: "PATCH",
    corps: {
      nom_complet: sessionConsultation.donnees.utilisateur.nom_complet,
      telephone: "+235 66 11 22 33",
      role: "ADMIN_CENTRAL",
      province_id: "prov-ouaddai",
      statut: "ACTIF",
    },
  });
  assert.ok([200, 400].includes(tentativeEscaladeProfil.reponse.status), "Le profil peut être mis à jour sans accepter de champs d’autorisation.");
  const sessionApresTentativeEscalade = await clientConsultation.requete("/api/auth/session");
  assert.equal(sessionApresTentativeEscalade.donnees.utilisateur.role, "CONSULTATION_INSTITUTIONNELLE");
  assert.deepEqual(sessionApresTentativeEscalade.donnees.utilisateur.provinces_autorisees, ["prov-sila"]);
  const nouveauCourrielConsultation = `consultation-modifie-${randomBytes(10).toString("hex")}@example.com`;
  const changementCourrielRefuse = await clientConsultation.requete("/api/compte/courriel", {
    methode: "POST", corps: { nouveau_courriel: nouveauCourrielConsultation, mot_de_passe_actuel: "MotDePasseIncorrect-12Aa" },
  });
  assert.equal(changementCourrielRefuse.reponse.status, 401, "Le changement d’adresse exige le mot de passe actuel.");
  const demandeChangementCourriel = await clientConsultation.requete("/api/compte/courriel", {
    methode: "POST", corps: { nouveau_courriel: nouveauCourrielConsultation, mot_de_passe_actuel: motDePasseConsultation },
  });
  assert.equal(demandeChangementCourriel.reponse.status, 202, "Le changement d’adresse commence par une vérification e-mail.");
  const messageNouveauCourriel = await dernierCourrielPour(nouveauCourrielConsultation);
  const codeNouveauCourriel = messageNouveauCourriel?.text?.match(/code de vérification SIGAD est\s*:\s*(\d{6})/iu)?.[1];
  assert.ok(codeNouveauCourriel, "Le prestataire local reçoit le code sans l’écrire en clair dans D1.");
  const codeNouveauCourrielInvalide = codeNouveauCourriel === "000000" ? "000001" : "000000";
  const refusCodeNouveauCourriel = await clientConsultation.requete("/api/compte/courriel/verifier", {
    methode: "POST", corps: { code: codeNouveauCourrielInvalide },
  });
  assert.equal(refusCodeNouveauCourriel.reponse.status, 400, "Un code e-mail incorrect est refusé.");
  const confirmationNouveauCourriel = await clientConsultation.requete("/api/compte/courriel/verifier", {
    methode: "POST", corps: { code: codeNouveauCourriel },
  });
  assert.equal(confirmationNouveauCourriel.reponse.status, 200, "Le code valide confirme la nouvelle adresse.");
  const profilApresCourriel = await clientConsultation.requete("/api/compte");
  assert.equal(profilApresCourriel.donnees.compte.courriel, nouveauCourrielConsultation);
  const avertissementAncienCourriel = await dernierCourrielPour(ligneConsultation.courriel);
  assert.match(avertissementAncienCourriel?.subject ?? "", /Modification de l’adresse e-mail SIGAD/u,
    "L’ancienne adresse reçoit un avis après le changement.");
  const nouveauMotDePasseConsultation = nouveauMotDePasse();
  const changementMotDePasseRefuse = await clientConsultation.requete("/api/compte/mot-de-passe", {
    methode: "POST", corps: {
      mot_de_passe_actuel: "MotDePasseIncorrect-12Aa",
      nouveau_mot_de_passe: nouveauMotDePasseConsultation,
      confirmation_mot_de_passe: nouveauMotDePasseConsultation,
    },
  });
  assert.equal(changementMotDePasseRefuse.reponse.status, 401, "Un mot de passe erroné ne modifie pas le compte.");
  const changementMotDePasseConfirme = await clientConsultation.requete("/api/compte/mot-de-passe", {
    methode: "POST", corps: {
      mot_de_passe_actuel: motDePasseConsultation,
      nouveau_mot_de_passe: nouveauMotDePasseConsultation,
      confirmation_mot_de_passe: nouveauMotDePasseConsultation,
    },
  });
  assert.equal(changementMotDePasseConfirme.reponse.status, 200, "Le mot de passe peut être changé après vérification du mot de passe actuel et MFA.");
  motDePasseConsultation = nouveauMotDePasseConsultation;
  assert.equal((await clientConsultation.requete("/api/auth/session")).donnees.utilisateur.role, "CONSULTATION_INSTITUTIONNELLE");
  const exportDansPerimetreConsultation = await clientConsultation.requete("/api/rapports/RAPPORT_MENSUEL_PROVINCIAL/export", {
    methode: "POST", corps: { format: "CSV", archiver: false, filtres: { province_id: "prov-sila" } },
  });
  assert.equal(exportDansPerimetreConsultation.reponse.status, 200, "Un compte consultatif peut exporter un rapport agrégé dans son périmètre.");
  const contenuExportConsultation = exportDansPerimetreConsultation.corpsTexte;
  assert.match(contenuExportConsultation, /sep=;/u);
  assert.doesNotMatch(contenuExportConsultation, /Ouaddaï/u, "Un export consultatif de Sila ne contient pas de données d’Ouaddaï.");
  const rapportsAvantRefusConsultation = ouvrirD1Locale();
  const totalRapportsConsultationAvantRefus = rapportsAvantRefusConsultation.prepare(
    "SELECT COUNT(*) AS total FROM rapports_generes WHERE genere_par = ?",
  ).get(sessionConsultation.donnees.utilisateur.id).total;
  rapportsAvantRefusConsultation.close();
  const exportHorsPerimetreConsultation = await clientConsultation.requete("/api/rapports/RAPPORT_MENSUEL_PROVINCIAL/export", {
    methode: "POST", corps: { format: "CSV", archiver: false, filtres: { province_id: "prov-ouaddai" } },
  });
  assert.equal(exportHorsPerimetreConsultation.reponse.status, 403, "Un compte de Sila ne peut pas exporter le Ouaddaï.");
  const exportPersonnelInterdit = await clientConsultation.requete("/api/rapports/LISTE_BENEFICIAIRES/export", {
    methode: "POST", corps: { format: "CSV", archiver: false, filtres: { province_id: "prov-sila" } },
  });
  assert.equal(exportPersonnelInterdit.reponse.status, 403, "Un compte consultatif ne peut pas exporter la liste nominative des ménages.");
  const rapportsApresRefusConsultation = ouvrirD1Locale();
  assert.equal(rapportsApresRefusConsultation.prepare(
    "SELECT COUNT(*) AS total FROM rapports_generes WHERE genere_par = ?",
  ).get(sessionConsultation.donnees.utilisateur.id).total, totalRapportsConsultationAvantRefus,
  "Les exports refusés ne créent ni rapport ni trace d’export autorisé.");
  rapportsApresRefusConsultation.close();
  const mutationsAvantConsultation = ouvrirD1Locale();
  const nombrePartenairesAvantConsultation = mutationsAvantConsultation.prepare("SELECT COUNT(*) AS total FROM partenaires").get().total;
  mutationsAvantConsultation.close();
  const mutationConsultationInterdite = await clientConsultation.requete("/api/gestion/partenaires", {
    methode: "POST", corps: {},
  });
  assert.equal(mutationConsultationInterdite.reponse.status, 403, "Un compte de consultation ne peut pas créer une ressource métier.");
  const mutationsApresConsultation = ouvrirD1Locale();
  assert.equal(mutationsApresConsultation.prepare("SELECT COUNT(*) AS total FROM partenaires").get().total,
    nombrePartenairesAvantConsultation, "Une mutation refusée ne change aucune donnée métier.");
  mutationsApresConsultation.close();
  const revocationSessionsConsultation = await administrateurCentral.requete(`/api/administration/comptes/consultation/${ligneConsultation.compte_id}/revoquer-sessions`, {
    methode: "POST", corps: { motif: "Révocation ciblée des sessions de test." },
  });
  assert.equal(revocationSessionsConsultation.reponse.status, 200);
  const sessionApresRevocationExplicite = await clientConsultation.requete("/api/auth/session");
  assert.equal(sessionApresRevocationExplicite.reponse.status, 401, "La révocation administrative invalide les sessions sans suspendre le compte.");
  const clientConsultationReconnecte = new ClientLocal();
  const defiConsultation = await clientConsultationReconnecte.connexion(identifiantConsultation, motDePasseConsultation);
  await terminerConnexionMfaTest(clientConsultationReconnecte, identifiantConsultation, defiConsultation);
  assert.equal((await clientConsultationReconnecte.requete("/api/auth/session")).reponse.status, 200);
  const suspensionConsultation = await administrateurCentral.requete(`/api/administration/comptes/consultation/${ligneConsultation.compte_id}/suspendre`, {
    methode: "POST", corps: { motif: "Suspension du compte de test." },
  });
  assert.equal(suspensionConsultation.reponse.status, 200);
  const sessionSuspendueConsultation = await clientConsultationReconnecte.requete("/api/auth/session");
  assert.equal(sessionSuspendueConsultation.reponse.status, 401, "La suspension invalide immédiatement la session consultative.");

  const baseObligationInitiale = ouvrirD1Locale();
  baseObligationInitiale.prepare("UPDATE utilisateurs SET doit_changer_mot_de_passe = 1 WHERE identifiant = 'central'").run();
  baseObligationInitiale.close();
  const accesPendantObligationInitiale = await administrateurCentral.requete("/api/central/controle/observations");
  assert.equal(accesPendantObligationInitiale.reponse.status, 403,
    "Une session centrale déjà vérifiée par MFA reste bloquée tant que le changement initial du mot de passe n’est pas effectué.");
  assert.match(Reflect.get(accesPendantObligationInitiale.donnees, "erreur"), /modifier votre mot de passe initial/u);
  const motDePasseCentralRenouvellement = nouveauMotDePasse();
  const changementCentralObligatoire = await administrateurCentral.requete("/api/auth/changer-mot-de-passe-initial", {
    methode: "POST", corps: { nouveau_mot_de_passe: motDePasseCentralRenouvellement },
  });
  assert.equal(changementCentralObligatoire.reponse.status, 200,
    "Le seul chemin d’administration autorisé durant cette obligation est le changement de mot de passe.");

  const deconnexionProprietaire = await proprietaire.requete("/api/auth/deconnexion", { methode: "POST" });
  assert.equal(deconnexionProprietaire.reponse.status, 200);
  const sessionProprietaireTerminee = await proprietaire.requete("/api/auth/session");
  assert.equal(sessionProprietaireTerminee.reponse.status, 401);
});
