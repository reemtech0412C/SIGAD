import { useCallback, useEffect, useMemo, useState, type FormEvent, type JSX } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { ErreurApi, requeteApi } from "../../services/api";

interface Props {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
}

interface PageApi<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface DistributionApi {
  id: string;
  reference_distribution: string;
  intitule_distribution: string;
  province_id: string;
  province_nom: string;
  date_prevue: string;
  nature_aide: string;
  statut: StatutDistribution;
  nombre_menages_cibles: number;
  nombre_personnes_cibles: number;
  modifie_le: string;
}

type StatutDistribution = "BROUILLON" | "EN_PREPARATION" | "VALIDEE_PROVINCE" | "EN_EXECUTION" | "TERMINEE_PROVINCE" | "RETOURNEE_POUR_CORRECTION" | "CLOTUREE_CENTRAL";
type TypeSource = "APPROVISIONNEMENT_CENTRAL" | "APPROVISIONNEMENT_DIRECT" | "STOCK_EXISTANT" | "MIXTE";
type StatutMenage = "EN_ATTENTE" | "SERVI" | "PARTIELLEMENT_SERVI" | "ABSENT" | "NON_SERVI";

interface EntrepotRef { id: string; code_entrepot: string; nom: string; }
interface ArticleRef { id: string; code_article: string; designation: string; unite: string; decimales_autorisees: number; }
interface PartenaireRef { id: string; nom: string; sigle: string | null; role: string; }
interface LocaliteRef { id: string; nom: string; type_localite: string; departement_id: string; departement_nom: string; }
interface SiteRef { id: string; nom: string; code_site: string | null; categorie_site: string; departement_id: string; }
interface ListeRef { id: string; reference_liste: string; intitule: string; nombre_menages_cibles: number; statut: string; }

interface MenageCible {
  id: string;
  code_menage: string;
  nom_chef_menage: string;
  nombre_personnes: number;
  departement_id: string;
  localite_id: string | null;
  localite_nom: string | null;
  site_humanitaire_id: string | null;
  site_humanitaire_nom: string | null;
}

interface ZoneApi {
  id: string;
  localite_id: string | null;
  localite_nom: string | null;
  arrondissement_id: string | null;
  arrondissement_nom: string | null;
  quartier_id: string | null;
  quartier_nom: string | null;
  carre_id: string | null;
  carre_nom: string | null;
  site_humanitaire_id: string | null;
  site_humanitaire_nom: string | null;
  nom_site_distribution: string;
}

interface ArticlePlanApi {
  id: string;
  article_id: string;
  code_article: string;
  designation: string;
  unite: string;
  source_approvisionnement: TypeSource;
  ration_par_menage: number;
  quantite_totale_prevue: number;
  quantite_reservee: number;
  quantite_distribuee: number;
}

interface CorrectionApi {
  id: string;
  motif_retour: string;
  elements_a_corriger: string;
  statut: "EN_ATTENTE_DELEGUE" | "CORRECTION_SOUMISE" | "VALIDEE_CENTRAL";
  reponse_delegue: string | null;
  cree_le: string;
}

interface DetailDistribution extends DistributionApi {
  departement_id: string;
  departement_nom: string;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  nature_aide: string;
  bailleur_fonds_id: string | null;
  partenaire_execution_id: string | null;
  objectif: string;
  date_prevue: string;
  entrepot_id: string;
  entrepot_nom: string;
  liste_beneficiaires_id: string | null;
  observations: string | null;
  version_plan: number;
  zones: ZoneApi[];
  articles: ArticlePlanApi[];
  corrections: CorrectionApi[];
}

interface MenageDistributionApi {
  id: string;
  menage_id: string;
  code_menage: string;
  nom_chef_menage: string;
  nombre_personnes: number;
  zone_distribution_id: string | null;
  statut_service: StatutMenage;
  date_service: string | null;
  motif_non_service: string | null;
}

interface AllocationApi {
  id: string;
  article_id: string;
  designation: string;
  unite: string;
  quantite_prevue: number;
  quantite_servie: number;
  quantite_restante: number;
}

interface SyntheseApi {
  menages: { total?: number; servis?: number; partiels?: number; absents?: number; non_servis?: number; en_attente?: number };
  articles: Array<{
    article_id: string;
    designation: string;
    unite: string;
    quantite_totale_prevue: number;
    quantite_reservee: number;
    quantite_distribuee: number;
    quantite_residuelle_reservee: number;
  }>;
}

interface ZoneForm {
  cle: string;
  genre: "localite" | "site";
  identifiant: string;
  nom: string;
  departement_id: string;
}

interface ArticleForm {
  article_id: string;
  source_approvisionnement: TypeSource;
  ration_par_menage: number;
}

const TAILLE_PAGE = 20;
const TAILLE_PAGE_MENAGES = 25;
const SOURCES: Array<[TypeSource, string]> = [
  ["APPROVISIONNEMENT_CENTRAL", "Approvisionnement central réceptionné"],
  ["APPROVISIONNEMENT_DIRECT", "Approvisionnement direct réceptionné"],
  ["STOCK_EXISTANT", "Stock existant de la province"],
  ["MIXTE", "Sources mixtes en stock"],
];
const LIBELLES_STATUT: Record<StatutDistribution | StatutMenage, string> = {
  BROUILLON: "Brouillon",
  EN_PREPARATION: "En préparation",
  VALIDEE_PROVINCE: "Validée par la province",
  EN_EXECUTION: "En cours d’exécution",
  TERMINEE_PROVINCE: "Terminée par la province",
  RETOURNEE_POUR_CORRECTION: "Retournée pour correction",
  CLOTUREE_CENTRAL: "Clôturée par l’administration centrale",
  EN_ATTENTE: "En attente",
  SERVI: "Servi",
  PARTIELLEMENT_SERVI: "Partiellement servi",
  ABSENT: "Absent",
  NON_SERVI: "Non servi",
};

function messageErreur(cause: unknown, defaut: string): string {
  return cause instanceof ErreurApi || cause instanceof Error ? cause.message : defaut;
}

function cleIdempotence(prefixe: string): string {
  return `${prefixe}-${crypto.randomUUID()}`;
}

function parametresPage(limite: number, decalage: number, recherche?: string): string {
  const params = new URLSearchParams({ limite: String(limite), decalage: String(decalage) });
  if (recherche?.trim()) params.set("recherche", recherche.trim());
  return params.toString();
}

function classStatut(statut: string): string {
  if (["SERVI", "CLOTUREE_CENTRAL"].includes(statut)) return "statut-distribution-reussi";
  if (["RETOURNEE_POUR_CORRECTION", "ABSENT", "NON_SERVI"].includes(statut)) return "statut-distribution-alerte";
  if (["EN_PREPARATION", "VALIDEE_PROVINCE", "EN_EXECUTION", "TERMINEE_PROVINCE", "PARTIELLEMENT_SERVI"].includes(statut)) return "statut-distribution-attente";
  return "statut-distribution-neutre";
}

function nomZone(zone: ZoneApi): string {
  if (zone.site_humanitaire_nom) return `Site humanitaire : ${zone.site_humanitaire_nom}`;
  const elements = [zone.localite_nom, zone.arrondissement_nom, zone.quartier_nom, zone.carre_nom].filter(Boolean);
  return elements.join(" · ") || zone.nom_site_distribution;
}

function lireChampsCorrection(texte: string): string[] {
  try {
    const valeur: unknown = JSON.parse(texte);
    if (typeof valeur !== "object" || valeur === null) return [];
    const champs = Reflect.get(valeur, "champs_modifiables");
    return Array.isArray(champs) ? champs.filter((champ): champ is string => typeof champ === "string") : [];
  } catch {
    return [];
  }
}

function Pagination(props: { total: number; decalage: number; limite: number; chargement: boolean; changer: (decalage: number) => void }): JSX.Element {
  const totalPages = Math.max(1, Math.ceil(props.total / props.limite));
  const page = Math.floor(props.decalage / props.limite) + 1;
  return (
    <div className="pagination">
      <span>Page {page} sur {totalPages} · {props.total} éléments</span>
      <div className="actions-ligne">
        <button className="bouton bouton-discret" disabled={props.decalage === 0 || props.chargement}
          onClick={() => props.changer(Math.max(0, props.decalage - props.limite))} type="button">Précédente</button>
        <button className="bouton bouton-discret" disabled={props.decalage + props.limite >= props.total || props.chargement}
          onClick={() => props.changer(props.decalage + props.limite)} type="button">Suivante</button>
      </div>
    </div>
  );
}

export function TableauDistributions({ utilisateur, jetonCsrf }: Props): JSX.Element {
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  const estCentral = utilisateur.role === "ADMIN_CENTRAL";
  const [ecran, definirEcran] = useState<"liste" | "formulaire" | "detail">("liste");
  const [distributions, definirDistributions] = useState<PageApi<DistributionApi>>({ elements: [], total: 0, limite: TAILLE_PAGE, decalage: 0 });
  const [detail, definirDetail] = useState<DetailDistribution | null>(null);
  const [synthese, definirSynthese] = useState<SyntheseApi | null>(null);
  const [menagesDistribution, definirMenagesDistribution] = useState<PageApi<MenageDistributionApi>>({ elements: [], total: 0, limite: TAILLE_PAGE_MENAGES, decalage: 0 });
  const [allocations, definirAllocations] = useState<AllocationApi[]>([]);
  const [menageRemise, definirMenageRemise] = useState<MenageDistributionApi | null>(null);
  const [chargement, definirChargement] = useState(false);
  const [soumission, definirSoumission] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [message, definirMessage] = useState<string | null>(null);
  const [recherche, definirRecherche] = useState("");
  const [statutFiltre, definirStatutFiltre] = useState("");
  const [decalage, definirDecalage] = useState(0);
  const [decalageMenages, definirDecalageMenages] = useState(0);
  const [referentiels, definirReferentiels] = useState<{
    entrepots: EntrepotRef[];
    articles: ArticleRef[];
    partenaires: PartenaireRef[];
    localites: LocaliteRef[];
    sites: SiteRef[];
    listes: ListeRef[];
  }>({ entrepots: [], articles: [], partenaires: [], localites: [], sites: [], listes: [] });

  const [distributionIdEdition, definirDistributionIdEdition] = useState<string | null>(null);
  const [intitule, definirIntitule] = useState("");
  const [objectif, definirObjectif] = useState("");
  const [datePrevue, definirDatePrevue] = useState(new Date().toISOString().slice(0, 10));
  const [natureAide, definirNatureAide] = useState("ALIMENTAIRE");
  const [entrepotId, definirEntrepotId] = useState("");
  const [bailleurId, definirBailleurId] = useState("");
  const [executionId, definirExecutionId] = useState("");
  const [listeId, definirListeId] = useState("");
  const [observations, definirObservations] = useState("");
  const [cleZone, definirCleZone] = useState("");
  const [zones, definirZones] = useState<ZoneForm[]>([]);
  const [rechercheMenages, definirRechercheMenages] = useState("");
  const [pageMenagesDisponibles, definirPageMenagesDisponibles] = useState<PageApi<MenageCible>>({ elements: [], total: 0, limite: TAILLE_PAGE_MENAGES, decalage: 0 });
  const [decalageMenagesDisponibles, definirDecalageMenagesDisponibles] = useState(0);
  const [menagesSelectionnes, definirMenagesSelectionnes] = useState<Map<string, MenageCible>>(new Map());
  const [affectationsZone, definirAffectationsZone] = useState<Map<string, number>>(new Map());
  const [articleId, definirArticleId] = useState("");
  const [sourceArticle, definirSourceArticle] = useState<TypeSource>("STOCK_EXISTANT");
  const [rationArticle, definirRationArticle] = useState(1);
  const [articlesPlan, definirArticlesPlan] = useState<ArticleForm[]>([]);
  const [identiteRecepteur, definirIdentiteRecepteur] = useState("");
  const [dateRemise, definirDateRemise] = useState(new Date().toISOString().slice(0, 10));
  const [statutRemise, definirStatutRemise] = useState<"SERVI" | "PARTIELLEMENT_SERVI" | "ABSENT" | "NON_SERVI">("SERVI");
  const [motifNonService, definirMotifNonService] = useState("");
  const [quantitesRemise, definirQuantitesRemise] = useState<Map<string, number>>(new Map());
  const [fichierPv, definirFichierPv] = useState<File | null>(null);
  const [motifRetour, definirMotifRetour] = useState("");
  const [champsRetour, definirChampsRetour] = useState<string[]>(["observations"]);
  const [reponseCorrection, definirReponseCorrection] = useState("");
  const [corrections, definirCorrections] = useState<Record<string, string | null>>({});
  const [observationsFinales, definirObservationsFinales] = useState("");

  const urlListe = useMemo(() => {
    const params = new URLSearchParams(parametresPage(TAILLE_PAGE, decalage, recherche));
    if (statutFiltre) params.set("statut", statutFiltre);
    return `/api/distributions?${params.toString()}`;
  }, [decalage, recherche, statutFiltre]);

  const chargerDistributions = useCallback(async () => {
    definirChargement(true);
    try {
      const page = await requeteApi<PageApi<DistributionApi>>(urlListe);
      definirDistributions(page);
      definirErreur(null);
    } catch (cause) {
      definirErreur(messageErreur(cause, "Les distributions n’ont pas pu être chargées."));
    } finally {
      definirChargement(false);
    }
  }, [urlListe]);

  useEffect(() => { void chargerDistributions(); }, [chargerDistributions]);

  useEffect(() => {
    if (!estDelegue) return;
    let actif = true;
    async function chargerReferentiels(): Promise<void> {
      try {
        const [entrepots, articles, partenaires, localites, sites, listes] = await Promise.all([
          requeteApi<PageApi<EntrepotRef>>("/api/distributions/referentiels?type=entrepots&limite=100&decalage=0"),
          requeteApi<PageApi<ArticleRef>>("/api/distributions/referentiels?type=articles&limite=100&decalage=0"),
          requeteApi<PageApi<PartenaireRef>>("/api/distributions/referentiels?type=partenaires&limite=100&decalage=0"),
          requeteApi<PageApi<LocaliteRef>>("/api/distributions/referentiels?type=localites&limite=100&decalage=0"),
          requeteApi<PageApi<SiteRef>>("/api/distributions/referentiels?type=sites&limite=100&decalage=0"),
          requeteApi<PageApi<ListeRef>>("/api/distributions/referentiels?type=listes&limite=100&decalage=0"),
        ]);
        if (!actif) return;
        definirReferentiels({ entrepots: entrepots.elements, articles: articles.elements,
          partenaires: partenaires.elements, localites: localites.elements,
          sites: sites.elements, listes: listes.elements });
      } catch (cause) {
        if (actif) definirErreur(messageErreur(cause, "Les référentiels de distribution n’ont pas pu être chargés."));
      }
    }
    void chargerReferentiels();
    return () => { actif = false; };
  }, [estDelegue]);

  const departementCible = zones[0]?.departement_id ?? "";

  useEffect(() => {
    if (!estDelegue || ecran !== "formulaire") return;
    let actif = true;
    async function chargerMenages(): Promise<void> {
      const params = new URLSearchParams(parametresPage(TAILLE_PAGE_MENAGES, decalageMenagesDisponibles, rechercheMenages));
      if (departementCible) params.set("departement_id", departementCible);
      try {
        const page = await requeteApi<PageApi<MenageCible>>(`/api/distributions/menages?${params.toString()}`);
        if (actif) {
          definirPageMenagesDisponibles(page);
          definirErreur(null);
        }
      } catch (cause) {
        if (actif) definirErreur(messageErreur(cause, "Les ménages cibles n’ont pas pu être chargés."));
      }
    }
    void chargerMenages();
    return () => { actif = false; };
  }, [departementCible, decalageMenagesDisponibles, ecran, estDelegue, rechercheMenages]);

  useEffect(() => {
    const correction = detail?.corrections.find((element) => element.statut === "EN_ATTENTE_DELEGUE");
    if (!detail || !correction) {
      definirCorrections({});
      definirReponseCorrection("");
      return;
    }
    const champs = lireChampsCorrection(correction.elements_a_corriger);
    const valeurs: Record<string, string | null> = {};
    for (const champ of champs) {
      valeurs[champ] = champ === "observations" ? detail.observations
        : champ === "intitule_distribution" ? detail.intitule_distribution
        : champ === "objectif" ? detail.objectif
        : champ === "date_prevue" ? detail.date_prevue : null;
    }
    definirCorrections(valeurs);
    definirReponseCorrection("");
  }, [detail?.id, detail?.corrections, detail?.observations, detail?.intitule_distribution, detail?.objectif, detail?.date_prevue]);

  const chargerDetail = useCallback(async (id: string, pageMenages = 0) => {
    definirChargement(true);
    try {
      const [detailApi, menagesApi, syntheseApi] = await Promise.all([
        requeteApi<DetailDistribution>(`/api/distributions/${id}`),
        requeteApi<PageApi<MenageDistributionApi>>(`/api/distributions/${id}/menages?limite=${TAILLE_PAGE_MENAGES}&decalage=${pageMenages}`),
        requeteApi<SyntheseApi>(`/api/distributions/${id}/synthese`),
      ]);
      definirDetail(detailApi);
      definirMenagesDistribution(menagesApi);
      definirSynthese(syntheseApi);
      definirDecalageMenages(pageMenages);
      definirErreur(null);
    } catch (cause) {
      definirErreur(messageErreur(cause, "La distribution n’a pas pu être ouverte."));
    } finally {
      definirChargement(false);
    }
  }, []);

  useEffect(() => {
    if (ecran === "detail" && detail?.id) void chargerDetail(detail.id, decalageMenages);
  }, [chargerDetail, decalageMenages, ecran, detail?.id]);

  function remettreFormulaire(): void {
    definirDistributionIdEdition(null);
    definirIntitule("");
    definirObjectif("");
    definirDatePrevue(new Date().toISOString().slice(0, 10));
    definirNatureAide("ALIMENTAIRE");
    definirEntrepotId("");
    definirBailleurId("");
    definirExecutionId("");
    definirListeId("");
    definirObservations("");
    definirCleZone("");
    definirZones([]);
    definirMenagesSelectionnes(new Map());
    definirAffectationsZone(new Map());
    definirArticlesPlan([]);
    definirArticleId("");
    definirRationArticle(1);
    definirEcran("formulaire");
    definirErreur(null);
    definirMessage(null);
  }

  async function modifierBrouillon(): Promise<void> {
    if (!detail || !["BROUILLON", "EN_PREPARATION"].includes(detail.statut)) return;
    definirSoumission(true);
    try {
      const menages: MenageDistributionApi[] = [];
      for (let page = 0; page < menagesDistribution.total; page += 100) {
        const resultat = await requeteApi<PageApi<MenageDistributionApi>>(
          `/api/distributions/${detail.id}/menages?limite=100&decalage=${page}`,
        );
        menages.push(...resultat.elements);
      }
      const zonesForm = detail.zones.map((zone) => {
        if (zone.site_humanitaire_id) {
          return { cle: `site:${zone.site_humanitaire_id}`, genre: "site" as const,
            identifiant: zone.site_humanitaire_id, nom: zone.nom_site_distribution, departement_id: detail.departement_id };
        }
        const localite = referentiels.localites.find((option) => option.id === zone.localite_id);
        return { cle: `localite:${zone.localite_id ?? ""}`, genre: "localite" as const,
          identifiant: zone.localite_id ?? "", nom: zone.nom_site_distribution, departement_id: localite?.departement_id ?? detail.departement_id };
      });
      const zoneIndex = new Map(detail.zones.map((zone, index) => [zone.id, index]));
      definirZones(zonesForm);
      definirCleZone("");
      definirMenagesSelectionnes(new Map(menages.map((menage) => [menage.menage_id, {
        id: menage.menage_id, code_menage: menage.code_menage, nom_chef_menage: menage.nom_chef_menage,
        nombre_personnes: menage.nombre_personnes, departement_id: detail.departement_id,
        localite_id: null, localite_nom: null, site_humanitaire_id: null, site_humanitaire_nom: null,
      }])));
      definirAffectationsZone(new Map(menages.map((menage) => [menage.menage_id, zoneIndex.get(menage.zone_distribution_id ?? "") ?? 0])));
      definirArticlesPlan(detail.articles.map((article) => ({
        article_id: article.article_id, source_approvisionnement: article.source_approvisionnement,
        ration_par_menage: article.ration_par_menage,
      })));
      definirIntitule(detail.intitule_distribution);
      definirObjectif(detail.objectif);
      definirDatePrevue(detail.date_prevue);
      definirNatureAide(detail.nature_aide);
      definirEntrepotId(detail.entrepot_id);
      definirBailleurId(detail.bailleur_fonds_id ?? "");
      definirExecutionId(detail.partenaire_execution_id ?? "");
      definirListeId(detail.liste_beneficiaires_id ?? "");
      definirObservations(detail.observations ?? "");
      definirDistributionIdEdition(detail.id);
      definirEcran("formulaire");
      definirErreur(null);
    } catch (cause) {
      definirErreur(messageErreur(cause, "Le brouillon n’a pas pu être préparé pour modification."));
    } finally {
      definirSoumission(false);
    }
  }

  function ajouterZone(): void {
    const [genre, identifiant] = cleZone.split(":");
    if (!genre || !identifiant || zones.some((zone) => zone.cle === cleZone)) return;
    const localite = genre === "localite" ? referentiels.localites.find((option) => option.id === identifiant) : undefined;
    const site = genre === "site" ? referentiels.sites.find((option) => option.id === identifiant) : undefined;
    const option: ZoneForm | undefined = localite
      ? { cle: cleZone, genre: "localite", identifiant, nom: localite.nom, departement_id: localite.departement_id }
      : site ? { cle: cleZone, genre: "site", identifiant, nom: site.nom, departement_id: site.departement_id } : undefined;
    if (!option) return;
    if (zones.length > 0 && zones[0]?.departement_id !== option.departement_id) {
      definirErreur("Les zones d’une même distribution doivent relever du même département.");
      return;
    }
    definirZones((actuelles) => [...actuelles, option]);
    definirCleZone("");
    definirErreur(null);
  }

  function ajouterArticle(): void {
    if (!articleId || articlesPlan.some((article) => article.article_id === articleId) || rationArticle <= 0) return;
    definirArticlesPlan((actuels) => [...actuels, {
      article_id: articleId,
      source_approvisionnement: sourceArticle,
      ration_par_menage: rationArticle,
    }]);
    definirArticleId("");
  }

  function choisirMenage(menage: MenageCible, coche: boolean): void {
    if (!coche) {
      definirMenagesSelectionnes((actuels) => { const copie = new Map(actuels); copie.delete(menage.id); return copie; });
      definirAffectationsZone((actuelles) => { const copie = new Map(actuelles); copie.delete(menage.id); return copie; });
      return;
    }
    const zoneIndex = zones.findIndex((zone) => zone.genre === "site"
      ? zone.identifiant === menage.site_humanitaire_id
      : zone.identifiant === menage.localite_id);
    if (zoneIndex < 0) {
      definirErreur("Le ménage ne correspond à aucune zone sélectionnée. Ajoutez sa localité ou son site humanitaire au ciblage.");
      return;
    }
    definirMenagesSelectionnes((actuels) => { const copie = new Map(actuels); copie.set(menage.id, menage); return copie; });
    definirAffectationsZone((actuelles) => { const copie = new Map(actuelles); copie.set(menage.id, zoneIndex); return copie; });
    definirErreur(null);
  }

  function basculerMenageRemise(menage: MenageDistributionApi): void {
    definirMenageRemise(menage);
    definirErreur(null);
    void requeteApi<AllocationApi[]>(`/api/distributions/${detail?.id}/menages/${menage.id}/allocations`)
      .then((resultat) => {
        definirAllocations(resultat);
        definirQuantitesRemise(new Map(resultat.map((allocation) => [allocation.id, allocation.quantite_restante])));
        definirStatutRemise(resultat.every((allocation) => allocation.quantite_restante <= 0.000001) ? "SERVI" : "SERVI");
        definirIdentiteRecepteur(menage.nom_chef_menage);
        definirDateRemise(new Date().toISOString().slice(0, 10));
      })
      .catch((cause: unknown) => definirErreur(messageErreur(cause, "Les allocations du ménage n’ont pas pu être chargées.")));
  }

  async function envoyerPlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!departementCible || zones.length === 0 || menagesSelectionnes.size === 0 || articlesPlan.length === 0 || !entrepotId) {
      definirErreur("Renseignez l’entrepôt, les zones, les ménages et au moins un article avant d’enregistrer.");
      return;
    }
    const menages = [...menagesSelectionnes.values()].map((menage) => ({
      menage_id: menage.id,
      index_zone: affectationsZone.get(menage.id) ?? 0,
    }));
    definirSoumission(true);
    definirErreur(null);
    try {
      const corps = {
        intitule_distribution: intitule,
        departement_id: departementCible,
        nature_aide: natureAide,
        bailleur_fonds_id: bailleurId || null,
        partenaire_execution_id: executionId || null,
        objectif,
        date_prevue: datePrevue,
        entrepot_id: entrepotId,
        liste_beneficiaires_id: listeId || null,
        observations: observations || null,
        zones: zones.map((zone) => ({
          localite_id: zone.genre === "localite" ? zone.identifiant : null,
          arrondissement_id: null,
          quartier_id: null,
          carre_id: null,
          site_humanitaire_id: zone.genre === "site" ? zone.identifiant : null,
          nom_site_distribution: zone.nom,
        })),
        articles: articlesPlan,
        menages,
      };
      const resultat = await requeteApi<{ id: string; reference_distribution: string }>(
        distributionIdEdition ? `/api/distributions/${distributionIdEdition}` : "/api/distributions",
        {
          methode: distributionIdEdition ? "PUT" : "POST",
          jetonCsrf,
          cleIdempotence: cleIdempotence("distribution"),
          corps,
        },
      );
      definirMessage(distributionIdEdition ? "Le brouillon a été mis à jour." : `La distribution ${resultat.reference_distribution} a été créée.`);
      definirDistributionIdEdition(null);
      definirEcran("detail");
      definirDecalageMenages(0);
      await chargerDetail(resultat.id, 0);
      await chargerDistributions();
    } catch (cause) {
      definirErreur(messageErreur(cause, "Le plan de distribution n’a pas pu être enregistré."));
    } finally {
      definirSoumission(false);
    }
  }

  async function effectuerAction(chemin: string, corps: unknown = {}): Promise<void> {
    if (!detail) return;
    definirSoumission(true);
    definirErreur(null);
    definirMessage(null);
    try {
      await requeteApi(chemin, { methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence("distribution-action"), corps });
      definirMessage("L’opération a été enregistrée.");
      await chargerDetail(detail.id, decalageMenages);
      await chargerDistributions();
    } catch (cause) {
      definirErreur(messageErreur(cause, "L’opération n’a pas pu être enregistrée."));
    } finally {
      definirSoumission(false);
    }
  }

  async function enregistrerRemise(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail || !menageRemise) return;
    const lignes = allocations.flatMap((allocation) => {
      const quantite = quantitesRemise.get(allocation.id) ?? 0;
      return quantite > 0 ? [{ allocation_id: allocation.id, quantite_remise: quantite }] : [];
    });
    definirSoumission(true);
    definirErreur(null);
    try {
      await requeteApi(`/api/distributions/${detail.id}/remises`, {
        methode: "POST",
        jetonCsrf,
        cleIdempotence: cleIdempotence("remise"),
        corps: {
          menage_distribution_id: menageRemise.id,
          date_remise: dateRemise,
          identite_recepteur: identiteRecepteur || "Aucun : ménage absent",
          emargement_reference: null,
          statut_service: statutRemise,
          motif_non_service: motifNonService || null,
          lignes: statutRemise === "ABSENT" || statutRemise === "NON_SERVI" ? [] : lignes,
        },
      });
      definirMenageRemise(null);
      definirMessage("La remise ou le constat de non-service a été enregistré.");
      await chargerDetail(detail.id, decalageMenages);
    } catch (cause) {
      definirErreur(messageErreur(cause, "La remise n’a pas pu être enregistrée."));
    } finally {
      definirSoumission(false);
    }
  }

  async function televerserProcesVerbal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail || !fichierPv) {
      definirErreur("Sélectionnez le procès-verbal de distribution au format PDF.");
      return;
    }
    const formulaire = new FormData();
    formulaire.set("fichier", fichierPv);
    definirSoumission(true);
    definirErreur(null);
    try {
      await requeteApi(`/api/distributions/${detail.id}/pv`, {
        methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence("pv-distribution"), corps: formulaire,
      });
      definirFichierPv(null);
      definirMessage("Le procès-verbal a été archivé.");
      await chargerDetail(detail.id, decalageMenages);
    } catch (cause) {
      definirErreur(messageErreur(cause, "Le procès-verbal n’a pas pu être téléversé."));
    } finally {
      definirSoumission(false);
    }
  }

  async function ouvrirDetail(distribution: DistributionApi): Promise<void> {
    definirEcran("detail");
    definirMenageRemise(null);
    definirDecalageMenages(0);
    await chargerDetail(distribution.id, 0);
  }

  async function validerCorrectionCentrale(correctionId: string): Promise<void> {
    if (!detail) return;
    definirSoumission(true);
    definirErreur(null);
    try {
      await requeteApi(`/api/central/distributions/${detail.id}/corrections/${correctionId}/validation`, {
        methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(`validation-correction-${correctionId}`), corps: {},
      });
      definirMessage("La correction a été validée par l’administration centrale.");
      await chargerDetail(detail.id, decalageMenages);
    } catch (cause) {
      definirErreur(messageErreur(cause, "La validation de la correction a échoué."));
    } finally {
      definirSoumission(false);
    }
  }

  if (ecran === "formulaire" && estDelegue) {
    const zoneDisponible = [
      ...referentiels.localites.map((localite) => ({ valeur: `localite:${localite.id}`, libelle: `Localité · ${localite.nom}` })),
      ...referentiels.sites.map((site) => ({ valeur: `site:${site.id}`, libelle: `Site humanitaire · ${site.nom}` })),
    ];
    return (
      <section className="contenu-tableau module-distributions">
        <div className="entete-section">
          <div><p className="surtitre">Gestion provinciale</p><h1>{distributionIdEdition ? "Modifier le brouillon" : "Nouvelle distribution provinciale"}</h1></div>
          <button className="bouton bouton-discret" onClick={() => { definirEcran("liste"); definirDistributionIdEdition(null); }} type="button">Retour à la liste</button>
        </div>
        {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
        {message && <p className="message-succes" role="status">{message}</p>}
        <form className="carte-section formulaire-distribution" onSubmit={(event) => void envoyerPlan(event)}>
          <div className="titre-section"><div><h2>Identification et organisation</h2><p>La province est déterminée par votre session sécurisée.</p></div></div>
          <div className="grille-territoriale">
            <div className="champ-territorial"><label htmlFor="distribution-intitule">Intitulé de la distribution</label><input id="distribution-intitule" maxLength={180} onChange={(event) => definirIntitule(event.target.value)} required value={intitule} /></div>
            <div className="champ-territorial"><label htmlFor="distribution-date">Date prévue</label><input id="distribution-date" onChange={(event) => definirDatePrevue(event.target.value)} required type="date" value={datePrevue} /></div>
            <div className="champ-territorial"><label htmlFor="distribution-nature">Nature de l’aide</label><select id="distribution-nature" onChange={(event) => definirNatureAide(event.target.value)} value={natureAide}><option value="ALIMENTAIRE">Aide alimentaire</option><option value="NFI">Articles non alimentaires</option><option value="MIXTE">Aide mixte</option></select></div>
            <div className="champ-territorial"><label htmlFor="distribution-entrepot">Entrepôt provincial</label><select id="distribution-entrepot" onChange={(event) => definirEntrepotId(event.target.value)} required value={entrepotId}><option value="">Sélectionner un entrepôt</option>{referentiels.entrepots.map((entrepot) => <option key={entrepot.id} value={entrepot.id}>{entrepot.nom} · {entrepot.code_entrepot}</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="distribution-bailleur">Partenaire financier</label><select id="distribution-bailleur" onChange={(event) => definirBailleurId(event.target.value)} value={bailleurId}><option value="">Aucun partenaire financier</option>{[...new Map(referentiels.partenaires.filter((partenaire) => ["BAILLEUR_DE_FONDS", "DONATEUR"].includes(partenaire.role)).map((partenaire) => [partenaire.id, partenaire])).values()].map((partenaire) => <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="distribution-execution">Partenaire d’exécution</label><select id="distribution-execution" onChange={(event) => definirExecutionId(event.target.value)} value={executionId}><option value="">Aucun partenaire d’exécution</option>{[...new Map(referentiels.partenaires.filter((partenaire) => partenaire.role === "PARTENAIRE_EXECUTION").map((partenaire) => [partenaire.id, partenaire])).values()].map((partenaire) => <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="distribution-liste">Liste de bénéficiaires prête</label><select id="distribution-liste" onChange={(event) => definirListeId(event.target.value)} value={listeId}><option value="">Sélection libre parmi les ménages actifs</option>{referentiels.listes.map((liste) => <option key={liste.id} value={liste.id}>{liste.intitule} · {liste.nombre_menages_cibles} ménages</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="distribution-objectif">Objectif</label><textarea id="distribution-objectif" maxLength={2000} onChange={(event) => definirObjectif(event.target.value)} required rows={3} value={objectif} /></div>
            <div className="champ-territorial"><label htmlFor="distribution-observations">Observations</label><textarea id="distribution-observations" maxLength={2000} onChange={(event) => definirObservations(event.target.value)} rows={3} value={observations} /></div>
          </div>

          <div className="separateur-stock" />
          <div className="titre-section"><div><h2>Sites et zones ciblés</h2><p>Les localités et sites humanitaires sont conservés comme références distinctes.</p></div></div>
          <div className="ligne-destination">
            <div className="champ-territorial"><label htmlFor="distribution-zone">Localité ou site humanitaire</label><select id="distribution-zone" onChange={(event) => definirCleZone(event.target.value)} value={cleZone}><option value="">Sélectionner une zone</option>{zoneDisponible.filter((zone) => !zones.some((choisie) => choisie.cle === zone.valeur)).map((zone) => <option key={zone.valeur} value={zone.valeur}>{zone.libelle}</option>)}</select></div>
            <button className="bouton bouton-discret" disabled={!cleZone || zones.length >= 20} onClick={ajouterZone} type="button">Ajouter la zone</button>
          </div>
          {zones.length > 0 && <div className="liste-chips" aria-label="Zones sélectionnées">{zones.map((zone, index) => <span className="puce-zone" key={zone.cle}>{zone.nom}<button aria-label={`Retirer ${zone.nom}`} onClick={() => {
            definirZones((actuelles) => actuelles.filter((_, position) => position !== index));
            definirAffectationsZone((actuelles) => {
              const prochaines = new Map<string, number>();
              for (const [id, zoneIndex] of actuelles) {
                if (zoneIndex !== index) prochaines.set(id, zoneIndex > index ? zoneIndex - 1 : zoneIndex);
              }
              return prochaines;
            });
          }} type="button">×</button></span>)}</div>}
          {zones.length > 0 && zones.some((zone) => zone.departement_id !== departementCible) && <p className="message-erreur">Une distribution ne peut pas regrouper des départements différents.</p>}

          <div className="separateur-stock" />
          <div className="titre-section"><div><h2>Articles et rations</h2><p>Chaque ration par ménage est calculée sur le nombre de ménages retenus.</p></div></div>
          <div className="ligne-allocation">
            <div className="champ-territorial"><label htmlFor="distribution-article">Article</label><select id="distribution-article" onChange={(event) => definirArticleId(event.target.value)} value={articleId}><option value="">Sélectionner un article</option>{referentiels.articles.filter((article) => !articlesPlan.some((ligne) => ligne.article_id === article.id)).map((article) => <option key={article.id} value={article.id}>{article.designation} · {article.unite}</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="distribution-source">Source en stock</label><select id="distribution-source" onChange={(event) => definirSourceArticle(event.target.value as TypeSource)} value={sourceArticle}>{SOURCES.map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="distribution-ration">Ration par ménage</label><input id="distribution-ration" min="0.001" onChange={(event) => definirRationArticle(Number(event.target.value))} step="0.001" type="number" value={rationArticle} /></div>
            <button className="bouton bouton-discret" disabled={!articleId || articlesPlan.length >= 10} onClick={ajouterArticle} type="button">Ajouter</button>
          </div>
          {articlesPlan.length > 0 && <div className="tableau-defilement"><table><thead><tr><th>Article</th><th>Source</th><th>Ration</th><th>Total estimé</th><th /></tr></thead><tbody>{articlesPlan.map((ligne) => {
            const article = referentiels.articles.find((option) => option.id === ligne.article_id);
            return <tr key={ligne.article_id}><td>{article?.designation ?? ligne.article_id}</td><td>{SOURCES.find(([source]) => source === ligne.source_approvisionnement)?.[1]}</td><td>{ligne.ration_par_menage} {article?.unite}</td><td>{ligne.ration_par_menage * menagesSelectionnes.size} {article?.unite}</td><td><button className="bouton-texte-danger" onClick={() => definirArticlesPlan((actuelles) => actuelles.filter((item) => item.article_id !== ligne.article_id))} type="button">Retirer</button></td></tr>;
          })}</tbody></table></div>}

          <div className="separateur-stock" />
          <div className="titre-section"><div><h2>Ménages bénéficiaires</h2><p>Le ciblage est limité aux ménages actifs de votre province et du département sélectionné.</p></div><strong className="compteur">{menagesSelectionnes.size} sélectionnés</strong></div>
          <div className="barre-filtres-stock"><div className="champ-territorial"><label htmlFor="recherche-menage-distribution">Recherche</label><input id="recherche-menage-distribution" onChange={(event) => { definirRechercheMenages(event.target.value); definirDecalageMenagesDisponibles(0); }} placeholder="Code ou nom du chef de ménage" value={rechercheMenages} /></div></div>
          <div className="tableau-defilement"><table><thead><tr><th>Sélection</th><th>Code</th><th>Chef de ménage</th><th>Personnes</th><th>Localisation</th></tr></thead><tbody>
            {pageMenagesDisponibles.elements.map((menage) => <tr key={menage.id}><td><input aria-label={`Sélectionner ${menage.code_menage}`} checked={menagesSelectionnes.has(menage.id)} onChange={(event) => choisirMenage(menage, event.target.checked)} type="checkbox" /></td><td className="code-reference">{menage.code_menage}</td><td>{menage.nom_chef_menage}</td><td>{menage.nombre_personnes}</td><td>{menage.site_humanitaire_nom ? `Site · ${menage.site_humanitaire_nom}` : menage.localite_nom ?? "Localisation non renseignée"}</td></tr>)}
            {pageMenagesDisponibles.elements.length === 0 && <tr><td className="cellule-vide" colSpan={5}>Aucun ménage actif dans ce département.</td></tr>}
          </tbody></table></div>
          <Pagination total={pageMenagesDisponibles.total} decalage={decalageMenagesDisponibles} limite={TAILLE_PAGE_MENAGES} chargement={chargement} changer={definirDecalageMenagesDisponibles} />
          <div className="pied-formulaire-distribution"><span>Les quantités totales seront déterminées automatiquement à partir des rations et des ménages sélectionnés.</span><button className="bouton bouton-principal" disabled={soumission || zones.length === 0 || menagesSelectionnes.size === 0 || articlesPlan.length === 0} type="submit">{soumission ? "Enregistrement…" : distributionIdEdition ? "Enregistrer les modifications" : "Enregistrer le brouillon"}</button></div>
        </form>
      </section>
    );
  }

  if (ecran === "detail" && detail) {
    const correctionOuverte = detail.corrections.find((correction) => correction.statut === "EN_ATTENTE_DELEGUE");
    const correctionSoumise = detail.corrections.find((correction) => correction.statut === "CORRECTION_SOUMISE");
    const toutesRemisesTerminees = (synthese?.menages.en_attente ?? 0) === 0;
    const action = async (suffixe: string, corps: unknown = {}) => effectuerAction(`/api/distributions/${detail.id}/${suffixe}`, corps);
    return (
      <section className="contenu-tableau module-distributions">
        <div className="entete-section">
          <div><p className="surtitre">{detail.province_nom} · {detail.reference_distribution}</p><h1>{detail.intitule_distribution}</h1><p className="texte-secondaire">{detail.objectif}</p></div>
          <button className="bouton bouton-discret" onClick={() => { definirEcran("liste"); definirDetail(null); definirMenageRemise(null); }} type="button">Retour à la liste</button>
        </div>
        {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
        {message && <p className="message-succes" role="status">{message}</p>}
        <section className="carte-section">
          <div className="bandeau-detail-distribution">
            <div><span className={`pastille-statut ${classStatut(detail.statut)}`}>{LIBELLES_STATUT[detail.statut]}</span><p>{detail.departement_nom} · {detail.date_prevue} · {detail.entrepot_nom}</p></div>
            <div className="actions-ligne">
              {estDelegue && ["BROUILLON", "EN_PREPARATION"].includes(detail.statut) && <button className="bouton bouton-discret" disabled={soumission} onClick={() => void modifierBrouillon()} type="button">Modifier le plan</button>}
              {estDelegue && detail.statut === "BROUILLON" && <button className="bouton bouton-principal" disabled={soumission} onClick={() => void action("preparation")} type="button">Lancer la préparation</button>}
              {estDelegue && detail.statut === "EN_PREPARATION" && <button className="bouton bouton-principal" disabled={soumission} onClick={() => void action("validation")} type="button">Valider et réserver le stock</button>}
              {estDelegue && detail.statut === "VALIDEE_PROVINCE" && <button className="bouton bouton-principal" disabled={soumission} onClick={() => void action("execution")} type="button">Démarrer l’exécution</button>}
            </div>
          </div>
          <div className="grille-indicateurs-distribution">
            <div><strong>{synthese?.menages.total ?? detail.nombre_menages_cibles}</strong><span>Ménages ciblés</span></div>
            <div><strong>{synthese?.menages.servis ?? 0}</strong><span>Servis</span></div>
            <div><strong>{synthese?.menages.partiels ?? 0}</strong><span>Partiellement servis</span></div>
            <div><strong>{synthese?.menages.absents ?? 0}</strong><span>Absents</span></div>
            <div><strong>{synthese?.menages.non_servis ?? 0}</strong><span>Non servis</span></div>
            <div><strong>{synthese?.menages.en_attente ?? detail.nombre_menages_cibles}</strong><span>En attente</span></div>
          </div>
        </section>

        <section className="carte-section">
          <div className="titre-section"><div><h2>Zones de distribution</h2><p>{detail.nombre_personnes_cibles} personnes ciblées · {detail.nature_aide}</p></div></div>
          <div className="liste-zones-distribution">{detail.zones.map((zone) => <span className="puce-zone" key={zone.id}>{nomZone(zone)}</span>)}</div>
        </section>

        <section className="carte-section">
          <div className="titre-section"><div><h2>Articles et rapprochement des quantités</h2><p>Les réservations et sorties sont inscrites dans le journal de stock.</p></div></div>
          <div className="tableau-defilement"><table><thead><tr><th>Article</th><th>Source déclarée</th><th>Ration / ménage</th><th>Prévu</th><th>Réservé</th><th>Distribué</th><th>Reliquat réservé</th></tr></thead><tbody>
            {(synthese?.articles ?? detail.articles).map((article) => <tr key={article.article_id}><td>{article.designation}</td><td>{SOURCES.find(([source]) => source === ("source_approvisionnement" in article ? article.source_approvisionnement : "STOCK_EXISTANT"))?.[1] ?? "Source mixte"}</td><td>{"ration_par_menage" in article ? article.ration_par_menage : "—"} {article.unite}</td><td>{article.quantite_totale_prevue} {article.unite}</td><td>{article.quantite_reservee} {article.unite}</td><td>{article.quantite_distribuee} {article.unite}</td><td>{"quantite_residuelle_reservee" in article ? article.quantite_residuelle_reservee : "—"} {article.unite}</td></tr>)}
            {detail.articles.length === 0 && <tr><td className="cellule-vide" colSpan={7}>Aucun article n’est associé à cette distribution.</td></tr>}
          </tbody></table></div>
        </section>

        {estDelegue && detail.statut === "EN_EXECUTION" && <section className="carte-section">
          <div className="titre-section"><div><h2>Remises aux ménages</h2><p>Les quantités sont déduites des réservations FEFO et enregistrées une seule fois.</p></div></div>
          <div className="tableau-defilement"><table><thead><tr><th>Code ménage</th><th>Chef de ménage</th><th>Personnes</th><th>Statut de service</th><th>Date</th><th>Action</th></tr></thead><tbody>
            {menagesDistribution.elements.map((menage) => <tr key={menage.id}><td className="code-reference">{menage.code_menage}</td><td>{menage.nom_chef_menage}</td><td>{menage.nombre_personnes}</td><td><span className={`pastille-statut ${classStatut(menage.statut_service)}`}>{LIBELLES_STATUT[menage.statut_service]}</span></td><td>{menage.date_service ?? "—"}</td><td>{["EN_ATTENTE", "PARTIELLEMENT_SERVI"].includes(menage.statut_service) && <button className="bouton bouton-discret" onClick={() => basculerMenageRemise(menage)} type="button">Saisir une remise</button>}</td></tr>)}
            {menagesDistribution.elements.length === 0 && <tr><td className="cellule-vide" colSpan={6}>Aucun ménage enregistré.</td></tr>}
          </tbody></table></div>
          <Pagination total={menagesDistribution.total} decalage={decalageMenages} limite={TAILLE_PAGE_MENAGES} chargement={chargement} changer={definirDecalageMenages} />
          {menageRemise && <form className="formulaire-remise-distribution" onSubmit={(event) => void enregistrerRemise(event)}>
            <div className="titre-section"><div><h3>Remise pour {menageRemise.code_menage}</h3><p>Le statut « servi » exige l’exécution complète des allocations restantes.</p></div><button className="bouton-texte-danger" onClick={() => definirMenageRemise(null)} type="button">Fermer</button></div>
            <div className="grille-territoriale">
              <div className="champ-territorial"><label htmlFor="remise-statut">Statut</label><select id="remise-statut" onChange={(event) => {
                const statut = event.target.value as typeof statutRemise;
                definirStatutRemise(statut);
                if (statut === "PARTIELLEMENT_SERVI") definirQuantitesRemise(new Map(allocations.map((allocation) => [allocation.id, 0])));
              }} value={statutRemise}><option value="SERVI">Servi</option><option value="PARTIELLEMENT_SERVI">Partiellement servi</option><option value="ABSENT">Absent</option><option value="NON_SERVI">Non servi</option></select></div>
              <div className="champ-territorial"><label htmlFor="remise-date">Date du constat</label><input id="remise-date" onChange={(event) => definirDateRemise(event.target.value)} required type="date" value={dateRemise} /></div>
              <div className="champ-territorial"><label htmlFor="remise-recepteur">Identité du récepteur</label><input id="remise-recepteur" onChange={(event) => definirIdentiteRecepteur(event.target.value)} value={identiteRecepteur} /></div>
              {(["ABSENT", "NON_SERVI"].includes(statutRemise)) && <div className="champ-territorial"><label htmlFor="remise-motif">Motif du non-service</label><textarea id="remise-motif" onChange={(event) => definirMotifNonService(event.target.value)} required rows={2} value={motifNonService} /></div>}
            </div>
            {!(["ABSENT", "NON_SERVI"].includes(statutRemise)) && <div className="tableau-defilement"><table><thead><tr><th>Article</th><th>Prévu</th><th>Déjà servi</th><th>Quantité remise</th></tr></thead><tbody>{allocations.map((allocation) => <tr key={allocation.id}><td>{allocation.designation}</td><td>{allocation.quantite_prevue} {allocation.unite}</td><td>{allocation.quantite_servie} {allocation.unite}</td><td><input aria-label={`Quantité remise pour ${allocation.designation}`} max={allocation.quantite_restante} min="0" onChange={(event) => definirQuantitesRemise((actuelles) => new Map(actuelles).set(allocation.id, Number(event.target.value)))} step="0.001" type="number" value={quantitesRemise.get(allocation.id) ?? 0} /></td></tr>)}</tbody></table></div>}
            <button className="bouton bouton-principal" disabled={soumission} type="submit">Enregistrer la remise</button>
          </form>}
          {toutesRemisesTerminees && <div className="panneau-document-distribution">
            <form className="formulaire-import" onSubmit={(event) => void televerserProcesVerbal(event)}><label htmlFor="pv-distribution">Procès-verbal de distribution en PDF</label><input accept="application/pdf,.pdf" id="pv-distribution" onChange={(event) => definirFichierPv(event.target.files?.[0] ?? null)} type="file" /><button className="bouton bouton-discret" disabled={soumission || !fichierPv} type="submit">Archiver le procès-verbal</button></form>
            <button className="bouton bouton-principal" disabled={soumission} onClick={() => void action("declaration-fin", { observations: observationsFinales || null })} type="button">Déclarer la distribution terminée</button>
            <label className="champ-appro-large" htmlFor="observations-fin">Observations de fin<textarea id="observations-fin" onChange={(event) => definirObservationsFinales(event.target.value)} value={observationsFinales} /></label>
          </div>}
        </section>}

        {estDelegue && correctionOuverte && <section className="carte-section">
          <div className="titre-section"><div><h2>Répondre à la demande de correction</h2><p>{correctionOuverte.motif_retour}</p></div></div>
          <div className="liste-zones-distribution">{lireChampsCorrection(correctionOuverte.elements_a_corriger).map((champ) => <span className="puce-zone" key={champ}>{champ}</span>)}</div>
          <form className="formulaire-correction-distribution" onSubmit={(event) => {
            event.preventDefault();
            void effectuerAction("corrections", { reponse_delegue: reponseCorrection, corrections });
          }}>
            <div className="grille-territoriale">{Object.keys(corrections).map((champ) => <div className="champ-territorial" key={champ}><label htmlFor={`correction-${champ}`}>{champCorrection(champ)}</label>{champ === "objectif" || champ === "observations" ? <textarea id={`correction-${champ}`} onChange={(event) => definirCorrections((actuelles) => ({ ...actuelles, [champ]: event.target.value }))} value={corrections[champ] ?? ""} /> : <input id={`correction-${champ}`} onChange={(event) => definirCorrections((actuelles) => ({ ...actuelles, [champ]: event.target.value }))} type={champ === "date_prevue" ? "date" : "text"} value={corrections[champ] ?? ""} />}</div>)}
              <div className="champ-territorial"><label htmlFor="reponse-correction">Réponse du délégué</label><textarea id="reponse-correction" onChange={(event) => definirReponseCorrection(event.target.value)} required rows={3} value={reponseCorrection} /></div>
            </div>
            <button className="bouton bouton-principal" disabled={soumission} type="submit">Soumettre la correction au contrôle central</button>
          </form>
        </section>}

        {estCentral && detail.statut === "TERMINEE_PROVINCE" && <section className="carte-section">
          <div className="titre-section"><div><h2>Contrôle central</h2><p>Le plan validé et les remises restent figés dans leur historique.</p></div></div>
          {correctionSoumise && <div className="actions-ligne"><button className="bouton bouton-principal" disabled={soumission} onClick={() => void validerCorrectionCentrale(correctionSoumise.id)} type="button">Valider la correction soumise</button></div>}
          <form className="formulaire-correction-distribution" onSubmit={(event) => {
            event.preventDefault();
            void requeteApi(`/api/central/distributions/${detail.id}/retour-correction`, {
              methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence("retour-correction"),
              corps: { motif_retour: motifRetour, elements_a_corriger: champsRetour },
            }).then(async () => { definirMessage("La distribution a été retournée à la province pour correction."); await chargerDetail(detail.id, decalageMenages); })
              .catch((cause: unknown) => definirErreur(messageErreur(cause, "Le retour pour correction a échoué.")));
          }}>
            <div className="champ-territorial"><label htmlFor="motif-retour">Motif du retour</label><textarea id="motif-retour" onChange={(event) => definirMotifRetour(event.target.value)} required rows={3} value={motifRetour} /></div>
            <fieldset className="choix-roles"><legend>Champs modifiables par le délégué</legend>{([["intitule_distribution", "Intitulé"], ["objectif", "Objectif"], ["date_prevue", "Date prévue"], ["observations", "Observations"]] as const).map(([champ, libelle]) => <label key={champ}><input checked={champsRetour.includes(champ)} onChange={(event) => definirChampsRetour((actuels) => event.target.checked ? [...actuels, champ] : actuels.filter((item) => item !== champ))} type="checkbox" />{libelle}</label>)}</fieldset>
            <button className="bouton bouton-discret" disabled={soumission || champsRetour.length === 0} type="submit">Retourner pour correction</button>
          </form>
          <div className="formulaire-cloture formulaire-approvisionnement"><label className="champ-territorial" htmlFor="observations-cloture">Observations finales<textarea id="observations-cloture" onChange={(event) => definirObservationsFinales(event.target.value)} value={observationsFinales} /></label><button className="bouton bouton-principal" disabled={soumission || Boolean(correctionSoumise)} onClick={() => void requeteApi(`/api/central/distributions/${detail.id}/cloture`, { methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence("cloture-distribution"), corps: { observations_finales: observationsFinales || null } }).then(async () => { definirMessage("La distribution a été clôturée et les reliquats ont été libérés."); await chargerDetail(detail.id, decalageMenages); }).catch((cause: unknown) => definirErreur(messageErreur(cause, "La clôture centrale a échoué.")))} type="button">Clôturer et libérer les reliquats</button></div>
        </section>}

        {detail.statut === "CLOTUREE_CENTRAL" && <section className="carte-section"><h2>Clôture centrale enregistrée</h2><p>Le bilan final est figé et les reliquats réservés ont été libérés dans le stock provincial.</p></section>}
        {detail.corrections.length > 0 && <section className="carte-section"><div className="titre-section"><div><h2>Historique des corrections</h2></div></div><div className="liste-corrections-distribution">{detail.corrections.map((correction) => <article key={correction.id}><strong>{LIBELLES_CORRECTION[correction.statut]}</strong><p>{correction.motif_retour}</p>{correction.reponse_delegue && <p>Réponse : {correction.reponse_delegue}</p>}{estCentral && correction.statut === "CORRECTION_SOUMISE" && <button className="bouton bouton-principal" onClick={() => void validerCorrectionCentrale(correction.id)} type="button">Valider cette correction</button>}</article>)}</div></section>}
      </section>
    );
  }

  return (
    <section className="contenu-tableau module-distributions">
      <div className="entete-section">
        <div><p className="surtitre">SIGAD · suivi des aides</p><h1>Distributions provinciales</h1><p className="texte-secondaire">Plans autonomes, réservations, remises aux ménages et contrôle central.</p></div>
        {estDelegue && <button className="bouton bouton-principal" onClick={remettreFormulaire} type="button">Nouvelle distribution</button>}
      </div>
      {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
      {message && <p className="message-succes" role="status">{message}</p>}
      <section className="carte-section">
        <div className="barre-filtres-stock">
          <div className="champ-territorial"><label htmlFor="recherche-distributions">Recherche</label><input id="recherche-distributions" onChange={(event) => { definirRecherche(event.target.value); definirDecalage(0); }} placeholder="Référence ou intitulé" value={recherche} /></div>
          <div className="champ-territorial"><label htmlFor="statut-distribution">Statut</label><select id="statut-distribution" onChange={(event) => { definirStatutFiltre(event.target.value); definirDecalage(0); }} value={statutFiltre}><option value="">Tous les statuts</option>{Object.entries(LIBELLES_STATUT).filter(([code]) => !["EN_ATTENTE", "SERVI", "PARTIELLEMENT_SERVI", "ABSENT", "NON_SERVI"].includes(code)).map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}</select></div>
        </div>
        <div className="tableau-defilement"><table><thead><tr><th>Référence</th>{(estCentral || utilisateur.role === "PROPRIETAIRE") && <th>Province</th>}<th>Distribution</th><th>Date prévue</th><th>Ménages</th><th>Statut</th><th>Action</th></tr></thead><tbody>
          {distributions.elements.map((distribution) => <tr key={distribution.id}><td className="code-reference">{distribution.reference_distribution}</td>{(estCentral || utilisateur.role === "PROPRIETAIRE") && <td>{distribution.province_nom}</td>}<td>{distribution.intitule_distribution}</td><td>{distribution.date_prevue}</td><td>{distribution.nombre_menages_cibles}</td><td><span className={`pastille-statut ${classStatut(distribution.statut)}`}>{LIBELLES_STATUT[distribution.statut]}</span></td><td><button className="bouton bouton-discret" onClick={() => void ouvrirDetail(distribution)} type="button">Ouvrir</button></td></tr>)}
          {distributions.elements.length === 0 && <tr><td className="cellule-vide" colSpan={estCentral || utilisateur.role === "PROPRIETAIRE" ? 7 : 6}>{chargement ? "Chargement des distributions…" : "Aucune distribution ne correspond aux filtres."}</td></tr>}
        </tbody></table></div>
        <Pagination total={distributions.total} decalage={decalage} limite={TAILLE_PAGE} chargement={chargement} changer={definirDecalage} />
      </section>
      {menageRemise && <div className="alerte-distribution" role="status">Une remise est en cours de saisie.</div>}
      {soumission && <div className="indicateur-operation" role="status">Enregistrement sécurisé en cours…</div>}
    </section>
  );
}

const LIBELLES_CORRECTION: Record<CorrectionApi["statut"], string> = {
  EN_ATTENTE_DELEGUE: "En attente de la province",
  CORRECTION_SOUMISE: "Correction soumise au contrôle central",
  VALIDEE_CENTRAL: "Correction validée par l’administration centrale",
};

function champCorrection(champ: string): string {
  const libelles: Record<string, string> = {
    intitule_distribution: "Intitulé de la distribution",
    objectif: "Objectif",
    date_prevue: "Date prévue",
    observations: "Observations",
  };
  return libelles[champ] ?? champ;
}
