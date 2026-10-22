import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { STATUTS_UTILISATEUR } from "../../../shared/constantes/roles";
import type { EntreeJournalAudit, ReponsePagination, UtilisateurAdmin } from "../../../shared/types/authentification";
import { schemaStatutUtilisateur } from "../../../shared/validations/authentification";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { genererJetonAleatoire, hacherMotDePasse } from "../services/cryptographie.service";

const routesProprietaire = new Hono<EnvironnementApplication>();

function paginationDepuisRequete(c: Context<EnvironnementApplication>): { limite: number; decalage: number } | null {
  const limiteTexte = c.req.query("limite");
  const decalageTexte = c.req.query("decalage");
  const limite = limiteTexte === undefined ? 25 : Number(limiteTexte);
  const decalage = decalageTexte === undefined ? 0 : Number(decalageTexte);
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100 || !Number.isSafeInteger(decalage) || decalage < 0) return null;
  return { limite, decalage };
}

function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

routesProprietaire.get("/utilisateurs", async (c) => {
  const pagination = paginationDepuisRequete(c);
  if (!pagination) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);

  const [liste, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, identifiant, nom_complet, role, province_id, statut,
              tentatives_echouees, derniere_connexion, cree_le
       FROM utilisateurs ORDER BY role ASC, identifiant ASC LIMIT ? OFFSET ?`,
    )
      .bind(pagination.limite, pagination.decalage)
      .all<UtilisateurAdmin>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM utilisateurs").first<{ total: number }>(),
  ]);

  const reponse: ReponsePagination<UtilisateurAdmin> = {
    elements: liste.results,
    total: total?.total ?? 0,
    limite: pagination.limite,
    decalage: pagination.decalage,
  };
  return c.json(reponse);
});

routesProprietaire.get("/audit", async (c) => {
  const pagination = paginationDepuisRequete(c);
  if (!pagination) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);

  const [liste, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, cree_le
       FROM journaux_audit ORDER BY cree_le DESC, id DESC LIMIT ? OFFSET ?`,
    )
      .bind(pagination.limite, pagination.decalage)
      .all<EntreeJournalAudit>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM journaux_audit").first<{ total: number }>(),
  ]);

  const reponse: ReponsePagination<EntreeJournalAudit> = {
    elements: liste.results,
    total: total?.total ?? 0,
    limite: pagination.limite,
    decalage: pagination.decalage,
  };
  return c.json(reponse);
});

routesProprietaire.patch("/utilisateurs/:id/statut", async (c) => {
  const id = c.req.param("id");
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const resultat = schemaStatutUtilisateur.safeParse(corps);
  if (!resultat.success) {
    return c.json({ erreur: resultat.error.issues[0]?.message ?? "Le statut demandé est invalide." }, 400);
  }

  const cible = await c.env.DB.prepare(
    "SELECT id, identifiant, role, statut FROM utilisateurs WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; identifiant: string; role: string; statut: (typeof STATUTS_UTILISATEUR)[number] }>();
  if (!cible) return c.json({ erreur: "Le compte demandé est introuvable." }, 404);
  if (cible.id === c.get("utilisateur").id && resultat.data.statut !== "ACTIF") {
    return c.json({ erreur: "Vous ne pouvez pas suspendre votre propre compte." }, 409);
  }

  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs SET statut = ?, tentatives_echouees = 0, verrouille_jusqua = NULL,
       modifie_le = datetime('now') WHERE id = ?`,
  ).bind(resultat.data.statut, id);
  const instructions = [miseAJour];
  if (resultat.data.statut === "SUSPENDU") {
    instructions.push(
      c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(id),
    );
  }
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: c.get("utilisateur"),
    action: resultat.data.statut === "SUSPENDU" ? "SUSPENSION_COMPTE" : "REACTIVATION_COMPTE",
    entiteType: "UTILISATEUR",
    entiteId: cible.id,
    adresseIp: adresseIp(c.req.raw),
    donneesAvant: JSON.stringify({ statut: cible.statut }),
    donneesApres: JSON.stringify({ statut: resultat.data.statut }),
  });
  instructions.push(audit);
  await c.env.DB.batch(instructions);
  return c.json({ message: "Le statut du compte a été mis à jour." });
});

routesProprietaire.post("/utilisateurs/:id/reinitialiser-acces", async (c) => {
  const id = c.req.param("id");
  const cible = await c.env.DB.prepare(
    "SELECT id, identifiant, nom_complet, role, province_id, statut, doit_changer_mot_de_passe FROM utilisateurs WHERE id = ?",
  )
    .bind(id)
    .first<{
      id: string;
      identifiant: string;
      nom_complet: string;
      role: "PROPRIETAIRE" | "ADMIN_CENTRAL" | "DELEGUE_PROVINCIAL";
      province_id: string | null;
      statut: "ACTIF" | "SUSPENDU" | "VERROUILLE";
      doit_changer_mot_de_passe: number;
    }>();
  if (!cible) return c.json({ erreur: "Le compte demandé est introuvable." }, 404);
  if (cible.statut === "SUSPENDU") return c.json({ erreur: "Réactivez le compte avant de réinitialiser son accès." }, 409);
  if (cible.id === c.get("utilisateur").id) return c.json({ erreur: "Vous ne pouvez pas réinitialiser votre propre accès." }, 409);

  const codeActivation = genererJetonAleatoire(24);
  const empreinteCode = await hacherMotDePasse(codeActivation);
  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?, doit_changer_mot_de_passe = 1,
       statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL, modifie_le = datetime('now')
     WHERE id = ?`,
  ).bind(empreinteCode, empreinteCode, id);
  const revoquerSessions = c.env.DB.prepare(
    "UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0",
  ).bind(id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: c.get("utilisateur"),
    action: "REINITIALISATION_ACCES",
    entiteType: "UTILISATEUR",
    entiteId: id,
    adresseIp: adresseIp(c.req.raw),
    donneesAvant: JSON.stringify({ doit_changer_mot_de_passe: cible.doit_changer_mot_de_passe === 1 }),
    donneesApres: JSON.stringify({ doit_changer_mot_de_passe: true }),
  });
  await c.env.DB.batch([miseAJour, revoquerSessions, audit]);
  return c.json({ message: "Le code d’activation a été généré. Transmettez-le à l’utilisateur par un canal sécurisé.", code_activation: codeActivation });
});

export { routesProprietaire };
