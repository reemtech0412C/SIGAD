import type { UtilisateurSession } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware.ts";
import {
  allouerLotsFefo,
  construireInstructionMouvement,
  creerReference,
  ErreurStock,
  executerOperationIdempotente,
  rejouerOperationIdempotente,
  type EcritureCritique,
  type LotFefoD1,
  type ResultatOperationStock,
} from "./stock.service";
import type {
  CreationApprovisionnementSaisie,
  CreationExpeditionSaisie,
  ReceptionProvincialeSaisie,
  RapprochementApprovisionnementSaisi,
  ClotureApprovisionnementSaisie,
} from "../../../shared/validations/approvisionnements";

const MAX_LOTS_PAR_EXPEDITION = 40;
// Six paramètres SQL par allocation et plafond D1 de 100 paramètres liés par instruction.
const MAX_LIGNES_ALLOCATION = 16;

interface AllocationD1 {
  id: string;
  approvisionnement_id: string;
  destination_id: string;
  province_id: string;
  article_id: string;
  quantite_allouee: number;
  quantite_expediee: number;
  code_article: string;
  decimales_autorisees: number;
}

interface ApprovisionnementD1 {
  id: string;
  reference: string;
  approvisionnement_id?: string;
  destination_id?: string;
  source_articles: "ENTREPOT_CENTRAL" | "FOURNISSEUR_EXTERNE" | "DON_PARTENAIRE";
  partenaire_id: string | null;
  statut: string;
  province_id?: string;
  code_province?: string;
  nom_province?: string;
}

interface ContexteDestinationD1 extends ApprovisionnementD1 {
  destination_id: string;
  province_id: string;
  code_province: string;
  nom_province: string;
}

interface EntrepotD1 {
  id: string;
  province_id: string | null;
  niveau: "CENTRAL" | "PROVINCIAL";
  actif: number;
}

interface LigneExpeditionD1 {
  id: string;
  article_approvisionnement_id: string;
  article_id: string;
  code_article: string;
  designation: string;
  decimales_autorisees: number;
  lot_origine_id: string | null;
  numero_lot_fournisseur: string | null;
  date_peremption: string | null;
  quantite_expediee: number;
}

interface PieceJointeD1 {
  id: string;
  cle_r2: string;
  nom_fichier_original: string;
  type_mime: string;
  taille_octets: number;
  province_id: string | null;
  televerse_par: string;
  entite_liee_id: string;
}

function empreinteStable(valeur: string | Uint8Array): Promise<string> {
  const octets = typeof valeur === "string" ? new TextEncoder().encode(valeur) : valeur;
  const copie = new Uint8Array(octets.byteLength);
  copie.set(octets);
  return crypto.subtle.digest("SHA-256", copie.buffer).then((digest) =>
    Array.from(new Uint8Array(digest), (octet) => octet.toString(16).padStart(2, "0")).join(""),
  );
}

function preparationAudit(
  db: D1Database,
  utilisateur: UtilisateurSession,
  action: string,
  type: string,
  id: string,
  adresseIp: string | null,
  donnees: unknown,
): D1PreparedStatement {
  return creerInstructionAudit(db, {
    utilisateur,
    action,
    entiteType: type,
    entiteId: id,
    adresseIp,
    donneesApres: JSON.stringify(donnees),
  });
}

function ajouterEcriture(
  instructions: EcritureCritique[],
  db: D1Database,
  operation: string,
  sql: string,
  valeurs: readonly (string | number | null)[],
): void {
  instructions.push({ operation, instruction: db.prepare(sql).bind(...valeurs) });
}

function verifierPrecision(quantite: number, decimales: number): boolean {
  const facteur = 10 ** decimales;
  return Math.abs(quantite * facteur - Math.round(quantite * facteur)) < 0.000001;
}

function creerReferenceApprovisionnement(prefixe: string, id: string): string {
  return `${prefixe}-${new Date().getUTCFullYear()}-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

async function verifierPartenaireApprovisionnement(
  db: D1Database,
  source: CreationApprovisionnementSaisie["source_articles"],
  partenaireId: string | null | undefined,
): Promise<void> {
  if (source === "ENTREPOT_CENTRAL") {
    if (partenaireId) throw new ErreurStock("Un approvisionnement du stock central ne doit pas désigner de fournisseur.", 400);
    return;
  }
  if (!partenaireId) throw new ErreurStock("Un fournisseur ou partenaire est obligatoire.", 400);
  const roles = source === "FOURNISSEUR_EXTERNE" ? ["FOURNISSEUR"] : ["DONATEUR", "BAILLEUR_DE_FONDS"];
  const places = roles.map(() => "?").join(", ");
  const partenaire = await db.prepare(
    `SELECT p.id FROM partenaires p
     INNER JOIN roles_partenaires rp ON rp.partenaire_id = p.id
     WHERE p.id = ? AND p.statut_validation = 'VALIDE' AND rp.role IN (${places}) LIMIT 1`,
  ).bind(partenaireId, ...roles).first<{ id: string }>();
  if (!partenaire) throw new ErreurStock("Le partenaire doit être validé et habilité pour l’origine sélectionnée.", 400);
}

export async function creerApprovisionnementCentral(
  db: D1Database,
  utilisateur: UtilisateurSession,
  entree: CreationApprovisionnementSaisie,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; reference: string; statut: "BROUILLON"; nombre_destinations: number; nombre_allocations: number }>> {
  const routeApi = "/api/central/approvisionnements";
  const rejouee = await rejouerOperationIdempotente<{
    id: string; reference: string; statut: "BROUILLON"; nombre_destinations: number; nombre_allocations: number;
  }>({ db, utilisateur, routeApi, cle, chargeUtile: entree });
  if (rejouee) return { ...rejouee, statutHttp: rejouee.statutHttp };

  await verifierPartenaireApprovisionnement(db, entree.source_articles, entree.partenaire_id);
  const provinceIds = entree.destinations.map((destination) => destination.province_id);
  const provinces = await db.prepare(
    `SELECT id FROM provinces WHERE actif = 1 AND id IN (${provinceIds.map(() => "?").join(", ")})`,
  ).bind(...provinceIds).all<{ id: string }>();
  if (provinces.results.length !== provinceIds.length) throw new ErreurStock("Une province cible est introuvable ou inactive.", 400);

  const articleIds = [...new Set(entree.destinations.flatMap((destination) => destination.articles.map((article) => article.article_id)))];
  const articles = await db.prepare(
    `SELECT a.id FROM articles a WHERE a.actif = 1 AND a.id IN (${articleIds.map(() => "?").join(", ")})`,
  ).bind(...articleIds).all<{ id: string }>();
  if (articles.results.length !== articleIds.length) throw new ErreurStock("Un article réparti est introuvable ou inactif.", 400);

  const id = crypto.randomUUID();
  const allocations = entree.destinations.flatMap((destination) => destination.articles.map((article) => ({
    id: crypto.randomUUID(), province_id: destination.province_id, article_id: article.article_id,
    quantite_allouee: article.quantite_allouee,
  })));
  const instructions: EcritureCritique[] = [];
  ajouterEcriture(instructions, db, "la création de l’approvisionnement", `
    INSERT INTO approvisionnements_centraux
      (id, reference, intitule_operation, date_creation, description, source_articles, partenaire_id,
       nature_aide, date_prevue_expedition, instructions, statut, cree_par)
    VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, 'BROUILLON', ?)
  `, [id, entree.reference, entree.intitule_operation, entree.description ?? null,
    entree.source_articles, entree.partenaire_id ?? null, entree.nature_aide,
    entree.date_prevue_expedition ?? null, entree.instructions ?? null, utilisateur.id]);

  const destinationIds = new Map<string, string>();
  for (const destination of entree.destinations) {
    const destinationId = crypto.randomUUID();
    destinationIds.set(destination.province_id, destinationId);
    ajouterEcriture(instructions, db, "la création d’une destination provinciale", `
      INSERT INTO destinations_approvisionnement (id, approvisionnement_id, province_id)
      VALUES (?, ?, ?)
    `, [destinationId, id, destination.province_id]);
  }

  for (let index = 0; index < allocations.length; index += MAX_LIGNES_ALLOCATION) {
    const lot = allocations.slice(index, index + MAX_LIGNES_ALLOCATION);
    const valeurs: (string | number | null)[] = [];
    const groupes = lot.map((allocation) => {
      valeurs.push(
        allocation.id,
        id,
        destinationIds.get(allocation.province_id) ?? null,
        allocation.province_id,
        allocation.article_id,
        allocation.quantite_allouee,
      );
      return "(?, ?, ?, ?, ?, ?)";
    });
    instructions.push({
      operation: "l’enregistrement de la répartition par article",
      changementsAttendus: lot.length,
      instruction: db.prepare(
        `INSERT INTO articles_approvisionnement
          (id, approvisionnement_id, destination_id, province_id, article_id, quantite_allouee)
         VALUES ${groupes.join(", ")}`,
      ).bind(...valeurs),
    });
  }
  instructions.push({
    operation: "l’écriture du journal d’audit",
    instruction: preparationAudit(db, utilisateur, "CREATION_APPROVISIONNEMENT", "APPROVISIONNEMENT_CENTRAL", id, adresseIp, {
      reference: entree.reference, nombre_destinations: entree.destinations.length, nombre_allocations: allocations.length,
    }),
  });

  const corps = {
    id, reference: entree.reference, statut: "BROUILLON" as const,
    nombre_destinations: entree.destinations.length, nombre_allocations: allocations.length,
  };
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle, chargeUtile: entree, statutHttp: 201, corps, instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

export async function validerApprovisionnementCentral(
  db: D1Database,
  utilisateur: UtilisateurSession,
  id: string,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; statut: "VALIDEE" }>> {
  const routeApi = `/api/central/approvisionnements/${id}/validation`;
  const chargeUtile = { approvisionnement_id: id };
  const rejouee = await rejouerOperationIdempotente<{ id: string; statut: "VALIDEE" }>({ db, utilisateur, routeApi, cle, chargeUtile });
  if (rejouee) return { ...rejouee, statutHttp: rejouee.statutHttp };
  const approvisionnement = await db.prepare("SELECT id, statut FROM approvisionnements_centraux WHERE id = ?")
    .bind(id).first<{ id: string; statut: string }>();
  if (!approvisionnement) throw new ErreurStock("Approvisionnement introuvable.", 404);
  if (approvisionnement.statut !== "BROUILLON") throw new ErreurStock("Seul un approvisionnement en brouillon peut être validé.", 409);

  const corps = { id, statut: "VALIDEE" as const };
  const instructions: EcritureCritique[] = [
    {
      operation: "la validation de l’approvisionnement",
      instruction: db.prepare(
        `UPDATE approvisionnements_centraux SET statut = 'VALIDEE', valide_par = ?, date_validation = datetime('now')
         WHERE id = ? AND statut = 'BROUILLON'`,
      ).bind(utilisateur.id, id),
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: preparationAudit(db, utilisateur, "VALIDATION_APPROVISIONNEMENT", "APPROVISIONNEMENT_CENTRAL", id, adresseIp, corps),
    },
  ];
  const resultat = await executerOperationIdempotente({ db, utilisateur, routeApi, cle, chargeUtile, statutHttp: 200, corps, instructions });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

async function lireAllocationsExpedition(
  db: D1Database,
  destinationId: string,
  ids: readonly string[],
): Promise<Map<string, AllocationD1>> {
  const resultats = await db.prepare(
    `SELECT aa.id, aa.approvisionnement_id, aa.destination_id, aa.province_id, aa.article_id,
       aa.quantite_allouee, aa.quantite_expediee, a.code_article, u.decimales_autorisees
     FROM articles_approvisionnement aa
     INNER JOIN articles a ON a.id = aa.article_id
     INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
     WHERE aa.destination_id = ? AND aa.id IN (${ids.map(() => "?").join(", ")}) AND a.actif = 1`,
  ).bind(destinationId, ...ids).all<AllocationD1>();
  return new Map(resultats.results.map((allocation) => [allocation.id, allocation]));
}

export async function creerExpeditionApprovisionnement(
  db: D1Database,
  utilisateur: UtilisateurSession,
  approvisionnementId: string,
  entree: CreationExpeditionSaisie,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; reference_expedition: string; nombre_lignes: number; origine_expedition: string }>> {
  const routeApi = `/api/central/approvisionnements/${approvisionnementId}/expeditions`;
  const rejouee = await rejouerOperationIdempotente<{
    id: string; reference_expedition: string; nombre_lignes: number; origine_expedition: string;
  }>({ db, utilisateur, routeApi, cle, chargeUtile: { approvisionnement_id: approvisionnementId, ...entree } });
  if (rejouee) return { ...rejouee, statutHttp: rejouee.statutHttp };

  const contexte = await db.prepare(
    `SELECT a.id, a.reference, a.source_articles, a.partenaire_id, a.statut,
       d.id AS destination_id, d.province_id, p.code AS code_province, p.nom AS nom_province
     FROM approvisionnements_centraux a
     INNER JOIN destinations_approvisionnement d ON d.approvisionnement_id = a.id
     INNER JOIN provinces p ON p.id = d.province_id
     WHERE a.id = ? AND d.id = ?`,
  ).bind(approvisionnementId, entree.destination_id).first<ContexteDestinationD1>();
  if (!contexte) throw new ErreurStock("Destination introuvable pour cet approvisionnement.", 404);
  if (!["VALIDEE", "EN_EXPEDITION", "PARTIELLEMENT_RECEPTIONNEE", "EN_RAPPROCHEMENT"].includes(contexte.statut)) {
    throw new ErreurStock("L’approvisionnement n’autorise pas de nouvelle expédition dans son état actuel.", 409);
  }
  const origineDirecte = entree.origine_expedition === "LIVRAISON_DIRECTE_FOURNISSEUR";
  if ((contexte.source_articles === "ENTREPOT_CENTRAL") === origineDirecte) {
    throw new ErreurStock("L’origine de l’expédition ne correspond pas à l’approvisionnement.", 400);
  }
  if (origineDirecte && contexte.partenaire_id) {
    await verifierPartenaireApprovisionnement(db, contexte.source_articles, contexte.partenaire_id);
  }

  let entrepot: EntrepotD1 | null = null;
  if (!origineDirecte) {
    entrepot = await db.prepare(
      `SELECT id, province_id, niveau, actif FROM entrepots
       WHERE id = ? AND niveau = 'CENTRAL' AND province_id IS NULL AND actif = 1`,
    ).bind(entree.entrepot_origine_id ?? "").first<EntrepotD1>();
    if (!entrepot) throw new ErreurStock("Entrepôt central introuvable ou inactif.", 404);
  }

  const allocations = await lireAllocationsExpedition(db, contexte.destination_id, entree.lignes.map((ligne) => ligne.article_approvisionnement_id));
  if (allocations.size !== entree.lignes.length) throw new ErreurStock("Une allocation n’appartient pas à la destination ou à un article actif.", 400);
  for (const ligne of entree.lignes) {
    const allocation = allocations.get(ligne.article_approvisionnement_id);
    if (!allocation || allocation.approvisionnement_id !== approvisionnementId) {
      throw new ErreurStock("Une allocation ne correspond pas à cet approvisionnement.", 400);
    }
    if (!verifierPrecision(ligne.quantite_expediee, allocation.decimales_autorisees)) {
      throw new ErreurStock(`La quantité de l’article ${allocation.code_article} dépasse la précision autorisée.`, 400);
    }
    if (allocation.quantite_expediee + ligne.quantite_expediee > allocation.quantite_allouee + 0.000001) {
      throw new ErreurStock(`La quantité demandée dépasse l’allocation restante de l’article ${allocation.code_article}.`, 409);
    }
  }

  const lotsParAllocation = new Map<string, { lot: LotFefoD1; quantite: number }[]>();
  if (entrepot) {
    let nombreLots = 0;
    for (const ligne of entree.lignes) {
      const allocation = allocations.get(ligne.article_approvisionnement_id);
      if (!allocation) throw new ErreurStock("Allocation introuvable.", 400);
      const lots = await db.prepare(
        `SELECT id, numero_lot, entrepot_id, province_id, article_id, source_type,
           source_reference_id, partenaire_bailleur_id, date_peremption, etat_qualite,
           quantite_physique, quantite_reservee
         FROM lots_stock
         WHERE entrepot_id = ? AND province_id IS NULL AND article_id = ?
           AND etat_qualite = 'BON'
           AND (date_peremption IS NULL OR date_peremption >= date('now'))
           AND quantite_physique > quantite_reservee
         ORDER BY CASE WHEN date_peremption IS NULL THEN 1 ELSE 0 END, date_peremption, cree_le, id
         LIMIT 41`,
      ).bind(entrepot.id, allocation.article_id).all<LotFefoD1>();
      const repartition = allouerLotsFefo(lots.results, ligne.quantite_expediee, new Date().toISOString().slice(0, 10));
      nombreLots += repartition.length;
      if (nombreLots > MAX_LOTS_PAR_EXPEDITION) {
        throw new ErreurStock(`Une expédition ne peut mobiliser plus de ${MAX_LOTS_PAR_EXPEDITION} lots. Répartissez-la en opérations distinctes.`, 400);
      }
      lotsParAllocation.set(ligne.article_approvisionnement_id, repartition);
    }
  }

  const soldes = new Map<string, number>();
  if (entrepot) {
    const articlesIds = [...new Set(entree.lignes.map((ligne) => allocations.get(ligne.article_approvisionnement_id)?.article_id ?? ""))];
    const lignesSoldes = await db.prepare(
      `SELECT article_id, quantite_physique FROM soldes_stock
       WHERE entrepot_id = ? AND province_id IS NULL AND article_id IN (${articlesIds.map(() => "?").join(", ")})`,
    ).bind(entrepot.id, ...articlesIds).all<{ article_id: string; quantite_physique: number }>();
    for (const solde of lignesSoldes.results) soldes.set(solde.article_id, solde.quantite_physique);
  }

  const expeditionId = crypto.randomUUID();
  const reference = creerReferenceApprovisionnement("EXP", expeditionId);
  const instructions: EcritureCritique[] = [{
    operation: "la création de l’expédition",
    instruction: db.prepare(
      `INSERT INTO expeditions
        (id, reference_expedition, approvisionnement_id, destination_id, province_destinataire_id,
         date_expedition, origine_expedition, entrepot_origine_id, reference_bordereau,
         transporteur_partenaire_id, informations_transport, cree_par)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      expeditionId, reference, approvisionnementId, contexte.destination_id, contexte.province_id,
      entree.date_expedition, entree.origine_expedition, entrepot?.id ?? null,
      entree.reference_bordereau, entree.transporteur_partenaire_id ?? null,
      entree.informations_transport ?? null, utilisateur.id,
    ),
  }];

  let nombreLignes = 0;
  for (const ligne of entree.lignes) {
    const allocation = allocations.get(ligne.article_approvisionnement_id);
    if (!allocation) throw new ErreurStock("Allocation introuvable.", 400);
    const lots = lotsParAllocation.get(ligne.article_approvisionnement_id);
    const quantites: readonly { lot: LotFefoD1 | null; quantite: number }[] = lots
      ?? [{ lot: null, quantite: ligne.quantite_expediee }];
    for (const repartition of quantites) {
      const ligneId = crypto.randomUUID();
      const lot = repartition.lot;
      ajouterEcriture(instructions, db, "l’enregistrement d’une ligne d’expédition", `
        INSERT INTO lignes_expedition
          (id, expedition_id, article_approvisionnement_id, article_id, lot_origine_id,
           numero_lot_fournisseur, date_peremption, quantite_expediee)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [ligneId, expeditionId, allocation.id, allocation.article_id, lot?.id ?? null,
        origineDirecte ? (ligne.numero_lot_fournisseur ?? null) : null,
        origineDirecte ? (ligne.date_peremption ?? null) : lot?.date_peremption ?? null,
        repartition.quantite]);
      nombreLignes += 1;

      if (lot && entrepot) {
        const avant = soldes.get(allocation.article_id) ?? 0;
        const apres = avant - repartition.quantite;
        ajouterEcriture(instructions, db, "le retrait conditionnel d’un lot central", `
          UPDATE lots_stock
          SET quantite_physique = quantite_physique - ?
          WHERE id = ? AND entrepot_id = ? AND province_id IS NULL AND article_id = ?
            AND etat_qualite = 'BON'
            AND (date_peremption IS NULL OR date_peremption >= date('now'))
            AND quantite_physique = ?
            AND quantite_physique - quantite_reservee >= ?
        `, [repartition.quantite, lot.id, entrepot.id, allocation.article_id, lot.quantite_physique, repartition.quantite]);
        instructions.push({
          operation: "l’écriture du mouvement de sortie d’expédition",
          instruction: construireInstructionMouvement(db, utilisateur, {
            id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
            entrepotId: entrepot.id, provinceId: null, articleId: allocation.article_id,
            lotId: lot.id, type: "SORTIE_EXPEDITION", sens: "MOINS", quantite: repartition.quantite,
            avant, apres, documentType: "EXPEDITION_CENTRALE", documentId: expeditionId,
            motif: `Expédition ${reference} — destination ${contexte.nom_province ?? contexte.province_id}`,
          }),
        });
        soldes.set(allocation.article_id, apres);
      }
    }
  }

  const corps = { id: expeditionId, reference_expedition: reference, nombre_lignes: nombreLignes, origine_expedition: entree.origine_expedition };
  instructions.push({
    operation: "l’écriture du journal d’audit",
    instruction: preparationAudit(db, utilisateur, "CREATION_EXPEDITION_APPROVISIONNEMENT", "EXPEDITION", expeditionId, adresseIp, {
      approvisionnement_id: approvisionnementId, province_destinataire_id: contexte.province_id,
      origine_expedition: entree.origine_expedition, nombre_lignes: nombreLignes,
    }),
  });
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile: { approvisionnement_id: approvisionnementId, ...entree },
    statutHttp: 201, corps, instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

export async function recevoirExpeditionProvinciale(
  db: D1Database,
  utilisateur: UtilisateurSession,
  expeditionId: string,
  provinceSessionId: string,
  entree: ReceptionProvincialeSaisie,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; reference_reception_prov: string; reception_stock_id: string; nombre_lignes: number }>> {
  const routeApi = `/api/provincial/expeditions/${expeditionId}/reception`;
  const rejouee = await rejouerOperationIdempotente<{
    id: string; reference_reception_prov: string; reception_stock_id: string; nombre_lignes: number;
  }>({ db, utilisateur, routeApi, cle, chargeUtile: { expedition_id: expeditionId, ...entree } });
  if (rejouee) return { ...rejouee, statutHttp: rejouee.statutHttp };
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id || utilisateur.province_id !== provinceSessionId) {
    throw new ErreurStock("La province de réception ne correspond pas à la session du délégué.", 403);
  }

  const expedition = await db.prepare(
    `SELECT e.id, e.approvisionnement_id, e.province_destinataire_id, e.reference_expedition,
       a.reference, a.partenaire_id, p.code AS code_province, p.nom AS nom_province,
       w.id AS entrepot_id
     FROM expeditions e
     INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
     INNER JOIN provinces p ON p.id = e.province_destinataire_id
     INNER JOIN entrepots w ON w.id = ? AND w.niveau = 'PROVINCIAL' AND w.actif = 1
       AND w.province_id = e.province_destinataire_id
     WHERE e.id = ? AND e.province_destinataire_id = ? AND e.statut_expedition = 'EN_ROUTE'`,
  ).bind(entree.entrepot_recepteur_id, expeditionId, provinceSessionId).first<ApprovisionnementD1 & {
    expedition_id: string; reference_expedition: string; entrepot_id: string;
  }>();
  if (!expedition) throw new ErreurStock("Expédition introuvable dans votre province ou déjà réceptionnée.", 404);

  const piece = await db.prepare(
    `SELECT id FROM pieces_jointes
     WHERE id = ? AND categorie_document = 'PV_RECEPTION' AND entite_liee_type = 'EXPEDITION'
       AND entite_liee_id = ? AND province_id = ? AND televerse_par = ?`,
  ).bind(entree.pv_piece_jointe_id, expeditionId, provinceSessionId, utilisateur.id).first<{ id: string }>();
  if (!piece) throw new ErreurStock("Le procès-verbal joint est introuvable ou n’appartient pas à cette expédition.", 400);

  const lignesExpedition = await db.prepare(
    `SELECT le.id, le.article_approvisionnement_id, le.article_id, a.code_article, a.designation,
       u.decimales_autorisees, le.lot_origine_id, le.numero_lot_fournisseur, le.date_peremption,
       le.quantite_expediee
     FROM lignes_expedition le
     INNER JOIN articles a ON a.id = le.article_id
     INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
     WHERE le.expedition_id = ? ORDER BY le.id`,
  ).bind(expeditionId).all<LigneExpeditionD1>();
  if (lignesExpedition.results.length === 0 || lignesExpedition.results.length !== entree.lignes.length) {
    throw new ErreurStock("La réception doit traiter une fois chaque ligne de l’expédition.", 400);
  }
  const saisies = new Map(entree.lignes.map((ligne) => [ligne.ligne_expedition_id, ligne]));
  for (const ligne of lignesExpedition.results) {
    const saisie = saisies.get(ligne.id);
    if (!saisie || saisie.quantite_recue_physique > ligne.quantite_expediee + 0.000001) {
      throw new ErreurStock("Une ligne de réception ne correspond pas à l’expédition ou dépasse la quantité envoyée.", 400);
    }
    if (![saisie.quantite_recue_physique, saisie.quantite_acceptee, saisie.quantite_endommagee]
      .every((quantite) => verifierPrecision(quantite, ligne.decimales_autorisees))) {
      throw new ErreurStock(`Les quantités de l’article ${ligne.code_article} dépassent la précision de son unité.`, 400);
    }
  }

  const stockReceptionId = crypto.randomUUID();
  const receptionId = crypto.randomUUID();
  const referenceReception = creerReferenceApprovisionnement(`REC-${expedition.code_province}`, receptionId);
  const referenceStock = creerReference("RST", stockReceptionId);
  const soldes = new Map<string, number>();
  const articleIds = [...new Set(lignesExpedition.results.map((ligne) => ligne.article_id))];
  const soldesAvant = await db.prepare(
    `SELECT article_id, quantite_physique FROM soldes_stock
     WHERE entrepot_id = ? AND province_id = ? AND article_id IN (${articleIds.map(() => "?").join(", ")})`,
  ).bind(entree.entrepot_recepteur_id, provinceSessionId, ...articleIds).all<{ article_id: string; quantite_physique: number }>();
  for (const solde of soldesAvant.results) soldes.set(solde.article_id, solde.quantite_physique);

  const instructions: EcritureCritique[] = [
    {
      operation: "la création de la réception de stock rattachée",
      instruction: db.prepare(
        `INSERT INTO receptions_stock
          (id, reference_reception, entrepot_id, province_id, type_entree, partenaire_id,
           date_reception, numero_bordereau_externe, observations, piece_jointe_id, enregistre_par)
         VALUES (?, ?, ?, ?, 'APPROVISIONNEMENT_CENTRAL', ?, ?, ?, ?, ?, ?)`,
      ).bind(stockReceptionId, referenceStock, entree.entrepot_recepteur_id, provinceSessionId,
        expedition.partenaire_id, entree.date_reception, expedition.reference_expedition,
        entree.observations ?? null, entree.pv_piece_jointe_id, utilisateur.id),
    },
    {
      operation: "la création du procès-verbal de réception provinciale",
      instruction: db.prepare(
        `INSERT INTO receptions_provinciales
          (id, reference_reception_prov, expedition_id, approvisionnement_id, province_id,
           entrepot_recepteur_id, reception_stock_id, date_reception, numero_pv_reception,
           comporte_ecarts, statut_rapprochement, observations, pv_piece_jointe_id, enregistre_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'AUCUN', ?, ?, ?)`,
      ).bind(receptionId, referenceReception, expeditionId, expedition.approvisionnement_id,
        provinceSessionId, entree.entrepot_recepteur_id, stockReceptionId, entree.date_reception,
        entree.numero_pv_reception, entree.observations ?? null, entree.pv_piece_jointe_id, utilisateur.id),
    },
  ];

  for (const ligne of lignesExpedition.results) {
    const saisie = saisies.get(ligne.id);
    if (!saisie) throw new ErreurStock("Ligne d’expédition introuvable dans la réception.", 400);
    const manquante = Math.max(0, ligne.quantite_expediee - saisie.quantite_recue_physique);
    const lotBonId = saisie.quantite_acceptee > 0 ? crypto.randomUUID() : null;
    const lotEndommageId = saisie.quantite_endommagee > 0 ? crypto.randomUUID() : null;
    const numeroLot = ligne.numero_lot_fournisseur
      ?? (ligne.lot_origine_id ? `LOT-${ligne.lot_origine_id.slice(0, 12).toUpperCase()}` : `LOT-${ligne.id.slice(0, 12).toUpperCase()}`);
    const etatBon = ligne.date_peremption && ligne.date_peremption < new Date().toISOString().slice(0, 10) ? "PERIME" : "BON";

    for (const lot of [
      lotBonId ? { id: lotBonId, quantite: saisie.quantite_acceptee, qualite: etatBon, numero: numeroLot } : null,
      lotEndommageId ? { id: lotEndommageId, quantite: saisie.quantite_endommagee, qualite: "ENDOMMAGE", numero: `${numeroLot}-ENDOMMAGE` } : null,
    ]) {
      if (!lot) continue;
      ajouterEcriture(instructions, db, "la création d’un lot reçu", `
        INSERT INTO lots_stock
          (id, numero_lot, article_id, entrepot_id, province_id, source_type, source_reference_id,
           partenaire_bailleur_id, date_peremption, etat_qualite, quantite_initiale,
           quantite_physique, quantite_reservee)
        VALUES (?, ?, ?, ?, ?, 'APPROVISIONNEMENT_CENTRAL', ?, ?, ?, ?, ?, 0, 0)
      `, [lot.id, lot.numero, ligne.article_id, entree.entrepot_recepteur_id, provinceSessionId,
        stockReceptionId, expedition.partenaire_id, ligne.date_peremption, lot.qualite, lot.quantite]);

      const avant = soldes.get(ligne.article_id) ?? 0;
      const apres = avant + lot.quantite;
      ajouterEcriture(instructions, db, "l’ajout conditionnel d’un lot reçu", `
        UPDATE lots_stock SET quantite_physique = quantite_physique + ?
        WHERE id = ? AND quantite_physique = 0 AND quantite_reservee = 0
      `, [lot.quantite, lot.id]);
      instructions.push({
        operation: "l’écriture du mouvement de réception",
        instruction: construireInstructionMouvement(db, utilisateur, {
          id: crypto.randomUUID(), reference: creerReference("MVT", crypto.randomUUID()),
          entrepotId: entree.entrepot_recepteur_id, provinceId: provinceSessionId,
          articleId: ligne.article_id, lotId: lot.id, type: "RECEPTION", sens: "PLUS",
          quantite: lot.quantite, avant, apres, documentType: "RECEPTION_APPROVISIONNEMENT_CENTRAL",
          documentId: receptionId, motif: `Réception ${referenceReception} — ${lot.qualite === "ENDOMMAGE" ? "lot endommagé" : "lot accepté"}`,
        }),
      });
      soldes.set(ligne.article_id, apres);
    }

    const quantitePhysique = saisie.quantite_recue_physique;
    if (quantitePhysique > 0) {
      const lotReception = lotBonId ?? lotEndommageId;
      if (!lotReception) throw new ErreurStock("Un lot reçu est obligatoire pour toute quantité physique positive.", 400);
      ajouterEcriture(instructions, db, "l’enregistrement de la ligne de stock réceptionnée", `
        INSERT INTO lignes_reception
          (id, reception_stock_id, article_id, lot_stock_id, quantite_recue,
           quantite_acceptee, quantite_endommagee, date_peremption)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [crypto.randomUUID(), stockReceptionId, ligne.article_id, lotReception, quantitePhysique,
        saisie.quantite_acceptee, saisie.quantite_endommagee, ligne.date_peremption]);
    }

    ajouterEcriture(instructions, db, "l’enregistrement de la ligne du procès-verbal", `
      INSERT INTO lignes_reception_provinciale
        (id, reception_provinciale_id, ligne_expedition_id, article_id, quantite_expediee,
         quantite_recue_physique, quantite_acceptee, quantite_endommagee, quantite_manquante,
         lot_cree_id, lot_endommage_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [crypto.randomUUID(), receptionId, ligne.id, ligne.article_id, ligne.quantite_expediee,
      saisie.quantite_recue_physique, saisie.quantite_acceptee, saisie.quantite_endommagee,
      manquante, lotBonId, lotEndommageId]);
  }

  const corps = {
    id: receptionId, reference_reception_prov: referenceReception,
    reception_stock_id: stockReceptionId, nombre_lignes: lignesExpedition.results.length,
  };
  instructions.push({
    operation: "l’écriture du journal d’audit",
    instruction: preparationAudit(db, utilisateur, "RECEPTION_PROVINCIALE_APPROVISIONNEMENT", "RECEPTION_PROVINCIALE", receptionId, adresseIp, {
      expedition_id: expeditionId, province_id: provinceSessionId, nombre_lignes: corps.nombre_lignes,
    }),
  });
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile: { expedition_id: expeditionId, ...entree },
    statutHttp: 201, corps, instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

export async function rapprocherEcartsApprovisionnement(
  db: D1Database,
  utilisateur: UtilisateurSession,
  approvisionnementId: string,
  receptionId: string,
  entree: RapprochementApprovisionnementSaisi,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ approvisionnement_id: string; reception_id: string; nombre_justifications: number }>> {
  const routeApi = `/api/central/approvisionnements/${approvisionnementId}/receptions/${receptionId}/rapprochement`;
  const chargeUtile = { approvisionnement_id: approvisionnementId, reception_id: receptionId, ...entree };
  const rejouee = await rejouerOperationIdempotente<{
    approvisionnement_id: string; reception_id: string; nombre_justifications: number;
  }>({ db, utilisateur, routeApi, cle, chargeUtile });
  if (rejouee) return { ...rejouee, statutHttp: rejouee.statutHttp };
  const reception = await db.prepare(
    `SELECT r.id, r.statut_rapprochement FROM receptions_provinciales r
     WHERE r.id = ? AND r.approvisionnement_id = ?`,
  ).bind(receptionId, approvisionnementId).first<{ id: string; statut_rapprochement: string }>();
  if (!reception) throw new ErreurStock("Réception introuvable dans cet approvisionnement.", 404);
  if (reception.statut_rapprochement !== "ECART_OUVERT") throw new ErreurStock("Cette réception ne comporte aucun écart ouvert.", 409);

  const instructions: EcritureCritique[] = [];
  for (const justification of entree.justifications) {
    const ligne = await db.prepare(
      `SELECT id FROM lignes_reception_provinciale
       WHERE id = ? AND reception_provinciale_id = ?
         AND abs(quantite_acceptee - quantite_expediee) > 0.000001
         AND justification_ecart IS NULL`,
    ).bind(justification.ligne_reception_id, receptionId).first<{ id: string }>();
    if (!ligne) throw new ErreurStock("Une ligne d’écart est déjà justifiée ou n’appartient pas à cette réception.", 409);
    instructions.push({
      operation: "l’enregistrement de la justification d’écart",
      instruction: db.prepare(
        `UPDATE lignes_reception_provinciale SET justification_ecart = ?
         WHERE id = ? AND reception_provinciale_id = ? AND justification_ecart IS NULL
           AND abs(quantite_acceptee - quantite_expediee) > 0.000001`,
      ).bind(justification.justification_ecart, ligne.id, receptionId),
    });
    instructions.push({
      operation: "l’audit de la justification d’écart",
      instruction: preparationAudit(db, utilisateur, "RAPPROCHEMENT_ECART_APPROVISIONNEMENT", "LIGNE_RECEPTION_PROVINCIALE", ligne.id, adresseIp, {
        reception_id: receptionId, justification_ecart: justification.justification_ecart,
      }),
    });
  }
  const corps = { approvisionnement_id: approvisionnementId, reception_id: receptionId, nombre_justifications: entree.justifications.length };
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle, chargeUtile, statutHttp: 200, corps, instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

export async function cloturerApprovisionnementCentral(
  db: D1Database,
  utilisateur: UtilisateurSession,
  approvisionnementId: string,
  entree: ClotureApprovisionnementSaisie,
  cle: string,
  adresseIp: string | null,
): Promise<ResultatOperationStock<{ id: string; statut: "CLOTUREE" }>> {
  const routeApi = `/api/central/approvisionnements/${approvisionnementId}/cloture`;
  const rejouee = await rejouerOperationIdempotente<{ id: string; statut: "CLOTUREE" }>({
    db, utilisateur, routeApi, cle, chargeUtile: { approvisionnement_id: approvisionnementId, ...entree },
  });
  if (rejouee) return { ...rejouee, statutHttp: rejouee.statutHttp };
  const approvisionnement = await db.prepare("SELECT id, statut FROM approvisionnements_centraux WHERE id = ?")
    .bind(approvisionnementId).first<{ id: string; statut: string }>();
  if (!approvisionnement) throw new ErreurStock("Approvisionnement introuvable.", 404);
  if (!["VALIDEE", "RECEPTIONNEE"].includes(approvisionnement.statut)) {
    throw new ErreurStock("L’approvisionnement ne peut être clôturé tant que les expéditions ou écarts ne sont pas traités.", 409);
  }
  const corps = { id: approvisionnementId, statut: "CLOTUREE" as const };
  const instructions: EcritureCritique[] = [
    {
      operation: "la clôture de l’approvisionnement",
      instruction: db.prepare(
        `UPDATE approvisionnements_centraux
         SET statut = 'CLOTUREE', cloture_par = ?, date_cloture = datetime('now'), observations_cloture = ?
         WHERE id = ? AND statut IN ('VALIDEE', 'RECEPTIONNEE')`,
      ).bind(utilisateur.id, entree.observations_cloture ?? null, approvisionnementId),
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: preparationAudit(db, utilisateur, "CLOTURE_APPROVISIONNEMENT", "APPROVISIONNEMENT_CENTRAL", approvisionnementId, adresseIp, corps),
    },
  ];
  const resultat = await executerOperationIdempotente({
    db, utilisateur, routeApi, cle,
    chargeUtile: { approvisionnement_id: approvisionnementId, ...entree },
    statutHttp: 200, corps, instructions,
  });
  return { ...resultat, statutHttp: resultat.statutHttp };
}

export async function televerserPvReception(
  db: D1Database,
  bucket: R2Bucket,
  utilisateur: UtilisateurSession,
  expeditionId: string,
  fichier: File,
  cleIdempotence: string,
  adresseIp: string | null,
): Promise<{ id: string; nom_fichier_original: string; taille_octets: number; type_mime: string }> {
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) {
    throw new ErreurStock("Seul le délégué de la province destinataire peut joindre le procès-verbal.", 403);
  }
  if (fichier.size < 1 || fichier.size > 10 * 1024 * 1024) {
    throw new ErreurStock("Le procès-verbal doit peser entre 1 octet et 10 Mo.", 400);
  }
  if (!["application/pdf", "image/jpeg", "image/png"].includes(fichier.type)) {
    throw new ErreurStock("Le procès-verbal doit être au format PDF, JPEG ou PNG.", 400);
  }
  const expedition = await db.prepare(
    `SELECT e.id, e.province_destinataire_id, p.code
     FROM expeditions e INNER JOIN provinces p ON p.id = e.province_destinataire_id
     WHERE e.id = ? AND e.province_destinataire_id = ? AND e.statut_expedition = 'EN_ROUTE'`,
  ).bind(expeditionId, utilisateur.province_id).first<{ id: string; province_destinataire_id: string; code: string }>();
  if (!expedition) throw new ErreurStock("Expédition introuvable dans votre province ou déjà réceptionnée.", 404);

  const contenu = new Uint8Array(await fichier.arrayBuffer());
  const metadonnees = new TextEncoder().encode(`${fichier.name}\n${fichier.type}\n`);
  const donneesEmpreinte = new Uint8Array(metadonnees.byteLength + contenu.byteLength);
  donneesEmpreinte.set(metadonnees);
  donneesEmpreinte.set(contenu, metadonnees.byteLength);
  const empreinte = await empreinteStable(donneesEmpreinte);
  const nomFichier = fichier.name.replace(/[\\/\u0000-\u001f\u007f]/gu, "_").slice(0, 180) || "proces-verbal";
  const cleR2 = `approvisionnements/${expedition.province_destinataire_id}/${expeditionId}/${cleIdempotence}`;
  const pieceExistante = await db.prepare(
    `SELECT id, cle_r2, nom_fichier_original, type_mime, taille_octets, province_id,
       televerse_par, entite_liee_id
     FROM pieces_jointes WHERE cle_r2 = ?`,
  ).bind(cleR2).first<PieceJointeD1>();
  if (pieceExistante) {
    const objet = await bucket.head(cleR2);
    if (!objet || objet.customMetadata?.empreinte_sha256 !== empreinte
      || pieceExistante.televerse_par !== utilisateur.id || pieceExistante.entite_liee_id !== expeditionId) {
      throw new ErreurStock("Cette clé d’idempotence est déjà associée à un autre procès-verbal.", 409);
    }
    return {
      id: pieceExistante.id, nom_fichier_original: pieceExistante.nom_fichier_original,
      taille_octets: pieceExistante.taille_octets, type_mime: pieceExistante.type_mime,
    };
  }

  const id = crypto.randomUUID();
  const objetExistant = await bucket.head(cleR2);
  if (objetExistant && objetExistant.customMetadata?.empreinte_sha256 !== empreinte) {
    throw new ErreurStock("Cette clé d’idempotence est déjà réservée à un autre fichier.", 409);
  }
  if (!objetExistant) {
    await bucket.put(cleR2, contenu, {
      httpMetadata: { contentType: fichier.type },
      customMetadata: { empreinte_sha256: empreinte, nom_fichier: nomFichier },
    });
  }

  try {
    const instructions: EcritureCritique[] = [
      {
        operation: "l’enregistrement des métadonnées du procès-verbal",
        instruction: db.prepare(
          `INSERT INTO pieces_jointes
            (id, cle_r2, nom_fichier_original, type_mime, taille_octets, categorie_document,
             entite_liee_type, entite_liee_id, province_id, televerse_par)
           VALUES (?, ?, ?, ?, ?, 'PV_RECEPTION', 'EXPEDITION', ?, ?, ?)`,
        ).bind(id, cleR2, nomFichier, fichier.type, contenu.byteLength, expeditionId,
          utilisateur.province_id, utilisateur.id),
      },
      {
        operation: "l’audit du téléversement du procès-verbal",
        instruction: preparationAudit(db, utilisateur, "TELEVERSEMENT_PV_APPROVISIONNEMENT", "PIECE_JOINTE", id, adresseIp, {
          expedition_id: expeditionId, taille_octets: contenu.byteLength, type_mime: fichier.type,
        }),
      },
    ];
    await db.batch(instructions.map((ecriture) => ecriture.instruction));
  } catch (erreur) {
    try { await bucket.delete(cleR2); } catch (erreurSuppression) {
      console.error(JSON.stringify({ action: "nettoyage_pv_r2_echoue", expedition_id: expeditionId, cle_r2: cleR2,
        erreur: erreurSuppression instanceof Error ? erreurSuppression.message : "Erreur non identifiée" }));
    }
    if (erreur instanceof Error && /UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint|AUDIT_APPROVISIONNEMENT/iu.test(erreur.message)) {
      throw new ErreurStock("Le procès-verbal existe déjà ou ses métadonnées ne respectent pas les règles de gestion.", 409);
    }
    throw new ErreurStock("Le procès-verbal n’a pas pu être enregistré.", 500);
  }
  return { id, nom_fichier_original: nomFichier, taille_octets: contenu.byteLength, type_mime: fichier.type };
}

export async function obtenirPvReception(
  db: D1Database,
  bucket: R2Bucket,
  utilisateur: UtilisateurSession,
  expeditionId: string,
): Promise<{ corps: ReadableStream; type_mime: string; nom_fichier_original: string; taille_octets: number }> {
  const provinceCondition = utilisateur.role === "DELEGUE_PROVINCIAL" ? " AND pj.province_id = ?" : "";
  const valeurs = utilisateur.role === "DELEGUE_PROVINCIAL"
    ? [expeditionId, utilisateur.province_id]
    : [expeditionId];
  const piece = await db.prepare(
    `SELECT pj.cle_r2, pj.type_mime, pj.nom_fichier_original, pj.taille_octets
     FROM pieces_jointes pj
     INNER JOIN expeditions e ON e.id = pj.entite_liee_id
     WHERE pj.entite_liee_type = 'EXPEDITION' AND pj.categorie_document = 'PV_RECEPTION'
       AND e.id = ?${provinceCondition}`,
  ).bind(...valeurs).first<{ cle_r2: string; type_mime: string; nom_fichier_original: string; taille_octets: number }>();
  if (!piece) throw new ErreurStock("Procès-verbal introuvable dans votre périmètre.", 404);
  const objet = await bucket.get(piece.cle_r2);
  if (!objet) throw new ErreurStock("Le fichier du procès-verbal est momentanément indisponible.", 404);
  return { corps: objet.body, type_mime: piece.type_mime, nom_fichier_original: piece.nom_fichier_original, taille_octets: piece.taille_octets };
}
