import { useCallback, useEffect, useMemo, useState } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import type {
  ArrondissementTerritorial,
  CarreTerritorial,
  CantonTerritorial,
  DepartementTerritorial,
  ElementSelectionLocalisation,
  LocaliteTerritoriale,
  MilieuResidenceTerritorial,
  PageTerritoriale,
  ProvinceTerritoriale,
  QuartierTerritorial,
  ReponseAjoutDynamiqueTerritoire,
  SiteHumanitaireTerritorial,
  SousPrefectureTerritoriale,
} from "../../../../shared/types/territoire";
import type { TypeUniteAjoutDynamique } from "../../../../shared/validations/territoire";
import type { NatureLieu } from "../../../../shared/utils/localisation-dynamique";
import { ErreurApi, requeteApi } from "../../services/api";
import { SIGADAlert, SIGADBadge, SIGADButton, SIGADFormPanel } from "../ui";

interface SelecteurLocalisationDynamiqueProps {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
  onChange?: (selection: ElementSelectionLocalisation | null) => void;
  onSelectionChange?: (selection: ElementSelectionLocalisation | null) => void;
}

interface EtatPage<T> {
  elements: T[];
  total: number;
  decalage: number;
  limite: number;
  chargement: boolean;
  erreur: string | null;
  definirDecalage: (decalage: number) => void;
}

const LIMITE_PAGE = 100;
const ID_VILLE_NDJAMENA = "loc-ndjamena-ville";

const LIBELLES_TYPE_UNITE: Record<TypeUniteAjoutDynamique, string> = {
  DEPARTEMENT: "Département",
  SOUS_PREFECTURE: "Sous-préfecture",
  CANTON: "Canton / Groupement",
  VILLE: "Ville / Centre urbain",
  ARRONDISSEMENT: "Arrondissement municipal",
  QUARTIER: "Quartier",
  CARRE: "Carré",
  VILLAGE: "Village",
  HAMEAU: "Hameau",
  FERRICK: "Ferrick",
  CAMPEMENT: "Campement",
  SITE_HUMANITAIRE: "Site humanitaire",
};

function utiliserPageApi<T extends { id: string }>(
  chemin: string | null,
  cleRafraichissement: number,
  elementsLocaux: T[] = [],
  limite = LIMITE_PAGE,
): EtatPage<T> {
  const [decalage, definirDecalage] = useState(0);
  const [page, definirPage] = useState<PageTerritoriale<T> | null>(null);
  const [chargement, definirChargement] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);

  const adresse = useMemo(() => {
    if (!chemin) return null;
    const separateur = chemin.includes("?") ? "&" : "?";
    return `${chemin}${separateur}limite=${limite}&decalage=${decalage}`;
  }, [chemin, decalage, limite]);

  useEffect(() => {
    definirDecalage(0);
  }, [chemin]);

  useEffect(() => {
    let actif = true;
    if (!adresse) {
      definirPage(null);
      definirErreur(null);
      definirChargement(false);
      return () => {
        actif = false;
      };
    }
    definirChargement(true);
    definirErreur(null);
    void requeteApi<PageTerritoriale<T>>(adresse)
      .then((reponse) => {
        if (actif) definirPage(reponse);
      })
      .catch((cause: unknown) => {
        if (actif) {
          definirErreur(
            cause instanceof Error
              ? cause.message
              : "Les données territoriales n’ont pas pu être chargées.",
          );
        }
      })
      .finally(() => {
        if (actif) definirChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [adresse, cleRafraichissement]);

  const elementsFusionnes = useMemo(() => {
    const base = page?.elements ?? [];
    if (elementsLocaux.length === 0) return base;
    const ids = new Set(base.map((e) => e.id));
    const supplementaires = elementsLocaux.filter((e) => !ids.has(e.id));
    return [...base, ...supplementaires];
  }, [page?.elements, elementsLocaux]);

  return {
    elements: elementsFusionnes,
    total: Math.max(page?.total ?? 0, elementsFusionnes.length),
    decalage,
    limite,
    chargement,
    erreur,
    definirDecalage,
  };
}

function cheminAvecFiltres(
  base: string,
  filtres: Record<string, string | null | undefined>,
): string {
  const parametres = new URLSearchParams();
  for (const [nom, valeur] of Object.entries(filtres)) {
    if (valeur) parametres.set(nom, valeur);
  }
  return `${base}?${parametres.toString()}`;
}

function SelecteurPagine<T extends { id: string }>(props: {
  idChamp?: string;
  libelle: string;
  elementVide: string;
  valeur: string;
  elements: T[];
  nomElement: (element: T) => string;
  total: number;
  decalage: number;
  chargement: boolean;
  erreur: string | null;
  definirDecalage: (decalage: number) => void;
  modifier: (valeur: string) => void;
  obligatoire?: boolean;
  desactive?: boolean;
  limitePage?: number;
  onAjouter?: (() => void) | undefined;
  libelleAjouter?: string;
}) {
  const limitePage = props.limitePage ?? LIMITE_PAGE;
  const pages = Math.max(1, Math.ceil(props.total / limitePage));
  const pageActuelle = Math.floor(props.decalage / limitePage) + 1;
  const idSelect = props.idChamp ?? `territoire-${props.libelle}`;

  return (
    <div className="champ-territorial">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.25rem",
        }}
      >
        <label htmlFor={idSelect} style={{ margin: 0 }}>
          {props.libelle}
          {props.obligatoire ? " *" : ""}
        </label>
        {props.onAjouter && (
          <SIGADButton
            variante="ghost"
            taille="sm"
            type="button"
            onClick={props.onAjouter}
            title={props.libelleAjouter ?? `Ajouter : ${props.libelle}`}
          >
            + Ajouter
          </SIGADButton>
        )}
      </div>
      <select
        id={idSelect}
        value={props.valeur}
        disabled={props.desactive || props.chargement || (props.elements.length === 0 && !props.valeur)}
        onChange={(evenement) => props.modifier(evenement.currentTarget.value)}
        required={props.obligatoire}
      >
        <option value="">{props.chargement ? "Chargement…" : props.elementVide}</option>
        {props.elements.map((element) => (
          <option key={element.id} value={element.id}>
            {props.nomElement(element)}
          </option>
        ))}
      </select>
      {props.total > limitePage && (
        <div className="pagination-territoriale" aria-label={`Pagination : ${props.libelle}`}>
          <button
            type="button"
            className="bouton bouton-discret"
            disabled={props.decalage === 0 || props.chargement}
            onClick={() => props.definirDecalage(Math.max(0, props.decalage - limitePage))}
          >
            Précédent
          </button>
          <span>
            Page {pageActuelle} sur {pages} · {props.total} résultats
          </span>
          <button
            type="button"
            className="bouton bouton-discret"
            disabled={pageActuelle >= pages || props.chargement}
            onClick={() => props.definirDecalage(props.decalage + limitePage)}
          >
            Suivant
          </button>
        </div>
      )}
      {props.erreur && (
        <p className="message-erreur" role="alert">
          {props.erreur}
        </p>
      )}
    </div>
  );
}

export function SelecteurLocalisationDynamique({
  utilisateur,
  jetonCsrf,
  onChange,
  onSelectionChange,
}: SelecteurLocalisationDynamiqueProps) {
  const notifierSelection = onChange ?? onSelectionChange;
  const [provinceId, definirProvinceId] = useState(
    Boolean(utilisateur.province_id) &&
      utilisateur.role !== "PROPRIETAIRE" &&
      utilisateur.role !== "ADMIN_CENTRAL"
      ? utilisateur.province_id ?? ""
      : "",
  );
  const [departementId, definirDepartementId] = useState("");
  const [milieu, definirMilieu] = useState<MilieuResidenceTerritorial | "">("");
  const [sousPrefectureId, definirSousPrefectureId] = useState("");
  const [cantonId, definirCantonId] = useState("");
  const [natureRurale, definirNatureRurale] = useState<Exclude<NatureLieu, "VILLE">>("VILLAGE");
  const [localiteId, definirLocaliteId] = useState("");
  const [siteId, definirSiteId] = useState("");
  const [arrondissementId, definirArrondissementId] = useState("");
  const [quartierId, definirQuartierId] = useState("");
  const [carreId, definirCarreId] = useState("");

  // Cache local des unités nouvellement créées et compteur de rafraîchissement
  const [cleRafraichissement, definirCleRafraichissement] = useState(0);
  const [departementsLocaux, definirDepartementsLocaux] = useState<DepartementTerritorial[]>([]);
  const [sousPrefecturesLocales, definirSousPrefecturesLocales] = useState<SousPrefectureTerritoriale[]>([]);
  const [cantonsLocaux, definirCantonsLocaux] = useState<CantonTerritorial[]>([]);
  const [localitesLocales, definirLocalitesLocales] = useState<LocaliteTerritoriale[]>([]);
  const [arrondissementsLocaux, definirArrondissementsLocaux] = useState<ArrondissementTerritorial[]>([]);
  const [quartiersLocaux, definirQuartiersLocaux] = useState<QuartierTerritorial[]>([]);
  const [carresLocaux, definirCarresLocaux] = useState<CarreTerritorial[]>([]);
  const [sitesLocaux, definirSitesLocaux] = useState<SiteHumanitaireTerritorial[]>([]);

  // État de la modale d'ajout dynamique (+ Ajouter)
  const [typeModalAjout, definirTypeModalAjout] = useState<TypeUniteAjoutDynamique | null>(null);
  const [nomModalAjout, definirNomModalAjout] = useState("");
  const [chefLieuModalAjout, definirChefLieuModalAjout] = useState("");
  const [villeAvecArrondissementsModal, definirVilleAvecArrondissementsModal] = useState(false);
  const [categorieSiteModal, definirCategorieSiteModal] = useState<
    "CAMP_REFUGIES" | "SITE_DEPLACES" | "CENTRE_ACCUEIL" | "SITE_TRANSIT" | "AUTRE_SITE"
  >("SITE_DEPLACES");
  const [enCoursAjout, definirEnCoursAjout] = useState(false);
  const [erreurModalAjout, definirErreurModalAjout] = useState<string | null>(null);
  const [notificationAjout, definirNotificationAjout] = useState<string | null>(null);

  // État de la modale de proposition de correction territoriale (procédure distincte)
  const [cibleCorrectionModal, definirCibleCorrectionModal] = useState<{
    type: TypeUniteAjoutDynamique;
    id: string;
    nomActuel: string;
  } | null>(null);
  const [nomCorrigeModal, definirNomCorrigeModal] = useState("");
  const [motifCorrectionModal, definirMotifCorrectionModal] = useState("");
  const [sourceCorrectionModal, definirSourceCorrectionModal] = useState("");
  const [enCoursCorrection, definirEnCoursCorrection] = useState(false);
  const [erreurModalCorrection, definirErreurModalCorrection] = useState<string | null>(null);

  const peutEnrichirTerritoire =
    utilisateur.role === "PROPRIETAIRE" ||
    utilisateur.role === "ADMIN_CENTRAL" ||
    utilisateur.role === "DELEGUE_PROVINCIAL" ||
    utilisateur.role === "RESPONSABLE_STOCK" ||
    utilisateur.role === "SUPERVISEUR_TERRAIN" ||
    utilisateur.role === "AGENT_DISTRIBUTION";

  const peutCreerDepartement =
    utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL";

  const peutProposerCorrection =
    utilisateur.role === "PROPRIETAIRE" ||
    utilisateur.role === "ADMIN_CENTRAL" ||
    utilisateur.role === "DELEGUE_PROVINCIAL";

  const provinces = utiliserPageApi<ProvinceTerritoriale>(
    "/api/territoire/provinces",
    cleRafraichissement,
  );
  const provinceSelectionnee =
    provinces.elements.find((element) => element.id === provinceId) ?? null;
  const estNdjamena =
    provinceSelectionnee?.statut_particulier === 1 || provinceId === "prov-ndjamena";

  // Synchroniser N'Djaména automatiquement avec sa ville à statut particulier
  useEffect(() => {
    if (estNdjamena) {
      definirDepartementId("");
      definirSousPrefectureId("");
      definirCantonId("");
      definirMilieu("URBAIN");
      definirLocaliteId(ID_VILLE_NDJAMENA);
      definirSiteId("");
    }
  }, [estNdjamena]);

  const departements = utiliserPageApi<DepartementTerritorial>(
    provinceId && !estNdjamena
      ? cheminAvecFiltres("/api/territoire/departements", { province_id: provinceId })
      : null,
    cleRafraichissement,
    departementsLocaux.filter((d) => d.province_id === provinceId),
  );

  const departementSelectionne =
    departements.elements.find((d) => d.id === departementId) ?? null;

  const sousPrefectures = utiliserPageApi<SousPrefectureTerritoriale>(
    !estNdjamena && departementId && milieu === "RURAL"
      ? cheminAvecFiltres("/api/territoire/sous-prefectures", {
          departement_id: departementId,
        })
      : null,
    cleRafraichissement,
    sousPrefecturesLocales.filter((sp) => sp.departement_id === departementId),
  );

  const sousPrefectureSelectionnee =
    sousPrefectures.elements.find((sp) => sp.id === sousPrefectureId) ?? null;

  const cantons = utiliserPageApi<CantonTerritorial>(
    !estNdjamena && departementId && milieu === "RURAL"
      ? cheminAvecFiltres("/api/territoire/cantons", {
          departement_id: departementId,
          sous_prefecture_id: sousPrefectureId || null,
        })
      : null,
    cleRafraichissement,
    cantonsLocaux.filter(
      (ca) =>
        ca.departement_id === departementId &&
        (!sousPrefectureId || ca.sous_prefecture_id === sousPrefectureId),
    ),
  );

  const cantonSelectionne = cantons.elements.find((ca) => ca.id === cantonId) ?? null;

  const typeLocaliteActive: Exclude<NatureLieu, "SITE_HUMANITAIRE"> | null = estNdjamena
    ? "VILLE"
    : milieu === "URBAIN"
      ? "VILLE"
      : milieu === "RURAL" && natureRurale !== "SITE_HUMANITAIRE"
        ? natureRurale
        : null;

  const localites = utiliserPageApi<LocaliteTerritoriale>(
    !estNdjamena && provinceId && departementId && typeLocaliteActive
      ? cheminAvecFiltres("/api/territoire/localites", {
          province_id: provinceId,
          departement_id: departementId,
          sous_prefecture_id: milieu === "RURAL" ? sousPrefectureId || null : null,
          canton_id: milieu === "RURAL" ? cantonId || null : null,
          type_localite: typeLocaliteActive,
        })
      : null,
    cleRafraichissement,
    localitesLocales.filter(
      (l) =>
        l.province_id === provinceId &&
        l.departement_id === departementId &&
        l.type_localite === typeLocaliteActive,
    ),
  );

  const siteHum = utiliserPageApi<SiteHumanitaireTerritorial>(
    !estNdjamena && provinceId && departementId && milieu === "RURAL" && natureRurale === "SITE_HUMANITAIRE"
      ? cheminAvecFiltres("/api/territoire/sites-humanitaires", {
          province_id: provinceId,
          departement_id: departementId,
          sous_prefecture_id: sousPrefectureId || null,
        })
      : null,
    cleRafraichissement,
    sitesLocaux.filter((s) => s.province_id === provinceId && s.departement_id === departementId),
  );

  const villeActive: LocaliteTerritoriale | null = useMemo(() => {
    if (estNdjamena) {
      return {
        id: ID_VILLE_NDJAMENA,
        province_id: provinceId || "prov-ndjamena",
        departement_id: null,
        sous_prefecture_id: null,
        commune_id: null,
        canton_id: null,
        nom: "N'Djaména",
        type_localite: "VILLE",
        mode_decoupage_urbain: "AVEC_ARRONDISSEMENTS",
      };
    }
    if (milieu === "URBAIN") {
      return localites.elements.find((element) => element.id === localiteId) ?? null;
    }
    return null;
  }, [estNdjamena, provinceId, milieu, localites.elements, localiteId]);

  const villePossedeArrondissements =
    estNdjamena ||
    villeActive?.mode_decoupage_urbain === "AVEC_ARRONDISSEMENTS" ||
    arrondissementsLocaux.some((a) => a.localite_id === villeActive?.id);

  const arrondissements = utiliserPageApi<ArrondissementTerritorial>(
    villeActive && villePossedeArrondissements
      ? cheminAvecFiltres("/api/territoire/arrondissements", { localite_id: villeActive.id })
      : null,
    cleRafraichissement,
    arrondissementsLocaux.filter((a) => a.localite_id === villeActive?.id),
  );

  const arrondissementSelectionne =
    arrondissements.elements.find((a) => a.id === arrondissementId) ?? null;

  const peutChargerQuartiers = Boolean(
    villeActive &&
      (!villePossedeArrondissements || arrondissementId.length > 0),
  );

  const quartiers = utiliserPageApi<QuartierTerritorial>(
    peutChargerQuartiers && villeActive
      ? cheminAvecFiltres("/api/territoire/quartiers", {
          localite_id: villeActive.id,
          arrondissement_id: villePossedeArrondissements ? arrondissementId || null : null,
        })
      : null,
    cleRafraichissement,
    quartiersLocaux.filter(
      (q) =>
        q.localite_id === villeActive?.id &&
        (!villePossedeArrondissements || q.arrondissement_id === arrondissementId),
    ),
  );

  const quartierSelectionne =
    quartiers.elements.find((q) => q.id === quartierId) ?? null;

  const carres = utiliserPageApi<CarreTerritorial>(
    quartierId
      ? cheminAvecFiltres("/api/territoire/carres", { quartier_id: quartierId })
      : null,
    cleRafraichissement,
    carresLocaux.filter((c) => c.quartier_id === quartierId),
  );

  const localiteSelectionnee =
    localites.elements.find((l) => l.id === localiteId) ?? null;

  const siteSelectionne =
    siteHum.elements.find((s) => s.id === siteId) ?? null;

  const carreSelectionne =
    carres.elements.find((c) => c.id === carreId) ?? null;

  useEffect(() => {
    if (utilisateur.role === "DELEGUE_PROVINCIAL") {
      definirProvinceId(utilisateur.province_id ?? "");
    }
  }, [utilisateur.role, utilisateur.province_id]);

  // Propagation de la sélection vers le composant parent
  useEffect(() => {
    if (!provinceId) {
      notifierSelection?.(null);
      return;
    }

    if (estNdjamena) {
      // Parcours exclusif N'Djaména : Province -> Arrondissement -> Quartier -> Carré (facultatif)
      if (!arrondissementId || !quartierId) {
        notifierSelection?.(null);
        return;
      }
      notifierSelection?.({
        nature: "LOCALITE",
        milieu: "URBAIN",
        province_id: provinceId,
        departement_id: null,
        sous_prefecture_id: null,
        canton_id: null,
        commune_id: null,
        localite_id: ID_VILLE_NDJAMENA,
        arrondissement_id: arrondissementId,
        quartier_id: quartierId,
        carre_id: carreId || null,
        site_humanitaire_id: null,
      });
      return;
    }

    if (!departementId || !milieu) {
      notifierSelection?.(null);
      return;
    }

    if (milieu === "URBAIN") {
      if (!villeActive) {
        notifierSelection?.(null);
        return;
      }
      notifierSelection?.({
        nature: "LOCALITE",
        milieu: "URBAIN",
        province_id: provinceId,
        departement_id: departementId,
        sous_prefecture_id: null,
        canton_id: null,
        commune_id: null,
        localite_id: villeActive.id,
        arrondissement_id: arrondissementId || null,
        quartier_id: quartierId || null,
        carre_id: carreId || null,
        site_humanitaire_id: null,
      });
      return;
    }

    // Milieu RURAL
    if (natureRurale === "SITE_HUMANITAIRE") {
      const site = siteHum.elements.find((s) => s.id === siteId);
      if (!site) {
        notifierSelection?.(null);
        return;
      }
      notifierSelection?.({
        nature: "SITE_HUMANITAIRE",
        milieu: "RURAL",
        province_id: provinceId,
        departement_id: departementId,
        sous_prefecture_id: sousPrefectureId || site.sous_prefecture_id || null,
        canton_id: cantonId || null,
        commune_id: null,
        localite_id: site.localite_proche_id ?? null,
        arrondissement_id: null,
        quartier_id: null,
        carre_id: null,
        site_humanitaire_id: site.id,
      });
      return;
    }

    const localiteRurale = localites.elements.find((l) => l.id === localiteId);
    if (!localiteRurale) {
      notifierSelection?.(null);
      return;
    }

    notifierSelection?.({
      nature: "LOCALITE",
      milieu: "RURAL",
      province_id: provinceId,
      departement_id: departementId,
      sous_prefecture_id: sousPrefectureId || localiteRurale.sous_prefecture_id || null,
      canton_id: cantonId || localiteRurale.canton_id || null,
      commune_id: null,
      localite_id: localiteRurale.id,
      arrondissement_id: null,
      quartier_id: null,
      carre_id: null,
      site_humanitaire_id: null,
    });
  }, [
    provinceId,
    estNdjamena,
    departementId,
    milieu,
    sousPrefectureId,
    cantonId,
    natureRurale,
    localiteId,
    siteId,
    arrondissementId,
    quartierId,
    carreId,
    villeActive,
    localites.elements,
    siteHum.elements,
    notifierSelection,
  ]);

  function modifierProvince(valeur: string): void {
    definirProvinceId(valeur);
    definirDepartementId("");
    definirMilieu(valeur === "prov-ndjamena" ? "URBAIN" : "");
    definirSousPrefectureId("");
    definirCantonId("");
    definirLocaliteId(valeur === "prov-ndjamena" ? ID_VILLE_NDJAMENA : "");
    definirSiteId("");
    definirArrondissementId("");
    definirQuartierId("");
    definirCarreId("");
    definirNotificationAjout(null);
  }

  function modifierDepartement(valeur: string): void {
    definirDepartementId(valeur);
    definirSousPrefectureId("");
    definirCantonId("");
    definirLocaliteId("");
    definirSiteId("");
    definirArrondissementId("");
    definirQuartierId("");
    definirCarreId("");
    definirNotificationAjout(null);
  }

  function modifierMilieu(nouveauMilieu: MilieuResidenceTerritorial | ""): void {
    definirMilieu(nouveauMilieu);
    definirSousPrefectureId("");
    definirCantonId("");
    definirLocaliteId("");
    definirSiteId("");
    definirArrondissementId("");
    definirQuartierId("");
    definirCarreId("");
    definirNotificationAjout(null);
  }

  const ouvrirModalAjout = useCallback((type: TypeUniteAjoutDynamique) => {
    definirTypeModalAjout(type);
    definirNomModalAjout("");
    definirChefLieuModalAjout("");
    definirVilleAvecArrondissementsModal(false);
    definirErreurModalAjout(null);
  }, []);

  const fermerModalAjout = useCallback(() => {
    definirTypeModalAjout(null);
    definirNomModalAjout("");
    definirChefLieuModalAjout("");
    definirErreurModalAjout(null);
  }, []);

  const uniteSelectionneePourCorrection = useMemo((): {
    type: TypeUniteAjoutDynamique;
    id: string;
    nomActuel: string;
  } | null => {
    if (carreSelectionne) {
      return { type: "CARRE", id: carreSelectionne.id, nomActuel: carreSelectionne.code_ou_nom };
    }
    if (quartierSelectionne) {
      return { type: "QUARTIER", id: quartierSelectionne.id, nomActuel: quartierSelectionne.nom };
    }
    if (arrondissementSelectionne) {
      return {
        type: "ARRONDISSEMENT",
        id: arrondissementSelectionne.id,
        nomActuel: arrondissementSelectionne.nom,
      };
    }
    if (milieu === "RURAL" && natureRurale === "SITE_HUMANITAIRE" && siteSelectionne) {
      return {
        type: "SITE_HUMANITAIRE",
        id: siteSelectionne.id,
        nomActuel: siteSelectionne.nom,
      };
    }
    if (localiteSelectionnee && !estNdjamena) {
      return {
        type: localiteSelectionnee.type_localite,
        id: localiteSelectionnee.id,
        nomActuel: localiteSelectionnee.nom,
      };
    }
    if (cantonSelectionne) {
      return { type: "CANTON", id: cantonSelectionne.id, nomActuel: cantonSelectionne.nom };
    }
    if (sousPrefectureSelectionnee) {
      return {
        type: "SOUS_PREFECTURE",
        id: sousPrefectureSelectionnee.id,
        nomActuel: sousPrefectureSelectionnee.nom,
      };
    }
    if (departementSelectionne) {
      return {
        type: "DEPARTEMENT",
        id: departementSelectionne.id,
        nomActuel: departementSelectionne.nom,
      };
    }
    return null;
  }, [
    carreSelectionne,
    quartierSelectionne,
    arrondissementSelectionne,
    milieu,
    natureRurale,
    siteSelectionne,
    localiteSelectionnee,
    estNdjamena,
    cantonSelectionne,
    sousPrefectureSelectionnee,
    departementSelectionne,
  ]);

  const ouvrirModalCorrection = useCallback(() => {
    if (!uniteSelectionneePourCorrection) return;
    definirCibleCorrectionModal(uniteSelectionneePourCorrection);
    definirNomCorrigeModal(uniteSelectionneePourCorrection.nomActuel);
    definirMotifCorrectionModal("");
    definirSourceCorrectionModal("");
    definirErreurModalCorrection(null);
  }, [uniteSelectionneePourCorrection]);

  const fermerModalCorrection = useCallback(() => {
    definirCibleCorrectionModal(null);
    definirNomCorrigeModal("");
    definirMotifCorrectionModal("");
    definirSourceCorrectionModal("");
    definirErreurModalCorrection(null);
  }, []);

  async function enregistrerPropositionCorrection(): Promise<void> {
    if (!cibleCorrectionModal || !provinceId) return;
    const nomCorrige = nomCorrigeModal.trim();
    const motif = motifCorrectionModal.trim();
    if (nomCorrige.length < 2) {
      definirErreurModalCorrection("Veuillez saisir un nom corrigé d'au moins 2 caractères.");
      return;
    }
    if (motif.length < 5) {
      definirErreurModalCorrection("Veuillez préciser le motif de la correction (5 caractères minimum).");
      return;
    }

    definirEnCoursCorrection(true);
    definirErreurModalCorrection(null);
    try {
      await requeteApi<{ id: string }>("/api/territoire/propositions/corrections", {
        methode: "POST",
        jetonCsrf,
        corps: {
          type_unite: cibleCorrectionModal.type,
          unite_id: cibleCorrectionModal.id,
          province_id: provinceId,
          nom_corrige: nomCorrige,
          motif_correction: motif,
          source_documentation: sourceCorrectionModal.trim() || null,
        },
      });
      definirNotificationAjout(
        `Proposition de correction enregistrée pour « ${cibleCorrectionModal.nomActuel} » → « ${nomCorrige} ».`,
      );
      fermerModalCorrection();
    } catch (cause) {
      definirErreurModalCorrection(
        cause instanceof ErreurApi || cause instanceof Error
          ? cause.message
          : "La proposition de correction territoriale n'a pas pu être enregistrée.",
      );
    } finally {
      definirEnCoursCorrection(false);
    }
  }

  const resumeRattachementModal = useMemo(() => {
    const morceaux: string[] = [];
    if (provinceSelectionnee) morceaux.push(`Province : ${provinceSelectionnee.nom}`);
    if (!estNdjamena && departementSelectionne && typeModalAjout !== "DEPARTEMENT") {
      morceaux.push(`Département : ${departementSelectionne.nom}`);
    }
    if (
      milieu === "RURAL" &&
      sousPrefectureSelectionnee &&
      ["CANTON", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT", "SITE_HUMANITAIRE"].includes(
        typeModalAjout ?? "",
      )
    ) {
      morceaux.push(`Sous-préfecture : ${sousPrefectureSelectionnee.nom}`);
    }
    if (
      milieu === "RURAL" &&
      cantonSelectionne &&
      ["VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(typeModalAjout ?? "")
    ) {
      morceaux.push(`Canton : ${cantonSelectionne.nom}`);
    }
    if (villeActive && ["ARRONDISSEMENT", "QUARTIER", "CARRE"].includes(typeModalAjout ?? "")) {
      morceaux.push(`Ville : ${villeActive.nom}`);
    }
    if (arrondissementSelectionne && ["QUARTIER", "CARRE"].includes(typeModalAjout ?? "")) {
      morceaux.push(`Arrondissement : ${arrondissementSelectionne.nom}`);
    }
    if (quartierSelectionne && typeModalAjout === "CARRE") {
      morceaux.push(`Quartier : ${quartierSelectionne.nom}`);
    }
    return morceaux.join(" → ");
  }, [
    provinceSelectionnee,
    estNdjamena,
    departementSelectionne,
    typeModalAjout,
    milieu,
    sousPrefectureSelectionnee,
    cantonSelectionne,
    villeActive,
    arrondissementSelectionne,
    quartierSelectionne,
  ]);

  async function enregistrerUniteDynamique(): Promise<void> {
    if (!typeModalAjout || !provinceId) return;
    const nomSaisi = nomModalAjout.trim();
    if (nomSaisi.length < 2) {
      definirErreurModalAjout("Veuillez saisir un nom d'au moins 2 caractères.");
      return;
    }

    definirEnCoursAjout(true);
    definirErreurModalAjout(null);

    const corps: Record<string, unknown> = {
      type: typeModalAjout,
      nom: nomSaisi,
      province_id: provinceId,
      departement_id: estNdjamena ? null : departementId || null,
      sous_prefecture_id: milieu === "RURAL" ? sousPrefectureId || null : null,
      canton_id: milieu === "RURAL" ? cantonId || null : null,
      localite_id: villeActive?.id ?? null,
      arrondissement_id: arrondissementId || null,
      quartier_id: quartierId || null,
    };

    if (typeModalAjout === "DEPARTEMENT" && chefLieuModalAjout.trim()) {
      corps.chef_lieu = chefLieuModalAjout.trim();
    }
    if (typeModalAjout === "VILLE") {
      corps.mode_decoupage_urbain = villeAvecArrondissementsModal
        ? "AVEC_ARRONDISSEMENTS"
        : "SANS_ARRONDISSEMENT";
    }
    if (typeModalAjout === "SITE_HUMANITAIRE") {
      corps.categorie_site = categorieSiteModal;
    }

    try {
      const reponse = await requeteApi<ReponseAjoutDynamiqueTerritoire>(
        "/api/territoire/unites-dynamiques",
        {
          methode: "POST",
          jetonCsrf,
          corps,
        },
      );

      // Mettre à jour le cache immédiat et sélectionner automatiquement l'unité
      switch (typeModalAjout) {
        case "DEPARTEMENT": {
          const dep = reponse.unite as unknown as DepartementTerritorial;
          definirDepartementsLocaux((prev) => [...prev.filter((d) => d.id !== reponse.id), dep]);
          definirDepartementId(reponse.id);
          break;
        }
        case "SOUS_PREFECTURE": {
          const sp = reponse.unite as unknown as SousPrefectureTerritoriale;
          definirSousPrefecturesLocales((prev) => [...prev.filter((s) => s.id !== reponse.id), sp]);
          definirSousPrefectureId(reponse.id);
          break;
        }
        case "CANTON": {
          const ca = reponse.unite as unknown as CantonTerritorial;
          definirCantonsLocaux((prev) => [...prev.filter((c) => c.id !== reponse.id), ca]);
          definirCantonId(reponse.id);
          break;
        }
        case "VILLE": {
          const ville = reponse.unite as unknown as LocaliteTerritoriale;
          definirLocalitesLocales((prev) => [...prev.filter((l) => l.id !== reponse.id), ville]);
          definirLocaliteId(reponse.id);
          definirArrondissementId("");
          definirQuartierId("");
          definirCarreId("");
          break;
        }
        case "VILLAGE":
        case "HAMEAU":
        case "FERRICK":
        case "CAMPEMENT": {
          const loc = reponse.unite as unknown as LocaliteTerritoriale;
          definirLocalitesLocales((prev) => [...prev.filter((l) => l.id !== reponse.id), loc]);
          definirNatureRurale(typeModalAjout);
          definirLocaliteId(reponse.id);
          break;
        }
        case "ARRONDISSEMENT": {
          const arr = reponse.unite as unknown as ArrondissementTerritorial;
          definirArrondissementsLocaux((prev) => [...prev.filter((a) => a.id !== reponse.id), arr]);
          if (villeActive && !estNdjamena && villeActive.mode_decoupage_urbain !== "AVEC_ARRONDISSEMENTS") {
            definirLocalitesLocales((prev) => [
              ...prev.filter((l) => l.id !== villeActive.id),
              { ...villeActive, mode_decoupage_urbain: "AVEC_ARRONDISSEMENTS" },
            ]);
          }
          definirArrondissementId(reponse.id);
          definirQuartierId("");
          definirCarreId("");
          break;
        }
        case "QUARTIER": {
          const qrt = reponse.unite as unknown as QuartierTerritorial;
          definirQuartiersLocaux((prev) => [...prev.filter((q) => q.id !== reponse.id), qrt]);
          definirQuartierId(reponse.id);
          definirCarreId("");
          break;
        }
        case "CARRE": {
          const car = reponse.unite as unknown as CarreTerritorial;
          definirCarresLocaux((prev) => [...prev.filter((c) => c.id !== reponse.id), car]);
          definirCarreId(reponse.id);
          break;
        }
        case "SITE_HUMANITAIRE": {
          const site = reponse.unite as unknown as SiteHumanitaireTerritorial;
          definirSitesLocaux((prev) => [...prev.filter((s) => s.id !== reponse.id), site]);
          definirNatureRurale("SITE_HUMANITAIRE");
          definirSiteId(reponse.id);
          break;
        }
      }

      definirCleRafraichissement((c) => c + 1);
      definirNotificationAjout(reponse.message);
      fermerModalAjout();
    } catch (cause) {
      definirErreurModalAjout(
        cause instanceof ErreurApi || cause instanceof Error
          ? cause.message
          : "L'unité territoriale n'a pas pu être ajoutée.",
      );
    } finally {
      definirEnCoursAjout(false);
    }
  }

  return (
    <section
      className="carte-section selecteur-localisation"
      aria-labelledby="titre-selecteur-localisation"
    >
      <div className="titre-section">
        <div>
          <h2 id="titre-selecteur-localisation">Sélecteur de localisation</h2>
          <p>
            {estNdjamena
              ? "Parcours urbain exclusif de N’Djaména : Province → Arrondissement municipal → Quartier → Carré (facultatif)."
              : "Sélectionnez la province, le département et le milieu de résidence (Urbain ou Rural)."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {peutProposerCorrection && uniteSelectionneePourCorrection && (
            <SIGADButton
              variante="outline"
              taille="sm"
              type="button"
              onClick={ouvrirModalCorrection}
              title="Proposer une modification ou une correction d'intitulé sur l'unité territoriale sélectionnée"
            >
              Proposer une modification territoriale
            </SIGADButton>
          )}
          {Boolean(utilisateur.province_id) &&
            utilisateur.role !== "PROPRIETAIRE" &&
            utilisateur.role !== "ADMIN_CENTRAL" && (
              <SIGADBadge variante="info">Province rattachée au compte</SIGADBadge>
            )}
        </div>
      </div>

      {notificationAjout && (
        <div style={{ marginBottom: "0.75rem" }}>
          <SIGADAlert
            variante="success"
            onFermer={() => definirNotificationAjout(null)}
          >
            {notificationAjout}
          </SIGADAlert>
        </div>
      )}

      <div className="grille-territoriale">
        {/* 1. PROVINCE */}
        <SelecteurPagine<ProvinceTerritoriale>
          idChamp="territoire-Province"
          libelle="Province"
          elementVide="Sélectionner une province"
          valeur={provinceId}
          elements={provinces.elements}
          nomElement={(element) => element.nom}
          total={provinces.total}
          decalage={provinces.decalage}
          chargement={provinces.chargement}
          erreur={provinces.erreur}
          definirDecalage={provinces.definirDecalage}
          modifier={modifierProvince}
          desactive={
            Boolean(utilisateur.province_id) &&
            utilisateur.role !== "PROPRIETAIRE" &&
            utilisateur.role !== "ADMIN_CENTRAL"
          }
          obligatoire
        />

        {/* CAS PARTICULIER : N'DJAMÉNA (Statut particulier) */}
        {provinceId && estNdjamena && (
          <>
            <SelecteurPagine<ArrondissementTerritorial>
              idChamp="territoire-Arrondissement"
              libelle="Arrondissement municipal"
              elementVide="Sélectionner un arrondissement"
              valeur={arrondissementId}
              elements={arrondissements.elements}
              nomElement={(element) => element.nom}
              total={arrondissements.total}
              decalage={arrondissements.decalage}
              chargement={arrondissements.chargement}
              erreur={arrondissements.erreur}
              definirDecalage={arrondissements.definirDecalage}
              modifier={(valeur) => {
                definirArrondissementId(valeur);
                definirQuartierId("");
                definirCarreId("");
              }}
              obligatoire
              onAjouter={
                peutEnrichirTerritoire
                  ? () => ouvrirModalAjout("ARRONDISSEMENT")
                  : undefined
              }
            />

            <SelecteurPagine<QuartierTerritorial>
              idChamp="territoire-Quartier"
              libelle="Quartier"
              elementVide={
                arrondissementId
                  ? "Sélectionner un quartier"
                  : "Sélectionnez d'abord un arrondissement"
              }
              valeur={quartierId}
              elements={quartiers.elements}
              nomElement={(element) => element.nom}
              total={quartiers.total}
              decalage={quartiers.decalage}
              chargement={quartiers.chargement}
              erreur={quartiers.erreur}
              definirDecalage={quartiers.definirDecalage}
              modifier={(valeur) => {
                definirQuartierId(valeur);
                definirCarreId("");
              }}
              desactive={!arrondissementId}
              obligatoire
              onAjouter={
                peutEnrichirTerritoire && arrondissementId
                  ? () => ouvrirModalAjout("QUARTIER")
                  : undefined
              }
            />

            <SelecteurPagine<CarreTerritorial>
              idChamp="territoire-Carre"
              libelle="Carré (facultatif)"
              elementVide={
                quartierId
                  ? "Aucun carré / Sélectionner un carré"
                  : "Sélectionnez d'abord un quartier"
              }
              valeur={carreId}
              elements={carres.elements}
              nomElement={(element) => element.code_ou_nom}
              total={carres.total}
              decalage={carres.decalage}
              chargement={carres.chargement}
              erreur={carres.erreur}
              definirDecalage={carres.definirDecalage}
              modifier={definirCarreId}
              desactive={!quartierId}
              onAjouter={
                peutEnrichirTerritoire && quartierId
                  ? () => ouvrirModalAjout("CARRE")
                  : undefined
              }
            />
          </>
        )}

        {/* CAS GÉNÉRAL : LES 22 PROVINCES HORS N'DJAMÉNA */}
        {provinceId && !estNdjamena && (
          <>
            <SelecteurPagine<DepartementTerritorial>
              idChamp="territoire-Departement"
              libelle="Département"
              elementVide="Sélectionner un département"
              valeur={departementId}
              elements={departements.elements}
              nomElement={(element) => element.nom}
              total={departements.total}
              decalage={departements.decalage}
              chargement={departements.chargement}
              erreur={departements.erreur}
              definirDecalage={departements.definirDecalage}
              modifier={modifierDepartement}
              obligatoire
              onAjouter={
                peutCreerDepartement
                  ? () => ouvrirModalAjout("DEPARTEMENT")
                  : undefined
              }
            />

            <div className="champ-territorial">
              <label htmlFor="territoire-milieu">Milieu de résidence *</label>
              <select
                id="territoire-milieu"
                value={milieu}
                disabled={!departementId}
                onChange={(evenement) =>
                  modifierMilieu(
                    evenement.currentTarget.value as MilieuResidenceTerritorial | "",
                  )
                }
                required
              >
                <option value="">Sélectionner le milieu (Urbain ou Rural)</option>
                <option value="URBAIN">Urbain (Ville → Quartier → Carré)</option>
                <option value="RURAL">
                  Rural (Sous-préfecture / Canton → Village, Hameau, Ferrick ou Campement)
                </option>
              </select>
            </div>

            {/* PARCOURS URBAIN (22 PROVINCES) */}
            {departementId && milieu === "URBAIN" && (
              <>
                <SelecteurPagine<LocaliteTerritoriale>
                  idChamp="territoire-Ville"
                  libelle="Ville / Centre urbain"
                  elementVide="Sélectionner une ville"
                  valeur={localiteId}
                  elements={localites.elements}
                  nomElement={(element) => element.nom}
                  total={localites.total}
                  decalage={localites.decalage}
                  chargement={localites.chargement}
                  erreur={localites.erreur}
                  definirDecalage={localites.definirDecalage}
                  modifier={(valeur) => {
                    definirLocaliteId(valeur);
                    definirArrondissementId("");
                    definirQuartierId("");
                    definirCarreId("");
                  }}
                  obligatoire
                  onAjouter={
                    peutEnrichirTerritoire
                      ? () => ouvrirModalAjout("VILLE")
                      : undefined
                  }
                />

                {villeActive && (
                  <>
                    {(villePossedeArrondissements || arrondissements.total > 0) ? (
                      <SelecteurPagine<ArrondissementTerritorial>
                        idChamp="territoire-Arrondissement"
                        libelle="Arrondissement municipal"
                        elementVide="Sélectionner un arrondissement"
                        valeur={arrondissementId}
                        elements={arrondissements.elements}
                        nomElement={(element) => element.nom}
                        total={arrondissements.total}
                        decalage={arrondissements.decalage}
                        chargement={arrondissements.chargement}
                        erreur={arrondissements.erreur}
                        definirDecalage={arrondissements.definirDecalage}
                        modifier={(valeur) => {
                          definirArrondissementId(valeur);
                          definirQuartierId("");
                          definirCarreId("");
                        }}
                        onAjouter={
                          peutEnrichirTerritoire
                            ? () => ouvrirModalAjout("ARRONDISSEMENT")
                            : undefined
                        }
                      />
                    ) : (
                      peutEnrichirTerritoire && (
                        <div className="champ-territorial" style={{ display: "flex", alignItems: "flex-end" }}>
                          <SIGADButton
                            variante="outline"
                            taille="sm"
                            type="button"
                            onClick={() => ouvrirModalAjout("ARRONDISSEMENT")}
                          >
                            + Ajouter un arrondissement municipal
                          </SIGADButton>
                        </div>
                      )
                    )}

                    <SelecteurPagine<QuartierTerritorial>
                      idChamp="territoire-Quartier"
                      libelle="Quartier"
                      elementVide={
                        peutChargerQuartiers
                          ? "Sélectionner un quartier"
                          : "Sélectionnez d'abord un arrondissement"
                      }
                      valeur={quartierId}
                      elements={quartiers.elements}
                      nomElement={(element) => element.nom}
                      total={quartiers.total}
                      decalage={quartiers.decalage}
                      chargement={quartiers.chargement}
                      erreur={quartiers.erreur}
                      definirDecalage={quartiers.definirDecalage}
                      modifier={(valeur) => {
                        definirQuartierId(valeur);
                        definirCarreId("");
                      }}
                      desactive={!peutChargerQuartiers}
                      onAjouter={
                        peutEnrichirTerritoire && peutChargerQuartiers
                          ? () => ouvrirModalAjout("QUARTIER")
                          : undefined
                      }
                    />

                    <SelecteurPagine<CarreTerritorial>
                      idChamp="territoire-Carre"
                      libelle="Carré (facultatif)"
                      elementVide={
                        quartierId
                          ? "Aucun carré / Sélectionner un carré"
                          : "Sélectionnez d'abord un quartier"
                      }
                      valeur={carreId}
                      elements={carres.elements}
                      nomElement={(element) => element.code_ou_nom}
                      total={carres.total}
                      decalage={carres.decalage}
                      chargement={carres.chargement}
                      erreur={carres.erreur}
                      definirDecalage={carres.definirDecalage}
                      modifier={definirCarreId}
                      desactive={!quartierId}
                      onAjouter={
                        peutEnrichirTerritoire && quartierId
                          ? () => ouvrirModalAjout("CARRE")
                          : undefined
                      }
                    />
                  </>
                )}
              </>
            )}

            {/* PARCOURS RURAL (22 PROVINCES) */}
            {departementId && milieu === "RURAL" && (
              <>
                <SelecteurPagine<SousPrefectureTerritoriale>
                  idChamp="territoire-Sous-prefecture"
                  libelle="Sous-préfecture (facultatif)"
                  elementVide="Rattachement direct au département (sans sous-préfecture)"
                  valeur={sousPrefectureId}
                  elements={sousPrefectures.elements}
                  nomElement={(element) => element.nom}
                  total={sousPrefectures.total}
                  decalage={sousPrefectures.decalage}
                  chargement={sousPrefectures.chargement}
                  erreur={sousPrefectures.erreur}
                  definirDecalage={sousPrefectures.definirDecalage}
                  modifier={(valeur) => {
                    definirSousPrefectureId(valeur);
                    definirCantonId("");
                    definirLocaliteId("");
                    definirSiteId("");
                  }}
                  onAjouter={
                    peutEnrichirTerritoire
                      ? () => ouvrirModalAjout("SOUS_PREFECTURE")
                      : undefined
                  }
                />

                <SelecteurPagine<CantonTerritorial>
                  idChamp="territoire-Canton"
                  libelle="Canton / Groupement (facultatif)"
                  elementVide="Aucun canton sélectionné"
                  valeur={cantonId}
                  elements={cantons.elements}
                  nomElement={(element) => element.nom}
                  total={cantons.total}
                  decalage={cantons.decalage}
                  chargement={cantons.chargement}
                  erreur={cantons.erreur}
                  definirDecalage={cantons.definirDecalage}
                  modifier={(valeur) => {
                    definirCantonId(valeur);
                    definirLocaliteId("");
                  }}
                  onAjouter={
                    peutEnrichirTerritoire
                      ? () => ouvrirModalAjout("CANTON")
                      : undefined
                  }
                />

                <div className="champ-territorial">
                  <label htmlFor="territoire-nature">Type d’implantation rurale *</label>
                  <select
                    id="territoire-nature"
                    value={natureRurale}
                    onChange={(evenement) => {
                      definirNatureRurale(
                        evenement.currentTarget.value as Exclude<NatureLieu, "VILLE">,
                      );
                      definirLocaliteId("");
                      definirSiteId("");
                    }}
                  >
                    <option value="VILLAGE">Village</option>
                    <option value="HAMEAU">Hameau</option>
                    <option value="FERRICK">Ferrick</option>
                    <option value="CAMPEMENT">Campement</option>
                    <option value="SITE_HUMANITAIRE">Site humanitaire</option>
                  </select>
                </div>

                {natureRurale !== "SITE_HUMANITAIRE" ? (
                  <SelecteurPagine<LocaliteTerritoriale>
                    idChamp={`territoire-${LIBELLES_TYPE_UNITE[natureRurale]}`}
                    libelle={LIBELLES_TYPE_UNITE[natureRurale]}
                    elementVide={`Sélectionner : ${LIBELLES_TYPE_UNITE[natureRurale]}`}
                    valeur={localiteId}
                    elements={localites.elements}
                    nomElement={(element) => element.nom}
                    total={localites.total}
                    decalage={localites.decalage}
                    chargement={localites.chargement}
                    erreur={localites.erreur}
                    definirDecalage={localites.definirDecalage}
                    modifier={definirLocaliteId}
                    obligatoire
                    onAjouter={
                      peutEnrichirTerritoire
                        ? () => ouvrirModalAjout(natureRurale)
                        : undefined
                    }
                  />
                ) : (
                  <SelecteurPagine<SiteHumanitaireTerritorial>
                    idChamp="territoire-Site-humanitaire"
                    libelle="Site humanitaire"
                    elementVide="Sélectionner un site humanitaire"
                    valeur={siteId}
                    elements={siteHum.elements}
                    nomElement={(element) => `${element.nom} · ${element.categorie_site}`}
                    total={siteHum.total}
                    decalage={siteHum.decalage}
                    chargement={siteHum.chargement}
                    erreur={siteHum.erreur}
                    definirDecalage={siteHum.definirDecalage}
                    modifier={definirSiteId}
                    obligatoire
                    onAjouter={
                      peutEnrichirTerritoire
                        ? () => ouvrirModalAjout("SITE_HUMANITAIRE")
                        : undefined
                    }
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* PANNEAU LATÉRAL D'AJOUT DYNAMIQUE (+ Ajouter) */}
      <SIGADFormPanel
        ouvert={typeModalAjout !== null}
        onFermer={fermerModalAjout}
        onSoumettre={() => void enregistrerUniteDynamique()}
        surtitre="Création directe dans le référentiel"
        titre={
          typeModalAjout
            ? `Ajouter : ${LIBELLES_TYPE_UNITE[typeModalAjout]}`
            : "Ajouter une unité territoriale"
        }
        description="L'unité créée sera immédiatement active, sélectionnée dans le formulaire en cours et enregistrée dans le référentiel partagé."
        taille="md"
        libelleSoumettre="Enregistrer et sélectionner"
        chargement={enCoursAjout}
        modifieNonEnregistre={nomModalAjout.trim().length > 0 || chefLieuModalAjout.trim().length > 0}
        erreur={erreurModalAjout}
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="champ-territorial">
            <label htmlFor="modal-ajout-rattachement">Rattachement territorial</label>
            <input
              id="modal-ajout-rattachement"
              type="text"
              value={resumeRattachementModal}
              readOnly
              disabled
            />
          </div>

          <div className="champ-territorial">
            <label htmlFor="modal-ajout-type">Type d’unité</label>
            {typeModalAjout &&
            ["VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(typeModalAjout) ? (
              <select
                id="modal-ajout-type"
                value={typeModalAjout}
                onChange={(e) =>
                  definirTypeModalAjout(e.currentTarget.value as TypeUniteAjoutDynamique)
                }
              >
                <option value="VILLAGE">Village</option>
                <option value="HAMEAU">Hameau</option>
                <option value="FERRICK">Ferrick</option>
                <option value="CAMPEMENT">Campement</option>
              </select>
            ) : (
              <input
                id="modal-ajout-type"
                type="text"
                value={typeModalAjout ? LIBELLES_TYPE_UNITE[typeModalAjout] : ""}
                readOnly
                disabled
              />
            )}
          </div>

          <div className="champ-territorial">
            <label htmlFor="modal-ajout-nom">
              Nom de l’unité ({typeModalAjout ? LIBELLES_TYPE_UNITE[typeModalAjout] : ""}) *
            </label>
            <input
              id="modal-ajout-nom"
              type="text"
              value={nomModalAjout}
              maxLength={160}
              placeholder="Saisissez le nom officiel ou usuel..."
              onChange={(e) => definirNomModalAjout(e.currentTarget.value)}
            />
          </div>

          {typeModalAjout === "DEPARTEMENT" && (
            <div className="champ-territorial">
              <label htmlFor="modal-ajout-chef-lieu">Chef-lieu (facultatif)</label>
              <input
                id="modal-ajout-chef-lieu"
                type="text"
                value={chefLieuModalAjout}
                maxLength={160}
                placeholder="Nom du chef-lieu du département"
                onChange={(e) => definirChefLieuModalAjout(e.currentTarget.value)}
              />
            </div>
          )}

          {typeModalAjout === "VILLE" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={villeAvecArrondissementsModal}
                onChange={(e) => definirVilleAvecArrondissementsModal(e.currentTarget.checked)}
              />
              <span>Cette ville comporte des arrondissements municipaux</span>
            </label>
          )}

          {typeModalAjout === "SITE_HUMANITAIRE" && (
            <div className="champ-territorial">
              <label htmlFor="modal-ajout-categorie-site">Catégorie du site</label>
              <select
                id="modal-ajout-categorie-site"
                value={categorieSiteModal}
                onChange={(e) =>
                  definirCategorieSiteModal(
                    e.currentTarget.value as typeof categorieSiteModal,
                  )
                }
              >
                <option value="SITE_DEPLACES">Site de déplacés</option>
                <option value="CAMP_REFUGIES">Camp de réfugiés</option>
                <option value="CENTRE_ACCUEIL">Centre d’accueil</option>
                <option value="SITE_TRANSIT">Site de transit</option>
                <option value="AUTRE_SITE">Autre site</option>
              </select>
            </div>
          )}
        </div>
      </SIGADFormPanel>

      {/* PANNEAU LATÉRAL DE PROPOSITION DE MODIFICATION TERRITORIALE */}
      <SIGADFormPanel
        ouvert={cibleCorrectionModal !== null}
        onFermer={fermerModalCorrection}
        onSoumettre={() => void enregistrerPropositionCorrection()}
        surtitre="Procédure de correction"
        titre="Proposer une modification territoriale"
        description="Signalez une correction d'intitulé ou d'orthographe sur l'unité existante sélectionnée. Pour créer une unité manquante, utilisez directement le bouton « + Ajouter »."
        taille="md"
        libelleSoumettre="Transmettre la proposition"
        chargement={enCoursCorrection}
        modifieNonEnregistre={motifCorrectionModal.trim().length > 0}
        erreur={erreurModalCorrection}
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="champ-territorial">
            <label htmlFor="modal-correction-actuel">Unité territoriale concernée</label>
            <input
              id="modal-correction-actuel"
              type="text"
              value={
                cibleCorrectionModal
                  ? `${LIBELLES_TYPE_UNITE[cibleCorrectionModal.type]} : ${cibleCorrectionModal.nomActuel}`
                  : ""
              }
              readOnly
              disabled
            />
          </div>

          <div className="champ-territorial">
            <label htmlFor="modal-correction-nom">Intitulé corrigé proposé *</label>
            <input
              id="modal-correction-nom"
              type="text"
              value={nomCorrigeModal}
              maxLength={160}
              placeholder="Saisissez le nom corrigé..."
              onChange={(e) => definirNomCorrigeModal(e.currentTarget.value)}
            />
          </div>

          <div className="champ-territorial">
            <label htmlFor="modal-correction-motif">Motif de la modification *</label>
            <input
              id="modal-correction-motif"
              type="text"
              value={motifCorrectionModal}
              maxLength={1000}
              placeholder="Précisez la raison de cette correction..."
              onChange={(e) => definirMotifCorrectionModal(e.currentTarget.value)}
            />
          </div>

          <div className="champ-territorial">
            <label htmlFor="modal-correction-source">
              Source ou référence justificative (facultatif)
            </label>
            <input
              id="modal-correction-source"
              type="text"
              value={sourceCorrectionModal}
              maxLength={500}
              placeholder="Décret, arrêté, relevé terrain..."
              onChange={(e) => definirSourceCorrectionModal(e.currentTarget.value)}
            />
          </div>
        </div>
      </SIGADFormPanel>
    </section>
  );
}
