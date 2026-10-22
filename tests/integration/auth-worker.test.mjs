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
import { codeMfaInutilise, configurerMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const cheminCodes = process.env.SIGAD_CODES_FILE;

function nouveauMotDePasse() {
  return `Sigad-${randomBytes(18).toString("base64url")}Aa9`;
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
    let donnees = null;
    try {
      donnees = await reponse.json();
    } catch {
      donnees = null;
    }
    return { reponse, donnees };
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

  let administrateurCentral = new ClientLocal();
  const connexionCentrale = await administrateurCentral.connexion("central", codePour(codes, "central"));
  assert.equal(connexionCentrale.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(connexionCentrale.donnees, "utilisateur"), "doit_changer_mot_de_passe"), true);
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
      `INSERT INTO rattachements_territoriaux
       (id, commune_id, departement_id, sous_prefecture_id, source_juridique, date_debut_validite)
       VALUES ('rat-test-invalide', 'com-test-sila', 'dep-test-ouaddai', 'sp-test-ouaddai', 'Contrôle', '2026-10-22')`,
    ).run(), /Rattachement territorial incohérent/u, "Un rattachement ne peut pas relier une commune à un département d’une autre province.");
    assert.throws(() => baseTerritoire.prepare(
      `INSERT INTO localites
       (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain)
       VALUES ('loc-test-invalide', 'prov-sila', 'dep-test-ouaddai', 'Localité interdite', 'VILLAGE', 'AUCUN')`,
    ).run(), /Localité incohérente/u, "Une localité doit relever du département de sa province.");
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
  const creationMenageSila = await delegueSila.requete("/api/gestion/menages", { methode: "POST", corps: corpsMenageSila });
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
  const resultatImportCsv = await delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: importCsv });
  assert.equal(resultatImportCsv.reponse.status, 201, "L’import CSV doit fonctionner dans le Worker local.");
  assert.equal(Reflect.get(resultatImportCsv.donnees, "nombre_menages"), 1);
  const lotCinqCents = Array.from({ length: 500 }, (_, index) => ({
    ...corpsMenageSila,
    nom_chef_menage: `Ménage importé par lot ${String(index + 1).padStart(3, "0")}`,
    telephone: `+235 62 00 ${String(index).padStart(4, "0")}`,
  }));
  const resultatLotCinqCents = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST", corps: { menages: lotCinqCents },
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
  const resultatExcel = await delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: fichierExcel });
  assert.equal(resultatExcel.reponse.status, 201, "L’import d’un classeur Excel .xlsx doit fonctionner dans le Worker local.");
  assert.equal(Reflect.get(resultatExcel.donnees, "nombre_menages"), 1);
  const importAvecProvinceImposee = await delegueSila.requete("/api/gestion/menages/importations", {
    methode: "POST",
    corps: { menages: [{ ...corpsMenageSila, province_id: "prov-ouaddai" }] },
  });
  assert.equal(importAvecProvinceImposee.reponse.status, 403, "L’import ne peut pas remplacer la province issue de la session.");
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
  });
  assert.equal(importDoublons.reponse.status, 201);
  assert.equal(Reflect.get(importDoublons.donnees, "doublons_signales"), 1, "Un doublon de l’import est signalé sans fusion automatique.");
  const importConcurrent = await Promise.all([
    delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: { menages: [corpsDoublons("+235 66 00 40 02")] } }),
    delegueSila.requete("/api/gestion/menages/importations", { methode: "POST", corps: { menages: [{ ...corpsDoublons("+235 66 00 40 02"), nom_chef_menage: "Ménage concurrent doublon" }] } }),
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
