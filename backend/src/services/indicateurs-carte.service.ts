import type { UtilisateurSession } from "../bindings.ts";
import {
  INDICATEURS_CARTE_ACTIFS,
  INDICATEURS_CARTE_DESACTIVES,
  type FiltresIndicateursCarte,
  type ReponseIndicateursCarte,
} from "../../../shared/validations/indicateurs-carte.ts";
import { ErreurRapport } from "./rapports.service.ts";

interface LigneAgregatsCarte {
  province_id: string;
  province: string;
  distributions_realisees: number;
  distributions_en_cours: number;
  menages_servis: number;
  date_photographie: string;
}

interface LigneStockCarte {
  province_id: string;
  province: string;
  article_id: string;
  designation: string;
  unite_mesure_id: string;
  unite_code: string;
  unite_libelle: string;
  entrepot_id: string | null;
  entrepot: string | null;
  coherent: number | null;
  quantite_disponible: number | null;
}

function ajouterPeriode(
  conditions: string[],
  valeurs: string[],
  colonne: string,
  dateDebut: string | undefined,
  dateFin: string | undefined,
): void {
  if (dateDebut) {
    conditions.push(`${colonne} >= ?`);
    valeurs.push(dateDebut);
  }
  if (dateFin) {
    conditions.push(`${colonne} < date(?, '+1 day')`);
    valeurs.push(dateFin);
  }
}

function ajouterProvince(conditions: string[], valeurs: string[], colonne: string, provinceId: string | null): void {
  if (provinceId) {
    conditions.push(`${colonne} = ?`);
    valeurs.push(provinceId);
  }
}

function appliquerPerimetre(
  utilisateur: UtilisateurSession,
  filtres: FiltresIndicateursCarte,
): string | null {
  if (utilisateur.role === "CONSULTATION_INSTITUTIONNELLE") {
    if (utilisateur.perimetre_consultation === "NATIONAL") return filtres.province_id ?? null;
    const provinces = utilisateur.provinces_autorisees ?? [];
    if (!provinces.length) throw new ErreurRapport("Aucun périmètre provincial actif n’est associé à ce compte.", 403);
    if (utilisateur.perimetre_consultation === "PROVINCIAL") {
      const province = provinces[0];
      if (!province || (filtres.province_id && filtres.province_id !== province)) {
        throw new ErreurRapport("Vous ne pouvez consulter que la province autorisée à votre compte.", 403);
      }
      return province;
    }
    if (!filtres.province_id || !provinces.includes(filtres.province_id)) {
      throw new ErreurRapport("Sélectionnez une province comprise dans le périmètre qui vous a été attribué.", 403);
    }
    return filtres.province_id;
  }
  if (utilisateur.role !== "DELEGUE_PROVINCIAL") return filtres.province_id ?? null;
  if (!utilisateur.province_id) {
    throw new ErreurRapport("Aucune province active n’est associée à votre session.", 403);
  }
  if (filtres.province_id && filtres.province_id !== utilisateur.province_id) {
    throw new ErreurRapport("Vous ne pouvez consulter que les indicateurs de votre province.", 403);
  }
  return utilisateur.province_id;
}

function nombre(ligne: Record<string, unknown>, cle: string): number {
  const valeur = ligne[cle];
  const resultat = typeof valeur === "number" ? valeur : Number(valeur ?? 0);
  return Number.isFinite(resultat) ? resultat : 0;
}

function nombreNullable(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  const resultat = typeof valeur === "number" ? valeur : Number(valeur);
  return Number.isFinite(resultat) ? resultat : null;
}

function texte(ligne: Record<string, unknown>, cle: string): string | null {
  const valeur = ligne[cle];
  return typeof valeur === "string" ? valeur : null;
}

function lireLigneAgregats(ligne: Record<string, unknown>): LigneAgregatsCarte {
  const provinceId = texte(ligne, "province_id");
  const province = texte(ligne, "province");
  const photographie = texte(ligne, "date_photographie");
  if (!provinceId || province === null || photographie === null) throw new Error("LIGNE_AGREGATS_CARTE_INVALIDE");
  return {
    province_id: provinceId,
    province,
    distributions_realisees: nombre(ligne, "distributions_realisees"),
    distributions_en_cours: nombre(ligne, "distributions_en_cours"),
    menages_servis: nombre(ligne, "menages_servis"),
    date_photographie: photographie,
  };
}

function lireLigneStock(ligne: Record<string, unknown>): LigneStockCarte {
  const provinceId = texte(ligne, "province_id");
  const province = texte(ligne, "province");
  const articleId = texte(ligne, "article_id");
  const designation = texte(ligne, "designation");
  const uniteMesureId = texte(ligne, "unite_mesure_id");
  const uniteCode = texte(ligne, "unite_code");
  const uniteLibelle = texte(ligne, "unite_libelle");
  if (!provinceId || province === null || !articleId || designation === null || !uniteMesureId
    || uniteCode === null || uniteLibelle === null) {
    throw new Error("LIGNE_STOCK_CARTE_INVALIDE");
  }
  return {
    province_id: provinceId,
    province,
    article_id: articleId,
    designation,
    unite_mesure_id: uniteMesureId,
    unite_code: uniteCode,
    unite_libelle: uniteLibelle,
    entrepot_id: texte(ligne, "entrepot_id"),
    entrepot: texte(ligne, "entrepot"),
    coherent: nombreNullable(ligne.coherent),
    quantite_disponible: nombreNullable(ligne.quantite_disponible),
  };
}

function construireSqlAgregats(filtres: FiltresIndicateursCarte, provinceId: string | null): { sql: string; valeurs: string[] } {
  const conditionsRealisees = ["d.statut = 'CLOTUREE_CENTRAL'"];
  const valeursRealisees: string[] = [];
  ajouterPeriode(conditionsRealisees, valeursRealisees, "c.date_cloture", filtres.date_debut, filtres.date_fin);
  ajouterProvince(conditionsRealisees, valeursRealisees, "d.province_id", provinceId);

  const conditionsEnCours = ["d.statut IN ('EN_EXECUTION', 'TERMINEE_PROVINCE', 'RETOURNEE_POUR_CORRECTION')"];
  const valeursEnCours: string[] = [];
  ajouterProvince(conditionsEnCours, valeursEnCours, "d.province_id", provinceId);

  const conditionsMenages = [
    "EXISTS (SELECT 1 FROM lignes_remise lr WHERE lr.remise_id = rd.id AND lr.quantite_remise > 0)",
  ];
  const valeursMenages: string[] = [];
  ajouterPeriode(conditionsMenages, valeursMenages, "rd.date_remise", filtres.date_debut, filtres.date_fin);
  ajouterProvince(conditionsMenages, valeursMenages, "rd.province_id", provinceId);

  const conditionsProvinces: string[] = [];
  const valeursProvinces: string[] = [];
  ajouterProvince(conditionsProvinces, valeursProvinces, "p.id", provinceId);

  const sql = `WITH distributions_realisees AS (
      SELECT d.province_id, COUNT(DISTINCT d.id) AS valeur
      FROM distributions_provinciales d
      INNER JOIN clotures_distribution c ON c.distribution_id = d.id AND c.province_id = d.province_id
      WHERE ${conditionsRealisees.join(" AND ")}
      GROUP BY d.province_id
    ), distributions_en_cours AS (
      SELECT d.province_id, COUNT(DISTINCT d.id) AS valeur
      FROM distributions_provinciales d
      WHERE ${conditionsEnCours.join(" AND ")}
        AND EXISTS (
          SELECT 1 FROM historique_statuts h
          WHERE h.operation_type = 'DISTRIBUTION_PROVINCIALE'
            AND h.operation_id = d.id AND h.nouveau_statut = 'EN_EXECUTION'
        )
      GROUP BY d.province_id
    ), menages_servis AS (
      SELECT rd.province_id, COUNT(DISTINCT rd.menage_id) AS valeur
      FROM remises_distribution rd
      INNER JOIN distributions_provinciales d
        ON d.id = rd.distribution_id AND d.province_id = rd.province_id
      INNER JOIN menages_distribution md
        ON md.id = rd.menage_distribution_id AND md.distribution_id = rd.distribution_id
        AND md.province_id = rd.province_id AND md.menage_id = rd.menage_id
      INNER JOIN menages m ON m.id = rd.menage_id AND m.province_id = rd.province_id
      WHERE ${conditionsMenages.join(" AND ")}
      GROUP BY rd.province_id
    )
    SELECT p.id AS province_id, p.nom AS province,
      COALESCE(dr.valeur, 0) AS distributions_realisees,
      COALESCE(dc.valeur, 0) AS distributions_en_cours,
      COALESCE(ms.valeur, 0) AS menages_servis,
      datetime('now') AS date_photographie
    FROM provinces p
    LEFT JOIN distributions_realisees dr ON dr.province_id = p.id
    LEFT JOIN distributions_en_cours dc ON dc.province_id = p.id
    LEFT JOIN menages_servis ms ON ms.province_id = p.id
    ${conditionsProvinces.length ? `WHERE ${conditionsProvinces.join(" AND ")}` : ""}
    ORDER BY p.nom COLLATE NOCASE`;
  return { sql, valeurs: [...valeursRealisees, ...valeursEnCours, ...valeursMenages, ...valeursProvinces] };
}

function construireSqlStocks(articleId: string, provinceId: string | null): { sql: string; valeurs: string[] } {
  const conditionsEntrepots = ["e.niveau = 'PROVINCIAL'", "e.actif = 1"];
  const valeursEntrepots: string[] = [];
  ajouterProvince(conditionsEntrepots, valeursEntrepots, "e.province_id", provinceId);
  const conditionsProvinces: string[] = [];
  const valeursProvinces: string[] = [];
  ajouterProvince(conditionsProvinces, valeursProvinces, "p.id", provinceId);

  const sql = `WITH article AS (
      SELECT a.id, a.designation, a.unite_mesure_id, u.code AS unite_code, u.libelle AS unite_libelle
      FROM articles a INNER JOIN unites_mesure u ON u.id = a.unite_mesure_id
      WHERE a.id = ? AND a.actif = 1
    ), entrepots_actifs AS (
      SELECT e.id, e.province_id, e.nom
      FROM entrepots e WHERE ${conditionsEntrepots.join(" AND ")}
    ), lots AS (
      SELECT l.entrepot_id,
        SUM(l.quantite_physique) AS quantite_physique,
        SUM(l.quantite_reservee) AS quantite_reservee,
        SUM(CASE WHEN l.etat_qualite = 'BON'
          AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
          THEN l.quantite_physique - l.quantite_reservee ELSE 0 END) AS quantite_disponible
      FROM lots_stock l INNER JOIN entrepots_actifs e
        ON e.id = l.entrepot_id AND e.province_id = l.province_id
      WHERE l.article_id = ?
      GROUP BY l.entrepot_id
    )
    SELECT p.id AS province_id, p.nom AS province,
      a.id AS article_id, a.designation, a.unite_mesure_id, a.unite_code, a.unite_libelle,
      e.id AS entrepot_id, e.nom AS entrepot,
      CASE WHEN e.id IS NULL THEN NULL
        WHEN ABS(COALESCE(s.quantite_physique, 0) - COALESCE(l.quantite_physique, 0)) <= 0.000001
          AND ABS(COALESCE(s.quantite_reservee, 0) - COALESCE(l.quantite_reservee, 0)) <= 0.000001
        THEN 1 ELSE 0 END AS coherent,
      CASE WHEN e.id IS NULL THEN NULL ELSE COALESCE(l.quantite_disponible, 0) END AS quantite_disponible
    FROM provinces p CROSS JOIN article a
    LEFT JOIN entrepots_actifs e ON e.province_id = p.id
    LEFT JOIN soldes_stock s ON s.entrepot_id = e.id AND s.article_id = a.id AND s.province_id = e.province_id
    LEFT JOIN lots l ON l.entrepot_id = e.id
    ${conditionsProvinces.length ? `WHERE ${conditionsProvinces.join(" AND ")}` : ""}
    ORDER BY p.nom COLLATE NOCASE, e.nom COLLATE NOCASE`;
  return { sql, valeurs: [articleId, ...valeursEntrepots, articleId, ...valeursProvinces] };
}

function construireStockProvince(lignes: LigneStockCarte[], articleId: string | null) {
  if (!articleId) {
    return {
      valeur: null,
      etat: "INDISPONIBLE" as const,
      article_id: null,
      designation: null,
      unite_mesure_id: null,
      unite_code: null,
      unite_libelle: null,
      entrepots_actifs: 0,
      entrepots: [],
    };
  }
  const premiere = lignes[0];
  if (!premiere) throw new ErreurRapport("L’article demandé est introuvable ou inactif.", 404);
  const lignesEntrepots = lignes.filter((ligne) => ligne.entrepot_id !== null && ligne.entrepot !== null);
  const entrepots = lignesEntrepots.map((ligne) => {
    const entrepotId = ligne.entrepot_id;
    const nom = ligne.entrepot;
    if (entrepotId === null || nom === null) throw new Error("ENTREPOT_CARTE_INVALIDE");
    return {
    entrepot_id: entrepotId,
    nom,
    valeur: ligne.coherent === 1 ? ligne.quantite_disponible : null,
    etat: ligne.coherent === 1 ? "DISPONIBLE" as const : "INCOHERENT" as const,
    };
  });
  const coherent = lignesEntrepots.every((ligne) => ligne.coherent === 1);
  const total = entrepots.reduce((somme, entrepot) => somme + (entrepot.valeur ?? 0), 0);
  return {
    valeur: lignesEntrepots.length === 0 || !coherent ? null : total,
    etat: lignesEntrepots.length === 0 ? "AUCUNE_DONNEE" as const : coherent ? "DISPONIBLE" as const : "INCOHERENT" as const,
    article_id: premiere.article_id,
    designation: premiere.designation,
    unite_mesure_id: premiere.unite_mesure_id,
    unite_code: premiere.unite_code,
    unite_libelle: premiere.unite_libelle,
    entrepots_actifs: lignesEntrepots.length,
    entrepots,
  };
}

function metaD1(resultats: D1Result<unknown>[]) {
  const meta = resultats.reduce((somme, resultat) => ({
    lignes_lues: somme.lignes_lues + (resultat.meta.rows_read ?? 0),
    lignes_ecrites: somme.lignes_ecrites + (resultat.meta.rows_written ?? 0),
    duree_requetes_ms: somme.duree_requetes_ms + (resultat.meta.duration ?? 0),
  }), { lignes_lues: 0, lignes_ecrites: 0, duree_requetes_ms: 0 });
  if (meta.lignes_ecrites !== 0) throw new Error("UNE_REQUETE_D_INDICATEURS_A_MODIFIE_LA_BASE");
  return { ...meta, requetes: resultats.length };
}

export async function lireIndicateursCarte(
  db: D1Database,
  utilisateur: UtilisateurSession,
  filtres: FiltresIndicateursCarte,
  environnement: string,
): Promise<ReponseIndicateursCarte> {
  const provinceId = appliquerPerimetre(utilisateur, filtres);
  const agregats = construireSqlAgregats(filtres, provinceId);
  const stocks = filtres.article_id ? construireSqlStocks(filtres.article_id, provinceId) : null;
  const requetes = [
    db.prepare(agregats.sql).bind(...agregats.valeurs),
    ...(stocks ? [db.prepare(stocks.sql).bind(...stocks.valeurs)] : []),
  ];
  const resultats = await db.batch<Record<string, unknown>>(requetes);
  if (resultats.length !== requetes.length || resultats.some((resultat) => !resultat.success)) {
    throw new Error("LECTURE_INDICATEURS_CARTE_INCOMPLETE");
  }
  const lignesAgregats = (resultats[0]?.results ?? []).map(lireLigneAgregats);
  const lignesStocks = (resultats[1]?.results ?? []).map(lireLigneStock);
  if (stocks && lignesStocks.length === 0) {
    throw new ErreurRapport("L’article demandé est introuvable ou inactif.", 404);
  }
  const stocksParProvince = new Map<string, LigneStockCarte[]>();
  for (const ligne of lignesStocks) {
    const groupe = stocksParProvince.get(ligne.province_id) ?? [];
    groupe.push(ligne);
    stocksParProvince.set(ligne.province_id, groupe);
  }
  const photographie = lignesAgregats[0]?.date_photographie ?? new Date().toISOString();
  return {
    version_contrat: "1.5",
    mode_donnees: environnement === "production" ? "OPERATIONNELLES" : "SYNTHETIQUES",
    perimetre: utilisateur.role === "DELEGUE_PROVINCIAL" || provinceId ? "PROVINCIAL" : "NATIONAL",
    province_id: provinceId,
    periode: { date_debut: filtres.date_debut ?? null, date_fin: filtres.date_fin ?? null },
    date_photographie: photographie,
    indicateurs_actifs: [...INDICATEURS_CARTE_ACTIFS],
    indicateurs_desactives: [...INDICATEURS_CARTE_DESACTIVES],
    provinces: lignesAgregats.map((ligne) => ({
      province_id: ligne.province_id,
      nom: ligne.province,
      distributions_realisees: { valeur: ligne.distributions_realisees, etat: "DISPONIBLE" as const },
      distributions_en_cours: { valeur: ligne.distributions_en_cours, etat: "DISPONIBLE" as const },
      menages_servis: { valeur: ligne.menages_servis, etat: "DISPONIBLE" as const },
      stocks_disponibles: construireStockProvince(stocksParProvince.get(ligne.province_id) ?? [], filtres.article_id ?? null),
    })),
    ressources_d1: metaD1(resultats),
  };
}
