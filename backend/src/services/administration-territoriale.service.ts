import type { EnvironnementApplication, UtilisateurSession } from "../bindings";
import { obtenirRequestIdAudit } from "../core/audit/contexte.ts";
type Database = EnvironnementApplication["Bindings"]["DB"];
import { zipSync, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type {
  PrevisualisationImportTerritoire,
  ResultatRechercheTerritoire,
  SimulationFusionTerritoire,
  SimulationRattachementTerritoire,
  TableauDeBordTerritorial,
  TypeUniteTerritoriale,
} from "../../../shared/types/territoire";
import type {
  schemaCreationUniteTerritoriale,
  schemaModificationRattachementTerritorial,
  schemaModificationUniteTerritoriale,
  schemaValidationLotTerritoire,
  schemaValidationUniteTerritoriale,
} from "../../../shared/validations/territoire";
import { z } from "zod";

export class ErreurAdministrationTerritoriale extends Error {
  readonly statutHttp: number;
  constructor(
    message: string,
    statutHttp: number = 400,
  ) {
    super(message);
    this.name = "ErreurAdministrationTerritoriale";
    this.statutHttp = statutHttp;
  }
}

function normaliserChaine(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

// 1. TABLEAU DE BORD TERRITORIAL
export async function obtenirTableauDeBordTerritorial(
  db: Database,
): Promise<TableauDeBordTerritorial> {
  const [
    provincesRes,
    departementsRes,
    sousPrefecturesRes,
    communesRes,
    cantonsRes,
    localitesRes,
    arrondissementsRes,
    quartiersRes,
    carresRes,
    sitesRes,
  ] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN actif = 1 THEN 1 ELSE 0 END) AS valides FROM provinces").first<{ total: number; valides: number }>(),
    db.prepare(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN statut_operationnel = 'ACTIF' AND actif = 1 THEN 1 ELSE 0 END) AS actifs,
        SUM(CASE WHEN certification_juridique = 'CERTIFIE_OFFICIEL' THEN 1 ELSE 0 END) AS certifies,
        SUM(CASE WHEN certification_juridique = 'NON_CERTIFIE' THEN 1 ELSE 0 END) AS non_certifies,
        SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides,
        SUM(CASE WHEN statut_validation IN ('A_VERIFIER', 'PROPOSE') THEN 1 ELSE 0 END) AS en_attente,
        SUM(CASE WHEN actif = 0 OR statut_validation = 'ARCHIVE' OR statut_operationnel = 'ARCHIVE' THEN 1 ELSE 0 END) AS archives
      FROM departements
    `).first<{ total: number; actifs: number; certifies: number; non_certifies: number; valides: number; en_attente: number; archives: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN actif = 1 THEN 1 ELSE 0 END) AS valides FROM sous_prefectures").first<{ total: number; valides: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides, SUM(CASE WHEN statut_validation IN ('A_VERIFIER', 'PROPOSE') THEN 1 ELSE 0 END) AS en_attente, SUM(CASE WHEN actif = 0 OR statut_validation = 'ARCHIVE' THEN 1 ELSE 0 END) AS archives FROM communes").first<{ total: number; valides: number; en_attente: number; archives: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides FROM cantons").first<{ total: number; valides: number }>(),
    db.prepare(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN type_localite = 'VILLE' THEN 1 ELSE 0 END) AS villes,
        SUM(CASE WHEN type_localite IN ('VILLAGE', 'HAMEAU') THEN 1 ELSE 0 END) AS villages,
        SUM(CASE WHEN type_localite IN ('FERRICK', 'CAMPEMENT') THEN 1 ELSE 0 END) AS ferricks,
        SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides,
        SUM(CASE WHEN statut_validation IN ('A_VERIFIER', 'PROPOSE') THEN 1 ELSE 0 END) AS en_attente,
        SUM(CASE WHEN statut_validation = 'ARCHIVE' THEN 1 ELSE 0 END) AS archives
      FROM localites
    `).first<{ total: number; villes: number; villages: number; ferricks: number; valides: number; en_attente: number; archives: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides FROM arrondissements").first<{ total: number; valides: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides FROM quartiers").first<{ total: number; valides: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides FROM carres").first<{ total: number; valides: number }>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END) AS valides, SUM(CASE WHEN statut_validation IN ('A_VERIFIER', 'PROPOSE') THEN 1 ELSE 0 END) AS en_attente FROM sites_humanitaires").first<{ total: number; valides: number; en_attente: number }>(),
  ]);

  const totalValidees =
    (provincesRes?.valides ?? 0) +
    (departementsRes?.valides ?? 0) +
    (sousPrefecturesRes?.valides ?? 0) +
    (communesRes?.valides ?? 0) +
    (cantonsRes?.valides ?? 0) +
    (localitesRes?.valides ?? 0) +
    (arrondissementsRes?.valides ?? 0) +
    (quartiersRes?.valides ?? 0) +
    (carresRes?.valides ?? 0) +
    (sitesRes?.valides ?? 0);

  const totalEnAttente =
    (departementsRes?.en_attente ?? 0) +
    (communesRes?.en_attente ?? 0) +
    (localitesRes?.en_attente ?? 0) +
    (sitesRes?.en_attente ?? 0);

  const totalArchivees =
    (departementsRes?.archives ?? 0) +
    (communesRes?.archives ?? 0) +
    (localitesRes?.archives ?? 0);

  // Détection des anomalies et doublons potentiels (ex: doublons de noms au sein du même département)
  const doublonsDepartements = await db
    .prepare("SELECT COUNT(*) as c FROM (SELECT nom, province_id, COUNT(*) FROM departements GROUP BY nom, province_id HAVING COUNT(*) > 1)")
    .first<{ c: number }>();
  const doublonsLocalites = await db
    .prepare("SELECT COUNT(*) as c FROM (SELECT nom, province_id, departement_id, type_localite, COUNT(*) FROM localites GROUP BY nom, province_id, departement_id, type_localite HAVING COUNT(*) > 1)")
    .first<{ c: number }>();

  const anomalies = (doublonsDepartements?.c ?? 0) + (doublonsLocalites?.c ?? 0);

  return {
    provinces: provincesRes?.total ?? 0,
    departements: departementsRes?.total ?? 0,
    departements_actifs: departementsRes?.actifs ?? 0,
    departements_certifies: departementsRes?.certifies ?? 0,
    departements_non_certifies: departementsRes?.non_certifies ?? 0,
    sous_prefectures: sousPrefecturesRes?.total ?? 0,
    communes: communesRes?.total ?? 0,
    villes: localitesRes?.villes ?? 0,
    arrondissements: arrondissementsRes?.total ?? 0,
    quartiers: quartiersRes?.total ?? 0,
    carres: carresRes?.total ?? 0,
    cantons: cantonsRes?.total ?? 0,
    villages: localitesRes?.villages ?? 0,
    ferricks: localitesRes?.ferricks ?? 0,
    sites_humanitaires: sitesRes?.total ?? 0,
    validees: totalValidees,
    en_attente: totalEnAttente,
    archivees: totalArchivees,
    anomalies_et_doublons: anomalies,
  };
}

// 2. ARBORESCENCE HIÉRARCHIQUE
export async function obtenirArborescenceTerritoriale(
  db: Database,
  provinceId?: string,
) {
  const provinces = await db
    .prepare("SELECT id, code, nom, chef_lieu, statut_particulier, actif FROM provinces WHERE ? IS NULL OR id = ? ORDER BY nom")
    .bind(provinceId ?? null, provinceId ?? null)
    .all<{ id: string; code: string; nom: string; chef_lieu: string; statut_particulier: number; actif: number }>();

  const resultats = [];

  for (const prov of provinces.results) {
    if (prov.statut_particulier === 1) {
      // Régime spécial N'Djaména : N'Djaména -> Ville -> Arrondissements -> Quartiers -> Carrés
      const ville = await db
        .prepare("SELECT id, nom, mode_decoupage_urbain, statut_validation FROM localites WHERE province_id = ? AND type_localite = 'VILLE' LIMIT 1")
        .bind(prov.id)
        .first<{ id: string; nom: string; mode_decoupage_urbain: string; statut_validation: string }>();

      let arrondissements: any[] = [];
      if (ville) {
        const arrList = await db
          .prepare("SELECT id, code, nom, statut_validation FROM arrondissements WHERE localite_id = ? ORDER BY code, nom")
          .bind(ville.id)
          .all<{ id: string; code: string; nom: string; statut_validation: string }>();

        for (const arr of arrList.results) {
          const quartiers = await db
            .prepare("SELECT id, nom, possede_carres, statut_validation FROM quartiers WHERE arrondissement_id = ? ORDER BY nom")
            .bind(arr.id)
            .all<{ id: string; nom: string; possede_carres: number; statut_validation: string }>();

          arrondissements.push({
            ...arr,
            quartiers: quartiers.results,
          });
        }
      }

      resultats.push({
        ...prov,
        type: "PROVINCE_CAPITALE",
        ville,
        arrondissements,
      });
    } else {
      // Régime général : Province -> Départements -> Sous-préfectures / Localités
      const departements = await db
        .prepare("SELECT id, code, nom, chef_lieu, statut_validation, source_officielle FROM departements WHERE province_id = ? ORDER BY nom")
        .bind(prov.id)
        .all<{ id: string; code: string; nom: string; chef_lieu: string | null; statut_validation: string; source_officielle: string | null }>();

      const departementsAvecSousUnites = [];
      for (const dep of departements.results) {
        const sousPrefectures = await db
          .prepare("SELECT id, code, nom FROM sous_prefectures WHERE departement_id = ? ORDER BY nom")
          .bind(dep.id)
          .all<{ id: string; code: string; nom: string }>();

        const localites = await db
          .prepare("SELECT id, nom, type_localite, mode_decoupage_urbain, statut_validation FROM localites WHERE departement_id = ? ORDER BY nom LIMIT 20")
          .bind(dep.id)
          .all<{ id: string; nom: string; type_localite: string; mode_decoupage_urbain: string; statut_validation: string }>();

        departementsAvecSousUnites.push({
          ...dep,
          sous_prefectures: sousPrefectures.results,
          localites_apercu: localites.results,
        });
      }

      resultats.push({
        ...prov,
        type: "PROVINCE_ORDINAIRE",
        departements: departementsAvecSousUnites,
      });
    }
  }

  return resultats;
}

/**
 * Construit une clause UNION ALL hiérarchique évitant la limite Cloudflare D1
 * (SQLITE_LIMIT_COMPOUND_SELECT = 5 termes max par SELECT composé).
 */
function construireSqlUnion(requetes: string[], tailleChunk = 4): string {
  if (requetes.length === 0) return "";
  if (requetes.length <= tailleChunk) {
    return requetes.join(" UNION ALL ");
  }
  const chunks: string[] = [];
  for (let i = 0; i < requetes.length; i += tailleChunk) {
    const groupe = requetes.slice(i, i + tailleChunk);
    if (groupe.length === 1) {
      chunks.push(groupe[0] ?? "");
    } else {
      chunks.push(`SELECT * FROM (${groupe.join(" UNION ALL ")})`);
    }
  }
  if (chunks.length > tailleChunk) {
    return construireSqlUnion(chunks, tailleChunk);
  }
  return chunks.join(" UNION ALL ");
}

// 3. RECHERCHE MULTICRITÈRES ET HOMONYMES
export async function rechercherUnitesTerritoriales(
  db: Database,
  params: {
    recherche?: string | undefined;
    type?: TypeUniteTerritoriale | undefined;
    province_id?: string | undefined;
    departement_id?: string | undefined;
    statut_validation?: string | undefined;
    limite?: number | undefined;
    decalage?: number | undefined;
  },
): Promise<{ elements: ResultatRechercheTerritoire[]; total: number }> {
  const limite = params.limite ?? 50;
  const decalage = params.decalage ?? 0;
  const recherche = params.recherche?.trim().toLowerCase();

  const requetesUnion: string[] = [];
  const bindings: any[] = [];

  // PROVINCES
  if (!params.type || params.type === "PROVINCE") {
    requetesUnion.push(`
      SELECT 
        p.id AS id,
        'PROVINCE' AS type,
        p.nom AS nom,
        p.code AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        NULL AS departement_id,
        NULL AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        CASE WHEN p.actif = 1 THEN 'VALIDE' ELSE 'ARCHIVE' END AS statut_validation,
        'Cadre territorial national' AS source_officielle,
        p.chef_lieu AS chef_lieu,
        ('Province ' || p.nom) AS fil_ariane
      FROM provinces p
      WHERE (? IS NULL OR p.id = ?)
        AND (? IS NULL OR LOWER(p.nom) LIKE '%' || ? || '%' OR LOWER(COALESCE(p.code, '')) LIKE '%' || ? || '%' OR LOWER(COALESCE(p.chef_lieu, '')) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      recherche ?? null, recherche ?? null, recherche ?? null, recherche ?? null
    );
  }

  // DEPARTEMENTS
  if (!params.type || params.type === "DEPARTEMENT") {
    requetesUnion.push(`
      SELECT 
        d.id AS id,
        'DEPARTEMENT' AS type,
        d.nom AS nom,
        d.code AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        NULL AS departement_id,
        NULL AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        d.statut_validation AS statut_validation,
        d.source_officielle AS source_officielle,
        d.chef_lieu AS chef_lieu,
        ('Province ' || p.nom || ' > Département ' || d.nom) AS fil_ariane
      FROM departements d
      INNER JOIN provinces p ON p.id = d.province_id
      WHERE (? IS NULL OR d.province_id = ?)
        AND (? IS NULL OR d.statut_validation = ?)
        AND (? IS NULL OR LOWER(d.nom) LIKE '%' || ? || '%' OR LOWER(COALESCE(d.code, '')) LIKE '%' || ? || '%' OR LOWER(COALESCE(d.chef_lieu, '')) LIKE '%' || ? || '%')
    `);
    // DEPARTEMENTS
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null, recherche ?? null, recherche ?? null
    );
  }

  // SOUS_PREFECTURES
  if (!params.type || params.type === "SOUS_PREFECTURE") {
    requetesUnion.push(`
      SELECT 
        sp.id AS id,
        'SOUS_PREFECTURE' AS type,
        sp.nom AS nom,
        sp.code AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        d.id AS departement_id,
        d.nom AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        'VALIDE' AS statut_validation,
        'Ordonnance 2024' AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || ' > Département ' || d.nom || ' > Sous-préfecture ' || sp.nom) AS fil_ariane
      FROM sous_prefectures sp
      INNER JOIN departements d ON d.id = sp.departement_id
      INNER JOIN provinces p ON p.id = d.province_id
      WHERE (? IS NULL OR d.province_id = ?)
        AND (? IS NULL OR d.id = ?)
        AND (? IS NULL OR LOWER(sp.nom) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.departement_id ?? null, params.departement_id ?? null,
      recherche ?? null, recherche ?? null
    );
  }

  // COMMUNES
  if (!params.type || params.type === "COMMUNE") {
    requetesUnion.push(`
      SELECT 
        c.id AS id,
        'COMMUNE' AS type,
        c.nom AS nom,
        c.code AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        NULL AS departement_id,
        NULL AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        c.statut_validation AS statut_validation,
        c.source_officielle AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || ' > Commune ' || c.nom) AS fil_ariane
      FROM communes c
      INNER JOIN provinces p ON p.id = c.province_id
      WHERE (? IS NULL OR c.province_id = ?)
        AND (? IS NULL OR c.statut_validation = ?)
        AND (? IS NULL OR LOWER(c.nom) LIKE '%' || ? || '%' OR LOWER(COALESCE(c.code, '')) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null, recherche ?? null
    );
  }

  // CANTONS
  if (!params.type || params.type === "CANTON") {
    const infoCantons = await db.prepare("PRAGMA table_info(cantons)").all<{ name: string }>();
    const possedeDepartementDirect = (infoCantons.results || []).some((col) => col.name === "departement_id");
    const exprJoinDep = possedeDepartementDirect
      ? "COALESCE(ca.departement_id, sp.departement_id)"
      : "sp.departement_id";
    requetesUnion.push(`
      SELECT 
        ca.id AS id,
        'CANTON' AS type,
        ca.nom AS nom,
        NULL AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        d.id AS departement_id,
        d.nom AS departement_nom,
        sp.id AS sous_prefecture_id,
        sp.nom AS sous_prefecture_nom,
        CASE WHEN ca.statut_validation = 'REJETE' THEN 'ARCHIVE' ELSE ca.statut_validation END AS statut_validation,
        'Canton traditionnel' AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || ' > Dépt ' || d.nom || COALESCE(' > SP ' || sp.nom, '') || ' > Canton ' || ca.nom) AS fil_ariane
      FROM cantons ca
      LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id
      INNER JOIN departements d ON d.id = ${exprJoinDep}
      INNER JOIN provinces p ON p.id = d.province_id
      WHERE (? IS NULL OR d.province_id = ?)
        AND (? IS NULL OR d.id = ?)
        AND (? IS NULL OR ca.statut_validation = ?)
        AND (? IS NULL OR LOWER(ca.nom) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.departement_id ?? null, params.departement_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null
    );
  }

  // LOCALITES (VILLE, VILLAGE, HAMEAU, FERRICK, CAMPEMENT)
  if (!params.type || ["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(params.type)) {
    const typeFiltre = ["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(params.type as string) ? params.type : null;
    requetesUnion.push(`
      SELECT 
        l.id AS id,
        l.type_localite AS type,
        l.nom AS nom,
        NULL AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        d.id AS departement_id,
        d.nom AS departement_nom,
        sp.id AS sous_prefecture_id,
        sp.nom AS sous_prefecture_nom,
        CASE WHEN l.statut_validation = 'REJETE' THEN 'ARCHIVE' ELSE l.statut_validation END AS statut_validation,
        l.source_documentation AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || COALESCE(' > Dépt ' || d.nom, '') || ' > ' || l.type_localite || ' ' || l.nom) AS fil_ariane
      FROM localites l
      INNER JOIN provinces p ON p.id = l.province_id
      LEFT JOIN departements d ON d.id = l.departement_id
      LEFT JOIN sous_prefectures sp ON sp.id = l.sous_prefecture_id
      WHERE (? IS NULL OR l.province_id = ?)
        AND (? IS NULL OR l.departement_id = ?)
        AND (? IS NULL OR l.statut_validation = ?)
        AND (? IS NULL OR l.type_localite = ?)
        AND (? IS NULL OR LOWER(l.nom) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.departement_id ?? null, params.departement_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      typeFiltre ?? null, typeFiltre ?? null,
      recherche ?? null, recherche ?? null
    );
  }

  // ARRONDISSEMENTS
  if (!params.type || params.type === "ARRONDISSEMENT") {
    requetesUnion.push(`
      SELECT 
        a.id AS id,
        'ARRONDISSEMENT' AS type,
        a.nom AS nom,
        a.code AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        NULL AS departement_id,
        NULL AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        a.statut_validation AS statut_validation,
        'Loi statut particulier N''Djamena' AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || ' > ' || l.nom || ' > ' || a.nom) AS fil_ariane
      FROM arrondissements a
      INNER JOIN localites l ON l.id = a.localite_id
      INNER JOIN provinces p ON p.id = l.province_id
      WHERE (? IS NULL OR l.province_id = ?)
        AND (? IS NULL OR a.statut_validation = ?)
        AND (? IS NULL OR LOWER(a.nom) LIKE '%' || ? || '%' OR LOWER(COALESCE(a.code, '')) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null, recherche ?? null
    );
  }

  // QUARTIERS
  if (!params.type || params.type === "QUARTIER") {
    requetesUnion.push(`
      SELECT 
        q.id AS id,
        'QUARTIER' AS type,
        q.nom AS nom,
        NULL AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        NULL AS departement_id,
        NULL AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        q.statut_validation AS statut_validation,
        'Référentiel urbain' AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || ' > ' || l.nom || COALESCE(' > ' || a.nom, '') || ' > Quartier ' || q.nom) AS fil_ariane
      FROM quartiers q
      INNER JOIN localites l ON l.id = q.localite_id
      INNER JOIN provinces p ON p.id = l.province_id
      LEFT JOIN arrondissements a ON a.id = q.arrondissement_id
      WHERE (? IS NULL OR l.province_id = ?)
        AND (? IS NULL OR q.statut_validation = ?)
        AND (? IS NULL OR LOWER(q.nom) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null
    );
  }

  // SUBDIVISIONS (CARRE, BLOC, SECTEUR)
  if (!params.type || ["CARRE", "BLOC", "SECTEUR"].includes(params.type)) {
    requetesUnion.push(`
      SELECT 
        cr.id AS id,
        cr.type_subdivision AS type,
        cr.code_ou_nom AS nom,
        cr.code_ou_nom AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        NULL AS departement_id,
        NULL AS departement_nom,
        NULL AS sous_prefecture_id,
        NULL AS sous_prefecture_nom,
        cr.statut_validation AS statut_validation,
        'Subdivision géographique' AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || COALESCE(' > ' || l.nom || ' > ' || q.nom, '') || ' > ' || cr.type_subdivision || ' ' || cr.code_ou_nom) AS fil_ariane
      FROM carres cr
      LEFT JOIN quartiers q ON q.id = cr.quartier_id
      LEFT JOIN localites l ON l.id = q.localite_id
      LEFT JOIN provinces p ON p.id = l.province_id
      WHERE (? IS NULL OR cr.type_subdivision = ?)
        AND (? IS NULL OR l.province_id = ?)
        AND (? IS NULL OR cr.statut_validation = ?)
        AND (? IS NULL OR LOWER(cr.code_ou_nom) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.type ?? null, params.type ?? null,
      params.province_id ?? null, params.province_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null
    );
  }

  // SITES HUMANITAIRES
  if (!params.type || params.type === "SITE_HUMANITAIRE") {
    requetesUnion.push(`
      SELECT 
        sh.id AS id,
        'SITE_HUMANITAIRE' AS type,
        sh.nom AS nom,
        sh.code_site AS code,
        p.id AS province_id,
        p.nom AS province_nom,
        d.id AS departement_id,
        d.nom AS departement_nom,
        sp.id AS sous_prefecture_id,
        sp.nom AS sous_prefecture_nom,
        sh.statut_validation AS statut_validation,
        'Coordination humanitaire' AS source_officielle,
        NULL AS chef_lieu,
        ('Province ' || p.nom || COALESCE(' > Dépt ' || d.nom, '') || ' > Site ' || sh.nom) AS fil_ariane
      FROM sites_humanitaires sh
      INNER JOIN provinces p ON p.id = sh.province_id
      LEFT JOIN departements d ON d.id = sh.departement_id
      LEFT JOIN sous_prefectures sp ON sp.id = sh.sous_prefecture_id
      WHERE (? IS NULL OR sh.province_id = ?)
        AND (? IS NULL OR sh.departement_id = ?)
        AND (? IS NULL OR sh.statut_validation = ?)
        AND (? IS NULL OR LOWER(sh.nom) LIKE '%' || ? || '%' OR LOWER(COALESCE(sh.code_site, '')) LIKE '%' || ? || '%')
    `);
    bindings.push(
      params.province_id ?? null, params.province_id ?? null,
      params.departement_id ?? null, params.departement_id ?? null,
      params.statut_validation ?? null, params.statut_validation ?? null,
      recherche ?? null, recherche ?? null, recherche ?? null
    );
  }

  if (requetesUnion.length === 0) {
    return { elements: [], total: 0 };
  }

  const sqlUnion = construireSqlUnion(requetesUnion, 4);
  const sqlPaged = `SELECT * FROM (${sqlUnion}) ORDER BY nom, id LIMIT ? OFFSET ?`;
  const sqlCount = `SELECT COUNT(*) as total FROM (${sqlUnion})`;

  const totalRes = await db.prepare(sqlCount).bind(...bindings).first<{ total: number }>();
  const rows = await db.prepare(sqlPaged).bind(...bindings, limite, decalage).all<ResultatRechercheTerritoire>();

  return {
    elements: rows.results,
    total: totalRes?.total ?? 0,
  };
}

// 4. AJOUTER UNE UNITÉ TERRITORIALE
export async function ajouterUniteTerritoriale(
  db: Database,
  utilisateur: UtilisateurSession,
  donnee: z.infer<typeof schemaCreationUniteTerritoriale>,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  const id = crypto.randomUUID();
  const dateEffet = donnee.date_effet ?? new Date().toISOString().slice(0, 10);
  const statutValidation = donnee.statut_validation ?? "VALIDE";
  const sourceOfficielle = donnee.source_officielle?.trim() || "Saisie administrative propriétaire";
  const referenceJuridique = donnee.reference_juridique?.trim() || null;

  let instructionSql;

  switch (donnee.type) {
    case "PROVINCE": {
      const existProv = await db.prepare("SELECT 1 FROM provinces WHERE LOWER(nom) = LOWER(?)").bind(donnee.nom.trim()).first();
      if (existProv) throw new ErreurAdministrationTerritoriale(`Une province nommée « ${donnee.nom} » existe déjà.`, 409);
      const code = donnee.code || `PROV-${normaliserChaine(donnee.nom).toUpperCase()}`;
      instructionSql = db.prepare(`
        INSERT INTO provinces (id, code, nom, chef_lieu, statut_particulier, actif)
        VALUES (?, ?, ?, ?, ?, 1)
      `).bind(id, code, donnee.nom, donnee.chef_lieu ?? "", donnee.statut_particulier ? 1 : 0);
      break;
    }

    case "DEPARTEMENT": {
      if (!donnee.province_id) {
        throw new ErreurAdministrationTerritoriale("Une province est obligatoire pour un département.", 400);
      }
      const existDep = await db.prepare("SELECT 1 FROM departements WHERE province_id = ? AND LOWER(nom) = LOWER(?)").bind(donnee.province_id, donnee.nom.trim()).first();
      if (existDep) throw new ErreurAdministrationTerritoriale(`Un département nommé « ${donnee.nom} » existe déjà dans cette province.`, 409);

      const code = donnee.code || `DEP-${donnee.province_id.toUpperCase().replace(/^PROV-/, "")}-${normaliserChaine(donnee.nom).toUpperCase()}`;
      const certifJuridique = referenceJuridique ? "CERTIFIE_OFFICIEL" : "NON_CERTIFIE";
      instructionSql = db.prepare(`
        INSERT INTO departements (
          id, province_id, code, nom, chef_lieu, actif, statut_validation, source_officielle,
          validation_administrative, validation_rattachement, validation_coordonnees,
          validation_limites_cartographiques, autres_appellations, date_effet, reference_juridique,
          observations, latitude, longitude, statut_operationnel, certification_juridique,
          active_par_proprietaire, date_activation_operationnelle
        ) VALUES (
          ?, ?, ?, ?, ?, 1, 'VALIDE', ?,
          'VALIDE', 'VALIDE', 'NON_RENSEIGNE',
          'NON_RENSEIGNE', ?, ?, ?,
          ?, ?, ?, 'ACTIF', ?,
          1, datetime('now')
        )
      `).bind(
        id, donnee.province_id, code, donnee.nom, donnee.chef_lieu ?? null, sourceOfficielle,
        donnee.autres_appellations ?? null, dateEffet, referenceJuridique,
        donnee.observations ?? null, donnee.latitude ?? null, donnee.longitude ?? null, certifJuridique
      );
      break;
    }

    case "SOUS_PREFECTURE": {
      if (!donnee.departement_id) {
        throw new ErreurAdministrationTerritoriale("Un département est obligatoire pour une sous-préfecture.", 400);
      }
      const existSp = await db.prepare("SELECT 1 FROM sous_prefectures WHERE departement_id = ? AND LOWER(nom) = LOWER(?)").bind(donnee.departement_id, donnee.nom.trim()).first();
      if (existSp) throw new ErreurAdministrationTerritoriale(`Une sous-préfecture nommée « ${donnee.nom} » existe déjà dans ce département.`, 409);

      const code = donnee.code || `SP-${normaliserChaine(donnee.nom).toUpperCase()}`;
      instructionSql = db.prepare(`
        INSERT INTO sous_prefectures (id, departement_id, code, nom, actif)
        VALUES (?, ?, ?, ?, 1)
      `).bind(id, donnee.departement_id, code, donnee.nom);
      break;
    }

    case "COMMUNE": {
      if (!donnee.province_id) {
        throw new ErreurAdministrationTerritoriale("Une province est obligatoire pour une commune.", 400);
      }
      const existCom = await db.prepare("SELECT 1 FROM communes WHERE province_id = ? AND LOWER(nom) = LOWER(?)").bind(donnee.province_id, donnee.nom.trim()).first();
      if (existCom) throw new ErreurAdministrationTerritoriale(`Une commune nommée « ${donnee.nom} » existe déjà dans cette province.`, 409);

      const code = donnee.code || `COM-${normaliserChaine(donnee.nom).toUpperCase()}`;
      instructionSql = db.prepare(`
        INSERT INTO communes (id, province_id, code, nom, type_commune, statut_validation, source_officielle, date_effet, actif)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(id, donnee.province_id, code, donnee.nom, donnee.type_commune ?? "RURALE", statutValidation, sourceOfficielle, dateEffet);
      break;
    }

    case "CANTON": {
      if (!donnee.sous_prefecture_id && !donnee.departement_id) {
        throw new ErreurAdministrationTerritoriale("Un département ou une sous-préfecture est obligatoire pour un canton.", 400);
      }
      const existCan = await db
        .prepare(
          `SELECT 1 FROM cantons
           WHERE COALESCE(departement_id, '') = COALESCE(?, '')
             AND COALESCE(sous_prefecture_id, '') = COALESCE(?, '')
             AND LOWER(nom) = LOWER(?)`,
        )
        .bind(donnee.departement_id ?? null, donnee.sous_prefecture_id ?? null, donnee.nom.trim())
        .first();
      if (existCan) throw new ErreurAdministrationTerritoriale(`Un canton nommé « ${donnee.nom} » existe déjà sous ce rattachement.`, 409);

      instructionSql = db.prepare(`
        INSERT INTO cantons (id, departement_id, sous_prefecture_id, nom, statut_validation, cree_par)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, donnee.departement_id ?? null, donnee.sous_prefecture_id ?? null, donnee.nom, statutValidation, utilisateur.id);
      break;
    }

    case "VILLE":
    case "VILLAGE":
    case "HAMEAU":
    case "FERRICK":
    case "CAMPEMENT": {
      const existLoc = await db.prepare(`
        SELECT 1 FROM localites 
        WHERE province_id = ? 
          AND COALESCE(departement_id, '') = COALESCE(?, '')
          AND LOWER(nom) = LOWER(?) 
          AND type_localite = ?
      `).bind(donnee.province_id, donnee.departement_id ?? null, donnee.nom.trim(), donnee.type).first();
      if (existLoc) throw new ErreurAdministrationTerritoriale(`Une localité de type ${donnee.type} nommée « ${donnee.nom} » existe déjà dans ce département.`, 409);

      const modeUrbain = donnee.type === "VILLE" ? (donnee.mode_decoupage_urbain || "SANS_ARRONDISSEMENT") : "AUCUN";
      instructionSql = db.prepare(`
        INSERT INTO localites (
          id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id,
          nom, type_localite, mode_decoupage_urbain, statut_validation, source_documentation,
          date_effet, propose_par, valide_par, cree_le
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, datetime('now')
        )
      `).bind(
        id,
        donnee.province_id,
        donnee.departement_id?.trim() || null,
        donnee.sous_prefecture_id?.trim() || null,
        donnee.commune_id?.trim() || null,
        donnee.canton_id?.trim() || null,
        donnee.nom.trim(),
        donnee.type,
        modeUrbain,
        statutValidation,
        sourceOfficielle,
        dateEffet,
        utilisateur.id,
        statutValidation === "VALIDE" ? utilisateur.id : null
      );
      break;
    }

    case "ARRONDISSEMENT": {
      if (!donnee.localite_id) {
        throw new ErreurAdministrationTerritoriale("La ville de rattachement est obligatoire.", 400);
      }
      const existArr = await db.prepare("SELECT 1 FROM arrondissements WHERE localite_id = ? AND LOWER(nom) = LOWER(?)").bind(donnee.localite_id, donnee.nom.trim()).first();
      if (existArr) throw new ErreurAdministrationTerritoriale(`Un arrondissement nommé « ${donnee.nom} » existe déjà dans cette ville.`, 409);

      instructionSql = db.prepare(`
        INSERT INTO arrondissements (id, localite_id, commune_id, code, nom, statut_validation)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, donnee.localite_id, donnee.commune_id ?? null, donnee.code ?? null, donnee.nom, statutValidation);
      break;
    }

    case "QUARTIER": {
      if (!donnee.localite_id) {
        throw new ErreurAdministrationTerritoriale("La ville de rattachement est obligatoire.", 400);
      }
      const existQ = await db.prepare("SELECT 1 FROM quartiers WHERE localite_id = ? AND LOWER(nom) = LOWER(?)").bind(donnee.localite_id, donnee.nom.trim()).first();
      if (existQ) throw new ErreurAdministrationTerritoriale(`Un quartier nommé « ${donnee.nom} » existe déjà dans cette ville.`, 409);

      instructionSql = db.prepare(`
        INSERT INTO quartiers (id, localite_id, arrondissement_id, nom, possede_carres, statut_validation, propose_par)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, donnee.localite_id, donnee.arrondissement_id ?? null, donnee.nom, donnee.possede_carres ? 1 : 0, statutValidation, utilisateur.id);
      break;
    }

    case "CARRE":
    case "BLOC":
    case "SECTEUR": {
      if (!donnee.quartier_id && !donnee.site_humanitaire_id) {
        throw new ErreurAdministrationTerritoriale("Un quartier urbain ou un site humanitaire est obligatoire pour cette subdivision.", 400);
      }
      const existCar = await db.prepare("SELECT 1 FROM carres WHERE (quartier_id = ? OR site_humanitaire_id = ?) AND LOWER(code_ou_nom) = LOWER(?) AND type_subdivision = ?")
        .bind(donnee.quartier_id ?? null, donnee.site_humanitaire_id ?? null, donnee.nom.trim(), donnee.type).first();
      if (existCar) throw new ErreurAdministrationTerritoriale(`Une subdivision ${donnee.type} nommée « ${donnee.nom} » existe déjà sous ce rattachement.`, 409);

      instructionSql = db.prepare(`
        INSERT INTO carres (id, quartier_id, code_ou_nom, statut_validation, type_subdivision, site_humanitaire_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, donnee.quartier_id ?? null, donnee.nom, statutValidation, donnee.type, donnee.site_humanitaire_id ?? null);
      break;
    }

    case "SITE_HUMANITAIRE": {
      const existSite = await db.prepare("SELECT 1 FROM sites_humanitaires WHERE province_id = ? AND LOWER(nom) = LOWER(?)").bind(donnee.province_id, donnee.nom.trim()).first();
      if (existSite) throw new ErreurAdministrationTerritoriale(`Un site humanitaire nommé « ${donnee.nom} » existe déjà dans cette province.`, 409);

      instructionSql = db.prepare(`
        INSERT INTO sites_humanitaires (
          id, province_id, departement_id, sous_prefecture_id, commune_id,
          code_site, nom, categorie_site, statut_validation, propose_par, cree_le
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, datetime('now')
        )
      `).bind(
        id, donnee.province_id, donnee.departement_id ?? null, donnee.sous_prefecture_id ?? null,
        donnee.commune_id ?? null, donnee.code ?? null, donnee.nom, donnee.categorie_site ?? "AUTRE_SITE",
        statutValidation, utilisateur.id
      );
      break;
    }

    default:
      throw new ErreurAdministrationTerritoriale(`Type d'unité non supporté: ${donnee.type}`, 400);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (
      id, action, entite_type, entite_id, utilisateur_id,
      anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
    ) VALUES (?, 'CREATION', ?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `).bind(
    auditId, donnee.type, id, utilisateur.id, JSON.stringify(donnee),
    donnee.source_officielle, donnee.observations || "Création initiale", adresseIp, obtenirRequestIdAudit(utilisateur)
  );

  await db.batch([instructionSql, auditSql]);
  return { id, type: donnee.type, nom: donnee.nom, statut_validation: statutValidation };
}

// 5. MODIFIER UNE UNITÉ TERRITORIALE
export async function modifierUniteTerritoriale(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  id: string,
  donnee: z.infer<typeof schemaModificationUniteTerritoriale>,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  // Lecture des anciennes valeurs
  let table = "";
  if (type === "PROVINCE") table = "provinces";
  else if (type === "DEPARTEMENT") table = "departements";
  else if (type === "SOUS_PREFECTURE") table = "sous_prefectures";
  else if (type === "COMMUNE") table = "communes";
  else if (type === "CANTON") table = "cantons";
  else if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) table = "localites";
  else if (type === "ARRONDISSEMENT") table = "arrondissements";
  else if (type === "QUARTIER") table = "quartiers";
  else if (type === "CARRE") table = "carres";
  else if (type === "SITE_HUMANITAIRE") table = "sites_humanitaires";
  else throw new ErreurAdministrationTerritoriale(`Type d'unité non modifiable: ${type}`, 400);

  const existante = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!existante) {
    throw new ErreurAdministrationTerritoriale(`Unité ${id} introuvable dans ${table}.`, 404);
  }

  let updateSql;
  if (type === "PROVINCE") {
    updateSql = db.prepare(`
      UPDATE provinces SET
        nom = COALESCE(?, nom),
        code = COALESCE(?, code),
        chef_lieu = COALESCE(?, chef_lieu)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.code ?? null, donnee.chef_lieu ?? null, id);
  } else if (type === "DEPARTEMENT") {
    updateSql = db.prepare(`
      UPDATE departements SET
        nom = COALESCE(?, nom),
        code = COALESCE(?, code),
        chef_lieu = COALESCE(?, chef_lieu),
        autres_appellations = COALESCE(?, autres_appellations),
        source_officielle = COALESCE(?, source_officielle),
        reference_juridique = COALESCE(?, reference_juridique),
        date_effet = COALESCE(?, date_effet),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        observations = COALESCE(?, observations)
      WHERE id = ?
    `).bind(
      donnee.nom ?? null, donnee.code ?? null, donnee.chef_lieu ?? null, donnee.autres_appellations ?? null,
      donnee.source_officielle ?? null, donnee.reference_juridique ?? null, donnee.date_effet ?? null,
      donnee.latitude ?? null, donnee.longitude ?? null, donnee.observations ?? null, id
    );
  } else if (type === "SOUS_PREFECTURE") {
    updateSql = db.prepare(`
      UPDATE sous_prefectures SET
        nom = COALESCE(?, nom),
        code = COALESCE(?, code)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.code ?? null, id);
  } else if (type === "COMMUNE") {
    updateSql = db.prepare(`
      UPDATE communes SET
        nom = COALESCE(?, nom),
        code = COALESCE(?, code),
        source_officielle = COALESCE(?, source_officielle)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.code ?? null, donnee.source_officielle ?? null, id);
  } else if (type === "CANTON") {
    updateSql = db.prepare(`
      UPDATE cantons SET
        nom = COALESCE(?, nom)
      WHERE id = ?
    `).bind(donnee.nom ?? null, id);
  } else if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    updateSql = db.prepare(`
      UPDATE localites SET
        nom = COALESCE(?, nom),
        mode_decoupage_urbain = COALESCE(?, mode_decoupage_urbain),
        source_documentation = COALESCE(?, source_documentation)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.mode_decoupage_urbain ?? null, donnee.source_officielle ?? null, id);
  } else if (type === "ARRONDISSEMENT") {
    updateSql = db.prepare(`
      UPDATE arrondissements SET
        nom = COALESCE(?, nom),
        code = COALESCE(?, code)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.code ?? null, id);
  } else if (type === "QUARTIER") {
    updateSql = db.prepare(`
      UPDATE quartiers SET
        nom = COALESCE(?, nom),
        possede_carres = COALESCE(?, possede_carres)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.possede_carres !== undefined && donnee.possede_carres !== null ? (donnee.possede_carres ? 1 : 0) : null, id);
  } else if (["CARRE", "BLOC", "SECTEUR"].includes(type)) {
    updateSql = db.prepare(`
      UPDATE carres SET
        code_ou_nom = COALESCE(?, code_ou_nom)
      WHERE id = ?
    `).bind(donnee.nom ?? null, id);
  } else if (type === "SITE_HUMANITAIRE") {
    updateSql = db.prepare(`
      UPDATE sites_humanitaires SET
        nom = COALESCE(?, nom),
        code_site = COALESCE(?, code_site)
      WHERE id = ?
    `).bind(donnee.nom ?? null, donnee.code ?? null, id);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (
      id, action, entite_type, entite_id, utilisateur_id,
      anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
    ) VALUES (?, 'MODIFICATION', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    auditId, type, id, utilisateur.id, JSON.stringify(existante),
    JSON.stringify(donnee), donnee.source_officielle || "Modification administrative", donnee.motif, adresseIp, obtenirRequestIdAudit(utilisateur)
  );

  await db.batch([updateSql!, auditSql]);
  return { id, type, nom: donnee.nom ?? (existante as any).nom, message: "Unité territoriale modifiée avec succès." };
}

// 6. SIMULATION ET CHANGEMENT DE RATTACHEMENT
export async function simulerRattachementTerritorial(
  db: Database,
  type: TypeUniteTerritoriale,
  id: string,
  nouveauDepartementId?: string | null,
): Promise<SimulationRattachementTerritoire> {
  let nomUnite = "";
  let ancienRattachement = "";
  let nouveauRattachement = "";

  if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    const loc = await db
      .prepare(`
        SELECT l.nom, l.province_id, l.departement_id, p.nom AS prov_nom, d.nom AS dep_nom
        FROM localites l
        INNER JOIN provinces p ON p.id = l.province_id
        LEFT JOIN departements d ON d.id = l.departement_id
        WHERE l.id = ?
      `)
      .bind(id)
      .first<{ nom: string; province_id: string; departement_id: string | null; prov_nom: string; dep_nom: string | null }>();

    if (!loc) throw new ErreurAdministrationTerritoriale(`Localité ${id} introuvable.`, 404);
    nomUnite = loc.nom;
    ancienRattachement = `${loc.prov_nom} > ${loc.dep_nom || "Rattachement direct"}`;

    if (nouveauDepartementId) {
      const nouveauDep = await db
        .prepare("SELECT d.nom, d.province_id, p.nom AS prov_nom FROM departements d INNER JOIN provinces p ON p.id = d.province_id WHERE d.id = ?")
        .bind(nouveauDepartementId)
        .first<{ nom: string; province_id: string; prov_nom: string }>();

      if (!nouveauDep) throw new ErreurAdministrationTerritoriale("Nouveau département introuvable.", 404);
      if (nouveauDep.province_id !== loc.province_id) {
        return {
          unite_id: id,
          nom_unite: nomUnite,
          type_unite: type,
          ancien_rattachement: ancienRattachement,
          nouveau_rattachement: `${nouveauDep.prov_nom} > ${nouveauDep.nom}`,
          menages_impactes: 0,
          operations_impactees: 0,
          distributions_historiques_preservees: 0,
          autorise: false,
          message_avertissement: "Le changement de rattachement interprovincial est interdit.",
        };
      }
      nouveauRattachement = `${nouveauDep.prov_nom} > ${nouveauDep.nom}`;
    }

    const menages = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE localite_id = ?").bind(id).first<{ c: number }>();
    const distributions = await db.prepare("SELECT COUNT(*) AS c FROM distributions_provinciales dp INNER JOIN zones_distribution zd ON zd.distribution_id = dp.id WHERE zd.localite_id = ?").bind(id).first<{ c: number }>();

    return {
      unite_id: id,
      nom_unite: nomUnite,
      type_unite: type,
      ancien_rattachement: ancienRattachement,
      nouveau_rattachement: nouveauRattachement,
      menages_impactes: menages?.c ?? 0,
      operations_impactees: 0,
      distributions_historiques_preservees: distributions?.c ?? 0,
      autorise: true,
    };
  }

  if (type === "SOUS_PREFECTURE") {
    const sp = await db
      .prepare(`
        SELECT sp.nom, sp.departement_id, d.province_id, p.nom AS prov_nom, d.nom AS dep_nom
        FROM sous_prefectures sp
        INNER JOIN departements d ON d.id = sp.departement_id
        INNER JOIN provinces p ON p.id = d.province_id
        WHERE sp.id = ?
      `)
      .bind(id)
      .first<{ nom: string; departement_id: string; province_id: string; prov_nom: string; dep_nom: string }>();

    if (!sp) throw new ErreurAdministrationTerritoriale(`Sous-préfecture ${id} introuvable.`, 404);
    nomUnite = sp.nom;
    ancienRattachement = `${sp.prov_nom} > Département ${sp.dep_nom}`;

    if (nouveauDepartementId) {
      const nouveauDep = await db
        .prepare("SELECT d.nom, d.province_id, p.nom AS prov_nom FROM departements d INNER JOIN provinces p ON p.id = d.province_id WHERE d.id = ?")
        .bind(nouveauDepartementId)
        .first<{ nom: string; province_id: string; prov_nom: string }>();

      if (!nouveauDep) throw new ErreurAdministrationTerritoriale("Nouveau département introuvable.", 404);
      if (nouveauDep.province_id !== sp.province_id) {
        return {
          unite_id: id,
          nom_unite: nomUnite,
          type_unite: type,
          ancien_rattachement: ancienRattachement,
          nouveau_rattachement: `${nouveauDep.prov_nom} > Département ${nouveauDep.nom}`,
          menages_impactes: 0,
          operations_impactees: 0,
          distributions_historiques_preservees: 0,
          autorise: false,
          message_avertissement: "Le changement de rattachement interprovincial est strictement interdit.",
        };
      }
      nouveauRattachement = `${nouveauDep.prov_nom} > Département ${nouveauDep.nom}`;
    }

    const menages = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE sous_prefecture_id = ?").bind(id).first<{ c: number }>();
    return {
      unite_id: id,
      nom_unite: nomUnite,
      type_unite: type,
      ancien_rattachement: ancienRattachement,
      nouveau_rattachement: nouveauRattachement,
      menages_impactes: menages?.c ?? 0,
      operations_impactees: 0,
      distributions_historiques_preservees: 0,
      autorise: true,
    };
  }

  throw new ErreurAdministrationTerritoriale(`Changement de rattachement non supporté pour le type ${type}`, 400);
}

export async function modifierRattachementTerritorial(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  id: string,
  donnee: z.infer<typeof schemaModificationRattachementTerritorial>,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  const simulation = await simulerRattachementTerritorial(db, type, id, donnee.nouveau_departement_id);
  if (!simulation.autorise) {
    throw new ErreurAdministrationTerritoriale(simulation.message_avertissement || "Rattachement non autorisé.", 409);
  }

  let updateSql;
  if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    updateSql = db.prepare(`
      UPDATE localites SET
        departement_id = COALESCE(?, departement_id),
        sous_prefecture_id = COALESCE(?, sous_prefecture_id),
        commune_id = COALESCE(?, commune_id),
        canton_id = COALESCE(?, canton_id)
      WHERE id = ?
    `).bind(
      donnee.nouveau_departement_id?.trim() || null,
      donnee.nouvelle_sous_prefecture_id?.trim() || null,
      donnee.nouvelle_commune_id?.trim() || null,
      donnee.nouveau_canton_id?.trim() || null,
      id
    );
  } else if (type === "SOUS_PREFECTURE") {
    if (!donnee.nouveau_departement_id) throw new ErreurAdministrationTerritoriale("Le nouveau département est obligatoire.", 400);
    updateSql = db.prepare("UPDATE sous_prefectures SET departement_id = ? WHERE id = ?").bind(donnee.nouveau_departement_id, id);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (
      id, action, entite_type, entite_id, utilisateur_id,
      anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
    ) VALUES (?, 'MODIFICATION_RATTACHEMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    auditId, type, id, utilisateur.id, JSON.stringify({ ancien: simulation.ancien_rattachement }),
    JSON.stringify({ nouveau: simulation.nouveau_rattachement }), donnee.justificatif, donnee.motif, adresseIp, obtenirRequestIdAudit(utilisateur)
  );

  await db.batch([updateSql!, auditSql]);
  return { id, type, simulation, message: "Rattachement territorial mis à jour avec succès." };
}

// 7. SIMULATION ET FUSION D'UNITÉS
export async function simulerFusionUnites(
  db: Database,
  type: TypeUniteTerritoriale,
  principaleId: string,
  doublonId: string,
): Promise<SimulationFusionTerritoire> {
  if (principaleId === doublonId) {
    throw new ErreurAdministrationTerritoriale("Une unité ne peut être fusionnée avec elle-même.", 400);
  }

  let nomSource = "";
  let nomCible = "";
  let codeSource: string | null = null;
  let codeCible: string | null = null;
  let rattachementSource = "";
  let rattachementCible = "";
  let menages = 0;
  let beneficiaires = 0;
  let distributions = 0;
  let sousUnites = 0;
  let menagesDoublons = 0;
  const conflits: string[] = [];
  const avertissements: string[] = [];

  if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    const [uPrincipale, uDoublon] = await Promise.all([
      db.prepare(`
        SELECT l.id, l.nom, l.province_id, l.departement_id, l.type_localite,
               p.nom AS province_nom, d.nom AS departement_nom
        FROM localites l
        INNER JOIN provinces p ON p.id = l.province_id
        LEFT JOIN departements d ON d.id = l.departement_id
        WHERE l.id = ?
      `).bind(principaleId).first<{ id: string; nom: string; province_id: string; departement_id: string | null; type_localite: string; province_nom: string; departement_nom: string | null }>(),
      db.prepare(`
        SELECT l.id, l.nom, l.province_id, l.departement_id, l.type_localite,
               p.nom AS province_nom, d.nom AS departement_nom
        FROM localites l
        INNER JOIN provinces p ON p.id = l.province_id
        LEFT JOIN departements d ON d.id = l.departement_id
        WHERE l.id = ?
      `).bind(doublonId).first<{ id: string; nom: string; province_id: string; departement_id: string | null; type_localite: string; province_nom: string; departement_nom: string | null }>(),
    ]);

    if (!uPrincipale || !uDoublon) {
      throw new ErreurAdministrationTerritoriale("L'une des localités à fusionner est introuvable.", 404);
    }

    nomCible = uPrincipale.nom;
    nomSource = uDoublon.nom;
    rattachementCible = `Province ${uPrincipale.province_nom}${uPrincipale.departement_nom ? ` > Dépt ${uPrincipale.departement_nom}` : ""}`;
    rattachementSource = `Province ${uDoublon.province_nom}${uDoublon.departement_nom ? ` > Dépt ${uDoublon.departement_nom}` : ""}`;

    if (uPrincipale.province_id !== uDoublon.province_id) {
      conflits.push("Les deux unités appartiennent à des provinces différentes.");
    }
    if (uPrincipale.type_localite !== uDoublon.type_localite) {
      conflits.push(`Types différents : ${uPrincipale.type_localite} vs ${uDoublon.type_localite}`);
    }

    const mRes = await db.prepare("SELECT COUNT(*) AS c, SUM(nombre_personnes) AS pers FROM menages WHERE localite_id = ?").bind(doublonId).first<{ c: number; pers: number | null }>();
    menages = mRes?.c ?? 0;
    beneficiaires = mRes?.pers ?? 0;

    const dRes = await db.prepare("SELECT COUNT(*) AS c FROM zones_distribution WHERE localite_id = ?").bind(doublonId).first<{ c: number }>();
    distributions = dRes?.c ?? 0;

    const qRes = await db.prepare("SELECT COUNT(*) AS c FROM quartiers WHERE localite_id = ?").bind(doublonId).first<{ c: number }>();
    sousUnites = qRes?.c ?? 0;

    // Détection de collision de ménages
    const dblRes = await db.prepare(`
      SELECT COUNT(*) AS c FROM menages m1
      INNER JOIN menages m2 ON LOWER(TRIM(m1.nom_chef_menage)) = LOWER(TRIM(m2.nom_chef_menage))
      WHERE m1.localite_id = ? AND m2.localite_id = ?
    `).bind(doublonId, principaleId).first<{ c: number }>();
    menagesDoublons = dblRes?.c ?? 0;
    if (menagesDoublons > 0) {
      avertissements.push(`${menagesDoublons} ménages portent le même nom de chef de ménage dans les deux unités.`);
    }
  } else if (type === "DEPARTEMENT") {
    const [uPrincipale, uDoublon] = await Promise.all([
      db.prepare(`
        SELECT d.id, d.nom, d.code, d.province_id, p.nom AS province_nom
        FROM departements d
        INNER JOIN provinces p ON p.id = d.province_id
        WHERE d.id = ?
      `).bind(principaleId).first<{ id: string; nom: string; code: string | null; province_id: string; province_nom: string }>(),
      db.prepare(`
        SELECT d.id, d.nom, d.code, d.province_id, p.nom AS province_nom
        FROM departements d
        INNER JOIN provinces p ON p.id = d.province_id
        WHERE d.id = ?
      `).bind(doublonId).first<{ id: string; nom: string; code: string | null; province_id: string; province_nom: string }>(),
    ]);

    if (!uPrincipale || !uDoublon) {
      throw new ErreurAdministrationTerritoriale("L'un des départements à fusionner est introuvable.", 404);
    }
    nomCible = uPrincipale.nom;
    nomSource = uDoublon.nom;
    codeCible = uPrincipale.code;
    codeSource = uDoublon.code;
    rattachementCible = `Province ${uPrincipale.province_nom}`;
    rattachementSource = `Province ${uDoublon.province_nom}`;

    if (uPrincipale.province_id !== uDoublon.province_id) {
      conflits.push("Les départements appartiennent à des provinces distinctes.");
    }

    if (codeSource && codeCible && codeSource !== codeCible) {
      avertissements.push(`Collision de codes : source « ${codeSource} » et cible « ${codeCible} ».`);
    }

    const locRes = await db.prepare("SELECT COUNT(*) AS c FROM localites WHERE departement_id = ?").bind(doublonId).first<{ c: number }>();
    sousUnites = locRes?.c ?? 0;
  }

  // Contrôle de ressemblance toponymique
  const sNorm = normaliserChaine(nomSource);
  const cNorm = normaliserChaine(nomCible);
  if (sNorm && cNorm && sNorm !== cNorm && !sNorm.includes(cNorm) && !cNorm.includes(sNorm)) {
    avertissements.push(`Écart toponymique détecté entre « ${nomSource} » et « ${nomCible} ». Vérifiez qu'il s'agit bien de la même entité.`);
  }

  const fusionAutorisee = conflits.length === 0;

  return {
    unite_source_id: doublonId,
    unite_cible_id: principaleId,
    nom_source: nomSource,
    nom_cible: nomCible,
    rattachement_source: rattachementSource,
    rattachement_cible: rattachementCible,
    code_source: codeSource,
    code_cible: codeCible,
    menages_concernes: menages,
    beneficiaires_concernes: beneficiaires,
    distributions_concernees: distributions,
    operations_concernees: 0,
    stocks_ou_entrepots_concernes: 0,
    sous_unites_concernees: sousUnites,
    menages_doublons_potentiels: menagesDoublons,
    conflits_identifies: conflits,
    avertissements,
    fusion_autorisee: fusionAutorisee,
    message_blocage: fusionAutorisee ? null : conflits.join("; "),
  };
}

export async function executerFusionUnites(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  principaleId: string,
  doublonId: string,
  motif: string,
  justificatif: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  const simulation = await simulerFusionUnites(db, type, principaleId, doublonId);
  if (!simulation.fusion_autorisee) {
    throw new ErreurAdministrationTerritoriale(`Fusion interdite: ${simulation.message_blocage}`, 409);
  }

  const instructions = [];

  // 1. Table de correspondance des fusions
  const correspondanceId = crypto.randomUUID();
  const typeCorr = ["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type) ? "LOCALITE" : type;
  instructions.push(
    db.prepare(`
      INSERT INTO correspondances_fusions_territoriales (
        id, entite_type, ancien_id, nouveau_id, motif, justificatif, fusionne_par
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(correspondanceId, typeCorr, doublonId, principaleId, motif, justificatif, utilisateur.id)
  );

  // 2. Transfert des références actives (sans altérer l'intégrité historique des distributions physiques)
  if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    // Réaffecter les ménages actifs
    instructions.push(
      db.prepare("UPDATE menages SET localite_id = ? WHERE localite_id = ?").bind(principaleId, doublonId)
    );
    // Réaffecter les quartiers
    instructions.push(
      db.prepare("UPDATE quartiers SET localite_id = ? WHERE localite_id = ?").bind(principaleId, doublonId)
    );
    // Archiver la localité doublon (statut REJETE conforme à la contrainte CHECK de localites)
    instructions.push(
      db.prepare("UPDATE localites SET statut_validation = 'REJETE' WHERE id = ?").bind(doublonId)
    );
  } else if (type === "DEPARTEMENT") {
    instructions.push(
      db.prepare("UPDATE localites SET departement_id = ? WHERE departement_id = ?").bind(principaleId, doublonId)
    );
    instructions.push(
      db.prepare("UPDATE sous_prefectures SET departement_id = ? WHERE departement_id = ?").bind(principaleId, doublonId)
    );
    instructions.push(
      db.prepare("UPDATE departements SET statut_validation = 'ARCHIVE', actif = 0 WHERE id = ?").bind(doublonId)
    );
  }

  // 3. Audit
  const auditId = crypto.randomUUID();
  instructions.push(
    db.prepare(`
      INSERT INTO audits_territoire (
        id, action, entite_type, entite_id, utilisateur_id,
        anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
      ) VALUES (?, 'FUSION', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      auditId, type, principaleId, utilisateur.id,
      JSON.stringify({ doublon_id: doublonId, nom_doublon: simulation.nom_source }),
      JSON.stringify({ principale_id: principaleId, nom_principale: simulation.nom_cible }),
      justificatif, motif, adresseIp, obtenirRequestIdAudit(utilisateur)
    )
  );

  await db.batch(instructions);
  return {
    correspondance_id: correspondanceId,
    type,
    principale_id: principaleId,
    doublon_id: doublonId,
    message: "Fusion d'unités territoriales exécutée avec succès.",
  };
}

// 8. ARCHIVAGE SÉCURISÉ
export async function archiverUniteTerritoriale(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  id: string,
  motif: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  let updateSql;
  switch (type) {
    case "PROVINCE":
      updateSql = db.prepare("UPDATE provinces SET actif = 0 WHERE id = ?").bind(id);
      break;
    case "DEPARTEMENT":
      updateSql = db.prepare("UPDATE departements SET actif = 0, statut_validation = 'ARCHIVE', statut_operationnel = 'ARCHIVE' WHERE id = ?").bind(id);
      break;
    case "SOUS_PREFECTURE":
      updateSql = db.prepare("UPDATE sous_prefectures SET actif = 0 WHERE id = ?").bind(id);
      break;
    case "COMMUNE":
      updateSql = db.prepare("UPDATE communes SET actif = 0, statut_validation = 'ARCHIVE' WHERE id = ?").bind(id);
      break;
    case "CANTON":
      updateSql = db.prepare("UPDATE cantons SET statut_validation = 'REJETE' WHERE id = ?").bind(id);
      break;
    case "VILLE":
    case "VILLAGE":
    case "HAMEAU":
    case "FERRICK":
    case "CAMPEMENT":
      updateSql = db.prepare("UPDATE localites SET statut_validation = 'REJETE' WHERE id = ?").bind(id);
      break;
    case "ARRONDISSEMENT":
      updateSql = db.prepare("UPDATE arrondissements SET statut_validation = 'ARCHIVE' WHERE id = ?").bind(id);
      break;
    case "QUARTIER":
      updateSql = db.prepare("UPDATE quartiers SET statut_validation = 'REJETE' WHERE id = ?").bind(id);
      break;
    case "CARRE":
    case "BLOC":
    case "SECTEUR":
      updateSql = db.prepare("UPDATE carres SET statut_validation = 'ARCHIVE' WHERE id = ?").bind(id);
      break;
    case "SITE_HUMANITAIRE":
      updateSql = db.prepare("UPDATE sites_humanitaires SET statut_validation = 'FERME' WHERE id = ?").bind(id);
      break;
    default:
      throw new ErreurAdministrationTerritoriale(`Archivage non supporté pour le type ${type}`, 400);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (
      id, action, entite_type, entite_id, utilisateur_id,
      anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
    ) VALUES (?, 'ARCHIVAGE', ?, ?, ?, NULL, '{"statut":"ARCHIVE"}', 'Archivage administratif', ?, ?, ?)
  `).bind(auditId, type, id, utilisateur.id, motif, adresseIp, obtenirRequestIdAudit(utilisateur));

  await db.batch([updateSql, auditSql]);
  return { id, type, message: "Unité territoriale archivée." };
}

// 8b. RÉACTIVATION SÉCURISÉE
export async function reactiverUniteTerritoriale(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  id: string,
  motif: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  let updateSql;
  switch (type) {
    case "PROVINCE":
      updateSql = db.prepare("UPDATE provinces SET actif = 1 WHERE id = ?").bind(id);
      break;
    case "DEPARTEMENT":
      updateSql = db.prepare("UPDATE departements SET actif = 1, statut_validation = 'VALIDE', statut_operationnel = 'ACTIF' WHERE id = ?").bind(id);
      break;
    case "SOUS_PREFECTURE":
      updateSql = db.prepare("UPDATE sous_prefectures SET actif = 1 WHERE id = ?").bind(id);
      break;
    case "COMMUNE":
      updateSql = db.prepare("UPDATE communes SET actif = 1, statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    case "CANTON":
      updateSql = db.prepare("UPDATE cantons SET statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    case "VILLE":
    case "VILLAGE":
    case "HAMEAU":
    case "FERRICK":
    case "CAMPEMENT":
      updateSql = db.prepare("UPDATE localites SET statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    case "ARRONDISSEMENT":
      updateSql = db.prepare("UPDATE arrondissements SET statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    case "QUARTIER":
      updateSql = db.prepare("UPDATE quartiers SET statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    case "CARRE":
    case "BLOC":
    case "SECTEUR":
      updateSql = db.prepare("UPDATE carres SET statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    case "SITE_HUMANITAIRE":
      updateSql = db.prepare("UPDATE sites_humanitaires SET statut_validation = 'VALIDE' WHERE id = ?").bind(id);
      break;
    default:
      throw new ErreurAdministrationTerritoriale(`Réactivation non supportée pour le type ${type}`, 400);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (
      id, action, entite_type, entite_id, utilisateur_id,
      anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
    ) VALUES (?, 'REACTIVATION', ?, ?, ?, '{"statut":"ARCHIVE"}', '{"statut":"ACTIF"}', 'Réactivation par le Propriétaire', ?, ?, ?)
  `).bind(auditId, type, id, utilisateur.id, motif, adresseIp, obtenirRequestIdAudit(utilisateur));

  await db.batch([updateSql, auditSql]);
  return { id, type, statut_validation: "VALIDE", message: "Unité territoriale réactivée avec succès." };
}

// 9. SUPPRESSION PHYSIQUE SÉCURISÉE (INTERDITE SI DÉPENDANCES)
export async function supprimerUniteTerritoriale(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  id: string,
  motif: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  let deleteSql;

  switch (type) {
    case "PROVINCE": {
      const deps = await db.prepare("SELECT COUNT(*) as c FROM departements WHERE province_id = ?").bind(id).first<{ c: number }>();
      const locs = await db.prepare("SELECT COUNT(*) as c FROM localites WHERE province_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) as c FROM menages WHERE province_id = ?").bind(id).first<{ c: number }>();
      const tot = (deps?.c ?? 0) + (locs?.c ?? 0) + (men?.c ?? 0);
      if (tot > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : la province possède ${deps?.c ?? 0} départements, ${locs?.c ?? 0} localités et ${men?.c ?? 0} ménages. Utilisez l'archivage.`,
          409
        );
      }
      deleteSql = db.prepare("DELETE FROM provinces WHERE id = ?").bind(id);
      break;
    }

    case "DEPARTEMENT": {
      const locs = await db.prepare("SELECT COUNT(*) AS c FROM localites WHERE departement_id = ?").bind(id).first<{ c: number }>();
      const sps = await db.prepare("SELECT COUNT(*) AS c FROM sous_prefectures WHERE departement_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE departement_id = ?").bind(id).first<{ c: number }>();
      const ent = await db.prepare("SELECT COUNT(*) AS c FROM entrepots WHERE localite_id IN (SELECT id FROM localites WHERE departement_id = ?)").bind(id).first<{ c: number }>();
      const dist = await db.prepare("SELECT COUNT(*) AS c FROM distributions_provinciales WHERE departement_id = ?").bind(id).first<{ c: number }>();

      const totalDeps = (locs?.c ?? 0) + (sps?.c ?? 0) + (men?.c ?? 0) + (ent?.c ?? 0) + (dist?.c ?? 0);
      if (totalDeps > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : le département est rattaché à ${locs?.c ?? 0} localités, ${sps?.c ?? 0} sous-préfectures, ${men?.c ?? 0} ménages et ${dist?.c ?? 0} distributions. Préférez l'archivage.`,
          409
        );
      }

      deleteSql = db.prepare("DELETE FROM departements WHERE id = ?").bind(id);
      break;
    }

    case "SOUS_PREFECTURE": {
      const locs = await db.prepare("SELECT COUNT(*) AS c FROM localites WHERE sous_prefecture_id = ?").bind(id).first<{ c: number }>();
      const cantons = await db.prepare("SELECT COUNT(*) AS c FROM cantons WHERE sous_prefecture_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE sous_prefecture_id = ?").bind(id).first<{ c: number }>();
      const tot = (locs?.c ?? 0) + (cantons?.c ?? 0) + (men?.c ?? 0);
      if (tot > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : la sous-préfecture possède ${locs?.c ?? 0} localités, ${cantons?.c ?? 0} cantons et ${men?.c ?? 0} ménages rattachés.`,
          409
        );
      }
      deleteSql = db.prepare("DELETE FROM sous_prefectures WHERE id = ?").bind(id);
      break;
    }

    case "COMMUNE": {
      const ratts = await db.prepare("SELECT COUNT(*) AS c FROM rattachements_territoriaux WHERE commune_id = ?").bind(id).first<{ c: number }>();
      const locs = await db.prepare("SELECT COUNT(*) AS c FROM localites WHERE commune_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE commune_id = ?").bind(id).first<{ c: number }>();
      const tot = (ratts?.c ?? 0) + (locs?.c ?? 0) + (men?.c ?? 0);
      if (tot > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : la commune possède ${ratts?.c ?? 0} rattachements territoriaux, ${locs?.c ?? 0} localités et ${men?.c ?? 0} ménages.`,
          409
        );
      }
      deleteSql = db.prepare("DELETE FROM communes WHERE id = ?").bind(id);
      break;
    }

    case "CANTON": {
      const locs = await db.prepare("SELECT COUNT(*) AS c FROM localites WHERE canton_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE canton_id = ?").bind(id).first<{ c: number }>();
      const tot = (locs?.c ?? 0) + (men?.c ?? 0);
      if (tot > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : le canton possède ${locs?.c ?? 0} localités et ${men?.c ?? 0} ménages rattachés.`,
          409
        );
      }
      deleteSql = db.prepare("DELETE FROM cantons WHERE id = ?").bind(id);
      break;
    }

    case "VILLE":
    case "VILLAGE":
    case "HAMEAU":
    case "FERRICK":
    case "CAMPEMENT": {
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE localite_id = ?").bind(id).first<{ c: number }>();
      const zones = await db.prepare("SELECT COUNT(*) AS c FROM zones_distribution WHERE localite_id = ?").bind(id).first<{ c: number }>();
      const quartiers = await db.prepare("SELECT COUNT(*) AS c FROM quartiers WHERE localite_id = ?").bind(id).first<{ c: number }>();

      const totalDeps = (men?.c ?? 0) + (zones?.c ?? 0) + (quartiers?.c ?? 0);
      if (totalDeps > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : la localité possède des dépendances actives (${men?.c ?? 0} ménages, ${zones?.c ?? 0} zones de distribution, ${quartiers?.c ?? 0} quartiers). Utilisez l'archivage ou la fusion.`,
          409
        );
      }

      deleteSql = db.prepare("DELETE FROM localites WHERE id = ?").bind(id);
      break;
    }

    case "ARRONDISSEMENT": {
      const qrt = await db.prepare("SELECT COUNT(*) AS c FROM quartiers WHERE arrondissement_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE arrondissement_id = ?").bind(id).first<{ c: number }>();
      const tot = (qrt?.c ?? 0) + (men?.c ?? 0);
      if (tot > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : l'arrondissement possède ${qrt?.c ?? 0} quartiers et ${men?.c ?? 0} ménages.`,
          409
        );
      }
      deleteSql = db.prepare("DELETE FROM arrondissements WHERE id = ?").bind(id);
      break;
    }

    case "QUARTIER": {
      const carres = await db.prepare("SELECT COUNT(*) AS c FROM carres WHERE quartier_id = ?").bind(id).first<{ c: number }>();
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE quartier_id = ?").bind(id).first<{ c: number }>();
      const tot = (carres?.c ?? 0) + (men?.c ?? 0);
      if (tot > 0) {
        throw new ErreurAdministrationTerritoriale(
          `Suppression physique refusée : le quartier possède ${carres?.c ?? 0} carrés et ${men?.c ?? 0} ménages rattachés.`,
          409
        );
      }
      deleteSql = db.prepare("DELETE FROM quartiers WHERE id = ?").bind(id);
      break;
    }

    case "CARRE":
    case "BLOC":
    case "SECTEUR": {
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE carre_id = ?").bind(id).first<{ c: number }>();
      if ((men?.c ?? 0) > 0) {
        throw new ErreurAdministrationTerritoriale(`Suppression physique refusée : la subdivision contient ${men?.c ?? 0} ménages.`, 409);
      }
      deleteSql = db.prepare("DELETE FROM carres WHERE id = ?").bind(id);
      break;
    }

    case "SITE_HUMANITAIRE": {
      const men = await db.prepare("SELECT COUNT(*) AS c FROM menages WHERE site_humanitaire_id = ?").bind(id).first<{ c: number }>();
      if ((men?.c ?? 0) > 0) {
        throw new ErreurAdministrationTerritoriale(`Suppression physique refusée : le site humanitaire contient ${men?.c ?? 0} ménages.`, 409);
      }
      deleteSql = db.prepare("DELETE FROM sites_humanitaires WHERE id = ?").bind(id);
      break;
    }

    default:
      throw new ErreurAdministrationTerritoriale(`Suppression physique non supportée pour le type ${type}`, 400);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (id, action, entite_type, entite_id, utilisateur_id, motif, adresse_ip, request_id)
    VALUES (?, 'SUPPRESSION', ?, ?, ?, ?, ?, ?)
  `).bind(auditId, type, id, utilisateur.id, motif, adresseIp, obtenirRequestIdAudit(utilisateur));

  await db.batch([deleteSql, auditSql]);
  return { id, type, message: `Unité ${type} supprimée avec succès (aucune dépendance détectée).` };
}

// 10. VALIDATION ET RETRAIT DE VALIDATION (UNITAIRE ET LOT)
export async function validerUniteTerritoriale(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  id: string,
  donnee: z.infer<typeof schemaValidationUniteTerritoriale>,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  const action = donnee.statut_validation === "VALIDE" ? "VALIDATION" : "RETRAIT_VALIDATION";
  let updateSql;

  if (type === "DEPARTEMENT") {
    updateSql = db.prepare(`
      UPDATE departements SET
        statut_validation = ?,
        validation_administrative = ?,
        validation_rattachement = ?,
        source_officielle = ?,
        reference_juridique = COALESCE(?, reference_juridique),
        date_effet = COALESCE(?, date_effet)
      WHERE id = ?
    `).bind(
      donnee.statut_validation, donnee.statut_validation, donnee.statut_validation,
      donnee.source_officielle, donnee.reference_juridique ?? null, donnee.date_effet ?? null, id
    );
  } else if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    updateSql = db.prepare(`
      UPDATE localites SET
        statut_validation = ?,
        source_documentation = ?,
        valide_par = ?
      WHERE id = ?
    `).bind(donnee.statut_validation, donnee.source_officielle, donnee.statut_validation === "VALIDE" ? utilisateur.id : null, id);
  } else {
    throw new ErreurAdministrationTerritoriale(`Validation non supportée pour ${type}`, 400);
  }

  const auditId = crypto.randomUUID();
  const auditSql = db.prepare(`
    INSERT INTO audits_territoire (
      id, action, entite_type, entite_id, utilisateur_id,
      anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `).bind(
    auditId, action, type, id, utilisateur.id,
    JSON.stringify({ statut_validation: donnee.statut_validation }),
    donnee.source_officielle, donnee.motif, adresseIp, obtenirRequestIdAudit(utilisateur)
  );

  await db.batch([updateSql, auditSql]);
  return { id, type, statut_validation: donnee.statut_validation, message: `Statut de validation mis à jour: ${donnee.statut_validation}` };
}

export async function validerLotUnitesTerritoriales(
  db: Database,
  utilisateur: UtilisateurSession,
  type: TypeUniteTerritoriale,
  donnee: z.infer<typeof schemaValidationLotTerritoire>,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  const instructions = [];
  const action = donnee.statut_validation === "VALIDE" ? "VALIDATION" : "RETRAIT_VALIDATION";

  for (const id of donnee.ids) {
    if (type === "DEPARTEMENT") {
      instructions.push(
        db.prepare(`
          UPDATE departements SET
            statut_validation = ?,
            validation_administrative = ?,
            validation_rattachement = ?,
            source_officielle = ?
          WHERE id = ?
        `).bind(donnee.statut_validation, donnee.statut_validation, donnee.statut_validation, donnee.source_officielle, id)
      );
    } else if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
      instructions.push(
        db.prepare(`
          UPDATE localites SET
            statut_validation = ?,
            source_documentation = ?,
            valide_par = ?
          WHERE id = ?
        `).bind(donnee.statut_validation, donnee.source_officielle, donnee.statut_validation === "VALIDE" ? utilisateur.id : null, id)
      );
    }

    const auditId = crypto.randomUUID();
    instructions.push(
      db.prepare(`
        INSERT INTO audits_territoire (
          id, action, entite_type, entite_id, utilisateur_id,
          anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, request_id
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `).bind(
        auditId, action, type, id, utilisateur.id,
        JSON.stringify({ statut_validation: donnee.statut_validation }),
        donnee.source_officielle, donnee.motif, adresseIp, obtenirRequestIdAudit(utilisateur)
      )
    );
  }

  await db.batch(instructions);
  return {
    total_traite: donnee.ids.length,
    statut_validation: donnee.statut_validation,
    message: `${donnee.ids.length} unités mises à jour vers ${donnee.statut_validation}.`,
  };
}

// 11. DÉTECTION DES DOUBLONS
export async function detecterDoublonsTerritoriaux(
  db: Database,
  type: TypeUniteTerritoriale,
  provinceId?: string,
) {
  const resultats = [];

  if (["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(type)) {
    const rows = await db
      .prepare(`
        SELECT l1.id AS id1, l1.nom AS nom1, l1.departement_id AS dep1, l1.statut_validation AS stat1,
               l2.id AS id2, l2.nom AS nom2, l2.departement_id AS dep2, l2.statut_validation AS stat2,
               p.nom AS province_nom
        FROM localites l1
        INNER JOIN localites l2 ON l1.province_id = l2.province_id AND l1.id < l2.id
        INNER JOIN provinces p ON p.id = l1.province_id
        WHERE (? IS NULL OR l1.province_id = ?)
          AND LOWER(TRIM(l1.nom)) = LOWER(TRIM(l2.nom))
        LIMIT 50
      `)
      .bind(provinceId ?? null, provinceId ?? null)
      .all<any>();

    resultats.push(...rows.results);
  } else if (type === "DEPARTEMENT") {
    const rows = await db
      .prepare(`
        SELECT d1.id AS id1, d1.nom AS nom1, d1.chef_lieu AS chef1, d1.statut_validation AS stat1,
               d2.id AS id2, d2.nom AS nom2, d2.chef_lieu AS chef2, d2.statut_validation AS stat2,
               p.nom AS province_nom
        FROM departements d1
        INNER JOIN departements d2 ON d1.province_id = d2.province_id AND d1.id < d2.id
        INNER JOIN provinces p ON p.id = d1.province_id
        WHERE (? IS NULL OR d1.province_id = ?)
          AND LOWER(TRIM(d1.nom)) = LOWER(TRIM(d2.nom))
        LIMIT 50
      `)
      .bind(provinceId ?? null, provinceId ?? null)
      .all<any>();

    resultats.push(...rows.results);
  }

  return resultats;
}

// 12. PRÉVISUALISATION ET IMPORT CSV
export async function previsualiserImportTerritoire(
  db: Database,
  csvTexte: string,
): Promise<PrevisualisationImportTerritoire> {
  const lignes = csvTexte.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lignes.length <= 1) {
    return {
      lignes_nouvelles: 0,
      lignes_existantes: 0,
      doublons_detectes: 0,
      rattachements_inconnus: 0,
      incompatibilites: 0,
      sources_insuffisantes: 0,
      erreurs: [{ ligne: 1, message: "Fichier CSV vide ou dépourvu de données." }],
      lignes_valides: [],
    };
  }

  const premiereLigne = lignes[0];
  if (!premiereLigne) {
    return {
      lignes_nouvelles: 0,
      lignes_existantes: 0,
      doublons_detectes: 0,
      rattachements_inconnus: 0,
      incompatibilites: 0,
      sources_insuffisantes: 0,
      erreurs: [{ ligne: 1, message: "Fichier CSV vide." }],
      lignes_valides: [],
    };
  }
  const enTete = premiereLigne.split(",").map(c => normaliserChaine(c));
  const idxType = enTete.findIndex(c => c === "type" || c === "typedunite" || c === "typeunite");
  const idxNom = enTete.findIndex(c => c === "nom" || c === "nomofficiel" || c === "toponyme");
  const idxProvince = enTete.findIndex(c => c === "provinceid" || c === "province");
  const idxDep = enTete.findIndex(c => c === "departementid" || c === "departement");
  const idxChefLieu = enTete.findIndex(c => c === "cheflieu");
  const idxSource = enTete.findIndex(c => c === "source" || c === "sourceofficielle");

  if (idxType === -1 || idxNom === -1 || idxProvince === -1) {
    return {
      lignes_nouvelles: 0,
      lignes_existantes: 0,
      doublons_detectes: 0,
      rattachements_inconnus: 0,
      incompatibilites: 0,
      sources_insuffisantes: 0,
      erreurs: [{ ligne: 1, message: "Colonnes obligatoires manquantes dans l'en-tête (type, nom, province_id requis)." }],
      lignes_valides: [],
    };
  }

  const provincesDb = await db.prepare("SELECT id FROM provinces").all<{ id: string }>();
  const setProvinces = new Set((provincesDb.results || []).map((p: { id: string }) => p.id));

  const departementsDb = await db.prepare("SELECT id, nom, province_id FROM departements").all<{ id: string; nom: string; province_id: string }>();
  const setDepartements = new Set((departementsDb.results || []).map((d: { id: string }) => d.id));

  let nouvelles = 0;
  let existantes = 0;
  let rattachementsInconnus = 0;
  let sourcesInsuffisantes = 0;
  const erreurs: Array<{ ligne: number; message: string }> = [];
  const lignesValides: any[] = [];

  for (let i = 1; i < lignes.length; i++) {
    const ligneCourante = lignes[i];
    if (!ligneCourante) continue;
    const colonnes = ligneCourante.split(",").map(c => c.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
    const type = colonnes[idxType]?.toUpperCase() as TypeUniteTerritoriale;
    const nom = colonnes[idxNom];
    const provinceId = colonnes[idxProvince];
    const depId = idxDep !== -1 ? colonnes[idxDep] : undefined;
    const chefLieu = idxChefLieu !== -1 ? colonnes[idxChefLieu] : undefined;
    const source = idxSource !== -1 ? colonnes[idxSource] : "Importation manuelle CSV";

    if (!nom || nom.length < 2) {
      erreurs.push({ ligne: i + 1, message: "Nom de l'unité trop court ou manquant." });
      continue;
    }

    if (!provinceId || !setProvinces.has(provinceId)) {
      rattachementsInconnus++;
      erreurs.push({ ligne: i + 1, message: `Province inconnue: ${provinceId ?? ""}` });
      continue;
    }

    if (depId && !setDepartements.has(depId)) {
      rattachementsInconnus++;
      erreurs.push({ ligne: i + 1, message: `Département inconnu: ${depId}` });
      continue;
    }

    if (!source || source.length < 3) {
      sourcesInsuffisantes++;
      erreurs.push({ ligne: i + 1, message: "Source officielle ou justificative insuffisante." });
      continue;
    }

    nouvelles++;
    lignesValides.push({
      type,
      nom,
      province_id: provinceId,
      departement_id: depId || undefined,
      chef_lieu: chefLieu || undefined,
      source,
    });
  }

  return {
    lignes_nouvelles: nouvelles,
    lignes_existantes: existantes,
    doublons_detectes: 0,
    rattachements_inconnus: rattachementsInconnus,
    incompatibilites: 0,
    sources_insuffisantes: sourcesInsuffisantes,
    erreurs,
    lignes_valides: lignesValides,
  };
}

export async function executerImportTerritoire(
  db: Database,
  utilisateur: UtilisateurSession,
  lignes: any[],
  adresseIp: string | null,
) {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurAdministrationTerritoriale("Action réservée au rôle PROPRIETAIRE.", 403);
  }

  let importes = 0;
  for (const ligne of lignes) {
    await ajouterUniteTerritoriale(
      db,
      utilisateur,
      {
        type: ligne.type,
        nom: ligne.nom,
        province_id: ligne.province_id,
        departement_id: ligne.departement_id,
        chef_lieu: ligne.chef_lieu,
        source_officielle: ligne.source || "Import CSV certifié",
        statut_validation: "A_VERIFIER",
      },
      adresseIp
    );
    importes++;
  }

  return {
    total_importes: importes,
    message: `${importes} unités territoriales importées avec succès (statut A_VERIFIER).`,
  };
}

// 13. EXPORT CSV DU RÉFÉRENTIEL
export async function exporterTerritoireCsv(
  db: Database,
  type?: TypeUniteTerritoriale,
  provinceId?: string,
): Promise<string> {
  const resultats = await rechercherUnitesTerritoriales(db, {
    type,
    province_id: provinceId,
    limite: 1000,
    decalage: 0,
  });

  const entetes = ["id", "type", "nom", "code", "province_id", "province_nom", "departement_id", "departement_nom", "statut_validation", "chef_lieu", "source_officielle", "fil_ariane"];
  const lignes = [entetes.join(",")];

  for (const el of resultats.elements) {
    const row = [
      el.id,
      el.type,
      `"${el.nom.replace(/"/g, '""')}"`,
      el.code || "",
      el.province_id,
      `"${el.province_nom.replace(/"/g, '""')}"`,
      el.departement_id || "",
      el.departement_nom ? `"${el.departement_nom.replace(/"/g, '""')}"` : "",
      el.statut_validation,
      el.chef_lieu ? `"${el.chef_lieu.replace(/"/g, '""')}"` : "",
      el.source_officielle ? `"${el.source_officielle.replace(/"/g, '""')}"` : "",
      `"${el.fil_ariane.replace(/"/g, '""')}"`,
    ];
    lignes.push(row.join(","));
  }

  return lignes.join("\n");
}

function xmlEchappe(valeur: string): string {
  return valeur.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function colonneExcelIndex(index: number): string {
  let resultat = "";
  let restant = index + 1;
  while (restant > 0) {
    const chiffre = (restant - 1) % 26;
    resultat = String.fromCharCode(65 + chiffre) + resultat;
    restant = Math.floor((restant - 1) / 26);
  }
  return resultat;
}

// 13b. EXPORT XLSX DU RÉFÉRENTIEL
export async function exporterTerritoireXlsx(
  db: Database,
  type?: TypeUniteTerritoriale,
  provinceId?: string,
): Promise<Uint8Array> {
  const resultats = await rechercherUnitesTerritoriales(db, {
    type,
    province_id: provinceId,
    limite: 10000,
    decalage: 0,
  });

  const entetes = [
    "Identifiant", "Type d'unité", "Nom officiel", "Code", "Province ID", "Province Nom",
    "Département ID", "Département Nom", "Statut validation", "Chef-lieu", "Source officielle", "Fil d'Ariane"
  ];

  const lignes: string[][] = [
    entetes,
    ...resultats.elements.map(el => [
      el.id,
      el.type,
      el.nom,
      el.code || "",
      el.province_id,
      el.province_nom,
      el.departement_id || "",
      el.departement_nom || "",
      el.statut_validation,
      el.chef_lieu || "",
      el.source_officielle || "",
      el.fil_ariane,
    ])
  ];

  const lignesXml = lignes.map((ligne, numLigne) => {
    const cellules = ligne.map((val, numCol) => {
      const adresse = `${colonneExcelIndex(numCol)}${numLigne + 1}`;
      return `<c r="${adresse}" t="inlineStr"><is><t xml:space="preserve">${xmlEchappe(val || "")}</t></is></c>`;
    }).join("");
    return `<row r="${numLigne + 1}">${cellules}</row>`;
  }).join("");

  const dernierChamp = colonneExcelIndex(entetes.length - 1);
  const feuille = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${dernierChamp}${lignes.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="${entetes.length}" width="22" customWidth="1"/></cols><sheetData>${lignesXml}</sheetData><autoFilter ref="A1:${dernierChamp}${lignes.length}"/></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Referentiel SIGAD" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const racine = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  return zipSync({
    "[Content_Types].xml": new TextEncoder().encode(contentTypes),
    "_rels/.rels": new TextEncoder().encode(racine),
    "xl/workbook.xml": new TextEncoder().encode(workbook),
    "xl/_rels/workbook.xml.rels": new TextEncoder().encode(workbookRels),
    "xl/worksheets/sheet1.xml": new TextEncoder().encode(feuille),
    "xl/styles.xml": new TextEncoder().encode(styles),
  });
}

// 13c. PRÉVISUALISATION FICHIER CSV OU XLSX
export async function previsualiserImportTerritoireFichier(
  db: Database,
  contenu: Uint8Array | string,
  _nomFichier: string = "",
): Promise<PrevisualisationImportTerritoire> {
  if (typeof contenu === "string") {
    return previsualiserImportTerritoire(db, contenu);
  }

  const octets = contenu as Uint8Array;
  // Détection ZIP / XLSX (signature PK\x03\x04)
  if (octets.length > 4 && octets[0] === 0x50 && octets[1] === 0x4B && octets[2] === 0x03 && octets[3] === 0x04) {
    let decompresse: Record<string, Uint8Array>;
    try {
      decompresse = unzipSync(octets);
    } catch {
      throw new ErreurAdministrationTerritoriale("Le fichier Excel (.xlsx) est corrompu ou illisible.", 400);
    }

    const feuilleXml = decompresse["xl/worksheets/sheet1.xml"];
    const sharedStringsXml = decompresse["xl/sharedStrings.xml"];

    if (!feuilleXml) {
      throw new ErreurAdministrationTerritoriale("Le classeur Excel ne contient pas de feuille valide (sheet1.xml introuvable).", 400);
    }

    const parser = new XMLParser({ ignoreAttributes: false });
    let sharedStrings: string[] = [];
    if (sharedStringsXml) {
      try {
        const parsedSst = parser.parse(new TextDecoder().decode(sharedStringsXml));
        const siList = parsedSst?.sst?.si;
        if (Array.isArray(siList)) {
          sharedStrings = siList.map((s: any) => s.t || s.r?.map((r: any) => r.t).join("") || "");
        } else if (siList) {
          sharedStrings = [siList.t || ""];
        }
      } catch {
        // En cas d'erreur sur sharedStrings, continuer avec tableau vide
      }
    }

    const parsedSheet = parser.parse(new TextDecoder().decode(feuilleXml));
    const sheetData = parsedSheet?.worksheet?.sheetData?.row;
    const rowsArray = Array.isArray(sheetData) ? sheetData : sheetData ? [sheetData] : [];

    const csvLignes: string[] = [];
    for (const r of rowsArray) {
      const cList = Array.isArray(r.c) ? r.c : r.c ? [r.c] : [];
      const ligneCellules: string[] = [];
      for (const cell of cList) {
        const type = cell["@_t"];
        let val = "";
        if (type === "s") {
          const idx = parseInt(cell.v, 10);
          val = sharedStrings[idx] || "";
        } else if (type === "inlineStr") {
          const tVal = cell.is?.t;
          val = typeof tVal === "object" ? (tVal["#text"] ?? "") : String(tVal ?? "");
        } else {
          val = cell.v !== undefined ? String(cell.v) : "";
        }
        ligneCellules.push(`"${String(val ?? "").replace(/"/g, '""')}"`);
      }
      csvLignes.push(ligneCellules.join(","));
    }

    return previsualiserImportTerritoire(db, csvLignes.join("\n"));
  }

  // Fichier texte brut CSV
  return previsualiserImportTerritoire(db, new TextDecoder().decode(octets));
}

// 14. HISTORIQUE DES AUDITS
export async function obtenirHistoriqueAuditsTerritoire(
  db: Database,
  optionsOuLimite:
    | {
        type?: string | undefined;
        action?: string | undefined;
        limite?: number | undefined;
        decalage?: number | undefined;
      }
    | number = 50,
  decalageParDefaut: number = 0,
) {
  let entiteType: string | undefined;
  let action: string | undefined;
  let limite = 50;
  let decalage = 0;

  if (typeof optionsOuLimite === "number") {
    limite = optionsOuLimite;
    decalage = decalageParDefaut;
  } else if (optionsOuLimite && typeof optionsOuLimite === "object") {
    entiteType = optionsOuLimite.type;
    action = optionsOuLimite.action;
    limite = optionsOuLimite.limite ?? 50;
    decalage = optionsOuLimite.decalage ?? 0;
  }

  const clauses: string[] = [];
  const params: any[] = [];

  if (entiteType) {
    clauses.push("a.entite_type = ?");
    params.push(entiteType);
  }
  if (action) {
    clauses.push("a.action = ?");
    params.push(action);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const totalSql = `SELECT COUNT(*) AS total FROM audits_territoire a ${whereSql}`;
  const totalStmt = db.prepare(totalSql);
  const totalRes = params.length > 0
    ? await totalStmt.bind(...params).first<{ total: number }>()
    : await totalStmt.first<{ total: number }>();

  const dataSql = `
      SELECT a.id, a.action, a.entite_type, a.entite_id, a.utilisateur_id, u.identifiant AS utilisateur_identifiant,
             a.anciennes_valeurs, a.nouvelles_valeurs, a.justificatif, a.motif, a.adresse_ip, a.cree_le
      FROM audits_territoire a
      LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
      ${whereSql}
      ORDER BY a.cree_le DESC, a.id DESC
      LIMIT ? OFFSET ?
    `;

  const rows = await db
    .prepare(dataSql)
    .bind(...params, limite, decalage)
    .all<any>();

  return {
    elements: rows.results,
    total: totalRes?.total ?? 0,
    limite,
    decalage,
  };
}
