import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import type {
  ArrondissementTerritorial,
  CarreTerritorial,
  CommuneTerritoriale,
  DepartementTerritorial,
  ElementSelectionLocalisation,
  LocaliteTerritoriale,
  PageTerritoriale,
  ProvinceTerritoriale,
  QuartierTerritorial,
  SiteHumanitaireTerritorial,
  SousPrefectureTerritoriale,
} from "../../../../shared/types/territoire";
import { calculerChampsLocalisationAffiches, type NatureLieu } from "../../../../shared/utils/localisation-dynamique";
import { ErreurApi, requeteApi } from "../../services/api";

interface SelecteurLocalisationDynamiqueProps {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
  onChange?: (selection: ElementSelectionLocalisation | null) => void;
}

interface EtatPage<T> {
  elements: T[];
  total: number;
  decalage: number;
  chargement: boolean;
  erreur: string | null;
  definirDecalage: (decalage: number) => void;
}

const LIMITE_PAGE = 40;

function utiliserPageApi<T>(chemin: string | null): EtatPage<T> {
  const [decalage, definirDecalage] = useState(0);
  const [page, definirPage] = useState<PageTerritoriale<T> | null>(null);
  const [chargement, definirChargement] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const adresse = useMemo(() => {
    if (!chemin) return null;
    const separateur = chemin.includes("?") ? "&" : "?";
    return `${chemin}${separateur}limite=${LIMITE_PAGE}&decalage=${decalage}`;
  }, [chemin, decalage]);

  useEffect(() => {
    definirDecalage(0);
  }, [chemin]);

  useEffect(() => {
    let actif = true;
    if (!adresse) {
      definirPage(null);
      definirErreur(null);
      definirChargement(false);
      return () => { actif = false; };
    }
    definirChargement(true);
    definirErreur(null);
    void requeteApi<PageTerritoriale<T>>(adresse)
      .then((reponse) => { if (actif) definirPage(reponse); })
      .catch((cause: unknown) => {
        if (actif) definirErreur(cause instanceof Error ? cause.message : "Les données territoriales n’ont pas pu être chargées.");
      })
      .finally(() => { if (actif) definirChargement(false); });
    return () => { actif = false; };
  }, [adresse]);

  return {
    elements: page?.elements ?? [],
    total: page?.total ?? 0,
    decalage,
    chargement,
    erreur,
    definirDecalage,
  };
}

function cheminAvecFiltres(base: string, filtres: Record<string, string | null | undefined>): string {
  const parametres = new URLSearchParams();
  for (const [nom, valeur] of Object.entries(filtres)) {
    if (valeur) parametres.set(nom, valeur);
  }
  return `${base}?${parametres.toString()}`;
}

function SelecteurPagine<T extends { id: string }>(props: {
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
}) {
  const pages = Math.max(1, Math.ceil(props.total / LIMITE_PAGE));
  const pageActuelle = Math.floor(props.decalage / LIMITE_PAGE) + 1;
  return (
    <div className="champ-territorial">
      <label htmlFor={`territoire-${props.libelle}`}>{props.libelle}{props.obligatoire ? " *" : ""}</label>
      <select
        id={`territoire-${props.libelle}`}
        value={props.valeur}
        disabled={props.chargement || props.elements.length === 0}
        onChange={(evenement) => props.modifier(evenement.currentTarget.value)}
        required={props.obligatoire}
      >
        <option value="">{props.chargement ? "Chargement…" : props.elementVide}</option>
        {props.elements.map((element) => <option key={element.id} value={element.id}>{props.nomElement(element)}</option>)}
      </select>
      {props.total > LIMITE_PAGE && (
        <div className="pagination-territoriale" aria-label={`Pagination : ${props.libelle}`}>
          <button type="button" className="bouton bouton-discret" disabled={props.decalage === 0 || props.chargement}
            onClick={() => props.definirDecalage(Math.max(0, props.decalage - LIMITE_PAGE))}>Précédent</button>
          <span>Page {pageActuelle} sur {pages} · {props.total} résultats</span>
          <button type="button" className="bouton bouton-discret" disabled={pageActuelle >= pages || props.chargement}
            onClick={() => props.definirDecalage(props.decalage + LIMITE_PAGE)}>Suivant</button>
        </div>
      )}
      {props.erreur && <p className="message-erreur" role="alert">{props.erreur}</p>}
    </div>
  );
}

export function SelecteurLocalisationDynamique({ utilisateur, jetonCsrf, onChange }: SelecteurLocalisationDynamiqueProps) {
  const [provinceId, definirProvinceId] = useState(utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id ?? "" : "");
  const [departementId, definirDepartementId] = useState("");
  const [sousPrefectureId, definirSousPrefectureId] = useState("");
  const [communeId, definirCommuneId] = useState("");
  const [nature, definirNature] = useState<NatureLieu | "">("");
  const [localiteId, definirLocaliteId] = useState("");
  const [siteId, definirSiteId] = useState("");
  const [arrondissementId, definirArrondissementId] = useState("");
  const [quartierId, definirQuartierId] = useState("");
  const [carreId, definirCarreId] = useState("");
  const [erreurProposition, definirErreurProposition] = useState<string | null>(null);
  const [messageProposition, definirMessageProposition] = useState<string | null>(null);
  const [typeProposition, definirTypeProposition] = useState<"LOCALITE" | "QUARTIER" | "SITE_HUMANITAIRE">("LOCALITE");
  const [typeLocaliteProposee, definirTypeLocaliteProposee] = useState<"VILLAGE" | "FERRICK" | "CAMPEMENT">("VILLAGE");
  const [categorieSiteProposee, definirCategorieSiteProposee] = useState("CAMP_REFUGIES");
  const [nomPropose, definirNomPropose] = useState("");
  const [sourceProposee, definirSourceProposee] = useState("");
  const [possedeCarresProposes, definirPossedeCarresProposes] = useState(false);

  const provinces = utiliserPageApi<ProvinceTerritoriale>("/api/territoire/provinces");
  const departements = utiliserPageApi<DepartementTerritorial>(provinceId
    ? cheminAvecFiltres("/api/territoire/departements", { province_id: provinceId }) : null);
  const sousPrefectures = utiliserPageApi<SousPrefectureTerritoriale>(departementId
    ? cheminAvecFiltres("/api/territoire/sous-prefectures", { departement_id: departementId }) : null);
  const communes = utiliserPageApi<CommuneTerritoriale>(provinceId && departementId
    ? cheminAvecFiltres("/api/territoire/communes", {
      province_id: provinceId,
      departement_id: departementId,
      sous_prefecture_id: sousPrefectureId || null,
    }) : null);
  const natureLocalite = nature === "VILLE" || nature === "VILLAGE" || nature === "FERRICK" || nature === "CAMPEMENT";
  const localites = utiliserPageApi<LocaliteTerritoriale>(natureLocalite && provinceId && departementId
    ? cheminAvecFiltres("/api/territoire/localites", {
      province_id: provinceId,
      departement_id: departementId,
      sous_prefecture_id: sousPrefectureId || null,
      commune_id: communeId || null,
      type_localite: nature,
    }) : null);
  const siteHum = utiliserPageApi<SiteHumanitaireTerritorial>(nature === "SITE_HUMANITAIRE" && provinceId && departementId
    ? cheminAvecFiltres("/api/territoire/sites-humanitaires", {
      province_id: provinceId,
      departement_id: departementId,
      sous_prefecture_id: sousPrefectureId || null,
      commune_id: communeId || null,
    }) : null);
  const localiteChoisie = localites.elements.find((element) => element.id === localiteId) ?? null;
  const arrondissementChemin = localiteChoisie?.mode_decoupage_urbain === "AVEC_ARRONDISSEMENTS"
    ? cheminAvecFiltres("/api/territoire/arrondissements", { localite_id: localiteChoisie.id }) : null;
  const arrondissements = utiliserPageApi<ArrondissementTerritorial>(arrondissementChemin);
  const modeVille = localiteChoisie?.mode_decoupage_urbain ?? null;
  const champsAffiches = calculerChampsLocalisationAffiches(
    nature || null,
    modeVille,
    arrondissementId.length > 0,
    false,
  );
  const quartierChemin = champsAffiches.quartier && localiteChoisie
    ? cheminAvecFiltres("/api/territoire/quartiers", {
      localite_id: localiteChoisie.id,
      arrondissement_id: modeVille === "AVEC_ARRONDISSEMENTS" ? arrondissementId : null,
    }) : null;
  const quartiers = utiliserPageApi<QuartierTerritorial>(quartierChemin);
  const quartierChoisi = quartiers.elements.find((element) => element.id === quartierId) ?? null;
  const champsFinaux = calculerChampsLocalisationAffiches(
    nature || null,
    modeVille,
    arrondissementId.length > 0,
    quartierChoisi?.possede_carres === 1,
  );
  const carres = utiliserPageApi<CarreTerritorial>(champsFinaux.carre && quartierId
    ? cheminAvecFiltres("/api/territoire/carres", { quartier_id: quartierId }) : null);

  useEffect(() => {
    if (utilisateur.role === "DELEGUE_PROVINCIAL") definirProvinceId(utilisateur.province_id ?? "");
  }, [utilisateur.role, utilisateur.province_id]);

  useEffect(() => {
    const province = provinces.elements.find((element) => element.id === provinceId);
    const departement = departements.elements.find((element) => element.id === departementId);
    const sousPrefecture = sousPrefectures.elements.find((element) => element.id === sousPrefectureId);
    const commune = communes.elements.find((element) => element.id === communeId);
    const localite = localites.elements.find((element) => element.id === localiteId);
    const site = siteHum.elements.find((element) => element.id === siteId);
    const selection: ElementSelectionLocalisation | null = province && departement
      ? nature === "SITE_HUMANITAIRE" && site
        ? {
          nature: "SITE_HUMANITAIRE", province_id: province.id, departement_id: site.departement_id,
          sous_prefecture_id: site.sous_prefecture_id, commune_id: site.commune_id,
          localite_id: site.localite_proche_id, arrondissement_id: null, quartier_id: null,
          carre_id: null, site_humanitaire_id: site.id,
        }
        : localite && nature !== "SITE_HUMANITAIRE"
          ? {
            nature: "LOCALITE", province_id: localite.province_id, departement_id: localite.departement_id,
            sous_prefecture_id: localite.sous_prefecture_id ?? sousPrefecture?.id ?? null,
            commune_id: localite.commune_id ?? commune?.id ?? null, localite_id: localite.id,
            arrondissement_id: champsAffiches.arrondissement ? arrondissementId || null : null,
            quartier_id: champsAffiches.quartier ? quartierId || null : null,
            carre_id: champsFinaux.carre ? carreId || null : null, site_humanitaire_id: null,
          }
          : null
      : null;
    onChange?.(selection);
  }, [
    provinceId, departementId, sousPrefectureId, communeId, nature, localiteId, siteId,
    arrondissementId, quartierId, carreId, provinces.elements, departements.elements,
    sousPrefectures.elements, communes.elements, localites.elements, siteHum.elements,
    champsAffiches.arrondissement, champsAffiches.quartier, champsFinaux.carre, onChange,
  ]);

  function modifierProvince(valeur: string): void {
    definirProvinceId(valeur);
    definirDepartementId(""); definirSousPrefectureId(""); definirCommuneId("");
    definirNature(""); definirLocaliteId(""); definirSiteId(""); definirArrondissementId("");
    definirQuartierId(""); definirCarreId("");
  }

  function modifierDepartement(valeur: string): void {
    definirDepartementId(valeur); definirSousPrefectureId(""); definirCommuneId("");
    definirLocaliteId(""); definirSiteId(""); definirArrondissementId(""); definirQuartierId(""); definirCarreId("");
  }

  async function soumettreProposition(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    definirErreurProposition(null);
    definirMessageProposition(null);
    if (!departementId || utilisateur.role !== "DELEGUE_PROVINCIAL") {
      definirErreurProposition("Sélectionnez un département de votre province avant de proposer un élément.");
      return;
    }
    let chemin = "";
    let corps: Record<string, string | boolean | null>;
    if (typeProposition === "LOCALITE") {
      chemin = "/api/territoire/propositions/localites";
      corps = {
        departement_id: departementId,
        sous_prefecture_id: sousPrefectureId || null,
        commune_id: communeId || null,
        canton_id: null,
        nom: nomPropose,
        type_localite: typeLocaliteProposee,
        source_documentation: sourceProposee,
      };
    } else if (typeProposition === "QUARTIER") {
      if (!localiteChoisie || localiteChoisie.type_localite !== "VILLE") {
        definirErreurProposition("Sélectionnez une ville avant de proposer un quartier.");
        return;
      }
      chemin = "/api/territoire/propositions/quartiers";
      corps = {
        localite_id: localiteChoisie.id,
        arrondissement_id: localiteChoisie.mode_decoupage_urbain === "AVEC_ARRONDISSEMENTS" ? arrondissementId || null : null,
        nom: nomPropose,
        possede_carres: possedeCarresProposes,
        source_documentation: sourceProposee,
      };
    } else {
      chemin = "/api/territoire/propositions/sites-humanitaires";
      corps = {
        departement_id: departementId,
        sous_prefecture_id: sousPrefectureId || null,
        commune_id: communeId || null,
        localite_proche_id: localiteChoisie?.id ?? null,
        nom: nomPropose,
        categorie_site: categorieSiteProposee,
        source_documentation: sourceProposee,
      };
    }
    try {
      await requeteApi<{ id: string; statut_validation: string }>(chemin, {
        methode: "POST", jetonCsrf, corps,
      });
      definirMessageProposition("La proposition a été transmise à l’administration centrale pour examen.");
      definirNomPropose(""); definirSourceProposee("");
    } catch (cause) {
      definirErreurProposition(cause instanceof ErreurApi ? cause.message : "La proposition n’a pas pu être enregistrée.");
    }
  }

  return (
    <section className="carte-section selecteur-localisation" aria-labelledby="titre-selecteur-localisation">
      <div className="titre-section">
        <div><h2 id="titre-selecteur-localisation">Sélecteur de localisation</h2>
          <p>Choisissez le rattachement administratif puis le lieu de l’intervention.</p></div>
        {utilisateur.role === "DELEGUE_PROVINCIAL" && <span className="badge-role">Province rattachée au compte</span>}
      </div>
      <div className="grille-territoriale">
        <SelecteurPagine<ProvinceTerritoriale> libelle="Province" elementVide="Sélectionner une province" valeur={provinceId}
          elements={provinces.elements} nomElement={(element) => element.nom} total={provinces.total}
          decalage={provinces.decalage} chargement={provinces.chargement} erreur={provinces.erreur}
          definirDecalage={provinces.definirDecalage} modifier={modifierProvince}
          obligatoire={utilisateur.role === "ADMIN_CENTRAL" || utilisateur.role === "PROPRIETAIRE"} />
        <SelecteurPagine<DepartementTerritorial> libelle="Département" elementVide="Sélectionner un département" valeur={departementId}
          elements={departements.elements} nomElement={(element) => element.nom} total={departements.total}
          decalage={departements.decalage} chargement={departements.chargement} erreur={departements.erreur}
          definirDecalage={departements.definirDecalage} modifier={modifierDepartement} obligatoire />
        <SelecteurPagine<SousPrefectureTerritoriale> libelle="Sous-préfecture" elementVide="Aucune sous-préfecture sélectionnée" valeur={sousPrefectureId}
          elements={sousPrefectures.elements} nomElement={(element) => element.nom} total={sousPrefectures.total}
          decalage={sousPrefectures.decalage} chargement={sousPrefectures.chargement} erreur={sousPrefectures.erreur}
          definirDecalage={sousPrefectures.definirDecalage} modifier={(valeur) => { definirSousPrefectureId(valeur); definirCommuneId(""); definirLocaliteId(""); definirSiteId(""); }} />
        <SelecteurPagine<CommuneTerritoriale> libelle="Commune" elementVide="Aucune commune sélectionnée" valeur={communeId}
          elements={communes.elements} nomElement={(element) => `${element.nom} · ${element.type_commune === "URBAINE" ? "urbaine" : "rurale"}`}
          total={communes.total} decalage={communes.decalage} chargement={communes.chargement} erreur={communes.erreur}
          definirDecalage={communes.definirDecalage} modifier={(valeur) => { definirCommuneId(valeur); definirLocaliteId(""); definirSiteId(""); }} />
        <div className="champ-territorial">
          <label htmlFor="territoire-nature">Nature du lieu</label>
          <select id="territoire-nature" value={nature} disabled={!departementId}
            onChange={(evenement) => {
              definirNature(evenement.currentTarget.value as NatureLieu | "");
              definirLocaliteId(""); definirSiteId(""); definirArrondissementId(""); definirQuartierId(""); definirCarreId("");
            }}>
            <option value="">Sélectionner une nature</option>
            <option value="VILLE">Ville</option>
            <option value="VILLAGE">Village</option>
            <option value="FERRICK">Ferrick</option>
            <option value="CAMPEMENT">Campement</option>
            <option value="SITE_HUMANITAIRE">Site humanitaire</option>
          </select>
        </div>
        {natureLocalite && <SelecteurPagine<LocaliteTerritoriale> libelle={nature === "VILLE" ? "Ville" : nature === "VILLAGE" ? "Village" : nature === "FERRICK" ? "Ferrick" : "Campement"}
          elementVide="Sélectionner un lieu" valeur={localiteId} elements={localites.elements} nomElement={(element) => element.nom}
          total={localites.total} decalage={localites.decalage} chargement={localites.chargement} erreur={localites.erreur}
          definirDecalage={localites.definirDecalage} modifier={(valeur) => { definirLocaliteId(valeur); definirArrondissementId(""); definirQuartierId(""); definirCarreId(""); }} />}
        {nature === "SITE_HUMANITAIRE" && <SelecteurPagine<SiteHumanitaireTerritorial> libelle="Site humanitaire"
          elementVide="Sélectionner un site" valeur={siteId} elements={siteHum.elements}
          nomElement={(element) => `${element.nom} · ${element.categorie_site}`} total={siteHum.total}
          decalage={siteHum.decalage} chargement={siteHum.chargement} erreur={siteHum.erreur}
          definirDecalage={siteHum.definirDecalage} modifier={definirSiteId} />}
        {champsAffiches.arrondissement && <SelecteurPagine<ArrondissementTerritorial> libelle="Arrondissement"
          elementVide="Sélectionner un arrondissement" valeur={arrondissementId} elements={arrondissements.elements}
          nomElement={(element) => element.nom} total={arrondissements.total} decalage={arrondissements.decalage}
          chargement={arrondissements.chargement} erreur={arrondissements.erreur}
          definirDecalage={arrondissements.definirDecalage} modifier={(valeur) => { definirArrondissementId(valeur); definirQuartierId(""); definirCarreId(""); }} obligatoire />}
        {champsAffiches.quartier && <SelecteurPagine<QuartierTerritorial> libelle="Quartier"
          elementVide="Sélectionner un quartier" valeur={quartierId} elements={quartiers.elements}
          nomElement={(element) => element.nom} total={quartiers.total} decalage={quartiers.decalage}
          chargement={quartiers.chargement} erreur={quartiers.erreur}
          definirDecalage={quartiers.definirDecalage} modifier={(valeur) => { definirQuartierId(valeur); definirCarreId(""); }} />}
        {champsFinaux.carre && <SelecteurPagine<CarreTerritorial> libelle="Carré"
          elementVide="Sélectionner un carré" valeur={carreId} elements={carres.elements}
          nomElement={(element) => element.code_ou_nom} total={carres.total} decalage={carres.decalage}
          chargement={carres.chargement} erreur={carres.erreur}
          definirDecalage={carres.definirDecalage} modifier={definirCarreId} />}
      </div>
      {utilisateur.role === "DELEGUE_PROVINCIAL" && (
        <details className="proposition-territoriale">
          <summary>Proposer un lieu ou une mise à jour géographique</summary>
          <p className="texte-secondaire">Toute proposition reste « PROPOSE » jusqu’à son examen par l’administration centrale.</p>
          <form className="formulaire-proposition" onSubmit={(evenement) => { void soumettreProposition(evenement); }}>
            <div className="champ-territorial">
              <label htmlFor="type-proposition">Élément à proposer</label>
              <select id="type-proposition" value={typeProposition} onChange={(evenement) => definirTypeProposition(evenement.currentTarget.value as typeof typeProposition)}>
                <option value="LOCALITE">Village, ferrick ou campement</option>
                <option value="QUARTIER">Quartier d’une ville</option>
                <option value="SITE_HUMANITAIRE">Site humanitaire</option>
              </select>
            </div>
            {typeProposition === "LOCALITE" && <div className="champ-territorial">
              <label htmlFor="type-localite-proposee">Type de localité</label>
              <select id="type-localite-proposee" value={typeLocaliteProposee}
                onChange={(evenement) => definirTypeLocaliteProposee(evenement.currentTarget.value as typeof typeLocaliteProposee)}>
                <option value="VILLAGE">Village</option><option value="FERRICK">Ferrick</option><option value="CAMPEMENT">Campement</option>
              </select>
            </div>}
            {typeProposition === "SITE_HUMANITAIRE" && <div className="champ-territorial">
              <label htmlFor="categorie-site-proposee">Catégorie du site</label>
              <select id="categorie-site-proposee" value={categorieSiteProposee} onChange={(evenement) => definirCategorieSiteProposee(evenement.currentTarget.value)}>
                <option value="CAMP_REFUGIES">Camp de réfugiés</option><option value="SITE_DEPLACES">Site de déplacés</option>
                <option value="CENTRE_ACCUEIL">Centre d’accueil</option><option value="SITE_TRANSIT">Site de transit</option>
                <option value="AUTRE_SITE">Autre site</option>
              </select>
            </div>}
            <div className="champ-territorial">
              <label htmlFor="nom-territoire-propose">Nom du lieu</label>
              <input id="nom-territoire-propose" value={nomPropose} maxLength={160} minLength={2} required
                onChange={(evenement) => definirNomPropose(evenement.currentTarget.value)} />
            </div>
            {typeProposition === "QUARTIER" && <label className="option-carres">
              <input type="checkbox" checked={possedeCarresProposes} onChange={(evenement) => definirPossedeCarresProposes(evenement.currentTarget.checked)} />
              Le quartier comporte des carrés
            </label>}
            <div className="champ-territorial champ-documentation">
              <label htmlFor="source-territoire-proposee">Source ou pièce justificative</label>
              <textarea id="source-territoire-proposee" value={sourceProposee} minLength={3} maxLength={500} required rows={3}
                onChange={(evenement) => definirSourceProposee(evenement.currentTarget.value)} />
            </div>
            {erreurProposition && <p className="message-erreur" role="alert">{erreurProposition}</p>}
            {messageProposition && <p className="message-succes" role="status">{messageProposition}</p>}
            <button type="submit" className="bouton bouton-principal">Transmettre la proposition</button>
          </form>
        </details>
      )}
    </section>
  );
}
