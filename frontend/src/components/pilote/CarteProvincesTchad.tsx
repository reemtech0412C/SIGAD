import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import {
  schemaReponseIndicateursCarte,
  type IndicateurCarteActif,
  type ReponseIndicateursCarte,
} from "../../../../shared/validations/indicateurs-carte";
import { PROVINCES_TCHAD } from "../../data/provinces-tchad";
import { provinceSelectionnableDansCarte } from "./carte-provinces-access";

interface Props {
  utilisateur: UtilisateurAuthentifie;
}

type PositionGeoJSON = readonly [number, number, ...number[]];

interface FeatureCartographique {
  sigadId: string;
  sigadName: string;
  pcode: string;
  nomOcha: string;
  anneaux: PositionGeoJSON[][];
}

interface PointSvg {
  x: number;
  y: number;
}

interface FeatureProjete extends FeatureCartographique {
  chemin: string;
}

interface ObjetInconnu {
  readonly [cle: string]: unknown;
}

interface ArticleOption {
  id: string;
  code_article: string;
  designation: string;
  unite: string;
  actif: number;
}

interface PageArticles {
  elements: ArticleOption[];
  total: number;
}

const URL_GEOJSON = "/data/tchad-admin1-ocha-v01.geojson";
const LARGEUR_SVG = 600;
const HAUTEUR_SVG = 660;
const TAILLE_PAGE_ARTICLES = 50;
const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const NOMS_INDICATEURS: Record<IndicateurCarteActif, string> = {
  distributions_realisees: "Distributions réalisées",
  distributions_en_cours: "Distributions en cours",
  menages_servis: "Ménages servis",
  stocks_disponibles: "Stocks disponibles",
};

function estObjet(value: unknown): value is ObjetInconnu {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lirePageArticles(value: unknown): PageArticles {
  if (!estObjet(value) || !Array.isArray(value.elements) || typeof value.total !== "number") {
    throw new Error("La liste paginée des articles est invalide.");
  }
  const elements = value.elements.map((entree): ArticleOption => {
    if (!estObjet(entree) || typeof entree.id !== "string" || typeof entree.code_article !== "string"
      || typeof entree.designation !== "string" || typeof entree.unite !== "string"
      || typeof entree.actif !== "number") {
      throw new Error("Une référence d’article est incomplète.");
    }
    return {
      id: entree.id,
      code_article: entree.code_article,
      designation: entree.designation,
      unite: entree.unite,
      actif: entree.actif,
    };
  });
  return { elements, total: value.total };
}

function lireErreur(value: unknown, messageParDefaut: string): string {
  return estObjet(value) && typeof value.erreur === "string" ? value.erreur : messageParDefaut;
}

function couleurValeur(valeur: number | null, maximum: number): string {
  if (valeur === null) return "#e5e9ee";
  const proportion = maximum > 0 ? Math.max(0, Math.min(1, valeur / maximum)) : 0;
  const depart = [239, 246, 251] as const;
  const arrivee = [20, 72, 112] as const;
  const composantes = depart.map((composante, index) => Math.round(composante + ((arrivee[index] ?? composante) - composante) * proportion));
  return `rgb(${composantes[0]} ${composantes[1]} ${composantes[2]})`;
}

function estPosition(value: unknown): value is PositionGeoJSON {
  return Array.isArray(value) && value.length >= 2
    && typeof value[0] === "number" && Number.isFinite(value[0])
    && typeof value[1] === "number" && Number.isFinite(value[1]);
}

function lireFeatureCollection(value: unknown): FeatureCartographique[] {
  if (!estObjet(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    throw new Error("Le fichier des limites provinciales n’est pas une collection GeoJSON valide.");
  }
  const parCodeOcha = new Map<string, (typeof PROVINCES_TCHAD)[number]>(PROVINCES_TCHAD.map((province) => [province.pcode, province]));
  const features = new Map<string, FeatureCartographique>();
  for (const element of value.features) {
    if (!estObjet(element) || !estObjet(element.properties) || !estObjet(element.geometry)) {
      throw new Error("Une entité du fichier géographique est incomplète.");
    }
    const code = element.properties.adm1_pcode;
    const nom = element.properties.adm1_name;
    if (typeof code !== "string" || typeof nom !== "string" || element.geometry.type !== "Polygon" || !Array.isArray(element.geometry.coordinates)) {
      throw new Error("Une limite provinciale ne possède pas les propriétés ou la géométrie attendues.");
    }
    const province = parCodeOcha.get(code);
    if (!province || province.nomOcha !== nom || features.has(province.sigadId)) {
      throw new Error(`Le code géographique ${code} n’est pas associé de manière unique au référentiel SIGAD vérifié.`);
    }
    const anneaux = element.geometry.coordinates.map((anneau) => {
      if (!Array.isArray(anneau) || anneau.length < 4 || !anneau.every(estPosition)) {
        throw new Error(`L’anneau de la province ${province.sigadName} est invalide.`);
      }
      return anneau;
    });
    if (anneaux.length === 0) throw new Error(`La province ${province.sigadName} ne contient aucune limite.`);
    features.set(province.sigadId, { ...province, anneaux });
  }
  if (features.size !== PROVINCES_TCHAD.length) {
    throw new Error(`Le fichier contient ${features.size} provinces reconnues sur ${PROVINCES_TCHAD.length}.`);
  }
  return PROVINCES_TCHAD.map((province) => {
    const feature = features.get(province.sigadId);
    if (!feature) throw new Error(`La géométrie de ${province.sigadName} est absente.`);
    return feature;
  });
}

function projeterFeatures(features: FeatureCartographique[]): FeatureProjete[] {
  const positions = features.flatMap((feature) => feature.anneaux.flat());
  const longitudes = positions.map((position) => position[0]);
  const latitudes = positions.map((position) => position[1]);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const latitudeCentrale = (minimumLatitude + maximumLatitude) / 2;
  const facteurLongitude = Math.cos(latitudeCentrale * Math.PI / 180);
  const marge = 24;
  const largeurGeographique = (maximumLongitude - minimumLongitude) * facteurLongitude;
  const hauteurGeographique = maximumLatitude - minimumLatitude;
  const echelle = Math.min((LARGEUR_SVG - marge * 2) / largeurGeographique, (HAUTEUR_SVG - marge * 2) / hauteurGeographique);
  const largeurProjete = largeurGeographique * echelle;
  const hauteurProjete = hauteurGeographique * echelle;
  const decalageX = (LARGEUR_SVG - largeurProjete) / 2;
  const decalageY = (HAUTEUR_SVG - hauteurProjete) / 2;
  const projeter = (position: PositionGeoJSON): PointSvg => ({
    x: decalageX + (position[0] - minimumLongitude) * facteurLongitude * echelle,
    y: decalageY + (maximumLatitude - position[1]) * echelle,
  });
  return features.map((feature) => {
    const chemin = feature.anneaux.map((anneau) => anneau.map((position, index) => {
      const point = projeter(position);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
    }).join(" ") + " Z").join(" ");
    return { ...feature, chemin };
  });
}

function nomProvince(utilisateur: UtilisateurAuthentifie, provinceId: string | null): string {
  if (!provinceId) return "Aucune province sélectionnée";
  const reference = PROVINCES_TCHAD.find((province) => province.sigadId === provinceId);
  return reference?.sigadName ?? (utilisateur.role === "DELEGUE_PROVINCIAL" ? "Province de session non reconnue" : "Province inconnue");
}

export function CarteProvincesTchad({ utilisateur }: Props) {
  const [features, setFeatures] = useState<FeatureCartographique[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rechargement, setRechargement] = useState(0);
  const [indicateur, setIndicateur] = useState<IndicateurCarteActif>("distributions_realisees");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [articleId, setArticleId] = useState("");
  const [rechercheArticle, setRechercheArticle] = useState("");
  const [decalageArticles, setDecalageArticles] = useState(0);
  const [pageArticles, setPageArticles] = useState<PageArticles | null>(null);
  const [chargementArticles, setChargementArticles] = useState(false);
  const [erreurArticles, setErreurArticles] = useState<string | null>(null);
  const [indicateurs, setIndicateurs] = useState<ReponseIndicateursCarte | null>(null);
  const [chargementIndicateurs, setChargementIndicateurs] = useState(true);
  const [erreurIndicateurs, setErreurIndicateurs] = useState<string | null>(null);
  const [provinceSelectionnee, setProvinceSelectionnee] = useState<string | null>(
    utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null,
  );
  const [provinceSurvolee, setProvinceSurvolee] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const projetees = useMemo(() => features ? projeterFeatures(features) : [], [features]);
  const centrale = utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL";
  const provinceSession = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  const provinceActive = projetees.find((feature) => feature.sigadId === provinceSelectionnee) ?? null;
  const provinceApercue = projetees.find((feature) => feature.sigadId === provinceSurvolee) ?? null;
  const indicateursParProvince = useMemo(
    () => new Map((indicateurs?.provinces ?? []).map((province) => [province.province_id, province])),
    [indicateurs],
  );
  const valeursVisibles = projetees.map((feature) => {
    const province = indicateursParProvince.get(feature.sigadId);
    if (!province) return null;
    const indicateurProvince = province[indicateur];
    return indicateurProvince.valeur;
  }).filter((valeur): valeur is number => valeur !== null);
  const maximumValeur = Math.max(0, ...valeursVisibles);
  const detailProvinceId = provinceSurvolee ?? provinceSelectionnee;
  const detailsProvince = detailProvinceId ? indicateursParProvince.get(detailProvinceId) ?? null : null;
  const articleSelectionne = pageArticles?.elements.find((article) => article.id === articleId) ?? null;

  useEffect(() => {
    if (indicateur !== "stocks_disponibles") return;
    const controleur = new AbortController();
    setChargementArticles(true);
    setErreurArticles(null);
    const minuterie = window.setTimeout(() => {
      const params = new URLSearchParams({ limite: String(TAILLE_PAGE_ARTICLES), decalage: String(decalageArticles) });
      if (rechercheArticle.trim()) params.set("recherche", rechercheArticle.trim());
      fetch(`/api/stocks/articles?${params.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controleur.signal,
      }).then(async (reponse) => {
        const donnees: unknown = await reponse.json().catch(() => null);
        if (!reponse.ok) throw new Error(lireErreur(donnees, "Le catalogue des articles est indisponible."));
        return lirePageArticles(donnees);
      }).then((resultat) => {
        if (controleur.signal.aborted) return;
        const actifs = resultat.elements.filter((article) => article.actif === 1);
        setPageArticles({ ...resultat, elements: actifs });
        if (articleId && !actifs.some((article) => article.id === articleId) && decalageArticles === 0 && !rechercheArticle) {
          setArticleId("");
        }
      }).catch((cause: unknown) => {
        if (!controleur.signal.aborted) setErreurArticles(cause instanceof Error ? cause.message : "Le catalogue des articles est indisponible.");
      }).finally(() => {
        if (!controleur.signal.aborted) setChargementArticles(false);
      });
    }, 180);
    return () => {
      window.clearTimeout(minuterie);
      controleur.abort();
    };
  }, [indicateur, decalageArticles, rechercheArticle, articleId]);

  useEffect(() => {
    const controleur = new AbortController();
    setChargementIndicateurs(true);
    setErreurIndicateurs(null);
    setIndicateurs(null);
    const params = new URLSearchParams();
    if (dateDebut) params.set("date_debut", dateDebut);
    if (dateFin) params.set("date_fin", dateFin);
    if (indicateur === "stocks_disponibles" && articleId) params.set("article_id", articleId);
    const query = params.toString();
    fetch(`/api/rapports/indicateurs-carte${query ? `?${query}` : ""}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controleur.signal,
    }).then(async (reponse) => {
      const donnees: unknown = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(lireErreur(donnees, "Les indicateurs cartographiques sont indisponibles."));
      const resultat = schemaReponseIndicateursCarte.safeParse(donnees);
      if (!resultat.success) throw new Error("La réponse des indicateurs cartographiques ne respecte pas son contrat.");
      return resultat.data;
    }).then((resultat) => {
      if (!controleur.signal.aborted) setIndicateurs(resultat);
    }).catch((cause: unknown) => {
      if (controleur.signal.aborted) return;
      setIndicateurs(null);
      setErreurIndicateurs(cause instanceof Error ? cause.message : "Les indicateurs cartographiques sont indisponibles.");
    }).finally(() => {
      if (!controleur.signal.aborted) setChargementIndicateurs(false);
    });
    return () => controleur.abort();
  }, [dateDebut, dateFin, indicateur, articleId, utilisateur.role, utilisateur.province_id]);

  useEffect(() => {
    setProvinceSelectionnee(provinceSession);
  }, [provinceSession]);

  useEffect(() => {
    const controleur = new AbortController();
    setFeatures(null);
    setErreur(null);
    fetch(URL_GEOJSON, { signal: controleur.signal, headers: { Accept: "application/geo+json, application/json" } })
      .then(async (reponse) => {
        if (!reponse.ok) throw new Error(`Chargement du GeoJSON impossible (HTTP ${reponse.status}).`);
        return lireFeatureCollection(await reponse.json() as unknown);
      })
      .then((resultat) => setFeatures(resultat))
      .catch((cause: unknown) => {
        if (controleur.signal.aborted) return;
        setErreur(cause instanceof Error ? cause.message : "Le référentiel cartographique est indisponible.");
      });
    return () => controleur.abort();
  }, [rechargement]);

  function selectionner(provinceId: string): void {
    if (!provinceSelectionnableDansCarte(utilisateur.role, provinceSession, provinceId)) return;
    setProvinceSelectionnee(provinceId);
  }

  function activerAuClavier(event: KeyboardEvent<SVGPathElement>, provinceId: string): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectionner(provinceId);
  }

  function reinitialiserVue(): void {
    setZoom(1);
    setProvinceSurvolee(null);
    setProvinceSelectionnee(provinceSession);
  }

  const nomProvinceVisible = provinceApercue?.sigadName ?? provinceActive?.sigadName ?? null;
  const valeurSelectionnee = detailsProvince?.[indicateur] ?? null;
  const valeurSelectionneeFormatee = valeurSelectionnee?.valeur === null || valeurSelectionnee === null
    ? null
    : nombreFr.format(valeurSelectionnee.valeur);
  const statutSelectionne = valeurSelectionnee?.etat ?? "INDISPONIBLE";
  const stockSelectionne = detailsProvince?.stocks_disponibles ?? null;
  const maximumLibelle = nombreFr.format(maximumValeur);

  return (
    <section aria-label="Carte interactive des provinces du Tchad" className="sigad-carte-tchad">
      <div className="sigad-carte-tchad__entete">
        <div>
          <span className="sigad-carte-tchad__badge">Mode expérimental · OCHA COD-AB v01</span>
          <p>23 provinces · validation juridique nationale en attente</p>
          {indicateurs?.mode_donnees === "SYNTHETIQUES" && <p className="sigad-carte-tchad__badge-synthetique" role="status">Jeu de données synthétiques de validation</p>}
        </div>
        <div aria-label="Commandes de zoom" className="sigad-carte-tchad__commandes">
          <button aria-label="Zoomer sur la carte" disabled={!features || zoom >= 1.8} onClick={() => setZoom((valeur) => Math.min(1.8, Number((valeur + 0.2).toFixed(1))))} type="button">+</button>
          <button aria-label="Dézoomer sur la carte" disabled={!features || zoom <= 1} onClick={() => setZoom((valeur) => Math.max(1, Number((valeur - 0.2).toFixed(1))))} type="button">−</button>
          <button aria-label="Réinitialiser la carte" disabled={!features && !erreur} onClick={reinitialiserVue} type="button">Réinitialiser</button>
        </div>
      </div>

      <section aria-label="Filtres des indicateurs cartographiques" className="sigad-carte-tchad__filtres">
        <label><span>Indicateur</span><select aria-label="Indicateur cartographique" value={indicateur}
          onChange={(event) => setIndicateur(event.currentTarget.value as IndicateurCarteActif)}>
          {Object.entries(NOMS_INDICATEURS).map(([cle, libelle]) => <option key={cle} value={cle}>{libelle}</option>)}
        </select></label>
        {indicateur === "distributions_realisees" || indicateur === "menages_servis" ? <>
          <label><span>Date de début</span><input aria-label="Début de période de la carte" type="date" value={dateDebut} onChange={(event) => setDateDebut(event.currentTarget.value)} /></label>
          <label><span>Date de fin</span><input aria-label="Fin de période de la carte" type="date" value={dateFin} onChange={(event) => setDateFin(event.currentTarget.value)} /></label>
        </> : <p className="sigad-carte-tchad__filtre-aide">{indicateur === "stocks_disponibles"
          ? "Photographie actuelle · la période ne s’applique pas au stock."
          : "Photographie actuelle · la période ne s’applique pas aux opérations en cours."}</p>}
        {indicateur === "stocks_disponibles" && <>
          <label><span>Rechercher un article</span><input aria-label="Rechercher un article" type="search" value={rechercheArticle}
            onChange={(event) => { setRechercheArticle(event.currentTarget.value); setDecalageArticles(0); }} placeholder="Code ou désignation" /></label>
          <label><span>Article et unité</span><select aria-label="Article pour le stock" value={articleId}
            onChange={(event) => setArticleId(event.currentTarget.value)} disabled={chargementArticles}>
            <option value="">Sélectionner un article</option>
            {pageArticles?.elements.map((article) => <option key={article.id} value={article.id}>{article.designation} · {article.unite}</option>)}
            {articleSelectionne && !pageArticles?.elements.some((article) => article.id === articleSelectionne.id)
              && <option value={articleSelectionne.id}>{articleSelectionne.designation} · {articleSelectionne.unite}</option>}
          </select></label>
          <div className="sigad-carte-tchad__pagination-articles" aria-label="Pagination des articles">
            <button type="button" disabled={chargementArticles || decalageArticles === 0}
              onClick={() => setDecalageArticles((valeur) => Math.max(0, valeur - TAILLE_PAGE_ARTICLES))}>Précédent</button>
            <span>{pageArticles ? `${pageArticles.total === 0 ? 0 : decalageArticles + 1}–${Math.min(decalageArticles + TAILLE_PAGE_ARTICLES, pageArticles.total)} sur ${pageArticles.total}` : "Articles"}</span>
            <button type="button" disabled={chargementArticles || !pageArticles || decalageArticles + TAILLE_PAGE_ARTICLES >= pageArticles.total}
              onClick={() => setDecalageArticles((valeur) => valeur + TAILLE_PAGE_ARTICLES)}>Suivant</button>
          </div>
          {chargementArticles && <p className="sigad-carte-tchad__filtre-aide" role="status">Chargement des articles…</p>}
          {erreurArticles && <p className="sigad-carte-tchad__erreur-indicateur" role="alert">{erreurArticles}</p>}
        </>}
      </section>

      <div className="sigad-carte-tchad__corps">
        <div className="sigad-carte-tchad__surface">
          {!features && !erreur && <div aria-label="Chargement des limites provinciales" className="sigad-carte-tchad__chargement" role="status"><span />Chargement des limites provinciales…</div>}
          {erreur && <div className="sigad-carte-tchad__erreur" role="alert"><strong>Carte indisponible</strong><p>{erreur}</p><button onClick={() => setRechargement((valeur) => valeur + 1)} type="button">Réessayer</button></div>}
          {features && <svg aria-label="Carte des 23 provinces du Tchad" className="sigad-carte-tchad__svg" role="group" viewBox={`0 0 ${LARGEUR_SVG} ${HAUTEUR_SVG}`}>
            <g transform={`translate(${LARGEUR_SVG / 2} ${HAUTEUR_SVG / 2}) scale(${zoom}) translate(${-LARGEUR_SVG / 2} ${-HAUTEUR_SVG / 2})`}>
              {projetees.map((feature) => {
                const selectionPermise = provinceSelectionnableDansCarte(utilisateur.role, provinceSession, feature.sigadId);
                const selectionnee = provinceSelectionnee === feature.sigadId;
                const metrique = indicateursParProvince.get(feature.sigadId)?.[indicateur];
                const valeur = metrique?.etat === "DISPONIBLE" ? metrique.valeur : null;
                const couleur = couleurValeur(valeur, maximumValeur);
                const valeurTitre = metrique?.valeur === null || !metrique
                  ? "données indisponibles"
                  : nombreFr.format(metrique.valeur);
                return <path
                  aria-disabled={!selectionPermise}
                  aria-label={`${feature.sigadName}, code ${feature.pcode}${selectionPermise ? ", sélectionner la province" : ", limites publiques, sélection réservée à votre province"}`}
                  aria-pressed={selectionnee}
                  className={`sigad-carte-tchad__province${selectionnee ? " sigad-carte-tchad__province--selectionnee" : ""}${provinceSurvolee === feature.sigadId ? " sigad-carte-tchad__province--survolee" : ""}`}
                  d={feature.chemin}
                  fillRule="evenodd"
                  style={{ fill: couleur }}
                  key={feature.sigadId}
                  onBlur={() => setProvinceSurvolee((valeur) => valeur === feature.sigadId ? null : valeur)}
                  onClick={() => selectionner(feature.sigadId)}
                  onFocus={() => setProvinceSurvolee(feature.sigadId)}
                  onKeyDown={(event) => activerAuClavier(event, feature.sigadId)}
                  onPointerEnter={() => setProvinceSurvolee(feature.sigadId)}
                  onPointerLeave={() => setProvinceSurvolee((valeur) => valeur === feature.sigadId ? null : valeur)}
                  role="button"
                  tabIndex={selectionPermise ? 0 : -1}
                ><title>{`${feature.sigadName} (${feature.pcode}) · ${NOMS_INDICATEURS[indicateur]} : ${valeurTitre}`}</title></path>;
              })}
            </g>
          </svg>}
          {features && <div className="sigad-carte-tchad__legende">
            <span aria-hidden="true" />Limite provinciale
            <span className="sigad-carte-tchad__echelle" aria-hidden="true" />{nombreFr.format(0)} à {maximumLibelle}
            <span className="sigad-carte-tchad__pastille-indisponible" />Données indisponibles
          </div>}
        </div>

        <aside aria-live="polite" className="sigad-carte-tchad__details">
          <div className="sigad-carte-tchad__details-entete"><span>Province</span><strong>{nomProvinceVisible ?? (provinceActive?.sigadName ?? "Sélectionnez une province")}</strong></div>
          {provinceApercue && <p className="sigad-carte-tchad__survol">Code OCHA : {provinceApercue.pcode}</p>}
          {centrale ? <label className="sigad-carte-tchad__selecteur"><span>Province sélectionnée</span><select aria-label="Province sélectionnée sur la carte" onChange={(event) => setProvinceSelectionnee(event.currentTarget.value || null)} value={provinceSelectionnee ?? ""}><option value="">Toutes les provinces</option>{PROVINCES_TCHAD.map((province) => <option key={province.sigadId} value={province.sigadId}>{province.sigadName}</option>)}</select></label>
            : <p className="sigad-carte-tchad__perimetre">Votre sélection est limitée à {nomProvince(utilisateur, provinceSession)}.</p>}
          {chargementIndicateurs && <div className="sigad-carte-tchad__etat-donnees" role="status"><span>Chargement des indicateurs</span><p>Lecture des agrégats du périmètre autorisé…</p></div>}
          {erreurIndicateurs && <div className="sigad-carte-tchad__erreur-indicateur" role="alert"><strong>Indicateurs indisponibles</strong><p>{erreurIndicateurs}</p></div>}
          {!chargementIndicateurs && !erreurIndicateurs && indicateurs && <div className="sigad-carte-tchad__etat-donnees">
            <span>{NOMS_INDICATEURS[indicateur]}</span>
            {!detailsProvince ? <p>Sélectionnez une province pour consulter sa valeur agrégée.</p>
              : valeurSelectionneeFormatee === null ? <p>{statutSelectionne === "INCOHERENT"
                ? "La concordance entre les lots et le solde comptable est invalide; aucune quantité n’est publiée."
                : indicateur === "stocks_disponibles" && !articleId
                  ? "Sélectionnez un article pour afficher un stock dans son unité de mesure."
                  : statutSelectionne === "AUCUNE_DONNEE"
                    ? "Aucun entrepôt provincial actif ne permet de mesurer ce stock."
                    : "Aucune donnée fiable n’est disponible pour ce périmètre."}</p>
                : <p className="sigad-carte-tchad__valeur-detail">{valeurSelectionneeFormatee}{indicateur === "stocks_disponibles" && stockSelectionne?.unite_libelle ? ` ${stockSelectionne.unite_libelle}` : ""}
                  <small>{statutSelectionne === "DISPONIBLE" ? "Valeur exacte · données D1" : statutSelectionne}</small></p>}
            {indicateur === "stocks_disponibles" && stockSelectionne?.article_id && <p className="sigad-carte-tchad__detail-article">{stockSelectionne.designation} · {stockSelectionne.unite_libelle}</p>}
            {indicateur === "stocks_disponibles" && stockSelectionne?.entrepots.map((entrepot) => <p className="sigad-carte-tchad__detail-entrepot" key={entrepot.entrepot_id}>
              {entrepot.nom} : {entrepot.valeur === null ? "cohérence à vérifier" : `${nombreFr.format(entrepot.valeur)} ${stockSelectionne.unite_code ?? ""}`}
            </p>)}
          </div>}
          <div className="sigad-carte-tchad__avertissement"><strong>Limites administratives indicatives — source OCHA/HDX, homologation juridique non confirmée.</strong><p>Cette visualisation reste expérimentale. Elle n’active pas le référentiel administratif SIGAD et ne modifie pas ses limites.</p></div>
          <p className="sigad-carte-tchad__source"><a href="https://data.humdata.org/dataset/cod-ab-tcd" rel="noreferrer" target="_blank">Source : OCHA FIS / HDX · COD-AB v01 <span aria-hidden="true">↗</span></a><small>Valide pour usage humanitaire depuis le 12/02/2025 · révision 30/10/2025 · licence CC BY-IGO.</small></p>
          {erreur && <p className="sigad-carte-tchad__etat-erreur">La géométrie n’a pas été chargée.</p>}
          {!centrale && provinceSession && !PROVINCES_TCHAD.some((province) => province.sigadId === provinceSession) && <p className="sigad-carte-tchad__etat-erreur">La province de session n’est pas présente dans la correspondance cartographique vérifiée.</p>}
          {indicateurs && <p className="sigad-carte-tchad__cout-d1">{indicateurs.ressources_d1.lignes_lues} lignes D1 lues · {indicateurs.ressources_d1.lignes_ecrites} écrite · {indicateurs.ressources_d1.duree_requetes_ms} ms</p>}
        </aside>
      </div>
    </section>
  );
}
