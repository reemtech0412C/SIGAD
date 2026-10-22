import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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

interface ProvinceApi { id: string; nom: string; }
interface DestinationApi { id: string; province_id: string; province: string; statut_destination: string; nombre_articles: number; }
interface ArticleApi { id: string; code_article: string; designation: string; decimales_autorisees: number; }
interface PartenaireApi { id: string; nom: string; sigle: string | null; }
interface EntrepotApi { id: string; nom: string; code_entrepot?: string; province_id?: string | null; }
interface ApprovisionnementApi {
  id: string;
  reference: string;
  intitule_operation: string;
  date_creation: string;
  source_articles: string;
  nature_aide: string;
  statut: string;
  nombre_destinations: number;
  nombre_expeditions: number;
}
interface AllocationApi {
  id: string;
  destination_id: string;
  province_id: string;
  province: string;
  article_id: string;
  code_article: string;
  article: string;
  quantite_allouee: number;
  quantite_expediee: number;
  quantite_receptionnee_acceptee: number;
  quantite_restante: number;
}
interface ExpeditionApi {
  id: string;
  reference_expedition: string;
  approvisionnement_id: string;
  reference_approvisionnement?: string;
  intitule_operation?: string;
  date_expedition: string;
  origine_expedition: string;
  reference_bordereau: string;
  statut_expedition: string;
  nombre_lignes?: number;
  reception_id?: string | null;
  statut_rapprochement?: string | null;
}
interface LigneExpeditionApi {
  id: string;
  article_approvisionnement_id: string;
  article_id: string;
  code_article: string;
  article: string;
  quantite_expediee: number;
  numero_lot_fournisseur: string | null;
  date_peremption: string | null;
}
interface DetailExpeditionApi extends ExpeditionApi {
  pv_piece_jointe_id: string | null;
  reception_id: string | null;
  lignes: LigneExpeditionApi[];
}
interface ReceptionApi {
  id: string;
  reference_reception_prov: string;
  expedition_id: string;
  province_id: string;
  province: string;
  date_reception: string;
  numero_pv_reception: string;
  comporte_ecarts: number;
  statut_rapprochement: string;
  reference_expedition: string;
}
interface LigneReceptionApi {
  id: string;
  article: string;
  quantite_expediee: number;
  quantite_recue_physique: number;
  quantite_acceptee: number;
  quantite_endommagee: number;
  quantite_manquante: number;
  justification_ecart: string | null;
}
interface DetailReceptionApi extends ReceptionApi { lignes: LigneReceptionApi[]; }
interface ResultatPvApi { id: string; nom_fichier_original: string; }
interface DestinationSaisie { cleLocale: string; province_id: string; articles: LigneAllocationSaisie[]; }
interface LigneAllocationSaisie { cleLocale: string; article_id: string; quantite_allouee: string; }
interface LigneExpeditionSaisie { cleLocale: string; article_approvisionnement_id: string; quantite_expediee: string; numero_lot_fournisseur: string; date_peremption: string; }
interface LigneReceptionSaisie { ligne_expedition_id: string; quantite_recue_physique: string; quantite_acceptee: string; quantite_endommagee: string; }

const TAILLE_PAGE = 20;
type Vue = "liste" | "nouveau" | "expeditions" | "reception" | "cloture";

function cleLocale(): string { return crypto.randomUUID(); }
function cleIdempotence(): string { return `sigad-${crypto.randomUUID()}`; }
function aujourdHui(): string { return new Date().toISOString().slice(0, 10); }
function erreurLisible(cause: unknown): string {
  return cause instanceof ErreurApi || cause instanceof Error ? cause.message : "L’opération n’a pas pu aboutir.";
}
function initialiserDestination(): DestinationSaisie {
  return { cleLocale: cleLocale(), province_id: "", articles: [{ cleLocale: cleLocale(), article_id: "", quantite_allouee: "" }] };
}

export function TableauApprovisionnements({ utilisateur, jetonCsrf }: Props) {
  const estAdmin = utilisateur.role === "ADMIN_CENTRAL";
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  const estProprietaire = utilisateur.role === "PROPRIETAIRE";
  const [vue, definirVue] = useState<Vue>(estDelegue ? "reception" : "liste");
  const [erreur, definirErreur] = useState<string | null>(null);
  const [succes, definirSucces] = useState<string | null>(null);
  const [chargement, definirChargement] = useState(false);
  const [approvisionnements, definirApprovisionnements] = useState<ApprovisionnementApi[]>([]);
  const [expeditions, definirExpeditions] = useState<ExpeditionApi[]>([]);
  const [provinces, definirProvinces] = useState<ProvinceApi[]>([]);
  const [articles, definirArticles] = useState<ArticleApi[]>([]);
  const [partenaires, definirPartenaires] = useState<PartenaireApi[]>([]);
  const [entrepots, definirEntrepots] = useState<EntrepotApi[]>([]);
  const [total, definirTotal] = useState(0);
  const [decalage, definirDecalage] = useState(0);
  const [recherche, definirRecherche] = useState("");
  const [selection, definirSelection] = useState<ApprovisionnementApi | null>(null);
  const [allocations, definirAllocations] = useState<AllocationApi[]>([]);
  const [totalAllocations, definirTotalAllocations] = useState(0);
  const [decalageAllocations, definirDecalageAllocations] = useState(0);
  const [destinationsApprovisionnement, definirDestinationsApprovisionnement] = useState<DestinationApi[]>([]);
  const [allocationsExpedition, definirAllocationsExpedition] = useState<AllocationApi[]>([]);
  const [receptions, definirReceptions] = useState<ReceptionApi[]>([]);
  const [totalReceptions, definirTotalReceptions] = useState(0);
  const [decalageReceptions, definirDecalageReceptions] = useState(0);
  const [expeditionChoisie, definirExpeditionChoisie] = useState<DetailExpeditionApi | null>(null);
  const [receptionChoisie, definirReceptionChoisie] = useState<DetailReceptionApi | null>(null);
  const [source, definirSource] = useState("ENTREPOT_CENTRAL");
  const [partenaireId, definirPartenaireId] = useState("");
  const [reference, definirReference] = useState(`APP-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  const [intitule, definirIntitule] = useState("");
  const [natureAide, definirNatureAide] = useState("ALIMENTAIRE");
  const [destinations, definirDestinations] = useState<DestinationSaisie[]>([initialiserDestination()]);
  const [destinationExpedition, definirDestinationExpedition] = useState("");
  const [origineExpedition, definirOrigineExpedition] = useState("ENTREPOT_CENTRAL");
  const [entrepotOrigine, definirEntrepotOrigine] = useState("");
  const [referenceBordereau, definirReferenceBordereau] = useState("");
  const [dateExpedition, definirDateExpedition] = useState(aujourdHui());
  const [lignesExpedition, definirLignesExpedition] = useState<LigneExpeditionSaisie[]>([{ cleLocale: cleLocale(), article_approvisionnement_id: "", quantite_expediee: "", numero_lot_fournisseur: "", date_peremption: "" }]);
  const [entrepotReception, definirEntrepotReception] = useState("");
  const [fichierPv, definirFichierPv] = useState<File | null>(null);
  const [pvCharge, definirPvCharge] = useState<{ expeditionId: string; fichier: File; pieceId: string } | null>(null);
  const [numeroPv, definirNumeroPv] = useState("");
  const [dateReception, definirDateReception] = useState(aujourdHui());
  const [lignesReception, definirLignesReception] = useState<LigneReceptionSaisie[]>([]);
  const [justifications, definirJustifications] = useState<Record<string, string>>({});
  const [observationsCloture, definirObservationsCloture] = useState("");

  const allocationsDestination = useMemo(
    () => allocationsExpedition.filter((allocation) => allocation.quantite_restante > 0),
    [allocationsExpedition],
  );

  const chargerReferences = useCallback(async () => {
    const appels: Promise<void>[] = [];
    if (!estDelegue) {
      appels.push(requeteApi<PageApi<ProvinceApi>>("/api/territoire/provinces?limite=100&decalage=0")
        .then((page) => definirProvinces(page.elements)));
      appels.push(requeteApi<PageApi<ArticleApi>>("/api/stocks/articles?limite=100&decalage=0")
        .then((page) => definirArticles(page.elements)));
      if (estAdmin) {
        const rolesPartenaire = source === "FOURNISSEUR_EXTERNE"
          ? ["FOURNISSEUR"]
          : source === "DON_PARTENAIRE" ? ["DONATEUR", "BAILLEUR_DE_FONDS"] : [];
        if (rolesPartenaire.length > 0) {
          appels.push(Promise.all(rolesPartenaire.map((role) =>
            requeteApi<PageApi<PartenaireApi>>(`/api/gestion/partenaires?limite=100&decalage=0&role=${encodeURIComponent(role)}&statut_validation=VALIDE`),
          )).then((pages) => definirPartenaires([...new Map(pages.flatMap((page) => page.elements).map((partenaire) => [partenaire.id, partenaire])).values()])));
        } else {
          definirPartenaires([]);
        }
        appels.push(requeteApi<PageApi<EntrepotApi>>("/api/central/approvisionnements/referentiels/entrepots-centraux?limite=100&decalage=0")
          .then((page) => definirEntrepots(page.elements)));
      }
    }
    if (estDelegue) {
      appels.push(requeteApi<PageApi<EntrepotApi>>("/api/stocks/entrepots?limite=100&decalage=0")
        .then((page) => definirEntrepots(page.elements.filter((entrepot) => entrepot.province_id === utilisateur.province_id))));
    }
    await Promise.all(appels);
  }, [estAdmin, estDelegue, source, utilisateur.province_id]);

  const chargerListe = useCallback(async () => {
    definirChargement(true);
    definirErreur(null);
    try {
      const parametres = new URLSearchParams({ limite: String(TAILLE_PAGE), decalage: String(decalage) });
      if (recherche.trim()) parametres.set("recherche", recherche.trim());
      if (estDelegue) {
        const page = await requeteApi<PageApi<ExpeditionApi>>(`/api/provincial/expeditions?${parametres.toString()}`);
        definirExpeditions(page.elements);
        definirTotal(page.total);
      } else {
        const page = await requeteApi<PageApi<ApprovisionnementApi>>(`/api/approvisionnements?${parametres.toString()}`);
        definirApprovisionnements(page.elements);
        definirTotal(page.total);
      }
    } catch (cause) { definirErreur(erreurLisible(cause)); }
    finally { definirChargement(false); }
  }, [decalage, estDelegue, recherche]);

  useEffect(() => { void chargerReferences().catch((cause: unknown) => definirErreur(erreurLisible(cause))); }, [chargerReferences]);
  useEffect(() => { void chargerListe(); }, [chargerListe]);

  async function notifierOperation(operation: () => Promise<unknown>, message: string): Promise<void> {
    definirErreur(null);
    definirSucces(null);
    definirChargement(true);
    try {
      await operation();
      definirSucces(message);
      await chargerListe();
      if (selection) await chargerDetails(selection.id);
    } catch (cause) { definirErreur(erreurLisible(cause)); }
    finally { definirChargement(false); }
  }

  async function chargerDetails(id: string): Promise<void> {
    if (estDelegue) return;
    const [detail, pageDestinations, pageAllocations, pageReceptions] = await Promise.all([
      requeteApi<ApprovisionnementApi>(`/api/approvisionnements/${encodeURIComponent(id)}`),
      requeteApi<PageApi<DestinationApi>>(`/api/approvisionnements/${encodeURIComponent(id)}/destinations?limite=23&decalage=0`),
      requeteApi<PageApi<AllocationApi>>(`/api/approvisionnements/${encodeURIComponent(id)}/repartition?limite=${TAILLE_PAGE}&decalage=0`),
      requeteApi<PageApi<ReceptionApi>>(`/api/approvisionnements/${encodeURIComponent(id)}/receptions?limite=${TAILLE_PAGE}&decalage=0`),
    ]);
    definirSelection(detail);
    definirDestinationsApprovisionnement(pageDestinations.elements);
    definirAllocations(pageAllocations.elements);
    definirTotalAllocations(pageAllocations.total);
    definirDecalageAllocations(0);
    definirReceptions(pageReceptions.elements);
    definirTotalReceptions(pageReceptions.total);
    definirDecalageReceptions(0);
    definirDestinationExpedition("");
    definirAllocationsExpedition([]);
    definirReceptionChoisie(null);
  }

  async function chargerPageAllocations(id: string, prochainDecalage: number): Promise<void> {
    const page = await requeteApi<PageApi<AllocationApi>>(
      `/api/approvisionnements/${encodeURIComponent(id)}/repartition?limite=${TAILLE_PAGE}&decalage=${prochainDecalage}`,
    );
    definirAllocations(page.elements);
    definirTotalAllocations(page.total);
    definirDecalageAllocations(page.decalage);
  }

  async function chargerPageReceptions(id: string, prochainDecalage: number): Promise<void> {
    const page = await requeteApi<PageApi<ReceptionApi>>(
      `/api/approvisionnements/${encodeURIComponent(id)}/receptions?limite=${TAILLE_PAGE}&decalage=${prochainDecalage}`,
    );
    definirReceptions(page.elements);
    definirTotalReceptions(page.total);
    definirDecalageReceptions(page.decalage);
  }

  async function choisirDestinationPourExpedition(destinationId: string): Promise<void> {
    definirDestinationExpedition(destinationId);
    definirLignesExpedition([{ cleLocale: cleLocale(), article_approvisionnement_id: "", quantite_expediee: "", numero_lot_fournisseur: "", date_peremption: "" }]);
    const destination = destinationsApprovisionnement.find((item) => item.id === destinationId);
    if (!destination || !selection) {
      definirAllocationsExpedition([]);
      return;
    }
    try {
      const page = await requeteApi<PageApi<AllocationApi>>(
        `/api/approvisionnements/${encodeURIComponent(selection.id)}/repartition?limite=20&decalage=0&province_id=${encodeURIComponent(destination.province_id)}`,
      );
      definirAllocationsExpedition(page.elements);
    } catch (cause) {
      definirAllocationsExpedition([]);
      definirErreur(erreurLisible(cause));
    }
  }

  async function choisirApprovisionnement(approvisionnement: ApprovisionnementApi): Promise<void> {
    definirErreur(null);
    try { await chargerDetails(approvisionnement.id); }
    catch (cause) { definirErreur(erreurLisible(cause)); }
  }

  async function choisirExpedition(expedition: ExpeditionApi): Promise<void> {
    definirErreur(null);
    definirPvCharge(null);
    try {
      const detail = await requeteApi<DetailExpeditionApi>(`/api/provincial/expeditions/${encodeURIComponent(expedition.id)}`);
      definirExpeditionChoisie(detail);
      definirLignesReception(detail.lignes.map((ligne) => ({
        ligne_expedition_id: ligne.id,
        quantite_recue_physique: String(ligne.quantite_expediee),
        quantite_acceptee: String(ligne.quantite_expediee),
        quantite_endommagee: "0",
      })));
      if (detail.reception_id) {
        definirSucces("Une réception est déjà enregistrée pour cette expédition.");
      }
    } catch (cause) { definirErreur(erreurLisible(cause)); }
  }

  async function chargerReception(reception: ReceptionApi): Promise<void> {
    if (!selection) return;
    try {
      const detail = await requeteApi<DetailReceptionApi>(`/api/approvisionnements/${encodeURIComponent(selection.id)}/receptions/${encodeURIComponent(reception.id)}`);
      definirReceptionChoisie(detail);
      definirJustifications(Object.fromEntries(detail.lignes.map((ligne) => [ligne.id, ligne.justification_ecart ?? ""])));
    } catch (cause) { definirErreur(erreurLisible(cause)); }
  }

  function modifierDestination(cle: string, modification: Partial<DestinationSaisie>): void {
    definirDestinations((courantes) => courantes.map((destination) => destination.cleLocale === cle ? { ...destination, ...modification } : destination));
  }

  async function soumettreApprovisionnement(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    const corps = {
      reference, intitule_operation: intitule, source_articles: source, partenaire_id: source === "ENTREPOT_CENTRAL" ? null : partenaireId,
      nature_aide: natureAide,
      destinations: destinations.map((destination) => ({
        province_id: destination.province_id,
        articles: destination.articles.map((article) => ({ article_id: article.article_id, quantite_allouee: Number(article.quantite_allouee) })),
      })),
    };
    await notifierOperation(async () => {
      await requeteApi("/api/central/approvisionnements", { methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps });
      definirReference(`APP-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      definirIntitule("");
      definirDestinations([initialiserDestination()]);
      definirVue("liste");
    }, "L’approvisionnement et ses répartitions ont été enregistrés en brouillon.");
  }

  async function validerApprovisionnement(): Promise<void> {
    if (!selection) return;
    await notifierOperation(() => requeteApi(`/api/central/approvisionnements/${encodeURIComponent(selection.id)}/validation`, {
      methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps: {},
    }), "L’approvisionnement a été validé.");
  }

  async function soumettreExpedition(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (!selection) return;
    const corps = {
      destination_id: destinationExpedition,
      date_expedition: dateExpedition,
      origine_expedition: origineExpedition,
      entrepot_origine_id: origineExpedition === "ENTREPOT_CENTRAL" ? entrepotOrigine : null,
      reference_bordereau: referenceBordereau,
      lignes: lignesExpedition.map((ligne) => ({
        article_approvisionnement_id: ligne.article_approvisionnement_id,
        quantite_expediee: Number(ligne.quantite_expediee),
        ...(origineExpedition === "LIVRAISON_DIRECTE_FOURNISSEUR" ? {
          numero_lot_fournisseur: ligne.numero_lot_fournisseur,
          date_peremption: ligne.date_peremption || null,
        } : {}),
      })),
    };
    await notifierOperation(async () => {
      await requeteApi(`/api/central/approvisionnements/${encodeURIComponent(selection.id)}/expeditions`, {
        methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps,
      });
      definirReferenceBordereau("");
      definirLignesExpedition([{ cleLocale: cleLocale(), article_approvisionnement_id: "", quantite_expediee: "", numero_lot_fournisseur: "", date_peremption: "" }]);
    }, "L’expédition a été enregistrée; le stock central a été mis à jour si nécessaire.");
  }

  async function soumettreReception(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (!expeditionChoisie || !fichierPv) return;
    await notifierOperation(async () => {
      const formulaire = new FormData();
      let pieceId = pvCharge?.expeditionId === expeditionChoisie.id && pvCharge.fichier === fichierPv
        ? pvCharge.pieceId
        : null;
      if (!pieceId) {
        formulaire.set("fichier", fichierPv);
        const piece = await requeteApi<ResultatPvApi>(`/api/provincial/expeditions/${encodeURIComponent(expeditionChoisie.id)}/pv`, {
          methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps: formulaire,
        });
        pieceId = piece.id;
        definirPvCharge({ expeditionId: expeditionChoisie.id, fichier: fichierPv, pieceId });
      }
      await requeteApi(`/api/provincial/expeditions/${encodeURIComponent(expeditionChoisie.id)}/reception`, {
        methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps: {
          entrepot_recepteur_id: entrepotReception,
          date_reception: dateReception,
          numero_pv_reception: numeroPv,
          pv_piece_jointe_id: pieceId,
          lignes: lignesReception.map((ligne) => ({
            ligne_expedition_id: ligne.ligne_expedition_id,
            quantite_recue_physique: Number(ligne.quantite_recue_physique),
            quantite_acceptee: Number(ligne.quantite_acceptee),
            quantite_endommagee: Number(ligne.quantite_endommagee),
          })),
        },
      });
      definirFichierPv(null);
      definirPvCharge(null);
      definirNumeroPv("");
    }, "Le procès-verbal et la réception ont été enregistrés; les quantités acceptées sont entrées en stock.");
  }

  async function rapprocherEcarts(): Promise<void> {
    if (!selection || !receptionChoisie) return;
    const ecarts = receptionChoisie.lignes.filter((ligne) => ligne.quantite_manquante > 0 || ligne.quantite_endommagee > 0);
    await notifierOperation(() => requeteApi(
      `/api/central/approvisionnements/${encodeURIComponent(selection.id)}/receptions/${encodeURIComponent(receptionChoisie.id)}/rapprochement`,
      {
        methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps: {
          justifications: ecarts.map((ligne) => ({ ligne_reception_id: ligne.id, justification_ecart: justifications[ligne.id] ?? "" })),
        },
      },
    ), "Les écarts de cette réception ont été rapprochés.");
  }

  async function cloturerApprovisionnement(): Promise<void> {
    if (!selection) return;
    await notifierOperation(() => requeteApi(`/api/central/approvisionnements/${encodeURIComponent(selection.id)}/cloture`, {
      methode: "POST", jetonCsrf, cleIdempotence: cleIdempotence(), corps: { observations_cloture: observationsCloture || null },
    }), "L’approvisionnement a été clôturé après contrôle de ses expéditions et écarts.");
  }

  const peutPrecedent = decalage > 0;
  const peutSuivant = decalage + TAILLE_PAGE < total;
  const controlesApprovisionnements = <div className="pagination">
    <span>Opérations {total === 0 ? 0 : decalage + 1} à {Math.min(decalage + TAILLE_PAGE, total)} sur {total}</span>
    <div className="actions-ligne">
      <button type="button" className="bouton bouton-secondaire" disabled={!peutPrecedent || chargement} onClick={() => definirDecalage((valeur) => Math.max(0, valeur - TAILLE_PAGE))}>Précédent</button>
      <button type="button" className="bouton bouton-secondaire" disabled={!peutSuivant || chargement} onClick={() => definirDecalage((valeur) => valeur + TAILLE_PAGE)}>Suivant</button>
    </div>
  </div>;
  const peutPageAllocationPrecedente = decalageAllocations > 0;
  const peutPageAllocationSuivante = decalageAllocations + TAILLE_PAGE < totalAllocations;
  const peutPageReceptionPrecedente = decalageReceptions > 0;
  const peutPageReceptionSuivante = decalageReceptions + TAILLE_PAGE < totalReceptions;

  return (
    <section className="contenu-tableau module-approvisionnements" aria-labelledby="titre-approvisionnements">
      <header className="entete-section">
        <div><h1 id="titre-approvisionnements">Approvisionnements centraux</h1><p className="texte-secondaire">Répartition, expédition, réception provinciale et rapprochement des écarts.</p></div>
        <span className="badge-role">{estAdmin ? "Administration centrale" : estDelegue ? "Délégation provinciale" : "Consultation et audit"}</span>
      </header>
      {erreur && <p className="message-erreur bandeau-erreur" role="alert">{erreur}</p>}
      {succes && <p className="message-succes" role="status">{succes}</p>}

      <nav className="navigation-gestion" aria-label="Fonctions des approvisionnements">
        {!estDelegue && <button type="button" className={vue === "liste" ? "lien-gestion actif" : "lien-gestion"} onClick={() => definirVue("liste")}>Liste des approvisionnements</button>}
        {estAdmin && <button type="button" className={vue === "nouveau" ? "lien-gestion actif" : "lien-gestion"} onClick={() => definirVue("nouveau")}>Nouvel approvisionnement</button>}
        {estAdmin && <button type="button" className={vue === "expeditions" ? "lien-gestion actif" : "lien-gestion"} onClick={() => definirVue("expeditions")}>Gestion des expéditions</button>}
        {estDelegue && <button type="button" className={vue === "reception" ? "lien-gestion actif" : "lien-gestion"} onClick={() => definirVue("reception")}>Réception provinciale</button>}
        {estAdmin && <button type="button" className={vue === "cloture" ? "lien-gestion actif" : "lien-gestion"} onClick={() => definirVue("cloture")}>Suivi des écarts et clôture</button>}
      </nav>

      {vue === "liste" && !estDelegue && <>
        <section className="carte-section">
          <div className="titre-section"><div><h2>Liste des approvisionnements</h2><p>Les résultats sont paginés côté serveur.</p></div><span className="compteur">{total} opération(s)</span></div>
          <div className="barre-filtres-stock"><label className="champ-territorial">Recherche<input value={recherche} onChange={(e) => { definirRecherche(e.currentTarget.value); definirDecalage(0); }} placeholder="Référence ou intitulé" /></label></div>
          <div className="tableau-defilement"><table><thead><tr><th>Référence</th><th>Opération</th><th>Source</th><th>Nature</th><th>Destinations</th><th>Expéditions</th><th>Statut</th><th>Action</th></tr></thead><tbody>
            {approvisionnements.map((operation) => <tr key={operation.id}><td className="code-reference">{operation.reference}</td><td className="texte-gras">{operation.intitule_operation}</td><td>{operation.source_articles.replaceAll("_", " ")}</td><td>{operation.nature_aide}</td><td>{operation.nombre_destinations}</td><td>{operation.nombre_expeditions}</td><td><span className="pastille-statut statut-information">{operation.statut}</span></td><td><button type="button" className="bouton bouton-secondaire" onClick={() => void choisirApprovisionnement(operation)}>Ouvrir</button></td></tr>)}
            {!chargement && approvisionnements.length === 0 && <tr><td className="cellule-vide" colSpan={8}>Aucun approvisionnement dans cette page.</td></tr>}
          </tbody></table></div>
          {controlesApprovisionnements}
        </section>
        {selection && <section className="carte-section">
          <div className="titre-section"><div><h2>{selection.reference} — {selection.intitule_operation}</h2><p>État de l’opération : {selection.statut}</p></div>{estAdmin && selection.statut === "BROUILLON" && <button type="button" className="bouton bouton-primaire" disabled={chargement} onClick={() => void validerApprovisionnement()}>Valider l’approvisionnement</button>}</div>
          <h3>Répartition par province et article</h3>
          <div className="tableau-defilement"><table><thead><tr><th>Province</th><th>Article</th><th>Alloué</th><th>Expédié</th><th>Accepté</th><th>Reste à expédier</th></tr></thead><tbody>
            {allocations.map((allocation) => <tr key={allocation.id}><td>{allocation.province}</td><td>{allocation.code_article} · {allocation.article}</td><td>{allocation.quantite_allouee}</td><td>{allocation.quantite_expediee}</td><td>{allocation.quantite_receptionnee_acceptee}</td><td>{allocation.quantite_restante}</td></tr>)}
            {allocations.length === 0 && <tr><td className="cellule-vide" colSpan={6}>Aucune répartition disponible.</td></tr>}
          </tbody></table></div>
          <div className="pagination"><span>Répartitions {totalAllocations === 0 ? 0 : decalageAllocations + 1} à {Math.min(decalageAllocations + TAILLE_PAGE, totalAllocations)} sur {totalAllocations}</span><div className="actions-ligne"><button type="button" className="bouton bouton-secondaire" disabled={!peutPageAllocationPrecedente || chargement} onClick={() => void chargerPageAllocations(selection.id, decalageAllocations - TAILLE_PAGE)}>Précédent</button><button type="button" className="bouton bouton-secondaire" disabled={!peutPageAllocationSuivante || chargement} onClick={() => void chargerPageAllocations(selection.id, decalageAllocations + TAILLE_PAGE)}>Suivant</button></div></div>
          <h3>Expéditions et réceptions liées</h3>
          <div className="tableau-defilement"><table><thead><tr><th>Réception</th><th>Province</th><th>Expédition</th><th>Date</th><th>Procès-verbal</th><th>Rapprochement</th><th>Action</th></tr></thead><tbody>
            {receptions.map((reception) => <tr key={reception.id}><td>{reception.reference_reception_prov}</td><td>{reception.province}</td><td>{reception.reference_expedition}</td><td>{reception.date_reception}</td><td>{reception.numero_pv_reception}</td><td>{reception.statut_rapprochement}</td><td><button type="button" className="bouton bouton-secondaire" onClick={() => void chargerReception(reception)}>Examiner les écarts</button></td></tr>)}
            {receptions.length === 0 && <tr><td className="cellule-vide" colSpan={7}>Aucune réception enregistrée.</td></tr>}
          </tbody></table></div>
          <div className="pagination"><span>Réceptions {totalReceptions === 0 ? 0 : decalageReceptions + 1} à {Math.min(decalageReceptions + TAILLE_PAGE, totalReceptions)} sur {totalReceptions}</span><div className="actions-ligne"><button type="button" className="bouton bouton-secondaire" disabled={!peutPageReceptionPrecedente || chargement} onClick={() => void chargerPageReceptions(selection.id, decalageReceptions - TAILLE_PAGE)}>Précédent</button><button type="button" className="bouton bouton-secondaire" disabled={!peutPageReceptionSuivante || chargement} onClick={() => void chargerPageReceptions(selection.id, decalageReceptions + TAILLE_PAGE)}>Suivant</button></div></div>
          {receptionChoisie && <div className="carte-ecarts"><h3>Rapprochement — {receptionChoisie.reference_reception_prov}</h3>{receptionChoisie.lignes.map((ligne) => <div className="ligne-ecart" key={ligne.id}><span>{ligne.article} · expédié {ligne.quantite_expediee}, accepté {ligne.quantite_acceptee}, endommagé {ligne.quantite_endommagee}, manquant {ligne.quantite_manquante}</span>{(ligne.quantite_endommagee > 0 || ligne.quantite_manquante > 0) && <label className="champ-territorial">Justification<textarea required minLength={5} value={justifications[ligne.id] ?? ""} onChange={(e) => definirJustifications((courant) => ({ ...courant, [ligne.id]: e.currentTarget.value }))} /></label>}</div>)}
            {estAdmin && receptionChoisie.statut_rapprochement !== "RAPPROCHE_JUSTIFIE" && <button type="button" className="bouton bouton-primaire" disabled={chargement || !receptionChoisie.lignes.some((ligne) => ligne.quantite_endommagee > 0 || ligne.quantite_manquante > 0)} onClick={() => void rapprocherEcarts()}>Valider le rapprochement</button>}
          </div>}
        </section>}
      </>}

      {vue === "nouveau" && estAdmin && <section className="carte-section">
        <div className="titre-section"><div><h2>Nouvel approvisionnement</h2><p>Définissez l’origine puis les allocations indépendantes de chaque province.</p></div></div>
        <form className="formulaire-gestion formulaire-approvisionnement" onSubmit={(e) => void soumettreApprovisionnement(e)}>
          <label className="champ-territorial">Référence<input required minLength={6} maxLength={80} pattern="APP-[A-Z0-9-]+" value={reference} onChange={(e) => definirReference(e.currentTarget.value)} /></label>
          <label className="champ-territorial">Intitulé de l’opération<input required minLength={2} maxLength={160} value={intitule} onChange={(e) => definirIntitule(e.currentTarget.value)} /></label>
          <label className="champ-territorial">Origine des articles<select value={source} onChange={(e) => { definirSource(e.currentTarget.value); definirPartenaireId(""); }}><option value="ENTREPOT_CENTRAL">Entrepôt central</option><option value="FOURNISSEUR_EXTERNE">Fournisseur externe</option><option value="DON_PARTENAIRE">Don d’un partenaire</option></select></label>
          {source !== "ENTREPOT_CENTRAL" && <label className="champ-territorial">Partenaire validé<select required value={partenaireId} onChange={(e) => definirPartenaireId(e.currentTarget.value)}><option value="">Sélectionner un partenaire</option>{partenaires.map((partenaire) => <option key={partenaire.id} value={partenaire.id}>{partenaire.sigle ? `${partenaire.sigle} · ` : ""}{partenaire.nom}</option>)}</select></label>}
          <label className="champ-territorial">Nature de l’aide<select value={natureAide} onChange={(e) => definirNatureAide(e.currentTarget.value)}><option value="ALIMENTAIRE">Aide alimentaire</option><option value="NFI">Articles non alimentaires</option><option value="MIXTE">Aide mixte</option></select></label>
          <div className="destination-editoriale">
            <div className="titre-section"><div><h3>Répartition par province</h3><p>Ajoutez une ligne distincte pour chaque province cible.</p></div><button type="button" className="bouton bouton-secondaire" onClick={() => definirDestinations((liste) => [...liste, initialiserDestination()])}>Ajouter une province</button></div>
            {destinations.map((destination, index) => <fieldset className="bloc-destination" key={destination.cleLocale}><legend>Destination {index + 1}</legend>
              <div className="ligne-destination"><label className="champ-territorial">Province<select required value={destination.province_id} onChange={(e) => modifierDestination(destination.cleLocale, { province_id: e.currentTarget.value })}><option value="">Sélectionner une province</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}</select></label>{destinations.length > 1 && <button type="button" className="bouton bouton-texte-danger" onClick={() => definirDestinations((liste) => liste.filter((item) => item.cleLocale !== destination.cleLocale))}>Retirer cette province</button>}</div>
              {destination.articles.map((ligne) => <div className="ligne-allocation" key={ligne.cleLocale}><label className="champ-territorial">Article<select required value={ligne.article_id} onChange={(e) => modifierDestination(destination.cleLocale, { articles: destination.articles.map((item) => item.cleLocale === ligne.cleLocale ? { ...item, article_id: e.currentTarget.value } : item) })}><option value="">Sélectionner un article</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.code_article} · {article.designation}</option>)}</select></label><label className="champ-territorial">Quantité allouée<input required type="number" min="0.001" step="any" value={ligne.quantite_allouee} onChange={(e) => modifierDestination(destination.cleLocale, { articles: destination.articles.map((item) => item.cleLocale === ligne.cleLocale ? { ...item, quantite_allouee: e.currentTarget.value } : item) })} /></label><button type="button" className="bouton bouton-texte-danger" disabled={destination.articles.length <= 1} onClick={() => modifierDestination(destination.cleLocale, { articles: destination.articles.filter((item) => item.cleLocale !== ligne.cleLocale) })}>Retirer l’article</button></div>)}
              <button type="button" className="bouton bouton-secondaire" onClick={() => modifierDestination(destination.cleLocale, { articles: [...destination.articles, { cleLocale: cleLocale(), article_id: "", quantite_allouee: "" }] })}>Ajouter un article</button>
            </fieldset>)}
          </div>
          <button type="submit" className="bouton bouton-primaire" disabled={chargement}>Enregistrer le brouillon</button>
        </form>
      </section>}

      {vue === "expeditions" && estAdmin && <>
        <section className="carte-section"><div className="titre-section"><div><h2>Créer une expédition</h2><p>Les quantités restent limitées par le solde des allocations et, pour l’origine centrale, par le stock FEFO disponible.</p></div></div>
          <label className="champ-territorial champ-appro-large">Approvisionnement<select value={selection?.id ?? ""} onChange={(e) => { const operation = approvisionnements.find((item) => item.id === e.currentTarget.value); if (operation) void choisirApprovisionnement(operation); }}><option value="">Sélectionner un approvisionnement</option>{approvisionnements.map((operation) => <option key={operation.id} value={operation.id}>{operation.reference} · {operation.intitule_operation}</option>)}</select></label>
          {controlesApprovisionnements}
          {selection && <form className="formulaire-gestion formulaire-approvisionnement" onSubmit={(e) => void soumettreExpedition(e)}>
            <label className="champ-territorial">Province destinataire<select required value={destinationExpedition} onChange={(e) => void choisirDestinationPourExpedition(e.currentTarget.value)}><option value="">Sélectionner une répartition</option>{destinationsApprovisionnement.map((destination) => <option key={destination.id} value={destination.id}>{destination.province} · {destination.statut_destination}</option>)}</select></label>
            <label className="champ-territorial">Origine réelle<select value={origineExpedition} onChange={(e) => definirOrigineExpedition(e.currentTarget.value)}><option value="ENTREPOT_CENTRAL">Entrepôt central</option><option value="LIVRAISON_DIRECTE_FOURNISSEUR">Livraison directe du fournisseur</option></select></label>
            {origineExpedition === "ENTREPOT_CENTRAL" && <label className="champ-territorial">Entrepôt central<select required value={entrepotOrigine} onChange={(e) => definirEntrepotOrigine(e.currentTarget.value)}><option value="">Sélectionner un entrepôt</option>{entrepots.map((entrepot) => <option key={entrepot.id} value={entrepot.id}>{entrepot.code_entrepot} · {entrepot.nom}</option>)}</select></label>}
            <label className="champ-territorial">Date d’expédition<input required type="date" value={dateExpedition} onChange={(e) => definirDateExpedition(e.currentTarget.value)} /></label>
            <label className="champ-territorial">Référence du bordereau<input required minLength={2} maxLength={120} value={referenceBordereau} onChange={(e) => definirReferenceBordereau(e.currentTarget.value)} /></label>
            <div className="destination-editoriale"><h3>Articles de l’expédition</h3>{lignesExpedition.map((ligne) => <div className="ligne-allocation" key={ligne.cleLocale}><label className="champ-territorial">Article alloué<select required value={ligne.article_approvisionnement_id} onChange={(e) => definirLignesExpedition((liste) => liste.map((item) => item.cleLocale === ligne.cleLocale ? { ...item, article_approvisionnement_id: e.currentTarget.value } : item))}><option value="">Sélectionner un article</option>{allocationsDestination.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.code_article} · {allocation.article} — disponible à allouer {allocation.quantite_restante}</option>)}</select></label><label className="champ-territorial">Quantité expédiée<input type="number" required min="0.001" step="any" value={ligne.quantite_expediee} onChange={(e) => definirLignesExpedition((liste) => liste.map((item) => item.cleLocale === ligne.cleLocale ? { ...item, quantite_expediee: e.currentTarget.value } : item))} /></label>{origineExpedition === "LIVRAISON_DIRECTE_FOURNISSEUR" && <><label className="champ-territorial">Numéro de lot fournisseur<input required value={ligne.numero_lot_fournisseur} onChange={(e) => definirLignesExpedition((liste) => liste.map((item) => item.cleLocale === ligne.cleLocale ? { ...item, numero_lot_fournisseur: e.currentTarget.value } : item))} /></label><label className="champ-territorial">Date de péremption<input type="date" value={ligne.date_peremption} onChange={(e) => definirLignesExpedition((liste) => liste.map((item) => item.cleLocale === ligne.cleLocale ? { ...item, date_peremption: e.currentTarget.value } : item))} /></label></>}{lignesExpedition.length > 1 && <button type="button" className="bouton bouton-texte-danger" onClick={() => definirLignesExpedition((liste) => liste.filter((item) => item.cleLocale !== ligne.cleLocale))}>Retirer</button>}</div>)}<button type="button" className="bouton bouton-secondaire" onClick={() => definirLignesExpedition((liste) => [...liste, { cleLocale: cleLocale(), article_approvisionnement_id: "", quantite_expediee: "", numero_lot_fournisseur: "", date_peremption: "" }])}>Ajouter un article à l’expédition</button></div>
            <button type="submit" className="bouton bouton-primaire" disabled={chargement || allocationsDestination.length === 0}>Enregistrer l’expédition</button>
          </form>}
        </section>
      </>}

      {vue === "reception" && estDelegue && <section className="carte-section"><div className="titre-section"><div><h2>Réception provinciale</h2><p>Seules les expéditions destinées à votre province sont présentées.</p></div></div>
        <div className="tableau-defilement"><table><thead><tr><th>Expédition</th><th>Approvisionnement</th><th>Date</th><th>Origine</th><th>Bordereau</th><th>Statut</th><th>Action</th></tr></thead><tbody>{expeditions.map((expedition) => <tr key={expedition.id}><td>{expedition.reference_expedition}</td><td>{expedition.reference_approvisionnement} · {expedition.intitule_operation}</td><td>{expedition.date_expedition}</td><td>{expedition.origine_expedition.replaceAll("_", " ")}</td><td>{expedition.reference_bordereau}</td><td>{expedition.statut_expedition}</td><td><button type="button" className="bouton bouton-secondaire" onClick={() => void choisirExpedition(expedition)}>Ouvrir</button></td></tr>)}{expeditions.length === 0 && <tr><td className="cellule-vide" colSpan={7}>Aucune expédition ne correspond aux filtres.</td></tr>}</tbody></table></div>
        {expeditionChoisie && <div className="detail-reception"><h3>{expeditionChoisie.reference_expedition} — {expeditionChoisie.intitule_operation}</h3><p>Bordereau {expeditionChoisie.reference_bordereau} · {expeditionChoisie.statut_expedition}</p>{expeditionChoisie.reception_id ? <p className="message-succes">Une réception est déjà enregistrée pour cette expédition.</p> : <form className="formulaire-gestion formulaire-approvisionnement" onSubmit={(e) => void soumettreReception(e)}>
          <label className="champ-territorial">Entrepôt récepteur<select required value={entrepotReception} onChange={(e) => definirEntrepotReception(e.currentTarget.value)}><option value="">Sélectionner l’entrepôt de votre province</option>{entrepots.map((entrepot) => <option key={entrepot.id} value={entrepot.id}>{entrepot.code_entrepot} · {entrepot.nom}</option>)}</select></label>
          <label className="champ-territorial">Date de réception<input type="date" required value={dateReception} onChange={(e) => definirDateReception(e.currentTarget.value)} /></label>
          <label className="champ-territorial">Numéro du procès-verbal<input required minLength={2} maxLength={120} value={numeroPv} onChange={(e) => definirNumeroPv(e.currentTarget.value)} /></label>
          <label className="champ-territorial">Procès-verbal signé<input type="file" required accept="application/pdf,image/jpeg,image/png" onChange={(e) => { definirFichierPv(e.currentTarget.files?.[0] ?? null); definirPvCharge(null); }} /></label>
          <div className="tableau-defilement tableau-reception"><table><thead><tr><th>Article</th><th>Expédié</th><th>Reçu physiquement</th><th>Accepté</th><th>Endommagé</th></tr></thead><tbody>{expeditionChoisie.lignes.map((ligne) => { const saisie = lignesReception.find((item) => item.ligne_expedition_id === ligne.id); return <tr key={ligne.id}><td>{ligne.code_article} · {ligne.article}</td><td>{ligne.quantite_expediee}</td><td><input type="number" min="0" step="any" required value={saisie?.quantite_recue_physique ?? "0"} onChange={(e) => { const valeur = e.currentTarget.value; definirLignesReception((liste) => liste.map((item) => item.ligne_expedition_id === ligne.id ? { ...item, quantite_recue_physique: valeur } : item)); }} /></td><td><input type="number" min="0" step="any" required value={saisie?.quantite_acceptee ?? "0"} onChange={(e) => { const valeur = e.currentTarget.value; definirLignesReception((liste) => liste.map((item) => item.ligne_expedition_id === ligne.id ? { ...item, quantite_acceptee: valeur } : item)); }} /></td><td><input type="number" min="0" step="any" required value={saisie?.quantite_endommagee ?? "0"} onChange={(e) => { const valeur = e.currentTarget.value; definirLignesReception((liste) => liste.map((item) => item.ligne_expedition_id === ligne.id ? { ...item, quantite_endommagee: valeur } : item)); }} /></td></tr>; })}</tbody></table></div>
          <button type="submit" className="bouton bouton-primaire" disabled={chargement || expeditionChoisie.lignes.length === 0}>Confirmer la réception</button>
        </form>}</div>}
        <div className="pagination"><span>{total} expédition(s) dans votre périmètre</span><div className="actions-ligne"><button type="button" className="bouton bouton-secondaire" disabled={!peutPrecedent || chargement} onClick={() => definirDecalage((valeur) => Math.max(0, valeur - TAILLE_PAGE))}>Précédent</button><button type="button" className="bouton bouton-secondaire" disabled={!peutSuivant || chargement} onClick={() => definirDecalage((valeur) => valeur + TAILLE_PAGE)}>Suivant</button></div></div>
      </section>}

      {vue === "cloture" && estAdmin && <section className="carte-section"><div className="titre-section"><div><h2>Suivi des écarts et clôture centrale</h2><p>La clôture est vérifiée par le serveur au regard de toutes les expéditions et réceptions liées.</p></div></div>
        <label className="champ-territorial champ-appro-large">Approvisionnement<select value={selection?.id ?? ""} onChange={(e) => { const operation = approvisionnements.find((item) => item.id === e.currentTarget.value); if (operation) void choisirApprovisionnement(operation); }}><option value="">Sélectionner une opération</option>{approvisionnements.map((operation) => <option key={operation.id} value={operation.id}>{operation.reference} · {operation.intitule_operation} · {operation.statut}</option>)}</select></label>
        {controlesApprovisionnements}
        {selection && <><div className="tableau-defilement"><table><thead><tr><th>Réception</th><th>Province</th><th>Expédition</th><th>Écarts</th><th>Rapprochement</th><th>Examen</th></tr></thead><tbody>{receptions.map((reception) => <tr key={reception.id}><td>{reception.reference_reception_prov}</td><td>{reception.province}</td><td>{reception.reference_expedition}</td><td>{reception.comporte_ecarts ? "À traiter" : "Aucun"}</td><td>{reception.statut_rapprochement}</td><td><button type="button" className="bouton bouton-secondaire" onClick={() => void chargerReception(reception)}>Détail</button></td></tr>)}{receptions.length === 0 && <tr><td className="cellule-vide" colSpan={6}>Aucune réception à rapprocher.</td></tr>}</tbody></table></div>
          {receptionChoisie && <div className="carte-ecarts"><h3>{receptionChoisie.reference_reception_prov} — {receptionChoisie.province}</h3>{receptionChoisie.lignes.map((ligne) => <div className="ligne-ecart" key={ligne.id}><span>{ligne.article} · expédié {ligne.quantite_expediee}, reçu {ligne.quantite_recue_physique}, accepté {ligne.quantite_acceptee}, endommagé {ligne.quantite_endommagee}, manquant {ligne.quantite_manquante}</span>{(ligne.quantite_endommagee > 0 || ligne.quantite_manquante > 0) && <label className="champ-territorial">Justification<textarea required minLength={5} value={justifications[ligne.id] ?? ""} onChange={(e) => definirJustifications((courant) => ({ ...courant, [ligne.id]: e.currentTarget.value }))} /></label>}</div>)}{receptionChoisie.statut_rapprochement !== "RAPPROCHE_JUSTIFIE" && receptionChoisie.lignes.some((ligne) => ligne.quantite_endommagee > 0 || ligne.quantite_manquante > 0) && <button type="button" className="bouton bouton-primaire" disabled={chargement} onClick={() => void rapprocherEcarts()}>Valider le rapprochement</button>}</div>}
          <div className="formulaire-gestion formulaire-cloture"><label className="champ-territorial">Observations de clôture<textarea maxLength={2000} value={observationsCloture} onChange={(e) => definirObservationsCloture(e.currentTarget.value)} /></label><button type="button" className="bouton bouton-primaire" disabled={chargement || selection.statut === "CLOTUREE"} onClick={() => void cloturerApprovisionnement()}>Clôturer l’approvisionnement</button></div>
        </>}
      </section>}

      {estProprietaire && <p className="texte-secondaire">Le profil propriétaire dispose uniquement des fonctions de consultation et d’audit dans ce module.</p>}
    </section>
  );
}
