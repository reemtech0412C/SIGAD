import { useCallback, useEffect, useMemo, useState } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { requeteApi } from "../../services/api";

interface Props {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
}

type TypeRapport =
  | "RAPPORT_MENSUEL_PROVINCIAL" | "RAPPORT_NATIONAL_CONSOLIDE" | "RAPPORT_APPROVISIONNEMENTS_CENTRAUX"
  | "RAPPORT_EXPEDITIONS" | "RAPPORT_RECEPTIONS_PROVINCIALES" | "ETAT_STOCKS" | "RAPPORT_MOUVEMENTS_STOCK"
  | "RAPPORT_DISTRIBUTION" | "LISTE_BENEFICIAIRES" | "LISTE_EMARGEMENT" | "PROCES_VERBAL_DISTRIBUTION"
  | "RAPPORT_ECARTS" | "RAPPORT_CLOTURE" | "RAPPORT_PARTENAIRE" | "RAPPORT_COUVERTURE_GEOGRAPHIQUE";

interface DefinitionRapport {
  type: TypeRapport;
  intitule: string;
  description: string;
  colonnes: Array<{ cle: string; libelle: string }>;
  donneesSensibles: boolean;
  identifiantOperationRequis: boolean;
}

interface Indicateurs {
  approvisionnements: number;
  distributions: number;
  menages_cibles_uniques: number;
  menages_servis_uniques: number;
  menages_partiellement_servis_uniques: number;
  occurrences_beneficiaires: number;
  personnes_enregistrees_menages_cibles: number;
  personnes_assistees_menages_uniques: number;
  personnes_assistees_cumulees: number;
  quantite_expediee: number;
  quantite_receptionnee: number;
  quantite_distribuee: number;
  stock_disponible_comptable: number;
  operations_cloturees: number;
  operations_en_attente: number;
  ecarts_non_resolus: number;
}

interface TableauDeBord {
  perimetre: "NATIONAL" | "PROVINCIAL";
  province_id: string | null;
  periode: { date_debut: string | null; date_fin: string | null };
  indicateurs: Indicateurs;
  evolution_mensuelle: Array<{ mois: string; distributions: number; menages_uniques: number; occurrences_beneficiaires: number; personnes_assistees_cumulees: number }>;
  provinces: Array<{ province_id: string; province: string; distributions: number; menages_uniques: number; menages_servis: number; menages_partiels: number; personnes_assistees: number }>;
  ressources_d1: { lignes_lues: number; duree_requetes_ms: number };
}

interface OptionsFiltres {
  provinces: Array<{ id: string; nom: string }>;
  partenaires: Array<{ id: string; nom: string }>;
  natures_aide: string[];
  localites: Array<{ id: string; nom: string }>;
  distributions: Array<{ id: string; reference: string; intitule: string; date_prevue: string }>;
  statuts: string[];
}

interface Apercu {
  definition: DefinitionRapport;
  elements: Array<Record<string, string | number | null>>;
  limite: number;
  decalage: number;
  suite_disponible: boolean;
  lignes_lues: number;
  duree_requetes_ms: number;
}

interface Archive {
  id: string;
  type_rapport: string;
  intitule: string;
  perimetre: string;
  province_id: string | null;
  format_export: "PDF" | "EXCEL" | "CSV";
  archive_disponible: number;
  genere_par: string;
  cree_le: string;
}

const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Ndjamena", dateStyle: "short" });
const pageSize = 25;

function query(valeurs: Record<string, string | number>): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(valeurs)) if (String(valeur).trim()) params.set(cle, String(valeur));
  return params.toString();
}

function dateAffichee(valeur: string): string {
  const date = new Date(`${valeur.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? valeur : dateFr.format(date);
}

function afficherValeur(valeur: string | number | null): string {
  if (valeur === null) return "—";
  if (typeof valeur === "number") return nombreFr.format(valeur);
  if (/^\d{4}-\d{2}-\d{2}/u.test(valeur)) return dateAffichee(valeur);
  return valeur;
}

function filtresDansQuery(valeurs: Record<string, string>, inclurePage = false, decalage = 0): Record<string, string | number> {
  const resultat: Record<string, string | number> = {};
  for (const [cle, valeur] of Object.entries(valeurs)) if (valeur) resultat[cle] = valeur;
  if (inclurePage) { resultat.limite = pageSize; resultat.decalage = decalage; }
  return resultat;
}

function telechargerBlob(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const indicateursEtiquettes: Array<{ cle: keyof Indicateurs; libelle: string }> = [
  { cle: "approvisionnements", libelle: "Approvisionnements" },
  { cle: "distributions", libelle: "Distributions" },
  { cle: "menages_cibles_uniques", libelle: "Ménages ciblés uniques" },
  { cle: "menages_servis_uniques", libelle: "Ménages servis uniques" },
  { cle: "menages_partiellement_servis_uniques", libelle: "Ménages partiellement servis" },
  { cle: "occurrences_beneficiaires", libelle: "Bénéfices (occurrences)" },
  { cle: "personnes_enregistrees_menages_cibles", libelle: "Personnes enregistrées" },
  { cle: "personnes_assistees_menages_uniques", libelle: "Personnes assistées, ménages uniques" },
  { cle: "personnes_assistees_cumulees", libelle: "Personnes assistées cumulées" },
  { cle: "quantite_expediee", libelle: "Quantités expédiées" },
  { cle: "quantite_receptionnee", libelle: "Quantités réceptionnées" },
  { cle: "quantite_distribuee", libelle: "Quantités distribuées" },
  { cle: "stock_disponible_comptable", libelle: "Stocks disponibles" },
  { cle: "operations_cloturees", libelle: "Opérations clôturées" },
  { cle: "operations_en_attente", libelle: "Opérations en attente" },
  { cle: "ecarts_non_resolus", libelle: "Écarts non résolus" },
];

export function TableauRapports({ utilisateur, jetonCsrf }: Props) {
  const provincial = utilisateur.role === "DELEGUE_PROVINCIAL";
  const [definitions, setDefinitions] = useState<DefinitionRapport[]>([]);
  const [options, setOptions] = useState<OptionsFiltres | null>(null);
  const [tableau, setTableau] = useState<TableauDeBord | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [type, setType] = useState<TypeRapport>("RAPPORT_DISTRIBUTION");
  const [provinceId, setProvinceId] = useState(provincial ? utilisateur.province_id ?? "" : "");
  const [partenaireId, setPartenaireId] = useState("");
  const [natureAide, setNatureAide] = useState("");
  const [statut, setStatut] = useState("");
  const [localiteId, setLocaliteId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [distributionId, setDistributionId] = useState("");
  const [format, setFormat] = useState<"PDF" | "EXCEL" | "CSV">("PDF");
  const [archiver, setArchiver] = useState(false);
  const [decalage, setDecalage] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const filtres = useMemo(() => ({ province_id: provinceId, partenaire_id: partenaireId,
    nature_aide: natureAide, statut, localite_id: localiteId, date_debut: dateDebut,
    date_fin: dateFin, distribution_id: distributionId }),
  [provinceId, partenaireId, natureAide, statut, localiteId, dateDebut, dateFin, distributionId]);
  const definition = definitions.find((element) => element.type === type) ?? null;

  const chargerOptions = useCallback(async () => {
    const [catalogue, filtres, pageArchives] = await Promise.all([
      requeteApi<{ elements: DefinitionRapport[] }>("/api/rapports/catalogue"),
      requeteApi<OptionsFiltres>("/api/rapports/filtres"),
      requeteApi<{ elements: Archive[] }>("/api/rapports/archives?limite=10&decalage=0"),
    ]);
    setDefinitions(catalogue.elements);
    setOptions(filtres);
    setArchives(pageArchives.elements);
    if (provincial && utilisateur.province_id) setProvinceId(utilisateur.province_id);
  }, [provincial, utilisateur.province_id]);

  const chargerDonnees = useCallback(async () => {
    if (!definitions.length) return;
    setChargement(true);
    setErreur(null);
    try {
      const queryFiltres = query(filtresDansQuery(filtres));
      const queryPage = query(filtresDansQuery(filtres, true, decalage));
      const [indicateurs, lignes] = await Promise.all([
        requeteApi<TableauDeBord>(`/api/rapports/tableau-de-bord?${queryFiltres}`),
        requeteApi<Apercu>(`/api/rapports/${type}/apercu?${queryPage}`),
      ]);
      setTableau(indicateurs);
      setApercu(lignes);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Les rapports n’ont pas pu être chargés.");
      setTableau(null);
      setApercu(null);
    } finally {
      setChargement(false);
    }
  }, [definitions.length, filtres, type, decalage]);

  useEffect(() => {
    let actif = true;
    void chargerOptions().catch((cause: unknown) => {
      if (actif) {
        setErreur(cause instanceof Error ? cause.message : "Le catalogue des rapports n’a pas pu être chargé.");
        setChargement(false);
      }
    });
    return () => { actif = false; };
  }, [chargerOptions]);

  useEffect(() => { void chargerDonnees(); }, [chargerDonnees]);

  function modifierFiltre(action: () => void): void {
    action();
    setDecalage(0);
  }

  async function exporter(): Promise<void> {
    setExportEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      const reponse = await fetch(`/api/rapports/${type}/export`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/octet-stream", "X-CSRF-Token": jetonCsrf },
        body: JSON.stringify({ format, filtres: filtresDansQuery(filtres), archiver }),
      });
      if (!reponse.ok) {
        const corps: unknown = await reponse.json().catch(() => null);
        const messageErreur = typeof corps === "object" && corps !== null && "erreur" in corps
          && typeof Reflect.get(corps, "erreur") === "string" ? Reflect.get(corps, "erreur") as string : "L’export du rapport a échoué.";
        throw new Error(messageErreur);
      }
      const fichier = await reponse.blob();
      const extension = format === "EXCEL" ? "xlsx" : format.toLowerCase();
      const id = reponse.headers.get("X-Report-Id") ?? "rapport";
      telechargerBlob(fichier, `sigad_${type.toLowerCase()}_${id}.${extension}`);
      const nombreLignes = reponse.headers.get("X-Report-Rows") ?? "0";
      setMessage(`${nombreFr.format(Number(nombreLignes))} ligne(s) exportée(s) en ${format}${archiver ? " et archivée(s)" : ""}.`);
      const pageArchives = await requeteApi<{ elements: Archive[] }>("/api/rapports/archives?limite=10&decalage=0");
      setArchives(pageArchives.elements);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le fichier n’a pas pu être généré.");
    } finally {
      setExportEnCours(false);
    }
  }

  async function telechargerArchive(archive: Archive): Promise<void> {
    setErreur(null);
    try {
      const reponse = await fetch(`/api/rapports/archives/${encodeURIComponent(archive.id)}`, { credentials: "same-origin" });
      if (!reponse.ok) throw new Error("Le fichier archivé n’est pas accessible.");
      const extension = archive.format_export === "EXCEL" ? "xlsx" : archive.format_export.toLowerCase();
      telechargerBlob(await reponse.blob(), `sigad_archive_${archive.id}.${extension}`);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le téléchargement de l’archive a échoué.");
    }
  }

  return (
    <section className="contenu-tableau module-rapports" aria-labelledby="titre-rapports">
      <div className="entete-module">
        <div><p className="surtitre">Pilotage et redevabilité</p><h1 id="titre-rapports">Rapports et tableaux de bord</h1>
          <p>Indicateurs issus des opérations, des bénéficiaires et des stocks enregistrés.</p></div>
        <span className="badge-perimetre">{provincial ? "Tableau provincial" : "Tableau national"}</span>
      </div>

      <section className="panneau-filtres" aria-label="Filtres des rapports">
        {!provincial && <label>Province
          <select aria-label="Province" value={provinceId} onChange={(event) => modifierFiltre(() => setProvinceId(event.target.value))}>
            <option value="">Toutes les provinces</option>
            {(options?.provinces ?? []).map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}
          </select>
        </label>}
        <label>Début de période<input aria-label="Début de période" type="date" value={dateDebut} onChange={(event) => modifierFiltre(() => setDateDebut(event.target.value))} /></label>
        <label>Fin de période<input aria-label="Fin de période" type="date" value={dateFin} onChange={(event) => modifierFiltre(() => setDateFin(event.target.value))} /></label>
        <label>Partenaire
          <select aria-label="Partenaire" value={partenaireId} onChange={(event) => modifierFiltre(() => setPartenaireId(event.target.value))}>
            <option value="">Tous les partenaires</option>
            {(options?.partenaires ?? []).map((partenaire) => <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>)}
          </select>
        </label>
        <label>Nature d’aide
          <select aria-label="Nature d’aide" value={natureAide} onChange={(event) => modifierFiltre(() => setNatureAide(event.target.value))}>
            <option value="">Toutes les natures</option>
            {(options?.natures_aide ?? []).map((nature) => <option key={nature} value={nature}>{nature}</option>)}
          </select>
        </label>
        <label>État / statut
          <select aria-label="État / statut" value={statut} onChange={(event) => modifierFiltre(() => setStatut(event.target.value))}>
            <option value="">Tous les statuts</option>
            {(options?.statuts ?? []).map((valeur) => <option key={valeur} value={valeur}>{valeur.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label>Localité validée
          <select aria-label="Localité validée" value={localiteId} onChange={(event) => modifierFiltre(() => setLocaliteId(event.target.value))}>
            <option value="">Toutes les localités</option>
            {(options?.localites ?? []).map((localite) => <option key={localite.id} value={localite.id}>{localite.nom}</option>)}
          </select>
        </label>
      </section>

      {erreur && <p className="message-erreur bandeau-erreur" role="alert">{erreur}</p>}
      {message && <p className="message-succes" role="status">{message}</p>}

      {tableau && <>
        <div className="grille-indicateurs-rapports" aria-label="Indicateurs du tableau de bord">
          {indicateursEtiquettes.map(({ cle, libelle }) => <article className="carte-indicateur-rapport" key={cle}>
            <span>{libelle}</span><strong>{nombreFr.format(tableau.indicateurs[cle])}</strong>
          </article>)}
        </div>
        <p className="note-perimetre">Les ménages uniques sont comptés une fois par période; les occurrences correspondent aux passages de distribution. Les personnes enregistrées et les personnes assistées sont présentées séparément.</p>
        <section className="panneau-tableau-rapport">
          <div className="entete-section-rapport"><div><h2>Évolution mensuelle</h2><p>{tableau.perimetre === "NATIONAL" ? "Consolidation nationale" : `Province ${options?.provinces.find((p) => p.id === tableau.province_id)?.nom ?? ""}`}</p></div>
            <span>Lecture D1 : {nombreFr.format(tableau.ressources_d1.lignes_lues)} lignes, {nombreFr.format(tableau.ressources_d1.duree_requetes_ms)} ms</span></div>
          <div className="tableau-defilement"><table><thead><tr><th>Mois</th><th>Distributions</th><th>Ménages uniques</th><th>Occurrences servies</th><th>Personnes assistées cumulées</th></tr></thead>
            <tbody>{tableau.evolution_mensuelle.map((ligne) => <tr key={ligne.mois}><td>{ligne.mois}</td><td>{nombreFr.format(ligne.distributions)}</td>
              <td>{nombreFr.format(ligne.menages_uniques)}</td><td>{nombreFr.format(ligne.occurrences_beneficiaires)}</td><td>{nombreFr.format(ligne.personnes_assistees_cumulees)}</td></tr>)}
              {!tableau.evolution_mensuelle.length && <tr><td colSpan={5}>Aucune opération sur cette période.</td></tr>}</tbody></table></div>
        </section>
        {!provincial && <section className="panneau-tableau-rapport"><div className="entete-section-rapport"><div><h2>Comparaison provinciale</h2><p>Indicateurs d’assistance par province.</p></div></div>
          <div className="tableau-defilement"><table><thead><tr><th>Province</th><th>Distributions</th><th>Ménages uniques</th><th>Ménages servis</th><th>Ménages partiels</th><th>Personnes assistées</th></tr></thead>
            <tbody>{tableau.provinces.map((ligne) => <tr key={ligne.province_id}><td>{ligne.province}</td><td>{nombreFr.format(ligne.distributions)}</td>
              <td>{nombreFr.format(ligne.menages_uniques)}</td><td>{nombreFr.format(ligne.menages_servis)}</td><td>{nombreFr.format(ligne.menages_partiels)}</td><td>{nombreFr.format(ligne.personnes_assistees)}</td></tr>)}</tbody></table></div>
        </section>}
      </>}

      <section className="panneau-tableau-rapport panneau-liste-rapports">
        <div className="entete-section-rapport"><div><h2>Générer un rapport</h2><p>{definition?.description ?? "Sélectionnez le rapport à consulter."}</p></div></div>
        <div className="formulaire-filtres-rapport">
          <label>Type de rapport<select aria-label="Type de rapport" value={type} onChange={(event) => { setType(event.target.value as TypeRapport); setDecalage(0); }}>
            {definitions.map((element) => <option key={element.type} value={element.type}>{element.intitule}</option>)}
          </select></label>
          {definition?.identifiantOperationRequis && <label>Distribution<select aria-label="Distribution" value={distributionId} onChange={(event) => modifierFiltre(() => setDistributionId(event.target.value))}>
            <option value="">Sélectionnez une distribution</option>
            {(options?.distributions ?? []).map((distribution) => <option key={distribution.id} value={distribution.id}>{distribution.reference} — {distribution.intitule}</option>)}
          </select></label>}
          <label>Format d’export<select aria-label="Format d’export" value={format} onChange={(event) => setFormat(event.target.value as "PDF" | "EXCEL" | "CSV")}>
            <option value="PDF">PDF</option><option value="EXCEL">Excel (XLSX)</option><option value="CSV">CSV</option>
          </select></label>
          <label className="case-archive"><input type="checkbox" checked={archiver} onChange={(event) => setArchiver(event.target.checked)} /> Archiver une copie dans SIGAD</label>
          <button className="bouton bouton-principal" type="button" onClick={() => void exporter()} disabled={exportEnCours || chargement}>
            {exportEnCours ? "Génération en cours…" : "Exporter le rapport"}
          </button>
        </div>
        <div className="entete-section-rapport entete-apercu"><div><h2>Aperçu des résultats</h2><p>{definition?.intitule}</p></div>
          {apercu && <span>Lecture D1 : {nombreFr.format(apercu.lignes_lues)} lignes, {nombreFr.format(apercu.duree_requetes_ms)} ms</span>}</div>
        {chargement ? <p className="etat-rapport">Chargement des indicateurs et des résultats…</p> : apercu ? <>
          <div className="tableau-defilement"><table><thead><tr>{apercu.definition.colonnes.map((colonne) => <th key={colonne.cle}>{colonne.libelle}</th>)}</tr></thead>
            <tbody>{apercu.elements.map((ligne, index) => <tr key={`${index}-${String(ligne.reference ?? ligne.code_menage ?? ligne.province ?? "ligne")}`}>
              {apercu.definition.colonnes.map((colonne) => <td key={colonne.cle}>{afficherValeur(ligne[colonne.cle] ?? null)}</td>)}
            </tr>)}{!apercu.elements.length && <tr><td colSpan={apercu.definition.colonnes.length}>Aucun résultat pour les filtres sélectionnés.</td></tr>}</tbody></table></div>
          <div className="pagination pagination-rapports"><span>Résultats {apercu.decalage + (apercu.elements.length ? 1 : 0)} à {apercu.decalage + apercu.elements.length}</span>
            <button className="bouton bouton-discret" type="button" disabled={!apercu.decalage || chargement} onClick={() => setDecalage(Math.max(0, decalage - pageSize))}>Précédent</button>
            <button className="bouton bouton-discret" type="button" disabled={!apercu.suite_disponible || chargement} onClick={() => setDecalage(decalage + pageSize)}>Suivant</button></div>
        </> : <p className="etat-rapport">Aucun résultat à afficher.</p>}
      </section>

      <section className="panneau-tableau-rapport"><div className="entete-section-rapport"><div><h2>Archives des rapports</h2><p>Les archives sont limitées à votre périmètre d’accès.</p></div></div>
        <div className="tableau-defilement"><table><thead><tr><th>Rapport</th><th>Périmètre</th><th>Format</th><th>Émis le</th><th>Fichier</th></tr></thead>
          <tbody>{archives.map((archive) => <tr key={archive.id}><td>{archive.intitule}</td><td>{archive.perimetre === "NATIONAL" ? "National" : archive.province_id}</td>
            <td>{archive.format_export}</td><td>{dateAffichee(archive.cree_le)}</td><td>{archive.archive_disponible
              ? <button className="bouton bouton-discret" type="button" onClick={() => void telechargerArchive(archive)}>Télécharger</button> : "Aucun fichier archivé"}</td></tr>)}
            {!archives.length && <tr><td colSpan={5}>Aucune archive disponible.</td></tr>}</tbody></table></div>
      </section>
    </section>
  );
}
