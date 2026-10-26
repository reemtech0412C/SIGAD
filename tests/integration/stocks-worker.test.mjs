import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { reserverStockFefo } from "../../backend/src/services/stock.service.ts";
import { configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const cheminCodes = process.env.SIGAD_CODES_FILE;

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const candidats = readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  for (const candidat of candidats) {
    const base = new DatabaseSync(join(dossierEtat, candidat));
    base.exec("PRAGMA foreign_keys = ON");
    const existe = base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get();
    if (existe?.total === 1) return base;
    base.close();
  }
  throw new Error("La base D1 locale SIGAD est introuvable.");
}

function cheminD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  for (const candidat of readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite")) {
    const chemin = join(dossierEtat, candidat);
    const base = new DatabaseSync(chemin);
    const existe = base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get();
    base.close();
    if (existe?.total === 1) return chemin;
  }
  throw new Error("Le fichier D1 local SIGAD est introuvable.");
}

function lireCodes(texte) {
  const elements = JSON.parse(texte);
  if (!Array.isArray(elements) || elements.length !== 25) throw new Error("Le test attend les 25 codes d’activation locaux.");
  return new Map(elements.map((element) => [element.identifiant, element.code_activation]));
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    const formulaire = options.corps instanceof FormData;
    if (options.corps !== undefined && !formulaire) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);
    if (this.cookies.size > 0) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: formulaire ? options.corps : JSON.stringify(options.corps) }),
    });
    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      if (!paire) continue;
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (valeur === "" || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    let donnees = null;
    try { donnees = await reponse.json(); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async connexion(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    let resultat = await this.requete("/api/auth/connexion", {
      methode: "POST", corps: { identifiant, mot_de_passe: motDePasse },
    });
    assert.equal(resultat.reponse.status, 200, `La connexion de ${identifiant} doit réussir.`);
    resultat = await terminerConnexionMfaTest(this, identifiant, resultat);
    if (resultat.donnees?.utilisateur?.doit_changer_mot_de_passe) {
      const nouveau = `Test-${crypto.randomUUID()}-Aa9`;
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST", corps: { nouveau_mot_de_passe: nouveau },
      });
      assert.equal(changement.reponse.status, 200, "Le changement de mot de passe initial doit être obligatoire et fonctionnel.");
    }
    if (["central", "proprietaire"].includes(identifiant)) await configurerMfaTest(this, identifiant);
    return resultat;
  }
}

class InstructionD1Locale {
  constructor(base, sql) { this.base = base; this.sql = sql; this.valeurs = []; }
  bind(...valeurs) { this.valeurs = valeurs; return this; }
  async first() { return this.base.prepare(this.sql).get(...this.valeurs) ?? null; }
  async all() { return { results: this.base.prepare(this.sql).all(...this.valeurs) }; }
}

class BaseD1Locale {
  constructor(base) { this.base = base; }
  prepare(sql) { return new InstructionD1Locale(this.base, sql); }
  async batch(instructions) {
    this.base.exec("BEGIN IMMEDIATE");
    try {
      const resultats = instructions.map((instruction) => {
        const resultat = this.base.prepare(instruction.sql).run(...instruction.valeurs);
        return { success: true, meta: { changes: Number(resultat.changes), duration: 0 } };
      });
      this.base.exec("COMMIT");
      return resultats;
    } catch (erreur) {
      this.base.exec("ROLLBACK");
      throw erreur;
    }
  }
}

function creerCle(prefixe) { return `${prefixe}-${crypto.randomUUID()}`; }

test("Gestion des articles et stocks dans le Worker Cloudflare et D1 locaux", async () => {
  if (!cheminCodes) throw new Error("Définissez SIGAD_CODES_FILE avec le fichier externe des codes locaux.");
  const codes = lireCodes(await (await import("node:fs/promises")).readFile(cheminCodes, "utf8"));
  const baseInitialisation = ouvrirD1Locale();
  try {
    for (const identifiant of ["central", "sila", "ouaddai"]) {
      const empreinte = await hacherMotDePasse(codes.get(identifiant));
      baseInitialisation.prepare(
        `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?,
         code_activation_expire_le = datetime('now', '+24 hours'),
         doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0,
         verrouille_jusqua = NULL WHERE identifiant = ?`,
      ).run(empreinte, empreinte, identifiant);
    }
    baseInitialisation.prepare("UPDATE utilisateurs SET statut = 'ACTIF' WHERE identifiant IN ('central', 'sila', 'ouaddai')").run();
  } finally { baseInitialisation.close(); }

  const central = new ClientLocal();
  const sila = new ClientLocal();
  const ouaddai = new ClientLocal();
  await Promise.all([
    central.connexion("central", codes.get("central")),
    sila.connexion("sila", codes.get("sila")),
    ouaddai.connexion("ouaddai", codes.get("ouaddai")),
  ]);

  const article = await central.requete("/api/stocks/articles", {
    methode: "POST",
    corps: {
      code_article: "ALIM-RIZ-PHASE4",
      designation: "Riz de test pour validation du stock",
      categorie_id: "cat-alimentaire",
      unite_mesure_id: "unit-kg",
      conditionnement_id: null,
      perissable: true,
      actif: true,
    },
  });
  assert.equal(article.reponse.status, 201, "L’administration centrale peut créer un article.");
  const articleId = article.donnees.id;

  const entrepotSila = await sila.requete("/api/stocks/entrepots", {
    methode: "POST", corps: { code_entrepot: "SILA-STOCK-TEST", nom: "Entrepôt synthétique de Sila", niveau: "PROVINCIAL", actif: true },
  });
  assert.equal(entrepotSila.reponse.status, 201, "Le délégué peut créer un entrepôt provincial dans sa province.");
  assert.equal(entrepotSila.donnees.province_id, "prov-sila", "Le rattachement provincial provient de la session.");
  const entrepotOuaddai = await central.requete("/api/stocks/entrepots", {
    methode: "POST", corps: { code_entrepot: "OUADDAI-STOCK-TEST", nom: "Entrepôt synthétique du Ouaddaï", niveau: "PROVINCIAL", province_id: "prov-ouaddai", actif: true },
  });
  assert.equal(entrepotOuaddai.reponse.status, 201);

  const entrepotAutreProvince = await sila.requete("/api/stocks/entrepots", {
    methode: "POST", corps: { code_entrepot: "SILA-HORS-PROVINCE", nom: "Entrepôt hors province", niveau: "PROVINCIAL", province_id: "prov-ouaddai", actif: true },
  });
  assert.equal(entrepotAutreProvince.reponse.status, 403, "Un délégué ne peut imposer l’identifiant d’une autre province.");
  const administrationCentraleInterdite = await sila.requete("/api/stocks/articles", {
    methode: "POST", corps: { code_article: "ARTICLE-INTERDIT", designation: "Article interdit", categorie_id: "cat-alimentaire", unite_mesure_id: "unit-kg", perissable: false, actif: true },
  });
  assert.equal(administrationCentraleInterdite.reponse.status, 403, "Le délégué ne peut pas gérer le référentiel national des articles.");

  const partenaire = await central.requete("/api/gestion/partenaires", {
    methode: "POST", corps: { nom: "Fournisseur synthétique Phase 4", sigle: "FSP4", type_organisation: "Fournisseur de test", roles: ["FOURNISSEUR"] },
  });
  assert.equal(partenaire.reponse.status, 201);

  const corpsReception = {
    entrepot_id: entrepotSila.donnees.id,
    type_entree: "APPROVISIONNEMENT_DIRECT_PARTENAIRE",
    partenaire_id: partenaire.donnees.id,
    date_reception: "2026-10-22",
    numero_bordereau_externe: "PV-TEST-001",
    observations: "Réception synthétique d’essai, sans donnée territoriale réelle.",
    lignes: [
      { article_id: articleId, numero_lot: "LOT-FEFO-01", quantite_recue: 5, quantite_acceptee: 5, quantite_endommagee: 0, date_peremption: "2026-11-15" },
      { article_id: articleId, numero_lot: "LOT-FEFO-02", quantite_recue: 5, quantite_acceptee: 5, quantite_endommagee: 0, date_peremption: "2027-04-30" },
      { article_id: articleId, numero_lot: "LOT-EXPIRE", quantite_recue: 1, quantite_acceptee: 1, quantite_endommagee: 0, date_peremption: "2026-10-20" },
      { article_id: articleId, numero_lot: "LOT-AVARIE", quantite_recue: 2, quantite_acceptee: 0, quantite_endommagee: 2, date_peremption: "2027-01-30" },
    ],
  };
  const cleReception = creerCle("reception-phase4");
  const reception = await sila.requete("/api/stocks/receptions-stock", {
    methode: "POST", corps: corpsReception, cleIdempotence: cleReception,
  });
  assert.equal(reception.reponse.status, 201, `La réception directe doit être enregistrée: ${JSON.stringify(reception.donnees)}`);
  const receptionRejouee = await sila.requete("/api/stocks/receptions-stock", {
    methode: "POST", corps: corpsReception, cleIdempotence: cleReception,
  });
  assert.equal(receptionRejouee.reponse.status, 201);
  assert.equal(receptionRejouee.reponse.headers.get("Idempotency-Replayed"), "true");
  assert.equal(receptionRejouee.donnees.id, reception.donnees.id, "Le rejeu renvoie le document d’origine.");
  const cleReutiliseeAvecAutreContenu = await sila.requete("/api/stocks/receptions-stock", {
    methode: "POST", corps: { ...corpsReception, observations: "Contenu différent" }, cleIdempotence: cleReception,
  });
  assert.equal(cleReutiliseeAvecAutreContenu.reponse.status, 409, "Une même clé ne peut désigner deux contenus différents.");

  const receptionOuaddai = await ouaddai.requete("/api/stocks/receptions-stock", {
    methode: "POST",
    cleIdempotence: creerCle("reception-ouaddai"),
    corps: {
      entrepot_id: entrepotOuaddai.donnees.id,
      type_entree: "STOCK_INITIAL",
      date_reception: "2026-10-22",
      lignes: [{ article_id: articleId, numero_lot: "LOT-OUADDAI-TEST", quantite_recue: 3, quantite_acceptee: 3, quantite_endommagee: 0 }],
    },
  });
  assert.equal(receptionOuaddai.reponse.status, 201);

  const filtreOuaddaiParSila = await sila.requete("/api/stocks/soldes-stock?province_id=prov-ouaddai");
  assert.equal(filtreOuaddaiParSila.reponse.status, 403, "Le filtre de province ne peut pas élargir le périmètre de Sila.");
  const listeSila = await sila.requete("/api/stocks/receptions-stock?limite=100&decalage=0");
  assert.equal(listeSila.reponse.status, 200);
  assert.equal(listeSila.donnees.elements.some((element) => element.id === receptionOuaddai.donnees.id), false,
    "Le registre de Sila ne doit pas révéler de réception du Ouaddaï.");
  const detailOuaddaiParSila = await sila.requete(`/api/stocks/receptions-stock/${receptionOuaddai.donnees.id}`);
  assert.equal(detailOuaddaiParSila.reponse.status, 404, "Une réception hors province reste masquée.");
  const ajustementCroise = await sila.requete("/api/stocks/ajustements-stock", {
    methode: "POST", cleIdempotence: creerCle("ajustement-croise"),
    corps: { entrepot_id: entrepotOuaddai.donnees.id, article_id: articleId, lot_stock_id: "lot-inconnu", type_ajustement: "PERTE", ecart_quantite: -1, motif_detaille: "Tentative de modification interprovinciale" },
  });
  assert.equal(ajustementCroise.reponse.status, 404, "Une mutation ciblant un entrepôt hors province est refusée.");
  const provinceForceeDansAjustement = await sila.requete("/api/stocks/ajustements-stock", {
    methode: "POST", cleIdempotence: creerCle("ajustement-province-forcee"),
    corps: {
      entrepot_id: entrepotSila.donnees.id, article_id: articleId, lot_stock_id: "lot-inconnu",
      type_ajustement: "PERTE", ecart_quantite: -1, motif_detaille: "Tentative de forçage de province",
      province_id: "prov-ouaddai",
    },
  });
  assert.equal(provinceForceeDansAjustement.reponse.status, 400,
    "Le corps d’une mutation ne peut pas fournir un champ de province contrôlé par la session.");
  const mutationSansCsrf = await sila.requete("/api/stocks/ajustements-stock", {
    methode: "POST", csrf: false, cleIdempotence: creerCle("ajustement-csrf"),
    corps: { entrepot_id: entrepotSila.donnees.id, article_id: articleId, lot_stock_id: "lot-inconnu", type_ajustement: "PERTE", ecart_quantite: -1, motif_detaille: "Mutation sans jeton CSRF" },
  });
  assert.equal(mutationSansCsrf.reponse.status, 403, "Une mutation sans jeton CSRF doit être refusée avant le service.");

  const baseLecture = ouvrirD1Locale();
  let lotEndommageId;
  let mouvementId;
  try {
    lotEndommageId = baseLecture.prepare("SELECT id FROM lots_stock WHERE numero_lot = 'LOT-AVARIE-ENDOMMAGE' AND province_id = 'prov-sila'").get()?.id;
    mouvementId = baseLecture.prepare("SELECT id FROM mouvements_stock WHERE document_source_id = ? ORDER BY cree_le LIMIT 1")
      .get(reception.donnees.id)?.id;
    assert.ok(lotEndommageId);
    assert.ok(mouvementId);
    const etatFefo = baseLecture.prepare(
      `SELECT numero_lot, etat_qualite, date_peremption FROM lots_stock
       WHERE article_id = ? AND entrepot_id = ? ORDER BY date_peremption IS NULL, date_peremption`,
    ).all(articleId, entrepotSila.donnees.id);
    assert.equal(etatFefo.find((lot) => lot.numero_lot === "LOT-EXPIRE").etat_qualite, "PERIME");
    assert.equal(etatFefo.find((lot) => lot.numero_lot === "LOT-AVARIE-ENDOMMAGE").etat_qualite, "ENDOMMAGE");
    const soldeInitial = baseLecture.prepare(
      "SELECT quantite_physique, quantite_reservee FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?",
    ).get(entrepotSila.donnees.id, articleId);
    const sommeLots = baseLecture.prepare(
      "SELECT SUM(quantite_physique) AS physique, SUM(quantite_reservee) AS reservee FROM lots_stock WHERE entrepot_id = ? AND article_id = ?",
    ).get(entrepotSila.donnees.id, articleId);
    assert.equal(soldeInitial.quantite_physique, 13);
    assert.equal(soldeInitial.quantite_reservee, 0);
    assert.equal(sommeLots.physique, soldeInitial.quantite_physique, "La somme physique des lots égale le solde consolidé.");
    assert.equal(sommeLots.reservee, soldeInitial.quantite_reservee, "La somme réservée des lots égale le solde consolidé.");
  } finally { baseLecture.close(); }

  const mutationsConcurrentes = await Promise.all([
    sila.requete("/api/stocks/ajustements-stock", {
      methode: "POST", cleIdempotence: creerCle("ajustement-concurrent-a"),
      corps: { entrepot_id: entrepotSila.donnees.id, article_id: articleId, lot_stock_id: lotEndommageId, type_ajustement: "AVARIE", ecart_quantite: -1.5, motif_detaille: "Retrait concurrent synthétique A" },
    }),
    sila.requete("/api/stocks/ajustements-stock", {
      methode: "POST", cleIdempotence: creerCle("ajustement-concurrent-b"),
      corps: { entrepot_id: entrepotSila.donnees.id, article_id: articleId, lot_stock_id: lotEndommageId, type_ajustement: "AVARIE", ecart_quantite: -1.5, motif_detaille: "Retrait concurrent synthétique B" },
    }),
  ]);
  assert.deepEqual(mutationsConcurrentes.map((resultat) => resultat.reponse.status).sort(), [201, 409],
    "Deux écritures concurrentes sur le même solde ne peuvent pas soustraire ensemble plus que le lot ne contient.");

  const baseReservationsA = new DatabaseSync(cheminD1Locale());
  const baseReservationsB = new DatabaseSync(cheminD1Locale());
  baseReservationsA.exec("PRAGMA foreign_keys = ON");
  baseReservationsB.exec("PRAGMA foreign_keys = ON");
  const dbReservationA = new BaseD1Locale(baseReservationsA);
  const dbReservationB = new BaseD1Locale(baseReservationsB);
  const utilisateurSila = {
    id: "usr-sila", identifiant: "sila", nom_complet: "Délégué synthétique de Sila",
    role: "DELEGUE_PROVINCIAL", province_id: "prov-sila", doit_changer_mot_de_passe: 0, statut: "ACTIF",
  };
  const demandesReservation = await Promise.all([
    reserverStockFefo(dbReservationA, utilisateurSila, {
      distribution_id: "distribution-synthetique-a", entrepot_id: entrepotSila.donnees.id,
      province_id: "prov-sila", article_id: articleId, quantite: 7,
    }, creerCle("reservation-fefo-a"), null).then((valeur) => ({ valeur }), (erreur) => ({ erreur })),
    reserverStockFefo(dbReservationB, utilisateurSila, {
      distribution_id: "distribution-synthetique-b", entrepot_id: entrepotSila.donnees.id,
      province_id: "prov-sila", article_id: articleId, quantite: 7,
    }, creerCle("reservation-fefo-b"), null).then((valeur) => ({ valeur }), (erreur) => ({ erreur })),
  ]);
  baseReservationsA.close();
  baseReservationsB.close();
  assert.equal(demandesReservation.filter((resultat) => "valeur" in resultat).length, 1,
    "Une seule réservation concurrente de 7 kg peut consommer le disponible FEFO de 10 kg.");
  assert.equal(demandesReservation.filter((resultat) => "erreur" in resultat).length, 1);
  const erreurReservation = demandesReservation.find((resultat) => "erreur" in resultat)?.erreur;
  assert.equal(erreurReservation?.statutHttp, 409, "La réservation concurrente perdante reçoit un conflit métier.");

  const reservationImpossible = await Promise.all([
    (() => {
      const base = new DatabaseSync(cheminD1Locale());
      base.exec("PRAGMA foreign_keys = ON");
      return reserverStockFefo(new BaseD1Locale(base), utilisateurSila, {
        distribution_id: "distribution-synthetique-refusee", entrepot_id: entrepotSila.donnees.id,
        province_id: "prov-sila", article_id: articleId, quantite: 4,
      }, creerCle("reservation-trop-elevee"), null).finally(() => base.close());
    })().then(() => false, (erreur) => erreur?.statutHttp === 409),
  ]);
  assert.equal(reservationImpossible[0], true, "Une demande supérieure au stock distribuable est refusée au niveau du service.");

  const baseControle = ouvrirD1Locale();
  try {
    const solde = baseControle.prepare(
      "SELECT quantite_physique, quantite_reservee FROM soldes_stock WHERE entrepot_id = ? AND article_id = ?",
    ).get(entrepotSila.donnees.id, articleId);
    const somme = baseControle.prepare(
      "SELECT SUM(quantite_physique) AS physique, SUM(quantite_reservee) AS reservee FROM lots_stock WHERE entrepot_id = ? AND article_id = ?",
    ).get(entrepotSila.donnees.id, articleId);
    const distribuable = baseControle.prepare(
      `SELECT SUM(CASE WHEN etat_qualite = 'BON' AND (date_peremption IS NULL OR date_peremption >= date('now'))
       THEN quantite_physique - quantite_reservee ELSE 0 END) AS total
       FROM lots_stock WHERE entrepot_id = ? AND article_id = ?`,
    ).get(entrepotSila.donnees.id, articleId);
    assert.equal(solde.quantite_physique, somme.physique, "Le solde physique reste égal au total des lots.");
    assert.equal(solde.quantite_reservee, somme.reservee, "Le solde réservé reste égal au total des lots.");
    assert.equal(solde.quantite_reservee, 7, "Une seule des deux réservations concurrentes a été appliquée.");
    assert.equal(distribuable.total, 3, "Le calcul FEFO exclut la péremption et les lots endommagés.");
    assert.equal(baseControle.prepare("SELECT COUNT(*) AS total FROM mouvements_stock WHERE document_source_id = ?").get(reception.donnees.id).total, 4,
      "La réception dédoublonnée produit un seul mouvement par lot non nul.");
    assert.equal(baseControle.prepare("SELECT COUNT(*) AS total FROM reservations_stock WHERE statut = 'ACTIVE'").get().total, 2,
      "Une réservation FEFO répartie sur deux lots enregistre ses deux lignes.");

    assert.throws(
      () => baseControle.prepare("UPDATE mouvements_stock SET motif = 'Modification interdite' WHERE id = ?").run(mouvementId),
      /MOUVEMENT_STOCK_IMMUABLE/u,
      "Une ligne du journal de mouvements ne peut pas être modifiée.",
    );
    assert.throws(
      () => baseControle.prepare("DELETE FROM mouvements_stock WHERE id = ?").run(mouvementId),
      /MOUVEMENT_STOCK_IMMUABLE/u,
      "Une ligne du journal de mouvements ne peut pas être supprimée.",
    );

    let rejetSoldeIncoherent = false;
    try {
      baseControle.prepare("UPDATE soldes_stock SET quantite_physique = quantite_physique + 1 WHERE entrepot_id = ? AND article_id = ?")
        .run(entrepotSila.donnees.id, articleId);
    } catch (erreur) { rejetSoldeIncoherent = erreur instanceof Error && /SOLDE_STOCK_INCOHERENT/u.test(erreur.message); }
    assert.equal(rejetSoldeIncoherent, true, "Un solde consolidé ne peut pas diverger des lots.");
  } finally { baseControle.close(); }

  const stockNegatif = await sila.requete("/api/stocks/ajustements-stock", {
    methode: "POST", cleIdempotence: creerCle("ajustement-stock-negatif"),
    corps: { entrepot_id: entrepotSila.donnees.id, article_id: articleId, lot_stock_id: lotEndommageId, type_ajustement: "PERTE", ecart_quantite: -100, motif_detaille: "Tentative de stock négatif" },
  });
  assert.equal(stockNegatif.reponse.status, 409, "Une sortie supérieure au disponible ne peut jamais créer de stock négatif.");

  const baseAvantEchec = ouvrirD1Locale();
  let nombreReceptionsAvant;
  let nombreMouvementsAvant;
  try {
    nombreReceptionsAvant = baseAvantEchec.prepare("SELECT COUNT(*) AS total FROM receptions_stock WHERE province_id = 'prov-sila'").get().total;
    nombreMouvementsAvant = baseAvantEchec.prepare("SELECT COUNT(*) AS total FROM mouvements_stock WHERE province_id = 'prov-sila'").get().total;
    baseAvantEchec.exec(
      `CREATE TRIGGER test_echec_audit_phase4 BEFORE INSERT ON journaux_audit
       WHEN NEW.action = 'RECEPTION_STOCK' BEGIN SELECT RAISE(ABORT, 'ECHEC_TRANSACTION_PHASE4'); END;`,
    );
  } finally { baseAvantEchec.close(); }
  const cleEchec = creerCle("reception-rollback");
  const receptionEnEchec = await sila.requete("/api/stocks/receptions-stock", {
    methode: "POST", cleIdempotence: cleEchec,
    corps: {
      entrepot_id: entrepotSila.donnees.id, type_entree: "STOCK_INITIAL", date_reception: "2026-10-22",
      lignes: [{ article_id: articleId, numero_lot: "LOT-ROLLBACK-TEST", quantite_recue: 2, quantite_acceptee: 2, quantite_endommagee: 0 }],
    },
  });
  assert.equal(receptionEnEchec.reponse.status, 500, "Une erreur tardive de journal d’audit doit échouer la réception.");
  const baseApresEchec = ouvrirD1Locale();
  try {
    assert.equal(baseApresEchec.prepare("SELECT COUNT(*) AS total FROM receptions_stock WHERE province_id = 'prov-sila'").get().total, nombreReceptionsAvant,
      "L’en-tête de réception a été annulé avec toute la transaction.");
    assert.equal(baseApresEchec.prepare("SELECT COUNT(*) AS total FROM mouvements_stock WHERE province_id = 'prov-sila'").get().total, nombreMouvementsAvant,
      "Les mouvements préparés ont été annulés avec toute la transaction.");
    assert.equal(baseApresEchec.prepare("SELECT COUNT(*) AS total FROM lots_stock WHERE numero_lot = 'LOT-ROLLBACK-TEST'").get().total, 0,
      "Les lots préparés ont été annulés avec toute la transaction.");
    assert.equal(baseApresEchec.prepare("SELECT COUNT(*) AS total FROM cles_idempotence WHERE cle = ?").get(cleEchec).total, 0,
      "La clé d’idempotence est elle aussi annulée.");
    baseApresEchec.exec("DROP TRIGGER test_echec_audit_phase4");
  } finally { baseApresEchec.close(); }
});
