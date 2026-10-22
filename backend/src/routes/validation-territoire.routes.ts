import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { listerPage } from "../services/territoire.service";
import type { PageTerritoriale } from "../../../shared/types/territoire";
import { schemaDecisionTerritoriale } from "../../../shared/validations/territoire";

interface PropositionTerritoriale {
  type_entite: "LOCALITE" | "QUARTIER" | "SITE_HUMANITAIRE";
  id: string;
  province_id: string;
  nom: string;
  detail: string;
  propose_par: string | null;
  cree_le: string;
}

interface LigneProposition {
  id: string;
  province_id: string;
  nom: string;
  statut_validation: string;
  donnees: Record<string, unknown>;
}

const routesValidationTerritoire = new Hono<EnvironnementApplication>();

function lirePagination(c: Context<EnvironnementApplication>): { limite: number; decalage: number } | null {
  const parametres = new URL(c.req.url).searchParams;
  const limite = parametres.has("limite") ? Number(parametres.get("limite")) : 25;
  const decalage = parametres.has("decalage") ? Number(parametres.get("decalage")) : 0;
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100 || !Number.isSafeInteger(decalage) || decalage < 0) return null;
  return { limite, decalage };
}

function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

async function lireProposition(
  db: D1Database,
  type: PropositionTerritoriale["type_entite"],
  id: string,
): Promise<LigneProposition | null> {
  if (type === "LOCALITE") {
    const ligne = await db.prepare(
      `SELECT id, province_id, nom, statut_validation, departement_id, sous_prefecture_id,
              commune_id, canton_id, type_localite, mode_decoupage_urbain, source_documentation, propose_par
       FROM localites WHERE id = ?`,
    ).bind(id).first<{
      id: string;
      province_id: string;
      nom: string;
      statut_validation: string;
      departement_id: string;
      sous_prefecture_id: string | null;
      commune_id: string | null;
      canton_id: string | null;
      type_localite: string;
      mode_decoupage_urbain: string;
      source_documentation: string | null;
      propose_par: string | null;
    }>();
    return ligne ? { id: ligne.id, province_id: ligne.province_id, nom: ligne.nom, statut_validation: ligne.statut_validation, donnees: ligne } : null;
  }
  if (type === "QUARTIER") {
    const ligne = await db.prepare(
      `SELECT q.id, l.province_id, q.nom, q.statut_validation, q.localite_id,
              q.arrondissement_id, q.possede_carres, q.propose_par
       FROM quartiers q INNER JOIN localites l ON l.id = q.localite_id WHERE q.id = ?`,
    ).bind(id).first<{
      id: string;
      province_id: string;
      nom: string;
      statut_validation: string;
      localite_id: string;
      arrondissement_id: string | null;
      possede_carres: number;
      propose_par: string | null;
    }>();
    return ligne ? { id: ligne.id, province_id: ligne.province_id, nom: ligne.nom, statut_validation: ligne.statut_validation, donnees: ligne } : null;
  }
  const ligne = await db.prepare(
    `SELECT id, province_id, nom, statut_validation, departement_id, sous_prefecture_id,
            commune_id, localite_proche_id, categorie_site, propose_par
     FROM sites_humanitaires WHERE id = ?`,
  ).bind(id).first<{
    id: string;
    province_id: string;
    nom: string;
    statut_validation: string;
    departement_id: string;
    sous_prefecture_id: string | null;
    commune_id: string | null;
    localite_proche_id: string | null;
    categorie_site: string;
    propose_par: string | null;
  }>();
  return ligne ? { id: ligne.id, province_id: ligne.province_id, nom: ligne.nom, statut_validation: ligne.statut_validation, donnees: ligne } : null;
}

routesValidationTerritoire.get("/referentiel-territorial/propositions", async (c) => {
  const pagination = lirePagination(c);
  if (!pagination) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  const union = `
    SELECT 'LOCALITE' AS type_entite, id, province_id, nom, type_localite AS detail, propose_par, cree_le
      FROM localites WHERE statut_validation = 'PROPOSE'
    UNION ALL
    SELECT 'QUARTIER' AS type_entite, q.id, l.province_id, q.nom, 'QUARTIER' AS detail, q.propose_par,
           COALESCE((SELECT MAX(j.cree_le) FROM journaux_audit j
                     WHERE j.action = 'PROPOSITION_QUARTIER' AND j.entite_type = 'QUARTIER' AND j.entite_id = q.id), l.cree_le) AS cree_le
      FROM quartiers q INNER JOIN localites l ON l.id = q.localite_id WHERE q.statut_validation = 'PROPOSE'
    UNION ALL
    SELECT 'SITE_HUMANITAIRE' AS type_entite, id, province_id, nom, categorie_site AS detail, propose_par, cree_le
      FROM sites_humanitaires WHERE statut_validation = 'PROPOSE'`;
  const page: PageTerritoriale<PropositionTerritoriale> = await listerPage(
    c.env.DB,
    `SELECT type_entite, id, province_id, nom, detail, propose_par, cree_le FROM (${union})
     ORDER BY cree_le DESC, type_entite, id LIMIT ? OFFSET ?`,
    `SELECT (SELECT COUNT(*) FROM localites WHERE statut_validation = 'PROPOSE')
          + (SELECT COUNT(*) FROM quartiers WHERE statut_validation = 'PROPOSE')
          + (SELECT COUNT(*) FROM sites_humanitaires WHERE statut_validation = 'PROPOSE') AS total`,
    [],
    pagination,
  );
  return c.json(page);
});

routesValidationTerritoire.post("/referentiel-territorial/propositions/:type/:id/decision", async (c) => {
  const valeurType = c.req.param("type").toUpperCase();
  if (valeurType !== "LOCALITE" && valeurType !== "QUARTIER" && valeurType !== "SITE_HUMANITAIRE") {
    return c.json({ erreur: "Le type de proposition territoriale est invalide." }, 400);
  }
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const resultat = schemaDecisionTerritoriale.safeParse(corps);
  if (!resultat.success) {
    return c.json({ erreur: resultat.error.issues[0]?.message ?? "La décision territoriale est invalide." }, 400);
  }
  const id = c.req.param("id");
  const proposition = await lireProposition(c.env.DB, valeurType, id);
  if (!proposition) return c.json({ erreur: "La proposition territoriale est introuvable." }, 404);
  if (proposition.statut_validation !== "PROPOSE") return c.json({ erreur: "Cette proposition a déjà été traitée." }, 409);

  const { decision, source_officielle: sourceOfficielle, date_effet: dateEffet } = resultat.data;
  const statutEnregistre = valeurType === "SITE_HUMANITAIRE" && decision === "REJETE" ? "FERME" : decision;
  const miseAJour = valeurType === "LOCALITE"
    ? c.env.DB.prepare(
      `UPDATE localites SET statut_validation = ?,
         valide_par = CASE WHEN ? = 'VALIDE' THEN ? ELSE valide_par END
       WHERE id = ? AND statut_validation = 'PROPOSE'`,
    ).bind(statutEnregistre, statutEnregistre, c.get("utilisateur").id, id)
    : valeurType === "QUARTIER"
      ? c.env.DB.prepare(
        "UPDATE quartiers SET statut_validation = ? WHERE id = ? AND statut_validation = 'PROPOSE'",
      ).bind(statutEnregistre, id)
      : c.env.DB.prepare(
        "UPDATE sites_humanitaires SET statut_validation = ? WHERE id = ? AND statut_validation = 'PROPOSE'",
      ).bind(statutEnregistre, id);

  const insertionHistorique = c.env.DB.prepare(
    `INSERT INTO historique_decoupages
     (id, entite_type, entite_id, type_modification, anciennes_valeurs, nouvelles_valeurs,
      source_officielle, date_effet, auteur_id)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`,
  ).bind(
    crypto.randomUUID(),
    valeurType,
    id,
    decision === "VALIDE" ? "VALIDATION_PROPOSITION" : "REJET_PROPOSITION",
    JSON.stringify({ statut_validation: "PROPOSE", ...proposition.donnees }),
    JSON.stringify({ statut_validation: statutEnregistre, decision }),
    sourceOfficielle,
    dateEffet,
    c.get("utilisateur").id,
  );
  const utilisateur = c.get("utilisateur");
  const audit = c.env.DB.prepare(
    `INSERT INTO journaux_audit
     (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id,
      donnees_avant, donnees_apres, adresse_ip)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`,
  ).bind(
    crypto.randomUUID(),
    utilisateur.id,
    utilisateur.role,
    utilisateur.province_id,
    decision === "VALIDE" ? "VALIDATION_REFERENTIEL_TERRITORIAL" : "REJET_REFERENTIEL_TERRITORIAL",
    valeurType,
    id,
    JSON.stringify(proposition.donnees),
    JSON.stringify({ statut_validation: statutEnregistre, source_officielle: sourceOfficielle, date_effet: dateEffet }),
    adresseIp(c.req.raw),
  );
  const resultats = await c.env.DB.batch([miseAJour, insertionHistorique, audit]);
  if ((resultats[0]?.meta.changes ?? 0) !== 1) return c.json({ erreur: "La proposition a été traitée simultanément par un autre utilisateur." }, 409);
  return c.json({ id, type_entite: valeurType, statut_validation: statutEnregistre, message: "La décision a été enregistrée et documentée." });
});

export { routesValidationTerritoire };
