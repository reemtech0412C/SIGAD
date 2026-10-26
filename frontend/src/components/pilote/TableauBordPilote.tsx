import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { requeteApi } from "../../services/api";
import { CarteProvincesTchad } from "./CarteProvincesTchad";
import "./tableau-bord-pilote.css";

interface Props {
  utilisateur: UtilisateurAuthentifie;
}

interface Indicateurs {
  approvisionnements: number;
  distributions: number;
  menages_cibles_uniques: number;
  menages_servis_uniques: number;
  menages_partiellement_servis_uniques: number;
  personnes_assistees_menages_uniques: number;
  quantite_distribuee: number;
  stock_disponible_comptable: number;
  operations_cloturees: number;
  operations_en_attente: number;
  ecarts_non_resolus: number;
}

interface TableauRapports {
  perimetre: "NATIONAL" | "PROVINCIAL";
  province_id: string | null;
  periode: { date_debut: string | null; date_fin: string | null };
  indicateurs: Indicateurs;
  evolution_mensuelle: Array<{
    mois: string;
    distributions: number;
    menages_uniques: number;
    occurrences_beneficiaires: number;
    personnes_assistees_cumulees: number;
  }>;
  ressources_d1: { lignes_lues: number; duree_requetes_ms: number };
}

interface OptionsFiltres {
  provinces: Array<{ id: string; nom: string }>;
  partenaires: Array<{ id: string; nom: string }>;
  natures_aide: string[];
  statuts: string[];
}

interface Filtres {
  date_debut: string;
  date_fin: string;
  province_id: string;
  partenaire_id: string;
  nature_aide: string;
  statut: string;
}

type TypeIcone = "foyer" | "personne" | "distribution" | "stock" | "attente" | "ecart" | "approvisionnement" | "carte" | "activite" | "retour" | "filtre" | "menu" | "fermer" | "soleil" | "lune" | "cloche" | "chevron" | "sortie";

const cheminsIcones: Record<TypeIcone, string> = {
  foyer: "M3 10.5 12 3l9 7.5M5 9v11h14V9M9 20v-6h6v6",
  personne: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  distribution: "M3 7h18M5 7l1 13h12l1-13M9 7V4h6v3M9 11v5m6-5v5",
  stock: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5m0 0 8-4.5M12 12v9M8 5.2l8 4.6",
  attente: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  ecart: "M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01",
  approvisionnement: "M4 5h16v14H4zM8 9h8m-8 4h8m-8 4h5",
  carte: "M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15",
  activite: "M4 12h4l3-8 4 16 3-8h2",
  retour: "M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5",
  filtre: "M4 6h16M7 12h10m-7 6h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  fermer: "m6 6 12 12M18 6 6 18",
  soleil: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  lune: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z",
  cloche: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0",
  chevron: "m7 10 5 5 5-5",
  sortie: "M10 17l5-5-5-5m5 5H3m10-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6",
};

const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Ndjamena", dateStyle: "short" });

function Icone({ nom, taille = 20 }: { nom: TypeIcone; taille?: number }) {
  return (
    <svg aria-hidden="true" className="sigad-preview__icone" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={cheminsIcones[nom]} />
    </svg>
  );
}

function dateCourte(date: string): string {
  const value = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(value.valueOf()) ? date : dateFr.format(value);
}

function periodeLibelle(periode: TableauRapports["periode"]): string {
  if (periode.date_debut && periode.date_fin) return `Du ${dateCourte(periode.date_debut)} au ${dateCourte(periode.date_fin)}`;
  if (periode.date_debut) return `Depuis le ${dateCourte(periode.date_debut)}`;
  if (periode.date_fin) return `Jusqu’au ${dateCourte(periode.date_fin)}`;
  return "Toutes les périodes disponibles";
}

function moisLibelle(mois: string): string {
  const date = new Date(`${mois}-01T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? mois : new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Ndjamena", month: "short" }).format(date).replace(".", "");
}

function requeteFiltres(filtres: Filtres): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) if (valeur) params.set(cle, valeur);
  return params.toString();
}

function EtatVide({ titre, description, compact = false }: { titre: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? "sigad-preview__etat-vide sigad-preview__etat-vide--compact" : "sigad-preview__etat-vide"}>
      <span className="sigad-preview__etat-icone"><Icone nom="activite" taille={22} /></span>
      <strong>{titre}</strong>
      <p>{description}</p>
    </div>
  );
}

function CarteIndicateur({
  icone, titre, valeur, aide, variante = "bleu", chargement,
}: {
  icone: TypeIcone;
  titre: string;
  valeur: number | undefined;
  aide: string;
  variante?: string;
  chargement: boolean;
}) {
  return (
    <article className="sigad-preview__indicateur">
      <div className={`sigad-preview__indicateur-icone sigad-preview__indicateur-icone--${variante}`}><Icone nom={icone} /></div>
      <div className="sigad-preview__indicateur-corps">
        <span className="sigad-preview__indicateur-titre">{titre}</span>
        {chargement ? <span aria-label="Chargement" className="sigad-preview__squelette sigad-preview__squelette--nombre" /> : <strong>{valeur === undefined ? "—" : nombreFr.format(valeur)}</strong>}
        <small>{aide}</small>
      </div>
    </article>
  );
}

export function TableauBordPilote({ utilisateur }: Props) {
  const central = utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL";
  const [options, setOptions] = useState<OptionsFiltres | null>(null);
  const [tableau, setTableau] = useState<TableauRapports | null>(null);
  const [filtresSaisis, setFiltresSaisis] = useState<Filtres>({ date_debut: "", date_fin: "", province_id: "", partenaire_id: "", nature_aide: "", statut: "" });
  const [filtresAppliques, setFiltresAppliques] = useState<Filtres>({ date_debut: "", date_fin: "", province_id: "", partenaire_id: "", nature_aide: "", statut: "" });
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurFiltres, setErreurFiltres] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rechargement, setRechargement] = useState(0);
  const query = useMemo(() => requeteFiltres(filtresAppliques), [filtresAppliques]);

  useEffect(() => {
    let actif = true;
    requeteApi<OptionsFiltres>("/api/rapports/filtres")
      .then((resultat) => {
        if (!actif) return;
        setOptions(resultat);
        if (!central && utilisateur.province_id) {
          setFiltresSaisis((precedents) => ({ ...precedents, province_id: utilisateur.province_id ?? "" }));
          setFiltresAppliques((precedents) => ({ ...precedents, province_id: utilisateur.province_id ?? "" }));
        }
      })
      .catch((cause: unknown) => {
        if (actif) setErreurFiltres(cause instanceof Error ? cause.message : "Les filtres de consultation sont indisponibles.");
      });
    return () => { actif = false; };
  }, [central, utilisateur.province_id]);

  useEffect(() => {
    let actif = true;
    setChargement(true);
    setErreur(null);
    requeteApi<TableauRapports>(`/api/rapports/tableau-de-bord${query ? `?${query}` : ""}`)
      .then((resultat) => { if (actif) setTableau(resultat); })
      .catch((cause: unknown) => {
        if (!actif) return;
        setTableau(null);
        setErreur(cause instanceof Error ? cause.message : "Le tableau de bord n’a pas pu être chargé.");
      })
      .finally(() => { if (actif) setChargement(false); });
    return () => { actif = false; };
  }, [query, rechargement]);

  function changerFiltre(cle: keyof Filtres, valeur: string): void {
    setFiltresSaisis((precedents) => ({ ...precedents, [cle]: valeur }));
  }

  function appliquerFiltres(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFiltresAppliques({ ...filtresSaisis, province_id: central ? filtresSaisis.province_id : utilisateur.province_id ?? "" });
  }

  function reinitialiserFiltres(): void {
    const provinceId = central ? "" : utilisateur.province_id ?? "";
    const reinitialises: Filtres = { date_debut: "", date_fin: "", province_id: provinceId, partenaire_id: "", nature_aide: "", statut: "" };
    setFiltresSaisis(reinitialises);
    setFiltresAppliques(reinitialises);
  }

  const series = tableau ? [...tableau.evolution_mensuelle].reverse() : [];
  const maximumDistributions = Math.max(1, ...series.map((mois) => mois.distributions));
  const stats = tableau?.indicateurs;

  return (
    <section aria-label="Tableau de bord" className="sigad-preview__contenu sigad-admin__dashboard">
          {erreur && <div className="sigad-preview__message sigad-preview__message--erreur" role="alert"><span>{erreur}</span><button className="sigad-preview__bouton sigad-preview__bouton--secondaire" onClick={() => setRechargement((valeur) => valeur + 1)} type="button">Réessayer</button></div>}

          <div className="sigad-preview__section-entete"><div><h2>Indicateurs clés</h2><p>{tableau ? periodeLibelle(tableau.periode) : "Données du périmètre autorisé"}</p></div><span className="sigad-preview__badge-perimetre"><span />{tableau?.perimetre === "NATIONAL" ? "Vue nationale" : "Vue provinciale"}</span><button aria-label="Actualiser les indicateurs" className="sigad-preview__bouton-actualiser" onClick={() => setRechargement((valeur) => valeur + 1)} type="button"><Icone nom="retour" taille={16} /><span>Actualiser</span></button></div>

          <section aria-label="Indicateurs opérationnels" className="sigad-preview__grille-indicateurs">
            <CarteIndicateur icone="foyer" titre="Ménages ciblés" valeur={stats?.menages_cibles_uniques} aide="Ménages uniques" chargement={chargement} variante="bleu" />
            <CarteIndicateur icone="personne" titre="Personnes assistées" valeur={stats?.personnes_assistees_menages_uniques} aide="Dans les ménages uniques servis" chargement={chargement} variante="vert" />
            <CarteIndicateur icone="distribution" titre="Distributions" valeur={stats?.distributions} aide="Opérations enregistrées" chargement={chargement} variante="violet" />
            <CarteIndicateur icone="approvisionnement" titre="Approvisionnements" valeur={stats?.approvisionnements} aide="Opérations centrales" chargement={chargement} variante="cyan" />
            <CarteIndicateur icone="attente" titre="Opérations en attente" valeur={stats?.operations_en_attente} aide="Selon le statut opérationnel" chargement={chargement} variante="orange" />
            <CarteIndicateur icone="ecart" titre="Écarts non résolus" valeur={stats?.ecarts_non_resolus} aide="Rapprochements en attente" chargement={chargement} variante="rouge" />
            <CarteIndicateur icone="stock" titre="Stock comptable agrégé" valeur={stats?.stock_disponible_comptable} aide="Unités de mesure hétérogènes" chargement={chargement} variante="bleu" />
            <CarteIndicateur icone="distribution" titre="Quantité distribuée" valeur={stats?.quantite_distribuee} aide="Somme des lignes de remise" chargement={chargement} variante="vert" />
          </section>

          <section aria-label="Filtres du tableau de bord" className="sigad-preview__panneau sigad-preview__filtres">
            <div className="sigad-preview__titre-panneau sigad-preview__titre-filtres"><span className="sigad-preview__icone-titre"><Icone nom="filtre" taille={18} /></span><div><h2>Filtres</h2><p>Les résultats respectent les droits de votre session.</p></div></div>
            <form className="sigad-preview__form-filtres" onSubmit={appliquerFiltres}>
              {central && <label><span>Province</span><select aria-label="Province" value={filtresSaisis.province_id} onChange={(event) => changerFiltre("province_id", event.currentTarget.value)}><option value="">Toutes les provinces autorisées</option>{options?.provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}</select></label>}
              <label><span>Date de début</span><input aria-label="Date de début" type="date" value={filtresSaisis.date_debut} onChange={(event) => changerFiltre("date_debut", event.currentTarget.value)} /></label>
              <label><span>Date de fin</span><input aria-label="Date de fin" type="date" value={filtresSaisis.date_fin} onChange={(event) => changerFiltre("date_fin", event.currentTarget.value)} /></label>
              <label><span>Partenaire</span><select aria-label="Partenaire" value={filtresSaisis.partenaire_id} onChange={(event) => changerFiltre("partenaire_id", event.currentTarget.value)}><option value="">Tous les partenaires</option>{options?.partenaires.map((partenaire) => <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>)}</select></label>
              <label><span>Nature de l’aide</span><select aria-label="Nature de l’aide" value={filtresSaisis.nature_aide} onChange={(event) => changerFiltre("nature_aide", event.currentTarget.value)}><option value="">Toutes les natures</option>{options?.natures_aide.map((nature) => <option key={nature} value={nature}>{nature}</option>)}</select></label>
              <label><span>Statut</span><select aria-label="Statut" value={filtresSaisis.statut} onChange={(event) => changerFiltre("statut", event.currentTarget.value)}><option value="">Tous les statuts</option>{options?.statuts.map((statut) => <option key={statut} value={statut}>{statut.replaceAll("_", " ")}</option>)}</select></label>
              <div className="sigad-preview__actions-filtres"><button className="sigad-preview__bouton sigad-preview__bouton--principal" type="submit">Appliquer</button><button className="sigad-preview__bouton sigad-preview__bouton--secondaire" onClick={reinitialiserFiltres} type="button">Réinitialiser</button></div>
            </form>
            {erreurFiltres && <p className="sigad-preview__message sigad-preview__message--avertissement" role="status">{erreurFiltres} Les filtres disponibles restent limités à ceux déjà chargés.</p>}
          </section>

          <article className="sigad-preview__panneau sigad-preview__panneau-carte">
            <div className="sigad-preview__titre-panneau"><span className="sigad-preview__icone-titre"><Icone nom="carte" taille={18} /></span><div><h2>Carte interactive du Tchad</h2><p>Aperçu expérimental des limites de 23 provinces</p></div></div>
            <CarteProvincesTchad utilisateur={utilisateur} />
          </article>

          <section className="sigad-preview__grille-contenu sigad-preview__grille-apres-carte">
            <article className="sigad-preview__panneau sigad-preview__panneau-graphique">
              <div className="sigad-preview__titre-panneau"><span className="sigad-preview__icone-titre"><Icone nom="activite" taille={18} /></span><div><h2>Évolution des distributions</h2><p>Nombre d’opérations par mois · date prévue</p></div></div>
              {chargement ? <div aria-label="Chargement du graphique" className="sigad-preview__squelette sigad-preview__squelette--graphique" /> : erreur ? <EtatVide titre="Graphique indisponible" description="Les données n’ont pas pu être chargées." compact /> : series.length ? (
                <div aria-label="Graphique des distributions mensuelles" className="sigad-preview__graphique" role="img">
                  <div className="sigad-preview__graduations"><span>{nombreFr.format(maximumDistributions)}</span><span>{nombreFr.format(Math.round(maximumDistributions / 2))}</span><span>0</span></div>
                  <div className="sigad-preview__barres">
                    {series.map((mois) => <div className="sigad-preview__colonne-mois" key={mois.mois} title={`${moisLibelle(mois.mois)} : ${nombreFr.format(mois.distributions)} distributions`}><div className="sigad-preview__barre-colonne" style={{ height: `${Math.max(mois.distributions > 0 ? 8 : 2, mois.distributions / maximumDistributions * 100)}%` }} /><span>{moisLibelle(mois.mois)}</span></div>)}
                  </div>
                </div>
              ) : <EtatVide titre="Aucune distribution sur la période" description="Aucune opération n’est disponible pour les critères sélectionnés." compact />}
              {tableau && <div className="sigad-preview__legende"><span />Distributions enregistrées</div>}
            </article>

          </section>

          <section className="sigad-preview__grille-contenu sigad-preview__grille-secondaire">
            <article className="sigad-preview__panneau">
              <div className="sigad-preview__titre-panneau"><span className="sigad-preview__icone-titre"><Icone nom="attente" taille={18} /></span><div><h2>Validations</h2><p>Demandes nécessitant une décision administrative</p></div></div>
              <EtatVide titre="Indicateur indisponible" description="Aucune API existante ne fournit un décompte fiable des validations en attente." compact />
            </article>
            <article className="sigad-preview__panneau">
              <div className="sigad-preview__titre-panneau"><span className="sigad-preview__icone-titre"><Icone nom="activite" taille={18} /></span><div><h2>Activités récentes</h2><p>Dernières opérations du périmètre</p></div></div>
              <EtatVide titre="Flux d’activité indisponible" description="Aucun endpoint de flux d’activité n’est disponible dans les API existantes." compact />
            </article>
          </section>

          {tableau && <footer className="sigad-preview__pied-donnees">Données chargées depuis les API SIGAD · {nombreFr.format(tableau.ressources_d1.lignes_lues)} lignes D1 lues · requêtes : {nombreFr.format(tableau.ressources_d1.duree_requetes_ms)} ms</footer>}
    </section>
  );
}
