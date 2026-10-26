import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import type { ElementSelectionLocalisation, ProvinceTerritoriale } from "../../../../shared/types/territoire";
import { SelecteurLocalisationDynamique } from "../territoire/SelecteurLocalisationDynamique";
import { SIGADFilterBar } from "../administration/SIGADFilterBar";
import { SIGADFormGrid } from "../administration/SIGADFormGrid";
import { ErreurApi, requeteApi } from "../../services/api";
import { SIGADAlert, SIGADBadge, SIGADPagination, SIGADSidePanel, SIGADTab, SIGADTabsList } from "../ui";

interface TableauGestionBeneficiairesProps {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
}

interface PageApi<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface MenageApi {
  id: string;
  code_menage: string;
  province_id: string;
  departement_id: string;
  localite_id: string | null;
  nom_chef_menage: string;
  sexe_chef: "M" | "F";
  nombre_personnes: number;
  telephone: string | null;
  categorie_population: string;
  statut: "ACTIF" | "INACTIF" | "DOUBLON_SUSPECTE" | "ARCHIVE";
  statut_validation: "A_VERIFIER" | "VALIDE" | "REJETE";
  date_enregistrement: string;
}

interface PartenaireApi {
  id: string;
  code: string | null;
  nom: string;
  sigle: string | null;
  type_organisation: string;
  contact_email: string | null;
  contact_telephone: string | null;
  statut_validation: "PROPOSE" | "VALIDE" | "INACTIF";
  cree_le: string;
}

interface ListeApi {
  id: string;
  reference_liste: string;
  intitule: string;
  province_id: string;
  nombre_menages_cibles: number;
  nombre_personnes_cibles: number;
  statut: "BROUILLON" | "PRETE" | "VERROUILLEE";
  cree_le: string;
}

interface CategoriePopulationApi {
  id: string;
  code: string;
  libelle: string;
}

interface ReferentielsGestion {
  categories_population: CategoriePopulationApi[];
  vulnerabilites: { code: string; libelle: string; niveau_priorite: number }[];
}

type VueGestion = "menages" | "partenaires" | "listes";

const TAILLE_PAGE = 20;
const ROLES_PARTENAIRES = [
  ["BAILLEUR_DE_FONDS", "Bailleur de fonds"],
  ["DONATEUR", "Donateur"],
  ["FOURNISSEUR", "Fournisseur"],
  ["PARTENAIRE_EXECUTION", "Partenaire d’exécution"],
  ["TRANSPORTEUR", "Transporteur"],
  ["GESTIONNAIRE_SITE", "Gestionnaire de site"],
] as const;

function messageErreur(cause: unknown, valeurParDefaut: string): string {
  return cause instanceof ErreurApi || cause instanceof Error ? cause.message : valeurParDefaut;
}

function dateAujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

function nomProvince(provinceId: string, provinces: readonly ProvinceTerritoriale[]): string {
  return provinces.find((province) => province.id === provinceId)?.nom ?? provinceId;
}

export function TableauGestionBeneficiaires({ utilisateur, jetonCsrf }: TableauGestionBeneficiairesProps) {
  const lireVueDepuisUrl = useCallback((): VueGestion => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("vue");
      if (param === "menages" || param === "partenaires" || param === "listes") {
        return param;
      }
    }
    return "menages";
  }, []);

  const [vue, definirVue] = useState<VueGestion>(lireVueDepuisUrl);

  useEffect(() => {
    const sync = () => {
      const nouvelleVue = lireVueDepuisUrl();
      definirVue((actuelle) => (actuelle !== nouvelleVue ? nouvelleVue : actuelle));
    };
    window.addEventListener("popstate", sync);
    const interval = window.setInterval(sync, 250);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(interval);
    };
  }, [lireVueDepuisUrl]);
  const [decalage, definirDecalage] = useState(0);
  const [menages, definirMenages] = useState<MenageApi[]>([]);
  const [partenaires, definirPartenaires] = useState<PartenaireApi[]>([]);
  const [listes, definirListes] = useState<ListeApi[]>([]);
  const [total, definirTotal] = useState(0);
  const [chargement, definirChargement] = useState(true);
  const [envoi, definirEnvoi] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [message, definirMessage] = useState<string | null>(null);
  const [categories, definirCategories] = useState<CategoriePopulationApi[]>([]);
  const [provinces, definirProvinces] = useState<ProvinceTerritoriale[]>([]);
  const [selectionLocalisation, definirSelectionLocalisation] = useState<ElementSelectionLocalisation | null>(null);
  const [fichierImport, definirFichierImport] = useState<File | null>(null);
  const cleImportFichier = useRef<{ signature: string; cle: string } | null>(null);
  const cleCreationMenage = useRef<{ signature: string; cle: string } | null>(null);
  const [partenaireNom, definirPartenaireNom] = useState("");
  const [partenaireSigle, definirPartenaireSigle] = useState("");
  const [partenaireType, definirPartenaireType] = useState("ONG nationale");
  const [partenaireEmail, definirPartenaireEmail] = useState("");
  const [partenaireTelephone, definirPartenaireTelephone] = useState("");
  const [rolesPartenaire, definirRolesPartenaire] = useState<string[]>(["PARTENAIRE_EXECUTION"]);
  const [nomChef, definirNomChef] = useState("");
  const [sexeChef, definirSexeChef] = useState<"F" | "M">("F");
  const [nombrePersonnes, definirNombrePersonnes] = useState(1);
  const [telephoneMenage, definirTelephoneMenage] = useState("");
  const [categoriePopulationId, definirCategoriePopulationId] = useState("");
  const [dateEnregistrement, definirDateEnregistrement] = useState(dateAujourdhui());
  const [intituleListe, definirIntituleListe] = useState("");
  const [provinceListe, definirProvinceListe] = useState(utilisateur.province_id ?? "");
  const [listeChoisie, definirListeChoisie] = useState("");
  const [menagesSelectionnes, definirMenagesSelectionnes] = useState<string[]>([]);
  const [filtreValidation, definirFiltreValidation] = useState("");
  const [rechercheFiltre, definirRechercheFiltre] = useState("");
  const [menageDecisionId, definirMenageDecisionId] = useState<string | null>(null);
  const [motifValidation, definirMotifValidation] = useState("");

  const chargerReferentiels = useCallback(async (): Promise<void> => {
    try {
      const [reponse, pageProvinces] = await Promise.all([
        requeteApi<ReferentielsGestion>("/api/gestion/referentiels"),
        requeteApi<PageApi<ProvinceTerritoriale>>("/api/territoire/provinces?limite=100&decalage=0"),
      ]);
      definirCategories(reponse.categories_population);
      definirProvinces(pageProvinces.elements);
      if (!categoriePopulationId && reponse.categories_population[0]) {
        definirCategoriePopulationId(reponse.categories_population[0].id);
      }
      if (!listeChoisie && listes[0]) definirListeChoisie(listes[0].id);
    } catch (cause) {
      definirErreur(messageErreur(cause, "Les référentiels n’ont pas pu être chargés."));
    }
  }, [categoriePopulationId, listeChoisie, listes]);

  const chargerVue = useCallback(async (): Promise<void> => {
    definirChargement(true);
    definirErreur(null);
    try {
      const cheminPage = `limite=${TAILLE_PAGE}&decalage=${decalage}`;
      const filtreRecherche = rechercheFiltre.trim() ? `&recherche=${encodeURIComponent(rechercheFiltre.trim())}` : "";
      if (vue === "menages") {
        const filtre = filtreValidation ? `&statut_validation=${encodeURIComponent(filtreValidation)}` : "";
        const page = await requeteApi<PageApi<MenageApi>>(`/api/gestion/menages?${cheminPage}${filtre}${filtreRecherche}`);
        definirMenages(page.elements);
        definirTotal(page.total);
      } else if (vue === "partenaires") {
        const page = await requeteApi<PageApi<PartenaireApi>>(`/api/gestion/partenaires?${cheminPage}${filtreRecherche}`);
        definirPartenaires(page.elements);
        definirTotal(page.total);
      } else {
        const [pageListes, pageMenages] = await Promise.all([
          requeteApi<PageApi<ListeApi>>(`/api/gestion/listes-beneficiaires?${cheminPage}`),
          requeteApi<PageApi<MenageApi>>(`/api/gestion/menages?limite=${TAILLE_PAGE}&decalage=0&statut=ACTIF`),
        ]);
        definirListes(pageListes.elements);
        definirMenages(pageMenages.elements);
        definirTotal(pageListes.total);
        if (pageListes.elements[0] && !pageListes.elements.some((liste) => liste.id === listeChoisie)) {
          definirListeChoisie(pageListes.elements[0].id);
        }
      }
    } catch (cause) {
      definirErreur(messageErreur(cause, "Les données de gestion n’ont pas pu être chargées."));
    } finally {
      definirChargement(false);
    }
  }, [decalage, filtreValidation, listeChoisie, rechercheFiltre, vue]);

  useEffect(() => { void chargerReferentiels(); }, [chargerReferentiels]);
  useEffect(() => { void chargerVue(); }, [chargerVue, jetonCsrf]);

  function changerVue(nouvelleVue: VueGestion): void {
    definirVue(nouvelleVue);
    definirDecalage(0);
    definirErreur(null);
    definirMessage(null);
  }

  async function creerPartenaire(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    definirErreur(null);
    definirMessage(null);
    definirEnvoi(true);
    try {
      const reponse = await requeteApi<{ statut_validation: string }>("/api/gestion/partenaires", {
        methode: "POST",
        jetonCsrf,
        corps: {
          nom: partenaireNom,
          sigle: partenaireSigle || null,
          type_organisation: partenaireType,
          contact_email: partenaireEmail || null,
          contact_telephone: partenaireTelephone || null,
          roles: rolesPartenaire,
        },
      });
      definirMessage(reponse.statut_validation === "PROPOSE"
        ? "La proposition de partenaire a été transmise à l’administration centrale."
        : "Le partenaire a été enregistré dans le référentiel.");
      definirPartenaireNom(""); definirPartenaireSigle(""); definirPartenaireEmail(""); definirPartenaireTelephone("");
      await chargerVue();
    } catch (cause) {
      definirErreur(messageErreur(cause, "Le partenaire n’a pas pu être enregistré."));
    } finally {
      definirEnvoi(false);
    }
  }

  async function importerFichierMenages(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (!fichierImport) {
      definirErreur("Sélectionnez un fichier CSV ou un classeur Excel à importer.");
      return;
    }
    definirErreur(null); definirMessage(null); definirEnvoi(true);
    const formulaire = new FormData();
    formulaire.append("fichier", fichierImport);
    const signature = `${fichierImport.name}\u0000${fichierImport.size}\u0000${fichierImport.lastModified}`;
    if (cleImportFichier.current?.signature !== signature) {
      cleImportFichier.current = { signature, cle: `sigad-${crypto.randomUUID()}` };
    }
    try {
      const resultat = await requeteApi<{ nombre_menages: number; doublons_signales: number }>(
        "/api/gestion/menages/importations",
        { methode: "POST", jetonCsrf, cleIdempotence: cleImportFichier.current.cle, corps: formulaire },
      );
      definirMessage(`${resultat.nombre_menages} ménage(s) importé(s), ${resultat.doublons_signales} doublon(s) possible(s) soumis à vérification.`);
      cleImportFichier.current = null;
      definirFichierImport(null);
      evenement.currentTarget.reset();
      await chargerVue();
    } catch (cause) {
      definirErreur(messageErreur(cause, "Le fichier d’importation n’a pas pu être traité."));
    } finally {
      definirEnvoi(false);
    }
  }

  async function creerMenage(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    definirErreur(null); definirMessage(null);
    if (!selectionLocalisation) {
      definirErreur("Sélectionnez une localité ou un site humanitaire validé.");
      return;
    }
    definirEnvoi(true);
    const localisation = selectionLocalisation;
    const corps: Record<string, unknown> = {
      departement_id: localisation.departement_id,
      sous_prefecture_id: localisation.sous_prefecture_id,
      commune_id: localisation.commune_id,
      localite_id: localisation.localite_id,
      arrondissement_id: localisation.arrondissement_id,
      quartier_id: localisation.quartier_id,
      carre_id: localisation.carre_id,
      site_humanitaire_id: localisation.site_humanitaire_id,
      nom_chef_menage: nomChef,
      sexe_chef: sexeChef,
      nombre_personnes: nombrePersonnes,
      telephone: telephoneMenage || null,
      categorie_population_id: categoriePopulationId,
      criteres_vulnerabilite: [],
      date_enregistrement: dateEnregistrement,
      membres: [],
    };
    if (utilisateur.role !== "DELEGUE_PROVINCIAL") corps.province_id = localisation.province_id;
    const signature = JSON.stringify(corps);
    if (cleCreationMenage.current?.signature !== signature) {
      cleCreationMenage.current = { signature, cle: `sigad-${crypto.randomUUID()}` };
    }
    try {
      await requeteApi<{ nombre_menages: number }>("/api/gestion/menages", {
        methode: "POST", jetonCsrf, cleIdempotence: cleCreationMenage.current.cle, corps,
      });
      cleCreationMenage.current = null;
      definirMessage("Le ménage a été enregistré. Tout rapprochement potentiel reste soumis à une vérification humaine.");
      definirNomChef(""); definirTelephoneMenage(""); definirNombrePersonnes(1); definirSelectionLocalisation(null);
      await chargerVue();
    } catch (cause) {
      definirErreur(messageErreur(cause, "Le ménage n’a pas pu être enregistré."));
    } finally {
      definirEnvoi(false);
    }
  }

  async function deciderValidationMenage(menageId: string, decision: "VALIDER" | "REFUSER"): Promise<void> {
    if (utilisateur.role !== "ADMIN_CENTRAL") {
      definirErreur("Cette décision est réservée à l’administration centrale.");
      return;
    }
    if (motifValidation.trim().length < 8) {
      definirErreur("Une justification d’au moins huit caractères est obligatoire.");
      return;
    }
    definirEnvoi(true); definirErreur(null); definirMessage(null);
    try {
      const resultat = await requeteApi<{ statut_validation: string }>(`/api/gestion/menages/${encodeURIComponent(menageId)}/validation`, {
        methode: "POST", jetonCsrf, corps: { decision, observations: motifValidation.trim() },
      });
      definirMessage(resultat.statut_validation === "VALIDE"
        ? "Le ménage a été validé séparément et peut être pris en compte selon les règles d’éligibilité."
        : "Le ménage a été refusé et reste inactif.");
      definirMenageDecisionId(null); definirMotifValidation("");
      await chargerVue();
    } catch (cause) {
      definirErreur(messageErreur(cause, "La décision de validation n’a pas pu être enregistrée."));
    } finally {
      definirEnvoi(false);
    }
  }

  async function creerListe(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    definirErreur(null); definirMessage(null); definirEnvoi(true);
    const corps: Record<string, string> = { intitule: intituleListe };
    if (utilisateur.role !== "DELEGUE_PROVINCIAL") corps.province_id = provinceListe;
    try {
      const liste = await requeteApi<{ id: string; reference_liste: string }>("/api/gestion/listes-beneficiaires", {
        methode: "POST", jetonCsrf, corps,
      });
      definirMessage(`La liste ${liste.reference_liste} a été créée en brouillon.`);
      definirIntituleListe(""); definirListeChoisie(liste.id);
      await chargerVue();
    } catch (cause) {
      definirErreur(messageErreur(cause, "La liste bénéficiaire n’a pas pu être créée."));
    } finally {
      definirEnvoi(false);
    }
  }

  async function inscrireMenages(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (!listeChoisie || menagesSelectionnes.length === 0) {
      definirErreur("Choisissez une liste et au moins un ménage actif.");
      return;
    }
    definirErreur(null); definirMessage(null); definirEnvoi(true);
    try {
      const reponse = await requeteApi<{ nombre_menages: number }>(
        `/api/gestion/listes-beneficiaires/${encodeURIComponent(listeChoisie)}/inscriptions`,
        { methode: "POST", jetonCsrf, corps: { menage_ids: menagesSelectionnes } },
      );
      definirMessage(`${reponse.nombre_menages} ménage(s) ajouté(s) à la liste.`);
      definirMenagesSelectionnes([]);
      await chargerVue();
    } catch (cause) {
      definirErreur(messageErreur(cause, "Les ménages n’ont pas pu être ajoutés à la liste."));
    } finally {
      definirEnvoi(false);
    }
  }

  async function telechargerListeBeneficiaires(): Promise<void> {
    if (!listeChoisie) return;
    definirErreur(null); definirMessage(null); definirEnvoi(true);
    try {
      const reponse = await fetch(`/api/gestion/listes-beneficiaires/${encodeURIComponent(listeChoisie)}/export`, {
        credentials: "same-origin",
        headers: { Accept: "text/csv" },
      });
      if (!reponse.ok) {
        let erreurApi = "La liste bénéficiaire n’a pas pu être exportée.";
        try {
          const donnees: unknown = await reponse.json();
          if (typeof donnees === "object" && donnees !== null && "erreur" in donnees && typeof Reflect.get(donnees, "erreur") === "string") {
            erreurApi = Reflect.get(donnees, "erreur") as string;
          }
        } catch {
          erreurApi = "La réponse d’exportation est illisible.";
        }
        throw new Error(erreurApi);
      }
      const fichier = await reponse.blob();
      const adresse = URL.createObjectURL(fichier);
      const lien = document.createElement("a");
      lien.href = adresse;
      lien.download = reponse.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/u)?.[1] ?? "liste-beneficiaires.csv";
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.setTimeout(() => URL.revokeObjectURL(adresse), 0);
      definirMessage("La liste bénéficiaire a été exportée en français.");
    } catch (cause) {
      definirErreur(messageErreur(cause, "La liste bénéficiaire n’a pas pu être exportée."));
    } finally {
      definirEnvoi(false);
    }
  }

  function definirCocheMenage(id: string, coche: boolean): void {
    definirMenagesSelectionnes((courants) => coche
      ? [...new Set([...courants, id])]
      : courants.filter((courant) => courant !== id));
  }

  return (
    <div className="contenu-tableau">
      <div className="sigad-compact-meta"><SIGADBadge variant="neutral">{utilisateur.role === "DELEGUE_PROVINCIAL" ? "Délégation provinciale" : "Administration centrale"}</SIGADBadge></div>
      <div style={{ marginBottom: "1.5rem" }}>
        <SIGADTabsList ariaLabel="Modules de gestion des bénéficiaires">
          <SIGADTab active={vue === "menages"} onClick={() => changerVue("menages")}>Ménages</SIGADTab>
          <SIGADTab active={vue === "partenaires"} onClick={() => changerVue("partenaires")}>Partenaires</SIGADTab>
          <SIGADTab active={vue === "listes"} onClick={() => changerVue("listes")}>Listes bénéficiaires</SIGADTab>
        </SIGADTabsList>
      </div>
      {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
      {message && <SIGADAlert type="success" message={message} style={{ marginBottom: "1rem" }} />}

      {vue === "menages" && <>
        <section className="carte-section" aria-labelledby="titre-menages">
          <div className="titre-section"><div><h2 id="titre-menages">Registre des ménages</h2><p>Les résultats sont limités au périmètre autorisé par votre session.</p></div><span className="compteur">{total} ménages</span></div>
          <SIGADFilterBar ariaLabel="Filtres des ménages" fieldsClassName="barre-filtres-stock">
            <label className="champ-territorial">Recherche<input aria-label="Recherche des ménages" maxLength={120} value={rechercheFiltre} onChange={(e) => { definirDecalage(0); definirRechercheFiltre(e.currentTarget.value); }} placeholder="Code ou nom du chef de ménage" /></label>
            <label className="champ-territorial filtre-validation-menages">État de validation<select id="filtre-validation-menages" value={filtreValidation} onChange={(e) => { definirDecalage(0); definirFiltreValidation(e.currentTarget.value); }}><option value="">Tous les états</option><option value="A_VERIFIER">À vérifier</option><option value="VALIDE">Validés</option><option value="REJETE">Refusés</option></select></label>
          </SIGADFilterBar>
          <div className="tableau-defilement"><table>
            <thead><tr><th>Référence</th><th>Chef de ménage</th><th>Province</th><th>Personnes</th><th>Téléphone</th><th>Catégorie</th><th>Statut</th><th>Validation</th><th>Date d’enregistrement</th>{utilisateur.role === "ADMIN_CENTRAL" && <th>Décision centrale</th>}</tr></thead>
            <tbody>{menages.map((menage) => <tr key={menage.id}>
              <td className="texte-gras code-reference">{menage.code_menage}</td><td>{menage.nom_chef_menage}</td>
              <td>{nomProvince(menage.province_id, provinces)}</td><td>{menage.nombre_personnes}</td><td>{menage.telephone ?? "—"}</td>
              <td>{menage.categorie_population}</td><td><span className="pastille-statut statut-information">{menage.statut.replaceAll("_", " ")}</span></td>
              <td><span className="pastille-statut statut-information">{menage.statut_validation.replaceAll("_", " ")}</span></td><td>{menage.date_enregistrement}</td>
              {utilisateur.role === "ADMIN_CENTRAL" && <td>{menage.statut === "INACTIF" && menage.statut_validation === "A_VERIFIER" ? (
                <>
                  <button className="bouton bouton-discret" onClick={() => definirMenageDecisionId(menage.id)} type="button">Examiner</button>
                  <SIGADSidePanel
                    open={menageDecisionId === menage.id}
                    onClose={() => { definirMenageDecisionId(null); definirMotifValidation(""); }}
                    title={`Examen du ménage ${menage.code_menage}`}
                    subtitle={`Chef de ménage : ${menage.nom_chef_menage} · ${menage.nombre_personnes} personne(s)`}
                    size="standard"
                    isDirty={Boolean(motifValidation.trim())}
                  >
                    <form className="formulaire-decision-menage" onSubmit={(e) => { e.preventDefault(); void deciderValidationMenage(menage.id, "VALIDER"); }} style={{ display: "grid", gap: "1rem" }}>
                      <label htmlFor={`motif-validation-${menage.id}`} style={{ fontWeight: 600, fontSize: "0.875rem" }}>Motif de décision pour {menage.code_menage}</label>
                      <textarea id={`motif-validation-${menage.id}`} minLength={8} maxLength={1000} required value={motifValidation} onChange={(e) => definirMotifValidation(e.currentTarget.value)} placeholder="Justification de la décision (8 caractères minimum)" rows={4} style={{ width: "100%", padding: "0.65rem", borderRadius: "var(--sigad-radius-md)", border: "1px solid var(--sigad-border-strong)" }} />
                      <div className="actions-ligne" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button className="bouton bouton-discret" disabled={envoi} onClick={() => { definirMenageDecisionId(null); definirMotifValidation(""); }} type="button">Annuler</button>
                        <button className="bouton bouton-discret" disabled={envoi || motifValidation.trim().length < 8} onClick={() => { void deciderValidationMenage(menage.id, "REFUSER"); }} type="button">Refuser</button>
                        <button className="bouton bouton-principal" disabled={envoi || motifValidation.trim().length < 8} type="submit">Valider</button>
                      </div>
                    </form>
                  </SIGADSidePanel>
                </>
              ) : "—"}</td>}
            </tr>)}{!chargement && menages.length === 0 && <tr><td className="cellule-vide" colSpan={utilisateur.role === "ADMIN_CENTRAL" ? 10 : 9}>Aucun ménage à afficher pour ce périmètre.</td></tr>}</tbody>
          </table></div>
          <SIGADPagination total={total} decalage={decalage} taillePage={TAILLE_PAGE} chargement={chargement} onPageChange={definirDecalage} />
        </section>
        <section className="carte-section" aria-labelledby="titre-creation-menage">
          <div className="titre-section"><div><h2 id="titre-creation-menage">Enregistrer un ménage</h2><p>Les relations territoriales sont vérifiées côté serveur et par les contraintes D1.</p></div></div>
          <SelecteurLocalisationDynamique utilisateur={utilisateur} jetonCsrf={jetonCsrf} onChange={definirSelectionLocalisation} />
          <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerMenage(evenement); }}>
            <div className="champ-territorial"><label htmlFor="nom-chef-menage">Nom du chef de ménage *</label><input id="nom-chef-menage" minLength={2} maxLength={160} required value={nomChef} onChange={(e) => definirNomChef(e.currentTarget.value)} /></div>
            <div className="champ-territorial"><label htmlFor="sexe-chef-menage">Sexe du chef de ménage *</label><select id="sexe-chef-menage" value={sexeChef} onChange={(e) => definirSexeChef(e.currentTarget.value as "F" | "M")}><option value="F">Féminin</option><option value="M">Masculin</option></select></div>
            <div className="champ-territorial"><label htmlFor="nombre-personnes-menage">Nombre de personnes *</label><input id="nombre-personnes-menage" type="number" min={1} max={250} required value={nombrePersonnes} onChange={(e) => definirNombrePersonnes(Number(e.currentTarget.value))} /></div>
            <div className="champ-territorial"><label htmlFor="telephone-menage">Téléphone</label><input id="telephone-menage" type="tel" maxLength={32} value={telephoneMenage} onChange={(e) => definirTelephoneMenage(e.currentTarget.value)} /></div>
            <div className="champ-territorial"><label htmlFor="categorie-population">Catégorie de population *</label><select id="categorie-population" required value={categoriePopulationId} onChange={(e) => definirCategoriePopulationId(e.currentTarget.value)}><option value="">Sélectionner une catégorie</option>{categories.map((categorie) => <option key={categorie.id} value={categorie.id}>{categorie.libelle}</option>)}</select></div>
            <div className="champ-territorial"><label htmlFor="date-enregistrement-menage">Date d’enregistrement *</label><input id="date-enregistrement-menage" type="date" required value={dateEnregistrement} onChange={(e) => definirDateEnregistrement(e.currentTarget.value)} /></div>
            <button className="bouton bouton-principal" disabled={envoi || !selectionLocalisation} type="submit">Enregistrer le ménage</button>
          </SIGADFormGrid>
        </section>
        <section className="carte-section" aria-labelledby="titre-import-menages">
          <div className="titre-section"><div><h2 id="titre-import-menages">Importer des ménages</h2><p>Formats CSV UTF-8 ou Excel (.xlsx), 500 lignes au maximum et 1 Mo. Seul le premier onglet Excel est lu; les formules doivent être converties en valeurs. Les doublons restent soumis à vérification.</p></div></div>
          <form className="formulaire-import" onSubmit={(evenement) => { void importerFichierMenages(evenement); }}>
            <label htmlFor="fichier-menages-import">Fichier CSV ou Excel</label><input id="fichier-menages-import" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(e) => { cleImportFichier.current = null; definirFichierImport(e.currentTarget.files?.[0] ?? null); }} />
            <p className="aide-saisie">Colonnes obligatoires : departement_id, nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_code, date_enregistrement. Les dates Excel numériques sont converties.</p>
            <button className="bouton bouton-principal" disabled={envoi || !fichierImport} type="submit">Importer le fichier</button>
          </form>
        </section>
      </>}

      {vue === "partenaires" && <>
        <section className="carte-section" aria-labelledby="titre-partenaires">
          <div className="titre-section"><div><h2 id="titre-partenaires">Référentiel des partenaires</h2><p>Les propositions provinciales restent en attente de validation centrale.</p></div><span className="compteur">{total} partenaires visibles</span></div>
          <SIGADFilterBar ariaLabel="Filtres des partenaires" fieldsClassName="barre-filtres-stock">
            <label className="champ-territorial">Recherche<input aria-label="Recherche des partenaires" maxLength={120} value={rechercheFiltre} onChange={(e) => { definirDecalage(0); definirRechercheFiltre(e.currentTarget.value); }} placeholder="Nom, sigle ou contact" /></label>
          </SIGADFilterBar>
          <div className="tableau-defilement"><table>
            <thead><tr><th>Partenaire</th><th>Sigle</th><th>Type d’organisation</th><th>Courriel</th><th>Téléphone</th><th>Validation</th></tr></thead>
            <tbody>{partenaires.map((partenaire) => <tr key={partenaire.id}><td className="texte-gras">{partenaire.nom}</td><td>{partenaire.sigle ?? "—"}</td><td>{partenaire.type_organisation}</td><td>{partenaire.contact_email ?? "—"}</td><td>{partenaire.contact_telephone ?? "—"}</td><td><span className="pastille-statut statut-information">{partenaire.statut_validation}</span></td></tr>)}
              {!chargement && partenaires.length === 0 && <tr><td className="cellule-vide" colSpan={6}>Aucun partenaire validé ou proposé pour ce compte.</td></tr>}</tbody>
          </table></div>
          <SIGADPagination total={total} decalage={decalage} taillePage={TAILLE_PAGE} chargement={chargement} onPageChange={definirDecalage} />
        </section>
        <section className="carte-section" aria-labelledby="titre-creer-partenaire">
          <div className="titre-section"><div><h2 id="titre-creer-partenaire">Enregistrer ou proposer un partenaire</h2><p>Une délégation provinciale propose un partenaire; l’administration centrale statue.</p></div></div>
          <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerPartenaire(evenement); }}>
            <div className="champ-territorial"><label htmlFor="partenaire-nom">Nom *</label><input id="partenaire-nom" minLength={2} maxLength={160} required value={partenaireNom} onChange={(e) => definirPartenaireNom(e.currentTarget.value)} /></div>
            <div className="champ-territorial"><label htmlFor="partenaire-sigle">Sigle</label><input id="partenaire-sigle" maxLength={40} value={partenaireSigle} onChange={(e) => definirPartenaireSigle(e.currentTarget.value)} /></div>
            <div className="champ-territorial"><label htmlFor="partenaire-type">Type d’organisation *</label><input id="partenaire-type" minLength={2} maxLength={100} required value={partenaireType} onChange={(e) => definirPartenaireType(e.currentTarget.value)} /></div>
            <div className="champ-territorial"><label htmlFor="partenaire-courriel">Courriel</label><input id="partenaire-courriel" type="email" maxLength={254} value={partenaireEmail} onChange={(e) => definirPartenaireEmail(e.currentTarget.value)} /></div>
            <div className="champ-territorial"><label htmlFor="partenaire-telephone">Téléphone</label><input id="partenaire-telephone" type="tel" maxLength={32} value={partenaireTelephone} onChange={(e) => definirPartenaireTelephone(e.currentTarget.value)} /></div>
            <fieldset className="choix-roles"><legend>Rôles du partenaire *</legend>{ROLES_PARTENAIRES.map(([code, libelle]) => <label key={code}><input type="checkbox" checked={rolesPartenaire.includes(code)} onChange={(e) => { const coche = e.currentTarget.checked; definirRolesPartenaire((roles) => coche ? [...new Set([...roles, code])] : roles.filter((role) => role !== code)); }} />{libelle}</label>)}</fieldset>
            <button className="bouton bouton-principal" disabled={envoi || rolesPartenaire.length === 0} type="submit">Enregistrer le partenaire</button>
          </SIGADFormGrid>
        </section>
      </>}

      {vue === "listes" && <>
        <section className="carte-section" aria-labelledby="titre-listes">
          <div className="titre-section"><div><h2 id="titre-listes">Listes bénéficiaires</h2><p>Une liste regroupe uniquement les ménages actifs de sa province.</p></div><span className="compteur">{total} listes</span></div>
          <div className="tableau-defilement"><table>
            <thead><tr><th>Référence</th><th>Intitulé</th><th>Province</th><th>Ménages ciblés</th><th>Personnes ciblées</th><th>Statut</th><th>Création</th></tr></thead>
            <tbody>{listes.map((liste) => <tr key={liste.id}><td className="texte-gras code-reference">{liste.reference_liste}</td><td>{liste.intitule}</td><td>{nomProvince(liste.province_id, provinces)}</td><td>{liste.nombre_menages_cibles}</td><td>{liste.nombre_personnes_cibles}</td><td><span className="pastille-statut statut-information">{liste.statut}</span></td><td>{liste.cree_le}</td></tr>)}
              {!chargement && listes.length === 0 && <tr><td className="cellule-vide" colSpan={7}>Aucune liste bénéficiaire pour ce périmètre.</td></tr>}</tbody>
          </table></div>
          <SIGADPagination total={total} decalage={decalage} taillePage={TAILLE_PAGE} chargement={chargement} onPageChange={definirDecalage} />
        </section>
        <section className="carte-section" aria-labelledby="titre-creer-liste">
          <div className="titre-section"><div><h2 id="titre-creer-liste">Créer une liste</h2><p>La liste est initialisée en brouillon et rattachée à une seule province.</p></div></div>
          <SIGADFormGrid className="formulaire-gestion" onSubmit={(evenement) => { void creerListe(evenement); }}>
            {utilisateur.role !== "DELEGUE_PROVINCIAL" && <div className="champ-territorial"><label htmlFor="province-liste">Province *</label><select id="province-liste" required value={provinceListe} onChange={(e) => definirProvinceListe(e.currentTarget.value)}><option value="">Sélectionner une province</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}</select></div>}
            <div className="champ-territorial"><label htmlFor="intitule-liste">Intitulé *</label><input id="intitule-liste" minLength={3} maxLength={180} required value={intituleListe} onChange={(e) => definirIntituleListe(e.currentTarget.value)} /></div>
            <button className="bouton bouton-principal" disabled={envoi || (utilisateur.role !== "DELEGUE_PROVINCIAL" && !provinceListe)} type="submit">Créer la liste bénéficiaire</button>
          </SIGADFormGrid>
        </section>
        <section className="carte-section" aria-labelledby="titre-inscrire-menages">
          <div className="titre-section"><div><h2 id="titre-inscrire-menages">Ajouter des ménages actifs</h2><p>Sélectionnez une liste, puis les ménages de la page courante de votre province.</p></div></div>
          <form onSubmit={(evenement) => { void inscrireMenages(evenement); }}>
            <div className="champ-territorial"><label htmlFor="liste-selectionnee">Liste bénéficiaire</label><select id="liste-selectionnee" value={listeChoisie} onChange={(e) => definirListeChoisie(e.currentTarget.value)}><option value="">Sélectionner une liste</option>{listes.map((liste) => <option key={liste.id} value={liste.id}>{liste.reference_liste} · {liste.intitule}</option>)}</select></div>
            <button className="bouton bouton-discret" disabled={envoi || !listeChoisie} onClick={() => { void telechargerListeBeneficiaires(); }} type="button">Télécharger la liste en CSV</button>
            <div className="tableau-defilement"><table>
              <thead><tr><th>Sélection</th><th>Référence</th><th>Chef de ménage</th><th>Localité</th><th>Effectif</th><th>Statut</th></tr></thead>
              <tbody>{menages.filter((menage) => menage.statut === "ACTIF").map((menage) => <tr key={menage.id}>
                <td><input aria-label={`Sélectionner le ménage ${menage.code_menage}`} type="checkbox" checked={menagesSelectionnes.includes(menage.id)} onChange={(e) => definirCocheMenage(menage.id, e.currentTarget.checked)} /></td>
                <td className="code-reference">{menage.code_menage}</td><td>{menage.nom_chef_menage}</td><td>{menage.localite_id ?? menage.departement_id}</td><td>{menage.nombre_personnes}</td><td>{menage.statut}</td>
              </tr>)}{!chargement && menages.filter((menage) => menage.statut === "ACTIF").length === 0 && <tr><td className="cellule-vide" colSpan={6}>Aucun ménage actif à inscrire pour ce périmètre.</td></tr>}</tbody>
            </table></div>
            <p className="texte-secondaire selection-compteur">{menagesSelectionnes.length} ménage(s) sélectionné(s)</p>
            <button className="bouton bouton-principal" disabled={envoi || !listeChoisie || menagesSelectionnes.length === 0} type="submit">Ajouter à la liste</button>
          </form>
        </section>
      </>}
      {chargement && <p className="texte-secondaire" role="status">Chargement des données…</p>}
    </div>
  );
}
