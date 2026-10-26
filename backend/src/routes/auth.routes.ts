import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { DELAI_SESSION_HEURES, DUREE_VERROUILLAGE_MINUTES, SEUIL_TENTATIVES_ECHOUEES } from "../../../shared/constantes/roles";
import { schemaChangementMotDePasseInitial, schemaConnexion } from "../../../shared/validations/authentification";
import { authMiddleware, cookieSession as lireJetonSession } from "../middlewares/auth.middleware";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { csrfPreAuthMiddleware, csrfSessionMiddleware, definirCookieCsrf, effacerCookieCsrf } from "../middlewares/csrf.middleware";
import { genererJetonAleatoire, hacherJeton, hacherMotDePasse, verifierMotDePasse } from "../services/cryptographie.service";
import { environnementExigeTransportSecurise } from "../services/securite-http.service";
import {
  definirEtapeDiagnosticRecuperation,
  journaliserEchecRecuperation,
  middlewareDiagnosticRecuperation,
} from "../services/diagnostic-recuperation.service";
import {
  creerJetonActivationProprietaire,
  estEnvironnementAutoriseRecuperation,
  expirationJetonActivationProprietaire,
  expirationSessionActivation,
  type OperationPreuveOperateur,
  verifierPreuveOperateur,
} from "../services/recuperation-proprietaire.service";
import {
  chiffrerSecretTotp,
  creerCodeOperation,
  dechiffrerSecretTotp,
  genererCodesRecuperation,
  genererSecretTotp,
  normaliserCodeRecuperation,
  uriProvisionnementTotp,
  verifierCodeTotp,
} from "../services/mfa.service";

interface LigneConnexion {
  id: string;
  identifiant: string;
  nom_complet: string;
  role: "PROPRIETAIRE" | "ADMIN_CENTRAL" | "DELEGUE_PROVINCIAL" | "CONSULTATION_INSTITUTIONNELLE";
  province_id: string | null;
  mot_de_passe_hash: string;
  code_activation_hash: string | null;
  code_activation_expire_le: string | null;
  code_activation_recuperation_id: string | null;
  doit_changer_mot_de_passe: number;
  statut: "ACTIF" | "SUSPENDU" | "VERROUILLE";
  verrouille_jusqua: string | null;
  double_facteur_secret: string | null;
  double_facteur_actif: number;
}

const routesAuth = new Hono<EnvironnementApplication>();

function cookieSession(jeton: string, environnement: string, dureeSecondes = DELAI_SESSION_HEURES * 60 * 60): string {
  const securise = environnementExigeTransportSecurise(environnement) ? "; Secure" : "";
  return `sigad_session=${encodeURIComponent(jeton)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${dureeSecondes}${securise}`;
}

function effacerCookieSession(environnement: string): string {
  const securise = environnementExigeTransportSecurise(environnement) ? "; Secure" : "";
  return `sigad_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securise}`;
}

function cookieDefiMfa(jeton: string, environnement: string): string {
  const securise = environnementExigeTransportSecurise(environnement) ? "; Secure" : "";
  return `sigad_mfa_challenge=${encodeURIComponent(jeton)}; Path=/api/auth/mfa; HttpOnly; SameSite=Strict; Max-Age=300${securise}`;
}

function effacerCookieDefiMfa(environnement: string): string {
  const securise = environnementExigeTransportSecurise(environnement) ? "; Secure" : "";
  return `sigad_mfa_challenge=; Path=/api/auth/mfa; HttpOnly; SameSite=Strict; Max-Age=0${securise}`;
}

function lireCookie(requete: Request, nom: string): string | null {
  const valeur = requete.headers.get("Cookie");
  if (!valeur) return null;
  for (const element of valeur.split(";")) {
    const separateur = element.indexOf("=");
    if (separateur > 0 && element.slice(0, separateur).trim() === nom) {
      return decodeURIComponent(element.slice(separateur + 1).trim());
    }
  }
  return null;
}

function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

function dateSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function expirationValide(expiration: string | null): boolean {
  if (!expiration) return false;
  const valeur = Date.parse(`${expiration.replace(" ", "T")}Z`);
  return Number.isFinite(valeur) && valeur > Date.now();
}

function activationInitialeValide(utilisateur: LigneConnexion | null): boolean {
  if (!utilisateur || utilisateur.doit_changer_mot_de_passe !== 1) return true;
  if (utilisateur.code_activation_recuperation_id !== null) {
    return expirationValide(utilisateur.code_activation_expire_le);
  }
  return utilisateur.code_activation_expire_le === null || expirationValide(utilisateur.code_activation_expire_le);
}

async function enregistrerEchecConnexion(
  c: Context<EnvironnementApplication>,
  utilisateur: LigneConnexion | null,
  identifiant: string,
  motif: string,
): Promise<void> {
  const evenement = c.env.DB.prepare(
    `INSERT INTO evenements_connexion
     (id, identifiant_tente, utilisateur_id, succes, motif_echec, adresse_ip, agent_utilisateur, request_id)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    identifiant,
    utilisateur?.id ?? null,
    motif,
    adresseIp(c.req.raw),
    c.req.header("User-Agent") ?? null,
    c.get("requestId"),
  );

  if (!utilisateur || utilisateur.statut === "SUSPENDU") {
    await c.env.DB.batch([evenement]);
    return;
  }

  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs
     SET tentatives_echouees = tentatives_echouees + 1,
         statut = CASE WHEN tentatives_echouees + 1 >= ? THEN 'VERROUILLE' ELSE statut END,
         verrouille_jusqua = CASE
           WHEN tentatives_echouees + 1 >= ? THEN datetime('now', '+' || ? || ' minutes')
           ELSE verrouille_jusqua
         END,
         modifie_le = datetime('now')
     WHERE id = ? AND statut IN ('ACTIF', 'VERROUILLE')
       AND (verrouille_jusqua IS NULL OR verrouille_jusqua <= datetime('now'))`,
  ).bind(SEUIL_TENTATIVES_ECHOUEES, SEUIL_TENTATIVES_ECHOUEES, DUREE_VERROUILLAGE_MINUTES, utilisateur.id);
  await c.env.DB.batch([miseAJour, evenement]);
}

routesAuth.get("/csrf", (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const existant = cookie
    .split(";")
    .map((element) => element.trim())
    .find((element) => element.startsWith("sigad_csrf="))
    ?.slice("sigad_csrf=".length);
  const jeton = existant ? decodeURIComponent(existant) : genererJetonAleatoire();
  c.header("Set-Cookie", definirCookieCsrf(jeton, c.env.ENVIRONMENT));
  return c.json({ jeton_csrf: jeton });
});

async function verifierDemandeRecuperation(
  c: Context<EnvironnementApplication>,
  operation: OperationPreuveOperateur,
): Promise<{ motif: string; identite: string; preuve: Awaited<ReturnType<typeof verifierPreuveOperateur>> } | Response> {
  definirEtapeDiagnosticRecuperation(c, "CONFIGURATION_ENVIRONNEMENT");
  if (!estEnvironnementAutoriseRecuperation(c.env.ENVIRONMENT, c.env.SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE)) {
    return c.json({ erreur: "La récupération exceptionnelle n’est pas activée pour cet environnement." }, 404);
  }
  const identiteAutorisee = c.env.SIGAD_RECUPERATION_OPERATEUR_IDENTITE?.trim().toLowerCase();
  const clePublique = c.env.SIGAD_RECUPERATION_OPERATEUR_CLE_PUBLIQUE;
  if (!identiteAutorisee || !clePublique) {
    return c.json({ erreur: "La récupération exceptionnelle n’est pas configurée." }, 503);
  }

  definirEtapeDiagnosticRecuperation(c, "LECTURE_CORPS");
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  if (typeof corps !== "object" || corps === null || !("motif" in corps)
    || typeof Reflect.get(corps, "motif") !== "string") {
    return c.json({ erreur: "Le motif de récupération est obligatoire." }, 400);
  }
  const valeurMotif = Reflect.get(corps, "motif");
  if (typeof valeurMotif !== "string") return c.json({ erreur: "Le motif de récupération est obligatoire." }, 400);
  const motif = valeurMotif.trim();
  if (motif.length < 10 || motif.length > 300) {
    return c.json({ erreur: "Le motif doit comporter de 10 à 300 caractères." }, 400);
  }
  const jetonPreuve = c.req.header("X-SIGAD-Preuve-Operateur");
  if (!jetonPreuve) return c.json({ erreur: "La preuve d’autorisation opérateur est absente ou invalide." }, 401);

  definirEtapeDiagnosticRecuperation(c, "VERIFICATION_PREUVE_OPERATEUR");
  let preuve: Awaited<ReturnType<typeof verifierPreuveOperateur>>;
  try {
    preuve = await verifierPreuveOperateur(jetonPreuve, identiteAutorisee, clePublique, operation, motif);
  } catch {
    return c.json({ erreur: "La preuve d’autorisation opérateur est absente ou invalide." }, 401);
  }

  return { motif, identite: preuve.identite, preuve };
}

routesAuth.post("/recuperation-proprietaire", middlewareDiagnosticRecuperation, csrfPreAuthMiddleware, async (c) => {
  const demande = await verifierDemandeRecuperation(c, "EMETTRE_ACTIVATION_INITIALE");
  if (demande instanceof Response) return demande;

  definirEtapeDiagnosticRecuperation(c, "LECTURE_COMPTE_CIBLE");
  const cible = await c.env.DB.prepare(
    `SELECT id, statut, role, double_facteur_actif, code_activation_recuperation_id,
            doit_changer_mot_de_passe
     FROM utilisateurs WHERE id = 'usr-proprietaire' AND identifiant = 'proprietaire'`,
  ).first<{
    id: string;
    statut: "ACTIF" | "SUSPENDU" | "VERROUILLE";
    role: string;
    double_facteur_actif: number;
    code_activation_recuperation_id: string | null;
    doit_changer_mot_de_passe: number;
  }>();
  if (!cible || cible.role !== "PROPRIETAIRE" || cible.statut !== "ACTIF"
    || cible.doit_changer_mot_de_passe !== 1 || cible.code_activation_recuperation_id !== null) {
    return c.json({ erreur: "Le compte propriétaire n’est pas disponible pour cette récupération." }, 409);
  }

  definirEtapeDiagnosticRecuperation(c, "GENERATION_JETON");
  const idRecuperation = crypto.randomUUID();
  const idPreuve = crypto.randomUUID();
  const codeActivation = creerJetonActivationProprietaire();

  definirEtapeDiagnosticRecuperation(c, "HACHAGE_JETON");
  const empreinteCode = await hacherMotDePasse(codeActivation);
  const expirationActivation = expirationJetonActivationProprietaire();

  definirEtapeDiagnosticRecuperation(c, "PREPARATION_D1");
  const instructions = [
    c.env.DB.prepare(
      `INSERT INTO preuves_operateur_recuperation
         (id, utilisateur_id, acteur_identite, nonce_hash, operation, motif, preuve_expire_le, request_id, adresse_ip)
       SELECT ?, ?, ?, ?, 'EMETTRE_ACTIVATION_INITIALE', ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM utilisateurs u WHERE u.id = ? AND u.identifiant = 'proprietaire'
           AND u.role = 'PROPRIETAIRE' AND u.statut = 'ACTIF'
           AND u.doit_changer_mot_de_passe = 1 AND u.code_activation_recuperation_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM recuperations_acces_proprietaire r
             WHERE r.utilisateur_id = u.id AND r.terminee_le IS NULL AND r.revoquee_le IS NULL)
       )`,
    ).bind(idPreuve, cible.id, demande.identite, demande.preuve.empreinteNonce, demande.motif,
      demande.preuve.expireLe, c.get("requestId"), adresseIp(c.req.raw), cible.id),
    c.env.DB.prepare(
      `INSERT INTO recuperations_acces_proprietaire
         (id, utilisateur_id, preuve_emission_id, activation_expire_le,
          etat_activation_precedent_capture_le, empreinte_activation_precedente,
          expiration_activation_precedente, empreinte_mot_de_passe_precedente,
          secret_mfa_temporaire_precedent, changement_mot_de_passe_precedent,
          mfa_actif_precedent)
       SELECT ?, u.id, ?, ?, datetime('now'), u.code_activation_hash,
              u.code_activation_expire_le, u.mot_de_passe_hash,
              u.double_facteur_secret_temporaire, u.doit_changer_mot_de_passe,
              u.double_facteur_actif
       FROM utilisateurs u
       WHERE u.id = ? AND u.identifiant = 'proprietaire'
         AND EXISTS (SELECT 1 FROM preuves_operateur_recuperation p
           WHERE p.id = ? AND p.operation = 'EMETTRE_ACTIVATION_INITIALE')`,
    ).bind(idRecuperation, idPreuve, expirationActivation, cible.id, idPreuve),
    c.env.DB.prepare(
      `UPDATE utilisateurs
       SET code_activation_hash = ?, code_activation_expire_le = ?, code_activation_recuperation_id = ?,
           modifie_le = datetime('now')
       WHERE id = ? AND identifiant = 'proprietaire' AND role = 'PROPRIETAIRE' AND statut = 'ACTIF'
         AND doit_changer_mot_de_passe = 1 AND code_activation_recuperation_id IS NULL
         AND EXISTS (
           SELECT 1 FROM recuperations_acces_proprietaire r
           WHERE r.id = ? AND r.utilisateur_id = utilisateurs.id
             AND r.etat_activation_precedent_capture_le IS NOT NULL
             AND r.empreinte_activation_precedente IS code_activation_hash
             AND r.expiration_activation_precedente IS code_activation_expire_le
             AND r.empreinte_mot_de_passe_precedente IS mot_de_passe_hash
             AND r.secret_mfa_temporaire_precedent IS double_facteur_secret_temporaire
             AND r.changement_mot_de_passe_precedent = doit_changer_mot_de_passe
             AND r.mfa_actif_precedent = double_facteur_actif
         )`,
    ).bind(empreinteCode, expirationActivation, idRecuperation, cible.id, idRecuperation),
    c.env.DB.prepare(
      `UPDATE sessions SET revoquee = 1
       WHERE utilisateur_id = ? AND revoquee = 0
         AND EXISTS (SELECT 1 FROM recuperations_acces_proprietaire WHERE id = ?)`,
    ).bind(cible.id, idRecuperation),
    c.env.DB.prepare(
      `UPDATE defis_mfa SET consomme = 1
       WHERE utilisateur_id = ? AND consomme = 0
         AND EXISTS (SELECT 1 FROM recuperations_acces_proprietaire WHERE id = ?)`,
       ).bind(cible.id, idRecuperation),
    c.env.DB.prepare(
      `UPDATE recuperations_acces_proprietaire SET emission_confirmee_le = datetime('now')
       WHERE id = ? AND utilisateur_id = ? AND emission_confirmee_le IS NULL`,
    ).bind(idRecuperation, cible.id),
  ];
  definirEtapeDiagnosticRecuperation(c, "TRANSACTION_D1");
  try {
    const resultats = await c.env.DB.batch(instructions);
    if ((resultats[0]?.meta.changes ?? 0) < 1 || (resultats[1]?.meta.changes ?? 0) < 1
      || (resultats[2]?.meta.changes ?? 0) < 1 || (resultats[5]?.meta.changes ?? 0) < 1) {
      journaliserEchecRecuperation(
        c.get("diagnosticRecuperation"),
        "RECUPERATION_NOMBRE_LIGNES_INATTENDU",
      );
      return c.json({ erreur: "La récupération n’a pas pu être appliquée au compte propriétaire." }, 409);
    }
  } catch (erreur) {
    journaliserEchecRecuperation(
      c.get("diagnosticRecuperation"),
      "RECUPERATION_TRANSACTION_D1_ECHOUEE",
      erreur,
    );
    return c.json({ erreur: "La preuve a déjà été utilisée ou la récupération n’a pas pu être appliquée." }, 409);
  }

  definirEtapeDiagnosticRecuperation(c, "PREPARATION_REPONSE");
  return c.json({
    compte: "proprietaire",
    code_activation: codeActivation,
    expire_le: expirationActivation,
    usage_unique: true,
  }, 201);
});

routesAuth.post("/recuperation-proprietaire/revoquer", middlewareDiagnosticRecuperation, csrfPreAuthMiddleware, async (c) => {
  const demande = await verifierDemandeRecuperation(c, "REVOQUER_ACTIVATION_INITIALE");
  if (demande instanceof Response) return demande;

  const cible = await c.env.DB.prepare(
    `SELECT id FROM utilisateurs WHERE id = 'usr-proprietaire' AND identifiant = 'proprietaire'
       AND role = 'PROPRIETAIRE' AND statut = 'ACTIF'`,
  ).first<{ id: string }>();
  if (!cible) return c.json({ erreur: "Le compte propriétaire n’est pas disponible pour cette récupération." }, 409);
  const recuperation = await c.env.DB.prepare(
    `SELECT id, etat_activation_precedent_capture_le, emission_confirmee_le
     FROM recuperations_acces_proprietaire
     WHERE utilisateur_id = ? AND terminee_le IS NULL AND revoquee_le IS NULL
     ORDER BY cree_le DESC LIMIT 1`,
  ).bind(cible.id).first<{ id: string; etat_activation_precedent_capture_le: string | null; emission_confirmee_le: string | null }>();
  if (!recuperation) return c.json({ erreur: "Aucune activation initiale en attente ne peut être révoquée." }, 409);
  if (!recuperation.etat_activation_precedent_capture_le || !recuperation.emission_confirmee_le) {
    return c.json({ erreur: "L’état initial de cette activation ne peut pas être restauré de manière sûre." }, 409);
  }

  const idPreuve = crypto.randomUUID();
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO preuves_operateur_recuperation
           (id, utilisateur_id, acteur_identite, nonce_hash, operation, motif, preuve_expire_le, request_id, adresse_ip)
         SELECT ?, ?, ?, ?, 'REVOQUER_ACTIVATION_INITIALE', ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM recuperations_acces_proprietaire
           WHERE id = ? AND utilisateur_id = ? AND terminee_le IS NULL AND revoquee_le IS NULL
             AND etat_activation_precedent_capture_le IS NOT NULL AND emission_confirmee_le IS NOT NULL
         )`,
      ).bind(idPreuve, cible.id, demande.identite, demande.preuve.empreinteNonce, demande.motif,
        demande.preuve.expireLe, c.get("requestId"), adresseIp(c.req.raw), recuperation.id, cible.id),
      c.env.DB.prepare(
        `UPDATE recuperations_acces_proprietaire
         SET revoquee_le = datetime('now'), preuve_revocation_id = ?
         WHERE id = ? AND utilisateur_id = ? AND terminee_le IS NULL AND revoquee_le IS NULL
           AND EXISTS (SELECT 1 FROM preuves_operateur_recuperation WHERE id = ? AND operation = 'REVOQUER_ACTIVATION_INITIALE')`,
      ).bind(idPreuve, recuperation.id, cible.id, idPreuve),
      c.env.DB.prepare(
        `UPDATE utilisateurs SET
           code_activation_hash = (
             SELECT CASE
               WHEN r.empreinte_activation_precedente IS NOT NULL
                 AND (r.expiration_activation_precedente IS NULL
                   OR datetime(r.expiration_activation_precedente) > datetime('now'))
               THEN r.empreinte_activation_precedente ELSE NULL END
             FROM recuperations_acces_proprietaire r WHERE r.id = ?
           ),
           code_activation_expire_le = (
             SELECT CASE
               WHEN r.empreinte_activation_precedente IS NOT NULL
                 AND (r.expiration_activation_precedente IS NULL
                   OR datetime(r.expiration_activation_precedente) > datetime('now'))
               THEN r.expiration_activation_precedente ELSE NULL END
             FROM recuperations_acces_proprietaire r WHERE r.id = ?
           ),
           code_activation_recuperation_id = NULL,
           mot_de_passe_hash = (SELECT r.empreinte_mot_de_passe_precedente FROM recuperations_acces_proprietaire r WHERE r.id = ?),
           doit_changer_mot_de_passe = (SELECT r.changement_mot_de_passe_precedent FROM recuperations_acces_proprietaire r WHERE r.id = ?),
           double_facteur_secret_temporaire = (SELECT r.secret_mfa_temporaire_precedent FROM recuperations_acces_proprietaire r WHERE r.id = ?),
           modifie_le = datetime('now')
         WHERE id = ? AND statut = 'ACTIF' AND role = 'PROPRIETAIRE'
           AND double_facteur_actif = (SELECT r.mfa_actif_precedent FROM recuperations_acces_proprietaire r WHERE r.id = ?)
           AND EXISTS (
             SELECT 1 FROM recuperations_acces_proprietaire r
             WHERE r.id = ? AND r.utilisateur_id = utilisateurs.id AND r.revoquee_le IS NOT NULL
               AND r.etat_activation_precedent_capture_le IS NOT NULL
               AND (utilisateurs.code_activation_recuperation_id = r.id
                 OR (r.jeton_consomme_le IS NOT NULL AND utilisateurs.code_activation_recuperation_id IS NULL))
           )`,
      ).bind(recuperation.id, recuperation.id, recuperation.id, recuperation.id, recuperation.id,
        cible.id, recuperation.id, recuperation.id),
      c.env.DB.prepare(
        `UPDATE sessions SET revoquee = 1
         WHERE recuperation_id = ? AND revoquee = 0
           AND EXISTS (SELECT 1 FROM recuperations_acces_proprietaire WHERE id = ? AND revoquee_le IS NOT NULL)`,
      ).bind(recuperation.id, recuperation.id),
      c.env.DB.prepare(
        `UPDATE defis_mfa SET consomme = 1
         WHERE recuperation_id = ? AND consomme = 0
           AND EXISTS (SELECT 1 FROM recuperations_acces_proprietaire WHERE id = ? AND revoquee_le IS NOT NULL)`,
       ).bind(recuperation.id, recuperation.id),
      c.env.DB.prepare(
        `UPDATE recuperations_acces_proprietaire SET revocation_confirmee_le = datetime('now')
         WHERE id = ? AND utilisateur_id = ? AND revoquee_le IS NOT NULL AND revocation_confirmee_le IS NULL`,
      ).bind(recuperation.id, cible.id),
      c.env.DB.prepare(
        `UPDATE recuperations_acces_proprietaire
         SET empreinte_activation_precedente = NULL,
             empreinte_mot_de_passe_precedente = NULL,
             secret_mfa_temporaire_precedent = NULL
         WHERE id = ? AND utilisateur_id = ? AND revocation_confirmee_le IS NOT NULL`,
      ).bind(recuperation.id, cible.id),
    ]);
    if ((resultats[0]?.meta.changes ?? 0) < 1 || (resultats[1]?.meta.changes ?? 0) < 1
      || (resultats[2]?.meta.changes ?? 0) < 1 || (resultats[5]?.meta.changes ?? 0) < 1
      || (resultats[6]?.meta.changes ?? 0) < 1) {
      return c.json({ erreur: "L’activation n’a pas pu être révoquée; elle a peut-être déjà été traitée." }, 409);
    }
  } catch {
    return c.json({ erreur: "La preuve a déjà été utilisée ou la révocation n’a pas pu être appliquée." }, 409);
  }
  return c.json({ revoquee: true });
});

routesAuth.post("/connexion", csrfPreAuthMiddleware, async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const resultat = schemaConnexion.safeParse(corps);
  if (!resultat.success) {
    return c.json({ erreur: resultat.error.issues[0]?.message ?? "Les informations de connexion sont invalides." }, 400);
  }

  const { identifiant, mot_de_passe } = resultat.data;
  const utilisateur = await c.env.DB.prepare(
    `SELECT u.id, u.identifiant, u.nom_complet,
            CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE' ELSE u.role END AS role,
            u.province_id, u.mot_de_passe_hash,
            u.code_activation_hash, u.code_activation_expire_le, u.code_activation_recuperation_id,
            u.doit_changer_mot_de_passe, u.statut, u.verrouille_jusqua,
            u.double_facteur_secret, u.double_facteur_actif
     FROM utilisateurs u LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
     WHERE (u.identifiant = ? OR lower(trim(u.courriel)) = lower(?))
       AND (cc.id IS NULL OR cc.statut <> 'SUSPENDU') LIMIT 1`,
  )
    .bind(identifiant, identifiant)
    .first<LigneConnexion>();

  const verrouActif = utilisateur?.statut === "VERROUILLE" && (
    utilisateur.verrouille_jusqua === null ||
    Date.parse(`${utilisateur.verrouille_jusqua.replace(" ", "T")}Z`) > Date.now()
  );
  const activationInitiale = utilisateur?.doit_changer_mot_de_passe === 1;
  const empreinteAttendue = activationInitiale ? utilisateur?.code_activation_hash : utilisateur?.mot_de_passe_hash;
  const motDePasseValide = utilisateur && empreinteAttendue
    ? await verifierMotDePasse(mot_de_passe, empreinteAttendue)
    : false;
  const activationNonExpiree = !activationInitiale || activationInitialeValide(utilisateur ?? null);
  if (!utilisateur || utilisateur.statut === "SUSPENDU" || verrouActif || !motDePasseValide || !activationNonExpiree) {
    const motif = !utilisateur ? "IDENTIFIANT_INCONNU" : verrouActif ? "COMPTE_VERROUILLE" : utilisateur.statut === "SUSPENDU" ? "COMPTE_SUSPENDU" : "MOT_DE_PASSE_INVALIDE";
    await enregistrerEchecConnexion(c, utilisateur, identifiant, motif);
    return c.json({ erreur: "Identifiant ou mot de passe incorrect, ou compte temporairement indisponible." }, 401);
  }

  const jetonSession = genererJetonAleatoire();
  const empreinteJeton = await hacherJeton(jetonSession);
  const jetonCsrf = c.req.header("X-CSRF-Token");
  if (!jetonCsrf) return c.json({ erreur: "La vérification de sécurité a échoué." }, 403);
  const authentificationMfaObligatoire = utilisateur.role === "PROPRIETAIRE"
    || utilisateur.role === "ADMIN_CENTRAL" || utilisateur.role === "CONSULTATION_INSTITUTIONNELLE";
  if (authentificationMfaObligatoire && utilisateur.double_facteur_actif === 1) {
    if (!utilisateur.double_facteur_secret || !c.env.CLE_CHIFFREMENT_MFA) {
      return c.json({ erreur: "La vérification multifacteur n’est pas disponible pour ce compte." }, 503);
    }
    const jetonDefi = genererJetonAleatoire();
    const expirationDefi = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, "");
    const idDefi = crypto.randomUUID();
    const empreinteDefi = await hacherJeton(jetonDefi);
    const journalDefi = creerInstructionAudit(c.env.DB, {
      utilisateur: {
        id: utilisateur.id,
        identifiant: utilisateur.identifiant,
        nom_complet: utilisateur.nom_complet,
        role: utilisateur.role,
        province_id: utilisateur.province_id,
        doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe,
        statut: utilisateur.statut,
      },
      action: "DEFI_MFA_CREE",
      entiteType: "AUTHENTIFICATION_MFA",
      entiteId: idDefi,
      adresseIp: adresseIp(c.req.raw),
      requestId: c.get("requestId"),
    });
    if (activationInitiale) {
      const empreinteActivation = utilisateur.code_activation_hash;
      if (!empreinteActivation) return c.json({ erreur: "Le code d’activation est invalide ou expiré." }, 401);
      const instructionsDefi = [
        c.env.DB.prepare(
          `INSERT INTO defis_mfa (id, utilisateur_id, jeton_hash, expire_le, activation_initiale, recuperation_id)
           SELECT ?, id, ?, ?, 1, code_activation_recuperation_id
           FROM utilisateurs
           WHERE id = ? AND statut = 'ACTIF' AND double_facteur_actif = 1
             AND code_activation_hash = ?
             AND (code_activation_expire_le > datetime('now')
               OR (code_activation_expire_le IS NULL AND code_activation_recuperation_id IS NULL))`,
        ).bind(idDefi, empreinteDefi, expirationDefi, utilisateur.id, empreinteActivation),
        c.env.DB.prepare(
          `UPDATE utilisateurs SET code_activation_hash = NULL, code_activation_expire_le = NULL,
               code_activation_recuperation_id = NULL, tentatives_echouees = 0, verrouille_jusqua = NULL,
               derniere_connexion = datetime('now'), modifie_le = datetime('now')
            WHERE id = ? AND code_activation_hash = ?
              AND (code_activation_expire_le > datetime('now')
                OR (code_activation_expire_le IS NULL AND code_activation_recuperation_id IS NULL))
             AND EXISTS (SELECT 1 FROM defis_mfa WHERE id = ? AND activation_initiale = 1)`,
        ).bind(utilisateur.id, empreinteActivation, idDefi),
        c.env.DB.prepare(
          `UPDATE recuperations_acces_proprietaire
           SET jeton_consomme_le = datetime('now'), defi_mfa_id = ?
           WHERE id = ? AND utilisateur_id = ? AND jeton_consomme_le IS NULL
             AND EXISTS (SELECT 1 FROM defis_mfa WHERE id = ? AND recuperation_id = recuperations_acces_proprietaire.id)`,
        ).bind(idDefi, utilisateur.code_activation_recuperation_id, utilisateur.id, idDefi),
        c.env.DB.prepare(
          `INSERT INTO journaux_audit (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, adresse_ip, request_id)
           SELECT ?, ?, ?, ?, 'DEFI_MFA_CREE', 'AUTHENTIFICATION_MFA', ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM defis_mfa WHERE id = ?)`
        ).bind(crypto.randomUUID(), utilisateur.id, utilisateur.role, utilisateur.province_id, idDefi, adresseIp(c.req.raw), c.get("requestId"), idDefi),
      ];
      try {
        const resultats = await c.env.DB.batch(instructionsDefi);
        if (resultats[0]?.meta.changes !== 1 || resultats[1]?.meta.changes !== 1) {
          return c.json({ erreur: "Le code d’activation a déjà été utilisé ou a expiré." }, 401);
        }
      } catch {
        return c.json({ erreur: "Le code d’activation a déjà été utilisé ou a expiré." }, 401);
      }
    } else {
      const instructionDefi = c.env.DB.prepare(
        `INSERT INTO defis_mfa (id, utilisateur_id, jeton_hash, expire_le) VALUES (?, ?, ?, ?)`,
      ).bind(idDefi, utilisateur.id, empreinteDefi, expirationDefi);
      await c.env.DB.batch([instructionDefi, journalDefi]);
    }
    c.header("Set-Cookie", cookieDefiMfa(jetonDefi, c.env.ENVIRONMENT));
    c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
    return c.json({ mfa_requis: true, expire_dans_secondes: 300 });
  }
  if (activationInitiale) {
    const empreinteActivation = utilisateur.code_activation_hash;
    if (!empreinteActivation) return c.json({ erreur: "Le code d’activation est invalide ou expiré." }, 401);
    const idSessionActivation = crypto.randomUUID();
    const expirationSqlite = expirationSessionActivation();
    const expirationIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const sessionActivation = c.env.DB.prepare(
      `INSERT INTO sessions
         (id, utilisateur_id, jeton_hash, jeton_csrf, adresse_ip, agent_utilisateur, expire_le, mfa_verifiee, activation_initiale, recuperation_id)
       SELECT ?, u.id, ?, ?, ?, ?, ?, ?, 1, u.code_activation_recuperation_id
       FROM utilisateurs u
       WHERE u.id = ? AND u.statut = 'ACTIF' AND u.doit_changer_mot_de_passe = 1
          AND u.code_activation_hash = ?
          AND (u.code_activation_expire_le > datetime('now')
            OR (u.code_activation_expire_le IS NULL AND u.code_activation_recuperation_id IS NULL))`,
    ).bind(idSessionActivation, empreinteJeton, jetonCsrf, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
      expirationSqlite, authentificationMfaObligatoire ? 0 : 1, utilisateur.id, empreinteActivation);
    const consommerActivation = c.env.DB.prepare(
      `UPDATE utilisateurs SET code_activation_hash = NULL, code_activation_expire_le = NULL,
           code_activation_recuperation_id = NULL, tentatives_echouees = 0, verrouille_jusqua = NULL,
           derniere_connexion = datetime('now'), modifie_le = datetime('now')
        WHERE id = ? AND code_activation_hash = ?
          AND (code_activation_expire_le > datetime('now')
            OR (code_activation_expire_le IS NULL AND code_activation_recuperation_id IS NULL))
         AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND activation_initiale = 1)`,
    ).bind(utilisateur.id, empreinteActivation, idSessionActivation);
    const lierRecuperation = c.env.DB.prepare(
      `UPDATE recuperations_acces_proprietaire
       SET jeton_consomme_le = datetime('now'), session_id = ?
       WHERE id = ? AND utilisateur_id = ? AND jeton_consomme_le IS NULL
         AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND recuperation_id = recuperations_acces_proprietaire.id)`,
    ).bind(idSessionActivation, utilisateur.code_activation_recuperation_id, utilisateur.id, idSessionActivation);
    const evenementActivation = c.env.DB.prepare(
      `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, adresse_ip, agent_utilisateur, request_id)
       SELECT ?, ?, ?, 1, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND activation_initiale = 1)`,
    ).bind(crypto.randomUUID(), identifiant, utilisateur.id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
      c.get("requestId"), idSessionActivation);
    const auditActivation = c.env.DB.prepare(
      `INSERT INTO journaux_audit (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, adresse_ip, request_id)
       SELECT ?, ?, ?, ?, 'ACTIVATION_INITIALE_DEBUTEE', 'UTILISATEUR', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND activation_initiale = 1)`,
    ).bind(crypto.randomUUID(), utilisateur.id, utilisateur.role, utilisateur.province_id, utilisateur.id, adresseIp(c.req.raw), c.get("requestId"), idSessionActivation);
    try {
      const resultats = await c.env.DB.batch([
        sessionActivation,
        consommerActivation,
        lierRecuperation,
        evenementActivation,
        auditActivation,
      ]);
      if (resultats[0]?.meta.changes !== 1 || resultats[1]?.meta.changes !== 1) {
        return c.json({ erreur: "Le code d’activation a déjà été utilisé ou a expiré." }, 401);
      }
    } catch {
      return c.json({ erreur: "Le code d’activation a déjà été utilisé ou a expiré." }, 401);
    }
    c.header("Set-Cookie", cookieSession(jetonSession, c.env.ENVIRONMENT, 15 * 60), { append: true });
    c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
    return c.json({
      utilisateur: {
        id: utilisateur.id,
        identifiant: utilisateur.identifiant,
        nom_complet: utilisateur.nom_complet,
        role: utilisateur.role,
        province_id: utilisateur.province_id,
        doit_changer_mot_de_passe: true,
        double_facteur_actif: utilisateur.double_facteur_actif === 1,
        mfa_setup_requis: authentificationMfaObligatoire && utilisateur.double_facteur_actif !== 1,
        activation_initiale: true,
      },
      expire_le: expirationIso,
    });
  }
  const idSession = crypto.randomUUID();
  const expireLe = new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000).toISOString();
  const expireLeBaseDonnees = expireLe.replace("T", " ").replace(/\.\d{3}Z$/u, "");

  const ouvertureSession = c.env.DB.prepare(
    `INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, adresse_ip, agent_utilisateur, expire_le, mfa_verifiee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(idSession, utilisateur.id, empreinteJeton, jetonCsrf, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
    expireLeBaseDonnees, authentificationMfaObligatoire ? 0 : 1);
  const reinitialisationTentatives = c.env.DB.prepare(
    `UPDATE utilisateurs SET tentatives_echouees = 0, verrouille_jusqua = NULL, statut = 'ACTIF',
       derniere_connexion = datetime('now'), modifie_le = datetime('now') WHERE id = ?`,
  ).bind(utilisateur.id);
  const evenement = c.env.DB.prepare(
    `INSERT INTO evenements_connexion
     (id, identifiant_tente, utilisateur_id, succes, adresse_ip, agent_utilisateur, request_id)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), identifiant, utilisateur.id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
    c.get("requestId"));
  const journal = creerInstructionAudit(c.env.DB, {
    utilisateur: {
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nom_complet: utilisateur.nom_complet,
      role: utilisateur.role,
      province_id: utilisateur.province_id,
      doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe,
      statut: "ACTIF",
    },
    action: "CONNEXION_REUSSIE",
    entiteType: "UTILISATEUR",
    entiteId: utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
    requestId: c.get("requestId"),
  });
  await c.env.DB.batch([ouvertureSession, reinitialisationTentatives, evenement, journal]);

  c.header("Set-Cookie", cookieSession(jetonSession, c.env.ENVIRONMENT), { append: true });
  c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
  return c.json({
    utilisateur: {
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nom_complet: utilisateur.nom_complet,
      role: utilisateur.role,
      province_id: utilisateur.province_id,
      doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe === 1,
      double_facteur_actif: utilisateur.double_facteur_actif === 1,
      mfa_setup_requis: authentificationMfaObligatoire && utilisateur.double_facteur_actif !== 1,
    },
    expire_le: expireLe,
  });
});

routesAuth.get("/session", authMiddleware, (c) => {
  const { utilisateur } = c.get("session");
  return c.json({
    utilisateur: {
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nom_complet: utilisateur.nom_complet,
      courriel: utilisateur.courriel ?? null,
      telephone: utilisateur.telephone ?? null,
      role: utilisateur.role,
      province_id: utilisateur.province_id,
      doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe === 1,
      double_facteur_actif: utilisateur.double_facteur_actif === 1,
      statut: utilisateur.statut,
      institution: utilisateur.institution ?? null,
      fonction: utilisateur.fonction ?? null,
      perimetre_consultation: utilisateur.perimetre_consultation ?? null,
      provinces_autorisees: utilisateur.provinces_autorisees ?? [],
    },
    expire_le: c.get("session").expire_le,
  });
});

routesAuth.post("/changer-mot-de-passe-initial", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (session.utilisateur.doit_changer_mot_de_passe !== 1) {
    return c.json({ erreur: "Aucun changement initial de mot de passe n’est requis." }, 409);
  }

  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const resultat = schemaChangementMotDePasseInitial.safeParse(corps);
  if (!resultat.success) {
    return c.json({ erreur: resultat.error.issues[0]?.message ?? "Le nouveau mot de passe est invalide." }, 400);
  }

  const empreinte = await hacherMotDePasse(resultat.data.nouveau_mot_de_passe);
  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = NULL,
       code_activation_expire_le = NULL, code_activation_recuperation_id = NULL,
       doit_changer_mot_de_passe = 0, tentatives_echouees = 0, verrouille_jusqua = NULL,
       modifie_le = datetime('now') WHERE id = ? AND doit_changer_mot_de_passe = 1`,
  ).bind(empreinte, session.utilisateur.id);
  const reponseAudit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur,
    action: "CHANGEMENT_MOT_DE_PASSE_INITIAL",
    entiteType: "UTILISATEUR",
    entiteId: session.utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
    requestId: c.get("requestId"),
    donneesApres: JSON.stringify({ doit_changer_mot_de_passe: false }),
  });
  const invalidationAutresSessions = c.env.DB.prepare(
    `UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND id <> ? AND revoquee = 0`,
  ).bind(session.utilisateur.id, session.id);
  const terminerActivationSiSecondFacteurValide = c.env.DB.prepare(
    `UPDATE sessions SET activation_initiale = CASE
       WHEN EXISTS (
         SELECT 1 FROM utilisateurs u
         WHERE u.id = sessions.utilisateur_id
           AND (u.role = 'DELEGUE_PROVINCIAL' OR (u.role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL') AND u.double_facteur_actif = 1 AND sessions.mfa_verifiee = 1)
             OR (EXISTS (SELECT 1 FROM comptes_consultation cc WHERE cc.utilisateur_id = u.id AND cc.statut IN ('INVITE', 'ACTIF'))
               AND u.double_facteur_actif = 1 AND sessions.mfa_verifiee = 1))
       ) THEN 0 ELSE activation_initiale END
     WHERE id = ? AND utilisateur_id = ? AND revoquee = 0`,
  ).bind(session.id, session.utilisateur.id);
  const journalRecuperation = c.env.DB.prepare(
    `UPDATE recuperations_acces_proprietaire
     SET mot_de_passe_change_le = datetime('now'),
         terminee_le = CASE
           WHEN EXISTS (
             SELECT 1 FROM sessions s INNER JOIN utilisateurs u ON u.id = s.utilisateur_id
             WHERE s.id = ? AND s.mfa_verifiee = 1 AND u.double_facteur_actif = 1
           ) THEN datetime('now') ELSE terminee_le END
     WHERE id = ? AND utilisateur_id = ? AND session_id = ? AND revoquee_le IS NULL AND terminee_le IS NULL`,
  ).bind(session.id, session.recuperation_id, session.utilisateur.id, session.id);
  const nettoyerInstantaneRecuperationTerminee = c.env.DB.prepare(
    `UPDATE recuperations_acces_proprietaire
     SET empreinte_activation_precedente = NULL,
         empreinte_mot_de_passe_precedente = NULL,
         secret_mfa_temporaire_precedent = NULL
     WHERE id = ? AND terminee_le IS NOT NULL AND emission_confirmee_le IS NOT NULL`,
  ).bind(session.recuperation_id);
  await c.env.DB.batch([
    miseAJour,
    invalidationAutresSessions,
    terminerActivationSiSecondFacteurValide,
    journalRecuperation,
    nettoyerInstantaneRecuperationTerminee,
    reponseAudit,
  ]);
  return c.json({ message: "Votre mot de passe a été modifié avec succès." });
});

routesAuth.post("/deconnexion", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  const jeton = lireJetonSession(c.req.raw);
  if (jeton) {
    const empreinte = await hacherJeton(jeton);
    const revoquer = c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE id = ? AND jeton_hash = ?").bind(session.id, empreinte);
    const audit = creerInstructionAudit(c.env.DB, {
      utilisateur: session.utilisateur,
      action: "DECONNEXION",
      entiteType: "SESSION",
      entiteId: session.id,
      adresseIp: adresseIp(c.req.raw),
      requestId: c.get("requestId"),
    });
    await c.env.DB.batch([revoquer, audit]);
  }
  c.header("Set-Cookie", effacerCookieSession(c.env.ENVIRONMENT));
  c.header("Set-Cookie", effacerCookieCsrf(c.env.ENVIRONMENT), { append: true });
  return c.json({ message: "Votre session est terminée." });
});

routesAuth.get("/mfa/statut", authMiddleware, (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role === "DELEGUE_PROVINCIAL") return c.json({ requis: false, actif: false });
  return c.json({
    requis: true,
    actif: c.get("session").double_facteur_actif === 1,
    session_verifiee: c.get("session").mfa_verifiee === 1,
  });
});

routesAuth.post("/mfa/initialiser", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (!c.env.CLE_CHIFFREMENT_MFA) return c.json({ erreur: "La configuration de sécurité MFA est indisponible." }, 503);
  if (session.utilisateur.role === "DELEGUE_PROVINCIAL" || session.double_facteur_actif === 1 || session.mfa_verifiee === 1) {
    return c.json({ erreur: "La configuration MFA n’est pas disponible pour cette session." }, 409);
  }
  const secret = genererSecretTotp();
  let secretChiffre: string;
  try {
    secretChiffre = await chiffrerSecretTotp(secret, c.env.CLE_CHIFFREMENT_MFA);
  } catch {
    return c.json({ erreur: "La configuration de chiffrement MFA est invalide." }, 503);
  }
  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs SET double_facteur_secret_temporaire = ?, modifie_le = datetime('now')
     WHERE id = ? AND role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL') AND double_facteur_actif = 0`,
  ).bind(secretChiffre, session.utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur,
    action: "INITIALISATION_MFA",
    entiteType: "AUTHENTIFICATION_MFA",
    entiteId: session.utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
    requestId: c.get("requestId"),
  });
  const resultats = await c.env.DB.batch([miseAJour, audit]);
  if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "La configuration MFA a déjà été activée ou modifiée." }, 409);
  return c.json({
    secret_totp: secret,
    uri_provisionnement: uriProvisionnementTotp(secret, session.utilisateur.identifiant),
    algorithme: "SHA1",
    chiffres: 6,
    periode_secondes: 30,
  });
});

routesAuth.post("/mfa/confirmer", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (!c.env.CLE_CHIFFREMENT_MFA || session.utilisateur.role === "DELEGUE_PROVINCIAL" || session.double_facteur_actif === 1) {
    return c.json({ erreur: "La confirmation MFA n’est pas disponible pour cette session." }, 409);
  }
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const code = typeof corps === "object" && corps !== null && "code" in corps && typeof Reflect.get(corps, "code") === "string"
    ? Reflect.get(corps, "code") as string
    : "";
  const secretLigne = await c.env.DB.prepare(
    "SELECT double_facteur_secret_temporaire FROM utilisateurs WHERE id = ? AND double_facteur_actif = 0",
  ).bind(session.utilisateur.id).first<{ double_facteur_secret_temporaire: string | null }>();
  if (!secretLigne?.double_facteur_secret_temporaire) return c.json({ erreur: "Initialisez d’abord le dispositif MFA." }, 409);
  let secret: string;
  try {
    secret = await dechiffrerSecretTotp(secretLigne.double_facteur_secret_temporaire, c.env.CLE_CHIFFREMENT_MFA);
  } catch {
    return c.json({ erreur: "Le secret temporaire MFA ne peut pas être vérifié." }, 503);
  }
  const compteur = await verifierCodeTotp(secret, code);
  if (compteur === null) return c.json({ erreur: "Le code de vérification est invalide ou expiré." }, 400);

  const codesRecuperation = genererCodesRecuperation();
  const empreintes = await Promise.all(codesRecuperation.map((codeRecuperation) => hacherJeton(normaliserCodeRecuperation(codeRecuperation))));
  const identifiantOperation = creerCodeOperation();
  const utiliserCompteur = c.env.DB.prepare(
    "INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)",
  ).bind(session.utilisateur.id, compteur, identifiantOperation);
  const activer = c.env.DB.prepare(
    `UPDATE utilisateurs SET double_facteur_secret = double_facteur_secret_temporaire,
       double_facteur_secret_temporaire = NULL, double_facteur_actif = 1, modifie_le = datetime('now')
     WHERE id = ? AND double_facteur_actif = 0 AND double_facteur_secret_temporaire = ?`,
  ).bind(session.utilisateur.id, secretLigne.double_facteur_secret_temporaire);
  const validerSession = c.env.DB.prepare(
    `UPDATE sessions SET mfa_verifiee = 1,
       activation_initiale = CASE
         WHEN EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND doit_changer_mot_de_passe = 0) THEN 0
         ELSE activation_initiale END
     WHERE id = ? AND utilisateur_id = ? AND mfa_verifiee = 0
       AND EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND double_facteur_actif = 1
         AND double_facteur_secret = ?)`,
  ).bind(session.utilisateur.id, session.id, session.utilisateur.id, session.utilisateur.id, secretLigne.double_facteur_secret_temporaire);
  const activerCompteConsultation = c.env.DB.prepare(`UPDATE comptes_consultation SET statut = 'ACTIF', modifie_le = datetime('now')
    WHERE utilisateur_id = ? AND statut = 'INVITE' AND EXISTS (
      SELECT 1 FROM utilisateurs WHERE id = ? AND double_facteur_actif = 1 AND doit_changer_mot_de_passe = 0)`)
    .bind(session.utilisateur.id, session.utilisateur.id);
  const terminerRecuperation = c.env.DB.prepare(
    `UPDATE recuperations_acces_proprietaire
     SET terminee_le = datetime('now')
     WHERE id = ? AND utilisateur_id = ? AND session_id = ?
       AND mot_de_passe_change_le IS NOT NULL AND terminee_le IS NULL AND revoquee_le IS NULL
       AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND activation_initiale = 0 AND mfa_verifiee = 1)`,
  ).bind(session.recuperation_id, session.utilisateur.id, session.id, session.id);
  const nettoyerInstantaneRecuperationTerminee = c.env.DB.prepare(
    `UPDATE recuperations_acces_proprietaire
     SET empreinte_activation_precedente = NULL,
         empreinte_mot_de_passe_precedente = NULL,
         secret_mfa_temporaire_precedent = NULL
     WHERE id = ? AND terminee_le IS NOT NULL AND emission_confirmee_le IS NOT NULL`,
  ).bind(session.recuperation_id);
  const insererRecuperation = c.env.DB.prepare(
    `INSERT INTO codes_recuperation_mfa (empreinte_code, utilisateur_id)
     SELECT json_extract(value, '$.empreinte'), ? FROM json_each(?)
     WHERE EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND double_facteur_actif = 1)
       AND NOT EXISTS (SELECT 1 FROM codes_recuperation_mfa WHERE utilisateur_id = ?)`
  ).bind(session.utilisateur.id, JSON.stringify(empreintes.map((empreinte) => ({ empreinte }))), session.utilisateur.id, session.utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur,
    action: "ACTIVATION_MFA",
    entiteType: "AUTHENTIFICATION_MFA",
    entiteId: session.utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
    requestId: c.get("requestId"),
    donneesApres: JSON.stringify({ actif: true, nombre_codes_recuperation: codesRecuperation.length }),
  });
  const resultats = await c.env.DB.batch([
    utiliserCompteur,
    activer,
    validerSession,
    activerCompteConsultation,
    terminerRecuperation,
    nettoyerInstantaneRecuperationTerminee,
    insererRecuperation,
    audit,
  ]);
  if (resultats[1]?.meta.changes !== 1 || resultats[2]?.meta.changes !== 1) {
    return c.json({ erreur: "La configuration MFA a déjà été confirmée dans cette session." }, 409);
  }
  return c.json({ actif: true, codes_recuperation: codesRecuperation });
});

routesAuth.post("/mfa/verifier", csrfPreAuthMiddleware, async (c) => {
  const jetonDefi = lireCookie(c.req.raw, "sigad_mfa_challenge");
  if (!jetonDefi) return c.json({ erreur: "Le défi MFA a expiré. Recommencez la connexion." }, 401);
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const code = typeof corps === "object" && corps !== null && "code" in corps && typeof Reflect.get(corps, "code") === "string"
    ? (Reflect.get(corps, "code") as string).trim()
    : "";
  const defi = await c.env.DB.prepare(
    `SELECT d.id, d.utilisateur_id, d.tentatives, d.activation_initiale, d.recuperation_id,
            u.identifiant, u.nom_complet,
            CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE' ELSE u.role END AS role,
            u.province_id, u.doit_changer_mot_de_passe, u.double_facteur_secret,
            u.double_facteur_actif, u.statut
     FROM defis_mfa d INNER JOIN utilisateurs u ON u.id = d.utilisateur_id
     LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
     WHERE d.jeton_hash = ? AND d.expire_le > datetime('now') AND d.consomme = 0
       AND d.tentatives < 5 AND u.statut = 'ACTIF' AND u.double_facteur_actif = 1
       AND (cc.id IS NULL OR cc.statut <> 'SUSPENDU')`,
  ).bind(await hacherJeton(jetonDefi)).first<{
    id: string; utilisateur_id: string; tentatives: number; activation_initiale: number; recuperation_id: string | null;
    identifiant: string; nom_complet: string;
    role: "PROPRIETAIRE" | "ADMIN_CENTRAL" | "CONSULTATION_INSTITUTIONNELLE"; province_id: string | null; doit_changer_mot_de_passe: number;
    double_facteur_secret: string | null; double_facteur_actif: number; statut: "ACTIF";
  }>();
  if (!defi || !defi.double_facteur_secret || !c.env.CLE_CHIFFREMENT_MFA) {
    return c.json({ erreur: "Le défi MFA est invalide, expiré ou déjà utilisé." }, 401);
  }
  const jetonCsrf = c.req.header("X-CSRF-Token");
  if (!jetonCsrf) return c.json({ erreur: "La vérification de sécurité a échoué." }, 403);

  let secret: string;
  try {
    secret = await dechiffrerSecretTotp(defi.double_facteur_secret, c.env.CLE_CHIFFREMENT_MFA);
  } catch {
    return c.json({ erreur: "Le dispositif MFA associé au compte est indisponible." }, 503);
  }
  const compteurTotp = await verifierCodeTotp(secret, code);
  const operationId = crypto.randomUUID();
  const idSession = crypto.randomUUID();
  const jetonSession = genererJetonAleatoire();
  const empreinteSession = await hacherJeton(jetonSession);
  const expiration = defi.activation_initiale === 1
    ? expirationSessionActivation()
    : dateSqlite(new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000));
  const authentification = compteurTotp === null
    ? await hacherJeton(normaliserCodeRecuperation(code))
    : null;

  try {
    const instructions: D1PreparedStatement[] = [];
    if (compteurTotp !== null) {
      instructions.push(c.env.DB.prepare(
        "DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = ? AND compteur < ?",
      ).bind(defi.utilisateur_id, compteurTotp - 1));
      instructions.push(c.env.DB.prepare(
        "INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)",
      ).bind(defi.utilisateur_id, compteurTotp, operationId));
    } else {
      instructions.push(c.env.DB.prepare(
        `UPDATE codes_recuperation_mfa SET utilise_le = datetime('now'), operation_id = ?
         WHERE utilisateur_id = ? AND empreinte_code = ? AND utilise_le IS NULL`,
      ).bind(operationId, defi.utilisateur_id, authentification));
    }
    instructions.push(c.env.DB.prepare(
      `INSERT INTO sessions
         (id, utilisateur_id, jeton_hash, jeton_csrf, adresse_ip, agent_utilisateur, expire_le, mfa_verifiee, activation_initiale, recuperation_id)
       SELECT ?, d.utilisateur_id, ?, ?, ?, ?, ?, 1, d.activation_initiale, d.recuperation_id FROM defis_mfa d
       WHERE d.id = ? AND d.consomme = 0 AND d.expire_le > datetime('now') AND d.tentatives < 5
         AND EXISTS (SELECT 1 FROM utilisateurs u WHERE u.id = d.utilisateur_id AND u.statut = 'ACTIF' AND u.double_facteur_actif = 1)
         AND EXISTS (SELECT 1 FROM ${compteurTotp === null ? "codes_recuperation_mfa" : "compteurs_totp_utilises"} c
           WHERE c.utilisateur_id = d.utilisateur_id AND c.operation_id = ?)`
    ).bind(idSession, empreinteSession, jetonCsrf, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null, expiration, defi.id, operationId));
    instructions.push(c.env.DB.prepare(
      "UPDATE defis_mfa SET consomme = 1 WHERE id = ? AND consomme = 0 AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)",
    ).bind(defi.id, idSession));
    instructions.push(c.env.DB.prepare(
      `UPDATE recuperations_acces_proprietaire
       SET session_id = ?, defi_mfa_id = NULL, jeton_consomme_le = COALESCE(jeton_consomme_le, datetime('now'))
       WHERE id = ? AND utilisateur_id = ? AND defi_mfa_id = ? AND terminee_le IS NULL AND revoquee_le IS NULL
         AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND recuperation_id = recuperations_acces_proprietaire.id)`
    ).bind(idSession, defi.recuperation_id, defi.utilisateur_id, defi.id, idSession));
    instructions.push(c.env.DB.prepare(
      `UPDATE utilisateurs SET tentatives_echouees = 0, verrouille_jusqua = NULL, derniere_connexion = datetime('now'), modifie_le = datetime('now')
       WHERE id = ? AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)`,
    ).bind(defi.utilisateur_id, idSession));
    instructions.push(c.env.DB.prepare(
      `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, adresse_ip, agent_utilisateur, request_id)
       SELECT ?, ?, ?, 1, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?)`,
    ).bind(crypto.randomUUID(), defi.identifiant, defi.utilisateur_id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
      c.get("requestId"), idSession));
    instructions.push(c.env.DB.prepare(
      `INSERT INTO journaux_audit (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, adresse_ip, request_id)
       SELECT ?, ?, ?, ?, 'CONNEXION_MFA_REUSSIE', 'AUTHENTIFICATION_MFA', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?)`
    ).bind(crypto.randomUUID(), defi.utilisateur_id, defi.role, defi.province_id, defi.id, adresseIp(c.req.raw), c.get("requestId"), idSession));
    const resultats = await c.env.DB.batch(instructions);
    const indexSession = compteurTotp === null ? 1 : 2;
    if (resultats[indexSession]?.meta.changes !== 1) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE defis_mfa SET tentatives = tentatives + 1 WHERE id = ? AND consomme = 0 AND tentatives < 5").bind(defi.id),
        c.env.DB.prepare(
          `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, motif_echec, adresse_ip, agent_utilisateur, request_id)
           VALUES (?, ?, ?, 0, 'MFA_INVALIDE_OU_REUTILISE', ?, ?, ?)`
        ).bind(crypto.randomUUID(), defi.identifiant, defi.utilisateur_id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
          c.get("requestId")),
      ]);
      return c.json({ erreur: "Le code MFA est invalide, expiré ou déjà utilisé." }, 401);
    }
  } catch {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE defis_mfa SET tentatives = tentatives + 1 WHERE id = ? AND consomme = 0 AND tentatives < 5").bind(defi.id),
      c.env.DB.prepare(
        `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, motif_echec, adresse_ip, agent_utilisateur, request_id)
         VALUES (?, ?, ?, 0, 'MFA_INVALIDE_OU_REUTILISE', ?, ?, ?)`
      ).bind(crypto.randomUUID(), defi.identifiant, defi.utilisateur_id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
        c.get("requestId")),
    ]);
    return c.json({ erreur: "Le code MFA est invalide, expiré ou déjà utilisé." }, 401);
  }

  const expireLe = defi.activation_initiale === 1
    ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
    : new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000).toISOString();
  c.header("Set-Cookie", cookieSession(
    jetonSession,
    c.env.ENVIRONMENT,
    defi.activation_initiale === 1 ? 15 * 60 : DELAI_SESSION_HEURES * 60 * 60,
  ));
  c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
  c.header("Set-Cookie", effacerCookieDefiMfa(c.env.ENVIRONMENT), { append: true });
  return c.json({
    utilisateur: {
      id: defi.utilisateur_id,
      identifiant: defi.identifiant,
      nom_complet: defi.nom_complet,
      role: defi.role,
      province_id: defi.province_id,
      doit_changer_mot_de_passe: defi.doit_changer_mot_de_passe === 1,
      double_facteur_actif: true,
    },
    expire_le: expireLe,
  });
});

routesAuth.post("/mfa/reinitialiser/:utilisateurId", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (session.utilisateur.role !== "PROPRIETAIRE" || session.mfa_verifiee !== 1 || !c.env.CLE_CHIFFREMENT_MFA) {
    return c.json({ erreur: "Seul le propriétaire authentifié par MFA peut réinitialiser un autre compte." }, 403);
  }
  const cible = c.req.param("utilisateurId");
  if (cible === session.utilisateur.id) return c.json({ erreur: "La réinitialisation du compte propriétaire exige une procédure de récupération hors bande." }, 409);
  let corps: unknown;
  try { corps = await c.req.json(); } catch { return c.json({ erreur: "Le corps de la requête est invalide." }, 400); }
  const code = typeof corps === "object" && corps !== null && "code" in corps && typeof Reflect.get(corps, "code") === "string"
    ? Reflect.get(corps, "code") as string : "";
  const proprietaire = await c.env.DB.prepare("SELECT double_facteur_secret FROM utilisateurs WHERE id = ? AND role = 'PROPRIETAIRE' AND double_facteur_actif = 1")
    .bind(session.utilisateur.id).first<{ double_facteur_secret: string | null }>();
  if (!proprietaire?.double_facteur_secret) return c.json({ erreur: "Le dispositif MFA du propriétaire est indisponible." }, 503);
  const secret = await dechiffrerSecretTotp(proprietaire.double_facteur_secret, c.env.CLE_CHIFFREMENT_MFA);
  const compteur = await verifierCodeTotp(secret, code);
  if (compteur === null) return c.json({ erreur: "Le code MFA du propriétaire est invalide ou expiré." }, 401);
  const idOperation = crypto.randomUUID();
  const cibleExistante = await c.env.DB.prepare("SELECT id FROM utilisateurs WHERE id = ? AND role = 'ADMIN_CENTRAL'").bind(cible).first<{ id: string }>();
  if (!cibleExistante) return c.json({ erreur: "Le compte central demandé est introuvable." }, 404);
  const resultats = await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)").bind(session.utilisateur.id, compteur, idOperation),
    c.env.DB.prepare(
      `UPDATE utilisateurs SET double_facteur_secret = NULL, double_facteur_secret_temporaire = NULL,
       double_facteur_actif = 0, modifie_le = datetime('now') WHERE id = ? AND role = 'ADMIN_CENTRAL'`,
    ).bind(cible),
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(cible),
    c.env.DB.prepare("DELETE FROM codes_recuperation_mfa WHERE utilisateur_id = ?").bind(cible),
    c.env.DB.prepare("DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = ?").bind(cible),
    c.env.DB.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = ? AND consomme = 0").bind(cible),
    c.env.DB.prepare(
      `INSERT INTO journaux_audit (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, adresse_ip, donnees_apres, request_id)
       VALUES (?, ?, 'PROPRIETAIRE', NULL, 'REINITIALISATION_MFA', 'UTILISATEUR', ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), session.utilisateur.id, cible, adresseIp(c.req.raw), JSON.stringify({ double_facteur_actif: false }), c.get("requestId")),
  ]);
  if (resultats[1]?.meta.changes !== 1) return c.json({ erreur: "Le compte a changé pendant la réinitialisation." }, 409);
  return c.json({ message: "Le dispositif MFA du compte central a été réinitialisé. La prochaine connexion exigera une nouvelle configuration." });
});

export { routesAuth };
