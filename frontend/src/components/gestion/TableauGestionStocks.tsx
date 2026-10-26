import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { SIGADFilterBar } from "../administration/SIGADFilterBar";
import { SIGADFormGrid } from "../administration/SIGADFormGrid";
import { ErreurApi, requeteApi } from "../../services/api";
import { SIGADAlert, SIGADBadge, SIGADPagination, SIGADTab, SIGADTabsList } from "../ui";

interface TableauGestionStocksProps {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
}

interface PageApi<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface ProvinceApi { id: string; nom: string; code: string }
interface CategorieApi { id: string; code: string; libelle: string }
interface UniteApi { id: string; code: string; libelle: string; decimales_autorisees: number }
interface ArticleApi {
  id: string; code_article: string; designation: string; categorie_id: string; categorie: string;
  unite_mesure_id: string; unite_code: string; unite: string; conditionnement_id: string | null;
  perissable: number; actif: number;
}
interface EntrepotApi {
  id: string; code_entrepot: string; nom: string; niveau: "CENTRAL" | "PROVINCIAL";
  province_id: string | null; province: string | null; actif: number;
}
interface SoldeApi {
  id: string; entrepot_id: string; entrepot: string; province_id: string | null; article_id: string;
  code_article: string; article: string; categorie: string; unite: string; quantite_physique: number;
  quantite_reservee: number; quantite_non_reservee: number; quantite_distribuable: number;
  seuil_alerte: number; derniere_maj: string;
}
interface LotApi {
  id: string; numero_lot: string; article_id: string; code_article: string; designation: string;
  entrepot_id: string; entrepot: string; province_id: string | null; date_peremption: string | null;
  etat_qualite: string; quantite_physique: number; quantite_reservee: number; quantite_disponible: number;
}
interface ReceptionApi {
  id: string; reference_reception: string; entrepot: string; type_entree: string;
  partenaire: string | null; date_reception: string; nombre_lignes: number; auteur: string;
}
interface MouvementApi {
  id: string; reference_mouvement: string; entrepot: string; code_article: string; article: string;
  numero_lot: string; type_mouvement: string; sens: string; quantite: number;
  solde_physique_avant: number; solde_physique_apres: number; motif: string; auteur: string; cree_le: string;
}
interface PartenaireApi { id: string; nom: string; sigle: string | null }

type VueStocks = "stocks" | "articles" | "entrepots" | "receptions" | "mouvements";

const TAILLE_PAGE = 20;

function messageErreur(cause: unknown, valeurParDefaut: string): string {
  return cause instanceof ErreurApi || cause instanceof Error ? cause.message : valeurParDefaut;
}

function dateAujourdhui(): string { return new Date().toISOString().slice(0, 10); }

function nombre(valeur: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(valeur);
}

function libelleMouvement(code: string): string {
  const libelles: Record<string, string> = {
    RECEPTION: "Réception",
    ENTREE: "Entrée de stock",
    SORTIE_EXPEDITION: "Sortie pour expédition",
    SORTIE_DISTRIBUTION: "Sortie pour distribution",
    RESERVATION: "Réservation",
    LIBERATION_RESERVATION: "Libération de réservation",
    TRANSFERT_SORTANT: "Transfert sortant",
    TRANSFERT_ENTRANT: "Transfert entrant",
    RETOUR: "Retour en stock",
    AJUSTEMENT_POSITIF: "Ajustement positif",
    AJUSTEMENT_NEGATIF: "Ajustement négatif",
    PERTE: "Perte constatée",
    INVENTAIRE: "Inventaire",
  };
  return libelles[code] ?? "Mouvement de stock";
}

export function TableauGestionStocks({ utilisateur, jetonCsrf }: TableauGestionStocksProps) {
  const [vue, definirVue] = useState<VueStocks>("stocks");
  const [decalage, definirDecalage] = useState(0);
  const [recherche, definirRecherche] = useState("");
  const [provinceFiltre, definirProvinceFiltre] = useState("");
  const [categories, definirCategories] = useState<CategorieApi[]>([]);
  const [unites, definirUnites] = useState<UniteApi[]>([]);
  const [provinces, definirProvinces] = useState<ProvinceApi[]>([]);
  const [articles, definirArticles] = useState<ArticleApi[]>([]);
  const [entrepots, definirEntrepots] = useState<EntrepotApi[]>([]);
  const [lots, definirLots] = useState<LotApi[]>([]);
  const [partenaires, definirPartenaires] = useState<PartenaireApi[]>([]);
  const [soldes, definirSoldes] = useState<SoldeApi[]>([]);
  const [receptions, definirReceptions] = useState<ReceptionApi[]>([]);
  const [mouvements, definirMouvements] = useState<MouvementApi[]>([]);
  const [total, definirTotal] = useState(0);
  const [chargement, definirChargement] = useState(true);
  const [envoi, definirEnvoi] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [message, definirMessage] = useState<string | null>(null);
  const [codeArticle, definirCodeArticle] = useState("");
  const [designationArticle, definirDesignationArticle] = useState("");
  const [categorieArticle, definirCategorieArticle] = useState("");
  const [uniteArticle, definirUniteArticle] = useState("");
  const [articlePerissable, definirArticlePerissable] = useState(false);
  const [codeEntrepot, definirCodeEntrepot] = useState("");
  const [nomEntrepot, definirNomEntrepot] = useState("");
  const [niveauEntrepot, definirNiveauEntrepot] = useState<"CENTRAL" | "PROVINCIAL">("PROVINCIAL");
  const [provinceEntrepot, definirProvinceEntrepot] = useState("");
  const [entrepotOperation, definirEntrepotOperation] = useState("");
  const [typeReception, definirTypeReception] = useState<"APPROVISIONNEMENT_DIRECT_PARTENAIRE" | "STOCK_INITIAL">("APPROVISIONNEMENT_DIRECT_PARTENAIRE");
  const [partenaireReception, definirPartenaireReception] = useState("");
  const [articleReception, definirArticleReception] = useState("");
  const [lotReception, definirLotReception] = useState("");
  const [quantiteRecue, definirQuantiteRecue] = useState(0);
  const [quantiteAcceptee, definirQuantiteAcceptee] = useState(0);
  const [quantiteEndommagee, definirQuantiteEndommagee] = useState(0);
  const [peremptionReception, definirPeremptionReception] = useState("");
  const [lotAjustement, definirLotAjustement] = useState("");
  const [typeAjustement, definirTypeAjustement] = useState("INVENTAIRE");
  const [ecartAjustement, definirEcartAjustement] = useState(0);
  const [motifAjustement, definirMotifAjustement] = useState("");

  const chargerReferentiels = useCallback(async () => {
    try {
      const [pageCategories, pageUnites, pageProvinces, pageArticles, pageEntrepots, pagePartenaires] = await Promise.all([
        requeteApi<PageApi<CategorieApi>>("/api/stocks/categories-aide?limite=100&decalage=0"),
        requeteApi<PageApi<UniteApi>>("/api/stocks/unites-mesure?limite=100&decalage=0"),
        requeteApi<PageApi<ProvinceApi>>("/api/territoire/provinces?limite=100&decalage=0"),
        requeteApi<PageApi<ArticleApi>>("/api/stocks/articles?limite=100&decalage=0"),
        requeteApi<PageApi<EntrepotApi>>("/api/stocks/entrepots?limite=100&decalage=0"),
        requeteApi<PageApi<PartenaireApi>>("/api/gestion/partenaires?limite=100&decalage=0&role=FOURNISSEUR&statut_validation=VALIDE"),
      ]);
      definirCategories(pageCategories.elements);
      definirUnites(pageUnites.elements);
      definirProvinces(pageProvinces.elements);
      definirArticles(pageArticles.elements);
      definirEntrepots(pageEntrepots.elements);
      definirPartenaires(pagePartenaires.elements);
      if (!categorieArticle && pageCategories.elements[0]) definirCategorieArticle(pageCategories.elements[0].id);
      if (!uniteArticle && pageUnites.elements[0]) definirUniteArticle(pageUnites.elements[0].id);
      if (!articleReception && pageArticles.elements[0]) definirArticleReception(pageArticles.elements[0].id);
      if (!entrepotOperation && pageEntrepots.elements[0]) definirEntrepotOperation(pageEntrepots.elements[0].id);
      if (!partenaireReception && pagePartenaires.elements[0]) definirPartenaireReception(pagePartenaires.elements[0].id);
    } catch (cause) {
      definirErreur(messageErreur(cause, "Les référentiels de stock n’ont pas pu être chargés."));
    }
  }, [articleReception, categorieArticle, entrepotOperation, partenaireReception, uniteArticle]);

  const chargerVue = useCallback(async () => {
    definirChargement(true);
    definirErreur(null);
    const parametres = new URLSearchParams({ limite: String(TAILLE_PAGE), decalage: String(decalage) });
    if (recherche.trim()) parametres.set("recherche", recherche.trim());
    if (provinceFiltre && utilisateur.role !== "DELEGUE_PROVINCIAL") parametres.set("province_id", provinceFiltre);
    try {
      if (vue === "stocks") {
        const page = await requeteApi<PageApi<SoldeApi>>(`/api/stocks/soldes-stock?${parametres.toString()}`);
        definirSoldes(page.elements); definirTotal(page.total);
      } else if (vue === "articles") {
        const page = await requeteApi<PageApi<ArticleApi>>(`/api/stocks/articles?${parametres.toString()}`);
        definirArticles(page.elements); definirTotal(page.total);
      } else if (vue === "entrepots") {
        const page = await requeteApi<PageApi<EntrepotApi>>(`/api/stocks/entrepots?${parametres.toString()}`);
        definirEntrepots(page.elements); definirTotal(page.total);
      } else if (vue === "receptions") {
        const page = await requeteApi<PageApi<ReceptionApi>>(`/api/stocks/receptions-stock?${parametres.toString()}`);
        definirReceptions(page.elements); definirTotal(page.total);
      } else {
        const page = await requeteApi<PageApi<MouvementApi>>(`/api/stocks/mouvements-stock?${parametres.toString()}`);
        definirMouvements(page.elements); definirTotal(page.total);
      }
    } catch (cause) {
      definirErreur(messageErreur(cause, "Les données de stock n’ont pas pu être chargées."));
    } finally {
      definirChargement(false);
    }
  }, [decalage, provinceFiltre, recherche, utilisateur.role, vue]);

  useEffect(() => { void chargerReferentiels(); }, [chargerReferentiels]);
  useEffect(() => { void chargerVue(); }, [chargerVue, jetonCsrf]);
  useEffect(() => {
    if (vue !== "stocks" || !articleReception) return;
    const parametres = new URLSearchParams({ limite: "100", decalage: "0", article_id: articleReception });
    if (utilisateur.role === "DELEGUE_PROVINCIAL" && utilisateur.province_id) parametres.set("province_id", utilisateur.province_id);
    void requeteApi<PageApi<LotApi>>(`/api/stocks/lots-stock?${parametres.toString()}`)
      .then((page) => definirLots(page.elements))
      .catch((cause: unknown) => definirErreur(messageErreur(cause, "Les lots n’ont pas pu être chargés.")));
  }, [articleReception, utilisateur.province_id, utilisateur.role, vue]);

  function changerVue(nouvelleVue: VueStocks): void {
    definirVue(nouvelleVue); definirDecalage(0); definirErreur(null); definirMessage(null);
  }

  async function envoyer(
    evenement: FormEvent<HTMLFormElement>,
    operation: () => Promise<string>,
  ): Promise<void> {
    evenement.preventDefault(); definirErreur(null); definirMessage(null); definirEnvoi(true);
    try {
      definirMessage(await operation());
      await Promise.all([chargerVue(), chargerReferentiels()]);
    } catch (cause) {
      definirErreur(messageErreur(cause, "L’opération de stock n’a pas abouti."));
    } finally { definirEnvoi(false); }
  }

  async function creerArticle(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    await envoyer(evenement, async () => {
      await requeteApi<ArticleApi>("/api/stocks/articles", {
        methode: "POST", jetonCsrf,
        corps: { code_article: codeArticle, designation: designationArticle, categorie_id: categorieArticle,
          unite_mesure_id: uniteArticle, conditionnement_id: null, perissable: articlePerissable, actif: true },
      });
      definirCodeArticle(""); definirDesignationArticle("");
      return "L’article a été créé dans le référentiel.";
    });
  }

  async function creerEntrepot(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    await envoyer(evenement, async () => {
      const corps: Record<string, unknown> = {
        code_entrepot: codeEntrepot, nom: nomEntrepot, niveau: niveauEntrepot, actif: true,
      };
      if (utilisateur.role !== "DELEGUE_PROVINCIAL" && niveauEntrepot === "PROVINCIAL") corps.province_id = provinceEntrepot;
      await requeteApi<EntrepotApi>("/api/stocks/entrepots", { methode: "POST", jetonCsrf, corps });
      definirCodeEntrepot(""); definirNomEntrepot("");
      return "L’entrepôt a été enregistré avec son rattachement territorial.";
    });
  }

  async function creerReception(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    await envoyer(evenement, async () => {
      await requeteApi<{ reference_reception: string }>("/api/stocks/receptions-stock", {
        methode: "POST", jetonCsrf, cleIdempotence: crypto.randomUUID(),
        corps: {
          entrepot_id: entrepotOperation, type_entree: typeReception,
          partenaire_id: typeReception === "APPROVISIONNEMENT_DIRECT_PARTENAIRE" ? partenaireReception : null,
          date_reception: dateAujourdhui(), lignes: [{ article_id: articleReception, numero_lot: lotReception,
            quantite_recue: quantiteRecue, quantite_acceptee: quantiteAcceptee,
            quantite_endommagee: quantiteEndommagee, date_peremption: peremptionReception || null }],
        },
      });
      definirLotReception(""); definirQuantiteRecue(0); definirQuantiteAcceptee(0);
      definirQuantiteEndommagee(0); definirPeremptionReception("");
      return "La réception et ses mouvements ont été enregistrés atomiquement.";
    });
  }

  async function creerAjustement(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    await envoyer(evenement, async () => {
      const lot = lots.find((element) => element.id === lotAjustement);
      if (!lot) throw new Error("Sélectionnez un lot disponible dans le registre des stocks.");
      await requeteApi("/api/stocks/ajustements-stock", {
        methode: "POST", jetonCsrf, cleIdempotence: crypto.randomUUID(),
        corps: {
          entrepot_id: lot.entrepot_id,
          article_id: lot.article_id,
          lot_stock_id: lotAjustement, type_ajustement: typeAjustement,
          ecart_quantite: ecartAjustement, motif_detaille: motifAjustement,
        },
      });
      definirEcartAjustement(0); definirMotifAjustement("");
      return "L’ajustement a été inscrit dans le journal immuable des mouvements.";
    });
  }

  const peutAdministrer = utilisateur.role === "ADMIN_CENTRAL" || utilisateur.role === "PROPRIETAIRE";
  const peutOperer = utilisateur.role === "ADMIN_CENTRAL" || utilisateur.role === "DELEGUE_PROVINCIAL";

  return (
    <div className="contenu-tableau">
      <div className="sigad-compact-meta">
        <SIGADBadge variant="neutral">{utilisateur.role === "DELEGUE_PROVINCIAL" ? "Périmètre provincial" : "Référentiel national"}</SIGADBadge>
      </div>
      <div style={{ marginBottom: "1.5rem" }}>
        <SIGADTabsList ariaLabel="Modules de stock">
          {([["stocks", "État des stocks"], ["articles", "Articles"], ["entrepots", "Entrepôts"], ["receptions", "Réceptions"], ["mouvements", "Journal des mouvements"]] as const).map(([cle, libelle]) => (
            <SIGADTab key={cle} active={vue === cle} onClick={() => changerVue(cle)}>
              {libelle}
            </SIGADTab>
          ))}
        </SIGADTabsList>
      </div>
      {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
      {message && <SIGADAlert type="success" message={message} style={{ marginBottom: "1rem" }} />}
      <section className="carte-section">
        <div className="titre-section"><div><h2>{vue === "stocks" ? "État physique, réservé et disponible" : vue === "mouvements" ? "Registre immuable des mouvements" : `Registre des ${vue}`}</h2>
          <p>Les listes sont filtrées et paginées par le serveur selon votre périmètre d’accès.</p></div><span className="compteur">{total} éléments</span></div>
        <SIGADFilterBar ariaLabel="Filtres des stocks" fieldsClassName="barre-filtres-stock">
          <div className="champ-territorial"><label htmlFor="recherche-stock">Recherche</label><input id="recherche-stock" value={recherche} maxLength={120}
            onChange={(evenement) => { definirRecherche(evenement.currentTarget.value); definirDecalage(0); }} placeholder="Code, désignation ou référence" /></div>
          {peutAdministrer && <div className="champ-territorial"><label htmlFor="province-filtre-stock">Province</label><select id="province-filtre-stock" value={provinceFiltre}
            onChange={(evenement) => { definirProvinceFiltre(evenement.currentTarget.value); definirDecalage(0); }}><option value="">Toutes les provinces</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}</select></div>}
        </SIGADFilterBar>
        <div className="tableau-defilement">
          {vue === "stocks" && <table><thead><tr><th>Entrepôt</th><th>Article</th><th>Catégorie</th><th>Physique</th><th>Réservé</th><th>Non réservé</th><th>Distribuable</th><th>Seuil</th><th>Mise à jour</th></tr></thead><tbody>
            {soldes.map((solde) => <tr key={solde.id}><td>{solde.entrepot}</td><td><strong>{solde.code_article}</strong><br />{solde.article}</td><td>{solde.categorie}</td>
              <td className="chiffre-stock">{nombre(solde.quantite_physique)} {solde.unite}</td><td className="chiffre-stock">{nombre(solde.quantite_reservee)} {solde.unite}</td>
              <td className="chiffre-stock">{nombre(solde.quantite_non_reservee)} {solde.unite}</td><td className="chiffre-stock">{nombre(solde.quantite_distribuable)} {solde.unite}</td>
              <td className="chiffre-stock">{nombre(solde.seuil_alerte)}</td><td>{solde.derniere_maj}</td></tr>)}
            {!chargement && soldes.length === 0 && <tr><td className="cellule-vide" colSpan={9}>Aucun solde de stock pour les filtres sélectionnés.</td></tr>}</tbody></table>}
          {vue === "articles" && <table><thead><tr><th>Code</th><th>Désignation</th><th>Catégorie</th><th>Unité</th><th>Périssable</th><th>Statut</th></tr></thead><tbody>
            {articles.map((article) => <tr key={article.id}><td className="code-reference">{article.code_article}</td><td className="texte-gras">{article.designation}</td><td>{article.categorie}</td><td>{article.unite}</td><td>{article.perissable ? "Oui — règle FEFO" : "Non"}</td><td>{article.actif ? "Actif" : "Inactif"}</td></tr>)}
            {!chargement && articles.length === 0 && <tr><td className="cellule-vide" colSpan={6}>Aucun article enregistré.</td></tr>}</tbody></table>}
          {vue === "entrepots" && <table><thead><tr><th>Code</th><th>Entrepôt</th><th>Niveau</th><th>Province</th><th>Statut</th></tr></thead><tbody>
            {entrepots.map((entrepot) => <tr key={entrepot.id}><td className="code-reference">{entrepot.code_entrepot}</td><td className="texte-gras">{entrepot.nom}</td><td>{entrepot.niveau === "CENTRAL" ? "Central" : "Provincial"}</td><td>{entrepot.province ?? "National"}</td><td>{entrepot.actif ? "Actif" : "Inactif"}</td></tr>)}
            {!chargement && entrepots.length === 0 && <tr><td className="cellule-vide" colSpan={5}>Aucun entrepôt dans ce périmètre.</td></tr>}</tbody></table>}
          {vue === "receptions" && <table><thead><tr><th>Référence</th><th>Date</th><th>Entrepôt</th><th>Type</th><th>Partenaire</th><th>Lignes</th><th>Enregistrée par</th></tr></thead><tbody>
            {receptions.map((reception) => <tr key={reception.id}><td className="code-reference texte-gras">{reception.reference_reception}</td><td>{reception.date_reception}</td><td>{reception.entrepot}</td><td>{reception.type_entree === "STOCK_INITIAL" ? "Stock initial" : "Réception directe partenaire"}</td><td>{reception.partenaire ?? "—"}</td><td className="chiffre-stock">{reception.nombre_lignes}</td><td>{reception.auteur}</td></tr>)}
            {!chargement && receptions.length === 0 && <tr><td className="cellule-vide" colSpan={7}>Aucune réception enregistrée.</td></tr>}</tbody></table>}
          {vue === "mouvements" && <table><thead><tr><th>Référence</th><th>Date</th><th>Entrepôt</th><th>Article / lot</th><th>Mouvement</th><th>Quantité</th><th>Solde après</th><th>Motif</th></tr></thead><tbody>
            {mouvements.map((mouvement) => <tr key={mouvement.id}><td className="code-reference">{mouvement.reference_mouvement}</td><td>{mouvement.cree_le}</td><td>{mouvement.entrepot}</td><td>{mouvement.code_article} · {mouvement.numero_lot}</td>
              <td>{libelleMouvement(mouvement.type_mouvement)}</td><td className="chiffre-stock">{mouvement.sens === "MOINS" ? "−" : mouvement.sens === "PLUS" ? "+" : "↔"}{nombre(mouvement.quantite)}</td>
              <td className="chiffre-stock">{nombre(mouvement.solde_physique_apres)}</td><td>{mouvement.motif}</td></tr>)}
            {!chargement && mouvements.length === 0 && <tr><td className="cellule-vide" colSpan={8}>Aucun mouvement dans ce périmètre.</td></tr>}</tbody></table>}
        </div>
        {chargement && <p className="texte-secondaire" role="status">Chargement des données…</p>}
        <SIGADPagination total={total} decalage={decalage} taillePage={TAILLE_PAGE} chargement={chargement} onPageChange={definirDecalage} />
      </section>

    {peutAdministrer && vue === "articles" && <section className="carte-section">
      <div className="titre-section"><div><h2>Créer un article</h2><p>Le référentiel national est administré par l’administration centrale.</p></div></div>
      <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerArticle(evenement); }}>
        <div className="champ-territorial"><label htmlFor="code-article">Code article</label><input id="code-article" required minLength={2} maxLength={60} value={codeArticle} onChange={(e) => definirCodeArticle(e.currentTarget.value.toUpperCase())} /></div>
        <div className="champ-territorial"><label htmlFor="designation-article">Désignation</label><input id="designation-article" required minLength={2} maxLength={160} value={designationArticle} onChange={(e) => definirDesignationArticle(e.currentTarget.value)} /></div>
        <div className="champ-territorial"><label htmlFor="categorie-article">Catégorie d’aide</label><select id="categorie-article" required value={categorieArticle} onChange={(e) => definirCategorieArticle(e.currentTarget.value)}><option value="">Sélectionner</option>{categories.map((categorie) => <option key={categorie.id} value={categorie.id}>{categorie.libelle}</option>)}</select></div>
        <div className="champ-territorial"><label htmlFor="unite-article">Unité de mesure</label><select id="unite-article" required value={uniteArticle} onChange={(e) => definirUniteArticle(e.currentTarget.value)}><option value="">Sélectionner</option>{unites.map((unite) => <option key={unite.id} value={unite.id}>{unite.libelle}</option>)}</select></div>
        <label className="option-stock"><input type="checkbox" checked={articlePerissable} onChange={(e) => definirArticlePerissable(e.currentTarget.checked)} /> Article périssable, soumis à la règle FEFO</label>
        <button className="bouton bouton-principal" disabled={envoi || !categorieArticle || !uniteArticle} type="submit">Créer l’article</button>
      </SIGADFormGrid>
    </section>}

    {peutOperer && vue === "entrepots" && <section className="carte-section">
      <div className="titre-section"><div><h2>Créer un entrepôt</h2><p>Un entrepôt provincial est automatiquement limité à la province de votre session.</p></div></div>
      <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerEntrepot(evenement); }}>
        <div className="champ-territorial"><label htmlFor="code-entrepot">Code</label><input id="code-entrepot" required maxLength={60} value={codeEntrepot} onChange={(e) => definirCodeEntrepot(e.currentTarget.value.toUpperCase())} /></div>
        <div className="champ-territorial"><label htmlFor="nom-entrepot">Nom de l’entrepôt</label><input id="nom-entrepot" required minLength={2} maxLength={160} value={nomEntrepot} onChange={(e) => definirNomEntrepot(e.currentTarget.value)} /></div>
        {peutAdministrer && <div className="champ-territorial"><label htmlFor="niveau-entrepot">Niveau</label><select id="niveau-entrepot" value={niveauEntrepot} onChange={(e) => definirNiveauEntrepot(e.currentTarget.value as "CENTRAL" | "PROVINCIAL")}><option value="CENTRAL">Central national</option><option value="PROVINCIAL">Provincial</option></select></div>}
        {peutAdministrer && niveauEntrepot === "PROVINCIAL" && <div className="champ-territorial"><label htmlFor="province-entrepot">Province</label><select id="province-entrepot" required value={provinceEntrepot} onChange={(e) => definirProvinceEntrepot(e.currentTarget.value)}><option value="">Sélectionner une province</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}</select></div>}
        <button className="bouton bouton-principal" disabled={envoi || !codeEntrepot || !nomEntrepot || (peutAdministrer && niveauEntrepot === "PROVINCIAL" && !provinceEntrepot)} type="submit">Enregistrer l’entrepôt</button>
      </SIGADFormGrid>
    </section>}

    {peutOperer && vue === "stocks" && <section className="carte-section">
      <div className="titre-section"><div><h2>{"Enregistrer une réception ou une entrée initiale"}</h2><p>La réception, les lots, les soldes, les mouvements et l’audit sont validés dans une transaction D1.</p></div></div>
      <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerReception(evenement); }}>
        <div className="champ-territorial"><label htmlFor="entrepot-reception">Entrepôt</label><select id="entrepot-reception" required value={entrepotOperation} onChange={(e) => definirEntrepotOperation(e.currentTarget.value)}><option value="">Sélectionner</option>{entrepots.filter((entrepot) => entrepot.actif).map((entrepot) => <option key={entrepot.id} value={entrepot.id}>{entrepot.nom}</option>)}</select></div>
        <div className="champ-territorial"><label htmlFor="type-reception">Type d’entrée</label><select id="type-reception" value={typeReception} onChange={(e) => definirTypeReception(e.currentTarget.value as typeof typeReception)}><option value="APPROVISIONNEMENT_DIRECT_PARTENAIRE">Réception directe d’un partenaire</option><option value="STOCK_INITIAL">Stock initial</option></select></div>
        {typeReception === "APPROVISIONNEMENT_DIRECT_PARTENAIRE" && <div className="champ-territorial"><label htmlFor="partenaire-reception">Fournisseur ou donateur validé</label><select id="partenaire-reception" required value={partenaireReception} onChange={(e) => definirPartenaireReception(e.currentTarget.value)}><option value="">Sélectionner</option>{partenaires.map((partenaire) => <option key={partenaire.id} value={partenaire.id}>{partenaire.sigle ? `${partenaire.sigle} · ` : ""}{partenaire.nom}</option>)}</select></div>}
        <div className="champ-territorial"><label htmlFor="article-reception">Article</label><select id="article-reception" required value={articleReception} onChange={(e) => definirArticleReception(e.currentTarget.value)}><option value="">Sélectionner</option>{articles.filter((article) => article.actif).map((article) => <option key={article.id} value={article.id}>{article.code_article} · {article.designation}</option>)}</select></div>
        <div className="champ-territorial"><label htmlFor="lot-reception">Numéro de lot</label><input id="lot-reception" required maxLength={100} value={lotReception} onChange={(e) => definirLotReception(e.currentTarget.value)} /></div>
        <div className="champ-territorial"><label htmlFor="quantite-recue">Quantité reçue</label><input id="quantite-recue" type="number" min="0.001" step="0.001" required value={quantiteRecue || ""} onChange={(e) => definirQuantiteRecue(Number(e.currentTarget.value))} /></div>
        <div className="champ-territorial"><label htmlFor="quantite-acceptee">Quantité acceptée</label><input id="quantite-acceptee" type="number" min="0" step="0.001" required value={quantiteAcceptee} onChange={(e) => definirQuantiteAcceptee(Number(e.currentTarget.value))} /></div>
        <div className="champ-territorial"><label htmlFor="quantite-endommagee">Quantité endommagée</label><input id="quantite-endommagee" type="number" min="0" step="0.001" required value={quantiteEndommagee} onChange={(e) => definirQuantiteEndommagee(Number(e.currentTarget.value))} /></div>
        <div className="champ-territorial"><label htmlFor="peremption-reception">Date de péremption</label><input id="peremption-reception" type="date" value={peremptionReception} onChange={(e) => definirPeremptionReception(e.currentTarget.value)} /></div>
        <button className="bouton bouton-principal" disabled={envoi || !entrepotOperation || !articleReception || !lotReception} type="submit">Enregistrer l’entrée</button>
      </SIGADFormGrid>
      <div className="separateur-stock" />
      <div className="titre-section"><div><h2>Inventaire et ajustement</h2><p>L’écart est signé : positif pour une entrée, négatif pour une sortie constatée.</p></div></div>
      <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerAjustement(evenement); }}>
        <div className="champ-territorial"><label htmlFor="lot-ajustement">Lot</label><select id="lot-ajustement" required value={lotAjustement} onChange={(e) => definirLotAjustement(e.currentTarget.value)}><option value="">Sélectionner un lot de l’article choisi</option>{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.numero_lot} · {lot.code_article} · disponible {nombre(lot.quantite_disponible)}</option>)}</select></div>
        <div className="champ-territorial"><label htmlFor="type-ajustement">Motif de l’ajustement</label><select id="type-ajustement" value={typeAjustement} onChange={(e) => definirTypeAjustement(e.currentTarget.value)}><option value="INVENTAIRE">Écart d’inventaire</option><option value="PERTE">Perte constatée</option><option value="AVARIE">Avarie constatée</option><option value="CORRECTION_ERREUR">Correction d’erreur</option></select></div>
        <div className="champ-territorial"><label htmlFor="ecart-ajustement">Écart de quantité</label><input id="ecart-ajustement" type="number" step="0.001" required value={ecartAjustement} onChange={(e) => definirEcartAjustement(Number(e.currentTarget.value))} /></div>
        <div className="champ-territorial"><label htmlFor="motif-ajustement">Motif détaillé</label><input id="motif-ajustement" required minLength={5} maxLength={1000} value={motifAjustement} onChange={(e) => definirMotifAjustement(e.currentTarget.value)} /></div>
        <button className="bouton bouton-discret" disabled={envoi || !lotAjustement || !entrepotOperation || ecartAjustement === 0} type="submit">Valider l’ajustement</button>
      </SIGADFormGrid>
    </section>}
    </div>
  );
}
