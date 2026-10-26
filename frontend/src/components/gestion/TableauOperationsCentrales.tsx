import { useCallback, useEffect, useMemo, useState, type FormEvent, type JSX } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { PROVINCES_TCHADIENNES } from "../../../../shared/constantes/provinces";
import type {
  ConsolidationNationaleOperation,
  DetailOperationCentrale,
  OperationCentrale,
  StatutOperationCentrale,
} from "../../../../shared/types/operations-centrales";
import { SIGADFilterBar } from "../administration/SIGADFilterBar";
import { SIGADFormGrid } from "../administration/SIGADFormGrid";
import { ErreurApi, requeteApi } from "../../services/api";
import {
  SIGADAlert,
  SIGADBadge,
  SIGADButton,
  SIGADPagination,
  SIGADTab,
  SIGADTabsList,
} from "../ui";

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

const TAILLE_PAGE = 20;

const LIBELLES_STATUT: Record<StatutOperationCentrale, string> = {
  BROUILLON: "Brouillon",
  SOUMISE_A_APPROBATION: "Soumise à approbation",
  APPROUVEE: "Approuvée (prête pour ouverture)",
  OUVERTE: "Ouverte aux provinces",
  EN_COURS: "En cours d’exécution",
  EN_CONSOLIDATION: "En consolidation",
  CLOTUREE: "Clôturée",
  ANNULEE: "Annulée",
};

function classStatut(statut: StatutOperationCentrale): string {
  switch (statut) {
    case "CLOTUREE":
    case "APPROUVEE":
      return "statut-distribution-reussi";
    case "OUVERTE":
    case "EN_COURS":
    case "EN_CONSOLIDATION":
      return "statut-distribution-attente";
    case "ANNULEE":
      return "statut-distribution-alerte";
    default:
      return "statut-distribution-neutre";
  }
}

function cleIdempotence(prefixe: string): string {
  return `${prefixe}-${crypto.randomUUID()}`;
}

export function TableauOperationsCentrales({ utilisateur, jetonCsrf }: Props): JSX.Element {
  const estAdmin = utilisateur.role === "ADMIN_CENTRAL";
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  const [ecran, definirEcran] = useState<"liste" | "formulaire" | "detail">("liste");
  const [ongletDetail, definirOngletDetail] = useState<"synthese" | "provinces" | "approbations" | "documents" | "consolidation">("synthese");
  const [operations, definirOperations] = useState<PageApi<OperationCentrale>>({ elements: [], total: 0, limite: TAILLE_PAGE, decalage: 0 });
  const [detail, definirDetail] = useState<DetailOperationCentrale | null>(null);
  const [consolidation, definirConsolidation] = useState<ConsolidationNationaleOperation | null>(null);
  const [chargement, definirChargement] = useState(false);
  const [soumission, definirSoumission] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [message, definirMessage] = useState<string | null>(null);
  const [recherche, definirRecherche] = useState("");
  const [statutFiltre, definirStatutFiltre] = useState("");
  const [decalage, definirDecalage] = useState(0);

  // Formulaire nouvelle opération
  const [intitule, definirIntitule] = useState("");
  const [referenceAdministrative, definirReferenceAdministrative] = useState("");
  const [descriptionContexte, definirDescriptionContexte] = useState("");
  const [typeIntervention, definirTypeIntervention] = useState("DISTRIBUTION_GRATUITE_VIVRES");
  const [anneeCampagne, definirAnneeCampagne] = useState("2026-2027");
  const [institutionResponsable, definirInstitutionResponsable] = useState("MASSNAH");
  const [referenceJuridique, definirReferenceJuridique] = useState("Arrêté n°0033/PR/PM/MASSNAH/SG/2026");
  const [objectifGeneral, definirObjectifGeneral] = useState("");
  const [categoriesBeneficiaires, definirCategoriesBeneficiaires] = useState("");
  const [criteresEligibilite, definirCriteresEligibilite] = useState("");
  const [sourcesCiblage, definirSourcesCiblage] = useState("");
  const [nbPrevMenages, definirNbPrevMenages] = useState<string>("");
  const [nbPrevPersonnes, definirNbPrevPersonnes] = useState<string>("");
  const [dateDebutPrevue, definirDateDebutPrevue] = useState("");
  const [dateFinPrevue, definirDateFinPrevue] = useState("");
  const [dateLimitePrepa, definirDateLimitePrepa] = useState("");
  const [dateLimiteRapports, definirDateLimiteRapports] = useState("");
  const [sourceVivres, definirSourceVivres] = useState("ONASA");
  const [notesTransport, definirNotesTransport] = useState("");
  const [provincesSelectionnees, definirProvincesSelectionnees] = useState<Set<string>>(new Set());
  const [rechercheProvince, definirRechercheProvince] = useState("");

  // Approbations & documents
  const [typeApprobation, definirTypeApprobation] = useState<"COMITE_PILOTAGE" | "VALIDATION_MINISTERIELLE">("COMITE_PILOTAGE");
  const [instanceDecisionnaire, definirInstanceDecisionnaire] = useState("Comité National de Pilotage");
  const [referenceActe, definirReferenceActe] = useState("");
  const [dateDecision, definirDateDecision] = useState(new Date().toISOString().slice(0, 10));
  const [signataireNom, definirSignataireNom] = useState("");
  const [signataireQualite, definirSignataireQualite] = useState("Président du Comité de Pilotage");
  const [decision, definirDecision] = useState<"APPROUVE" | "APPROUVE_AVEC_RESERVES">("APPROUVE");
  const [fichierDoc, definirFichierDoc] = useState<File | null>(null);
  const [categorieDoc, definirCategorieDoc] = useState("ARRETE_MINISTERIEL");
  const [intituleDoc, definirIntituleDoc] = useState("Arrêté ministériel de cadrage");
  const [motifAnnulation, definirMotifAnnulation] = useState("");

  // Délégué provincial - mise à jour locale
  const [planLocal, definirPlanLocal] = useState("");
  const [observationsDelegue, definirObservationsDelegue] = useState("");
  const [statutExecutionLocal, definirStatutExecutionLocal] = useState("EN_PREPARATION");

  const chargerListe = useCallback(async () => {
    definirChargement(true);
    definirErreur(null);
    try {
      const params = new URLSearchParams({ limite: String(TAILLE_PAGE), decalage: String(decalage) });
      if (recherche.trim()) params.set("recherche", recherche.trim());
      if (statutFiltre) params.set("statut", statutFiltre);

      const endpoint = estDelegue ? `/api/provincial/operations-centrales?${params.toString()}` : `/api/operations-centrales?${params.toString()}`;
      const reponse = await requeteApi<PageApi<OperationCentrale>>(endpoint);
      definirOperations(reponse);
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "Impossible de charger les opérations centrales.");
    } finally {
      definirChargement(false);
    }
  }, [decalage, estDelegue, recherche, statutFiltre]);

  useEffect(() => {
    void chargerListe();
  }, [chargerListe]);

  const chargerDetail = useCallback(async (id: string) => {
    definirChargement(true);
    definirErreur(null);
    try {
      const endpoint = estDelegue ? `/api/provincial/operations-centrales/${id}` : `/api/operations-centrales/${id}`;
      const [data, consolidationData] = await Promise.all([
        requeteApi<DetailOperationCentrale>(endpoint),
        requeteApi<ConsolidationNationaleOperation>(`/api/operations-centrales/${id}/consolidation`).catch(() => null),
      ]);
      definirDetail(data);
      definirConsolidation(consolidationData);

      if (estDelegue && data.dossiers && data.dossiers.length > 0) {
        const monDossier = data.dossiers[0];
        definirPlanLocal(monDossier?.plan_operationnel_local || "");
        definirObservationsDelegue(monDossier?.observations_delegue || "");
        definirStatutExecutionLocal(monDossier?.statut_execution || "ASSIGNE");
      }
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "Impossible de charger le détail de l'opération.");
    } finally {
      definirChargement(false);
    }
  }, [estDelegue]);

  function ouvrirFormulaire(): void {
    definirIntitule("");
    definirReferenceAdministrative("");
    definirDescriptionContexte("");
    definirTypeIntervention("DISTRIBUTION_GRATUITE_VIVRES");
    definirAnneeCampagne("2026-2027");
    definirInstitutionResponsable("MASSNAH");
    definirReferenceJuridique("Arrêté n°0033/PR/PM/MASSNAH/SG/2026");
    definirObjectifGeneral("");
    definirCategoriesBeneficiaires("");
    definirCriteresEligibilite("");
    definirSourcesCiblage("");
    definirNbPrevMenages("");
    definirNbPrevPersonnes("");
    definirDateDebutPrevue("");
    definirDateFinPrevue("");
    definirDateLimitePrepa("");
    definirDateLimiteRapports("");
    definirSourceVivres("ONASA");
    definirNotesTransport("");
    definirProvincesSelectionnees(new Set());
    definirRechercheProvince("");
    definirEcran("formulaire");
    definirErreur(null);
    definirMessage(null);
  }

  function basculerProvince(provId: string): void {
    definirProvincesSelectionnees((actuelles) => {
      const prochaines = new Set(actuelles);
      if (prochaines.has(provId)) prochaines.delete(provId);
      else prochaines.add(provId);
      return prochaines;
    });
  }

  function toutSelectionner(): void {
    definirProvincesSelectionnees(new Set(PROVINCES_TCHADIENNES.map((p) => `prov-${p.identifiantCompte}`)));
  }

  function toutDeselectionner(): void {
    definirProvincesSelectionnees(new Set());
  }

  async function enregistrerNouvelleOperation(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (provincesSelectionnees.size === 0) {
      definirErreur("Sélectionnez au moins une province pour cette opération.");
      return;
    }
    definirSoumission(true);
    definirErreur(null);
    try {
      const provinces = Array.from(provincesSelectionnees).map((province_id) => ({ province_id }));
      const corps = {
        intitule,
        reference_administrative: referenceAdministrative || null,
        description_contexte: descriptionContexte || null,
        type_intervention: typeIntervention,
        annee_campagne: anneeCampagne,
        institution_responsable: institutionResponsable,
        reference_juridique: referenceJuridique || null,
        objectif_general: objectifGeneral || null,
        categories_beneficiaires: categoriesBeneficiaires || null,
        criteres_eligibilite: criteresEligibilite || null,
        sources_donnees_ciblage: sourcesCiblage || null,
        nombre_previsionnel_menages: nbPrevMenages ? Number(nbPrevMenages) : null,
        nombre_previsionnel_personnes: nbPrevPersonnes ? Number(nbPrevPersonnes) : null,
        date_debut_prevue: dateDebutPrevue || null,
        date_fin_prevue: dateFinPrevue || null,
        date_limite_preparation_provinciale: dateLimitePrepa || null,
        date_limite_transmission_rapports: dateLimiteRapports || null,
        source_vivres: sourceVivres,
        notes_transport_reception: notesTransport || null,
        provinces,
      };

      const reponse = await requeteApi<{ id: string; code_operation: string }>("/api/operations-centrales", {
        methode: "POST",
        jetonCsrf,
        cleIdempotence: cleIdempotence("nouvelle-opc"),
        corps,
      });

      definirMessage(`Opération ${reponse.code_operation} créée avec succès.`);
      await chargerListe();
      await chargerDetail(reponse.id);
      definirEcran("detail");
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "L'enregistrement a échoué.");
    } finally {
      definirSoumission(false);
    }
  }

  async function changerStatut(nouveauStatut: StatutOperationCentrale): Promise<void> {
    if (!detail) return;
    definirSoumission(true);
    definirErreur(null);
    try {
      await requeteApi(`/api/operations-centrales/${detail.id}/statut`, {
        methode: "POST",
        jetonCsrf,
        cleIdempotence: cleIdempotence(`statut-${nouveauStatut}`),
        corps: {
          nouveau_statut: nouveauStatut,
          motif_ou_commentaire: ((nouveauStatut === "BROUILLON" || nouveauStatut === "ANNULEE") && motifAnnulation.trim().length > 0)
            ? motifAnnulation
            : `Passage à ${LIBELLES_STATUT[nouveauStatut]} par l'administration centrale.`,
          motif_annulation: nouveauStatut === "ANNULEE" ? motifAnnulation : null,
        },
      });
      definirMessage(`Statut mis à jour : ${LIBELLES_STATUT[nouveauStatut]}.`);
      await chargerDetail(detail.id);
      await chargerListe();
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "Le changement de statut a échoué.");
    } finally {
      definirSoumission(false);
    }
  }

  async function ajouterApprobation(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!detail) return;
    definirSoumission(true);
    definirErreur(null);
    try {
      await requeteApi(`/api/operations-centrales/${detail.id}/approbations`, {
        methode: "POST",
        jetonCsrf,
        cleIdempotence: cleIdempotence("approbation-opc"),
        corps: {
          type_approbation: typeApprobation,
          instance_decisionnaire: instanceDecisionnaire,
          reference_acte: referenceActe,
          date_decision: dateDecision,
          signataire_nom: signataireNom,
          signataire_qualite: signataireQualite,
          decision,
        },
      });
      definirMessage("Acte d'approbation enregistré avec succès.");
      definirReferenceActe("");
      definirSignataireNom("");
      await chargerDetail(detail.id);
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "L'enregistrement de l'approbation a échoué.");
    } finally {
      definirSoumission(false);
    }
  }

  async function televerserDocument(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!detail || !fichierDoc) return;
    definirSoumission(true);
    definirErreur(null);
    try {
      const formulaire = new FormData();
      formulaire.set("fichier", fichierDoc);
      formulaire.set("categorie_document", categorieDoc);
      formulaire.set("intitule", intituleDoc);

      await requeteApi(`/api/operations-centrales/${detail.id}/documents`, {
        methode: "POST",
        jetonCsrf,
        cleIdempotence: cleIdempotence("doc-opc"),
        corps: formulaire,
      });

      definirMessage("Document officiel téléversé et archivé.");
      definirFichierDoc(null);
      await chargerDetail(detail.id);
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "Le téléversement du document a échoué.");
    } finally {
      definirSoumission(false);
    }
  }

  async function mettreAJourDossierDelegue(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!detail) return;
    definirSoumission(true);
    definirErreur(null);
    try {
      await requeteApi(`/api/provincial/operations-centrales/${detail.id}/dossier`, {
        methode: "PATCH",
        jetonCsrf,
        cleIdempotence: cleIdempotence("maj-dossier-delegue"),
        corps: {
          statut_execution: statutExecutionLocal,
          plan_operationnel_local: planLocal || null,
          observations_delegue: observationsDelegue || null,
        },
      });
      definirMessage("Dossier provincial mis à jour.");
      await chargerDetail(detail.id);
    } catch (cause) {
      definirErreur(cause instanceof ErreurApi ? cause.message : "La mise à jour locale a échoué.");
    } finally {
      definirSoumission(false);
    }
  }

  const provincesFiltrees = useMemo(() => {
    if (!rechercheProvince.trim()) return PROVINCES_TCHADIENNES;
    const motif = rechercheProvince.trim().toLowerCase();
    return PROVINCES_TCHADIENNES.filter((p) => p.nom.toLowerCase().includes(motif) || p.code.toLowerCase().includes(motif));
  }, [rechercheProvince]);

  // VUE 1 : FORMULAIRE NOUVELLE OPÉRATION CENTRALE
  if (ecran === "formulaire") {
    return (
      <section className="contenu-tableau module-operations">
        <div className="entete-section">
          <div>
            <h1>Nouvelle opération centrale de distribution</h1>
          </div>
          <button className="bouton bouton-discret" onClick={() => definirEcran("liste")} type="button">
            Retour à la liste
          </button>
        </div>

        {erreur && <p className="message-erreur" role="alert">{erreur}</p>}

        <SIGADFormGrid className="carte-section formulaire-operation" onSubmit={(e) => void enregistrerNouvelleOperation(e)}>
          <div className="titre-section">
            <div>
              <h2>A. Identification et contexte administratif</h2>
              <p>Cadre officiel et intitulé de la campagne de distribution.</p>
            </div>
          </div>
          <div className="grille-territoriale">
            <div className="champ-territorial champ-large">
              <label htmlFor="opc-intitule">Intitulé officiel de l'opération *</label>
              <input
                id="opc-intitule"
                required
                value={intitule}
                onChange={(e) => definirIntitule(e.target.value)}
                placeholder="Ex: Distribution gratuite de vivres — Campagne agricole et déficit pluviométrique 2026-2027"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-ref-admin">Référence administrative (optionnelle)</label>
              <input
                id="opc-ref-admin"
                value={referenceAdministrative}
                onChange={(e) => definirReferenceAdministrative(e.target.value)}
                placeholder="Ex: MASSNAH/DG/2026-084"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-campagne">Année / Campagne *</label>
              <input
                id="opc-campagne"
                required
                value={anneeCampagne}
                onChange={(e) => definirAnneeCampagne(e.target.value)}
                placeholder="2026-2027"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-institution">Institution responsable *</label>
              <input
                id="opc-institution"
                required
                value={institutionResponsable}
                onChange={(e) => definirInstitutionResponsable(e.target.value)}
                placeholder="MASSNAH"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-ref-juridique">Référence juridique (Arrêté ou Décision)</label>
              <input
                id="opc-ref-juridique"
                value={referenceJuridique}
                onChange={(e) => definirReferenceJuridique(e.target.value)}
                placeholder="Ex: Arrêté n°0033/PR/PM/MASSNAH/SG/2026"
              />
            </div>
            <div className="champ-territorial champ-large">
              <label htmlFor="opc-description">Description et contexte opérationnel</label>
              <textarea
                id="opc-description"
                rows={3}
                value={descriptionContexte}
                onChange={(e) => definirDescriptionContexte(e.target.value)}
                placeholder="Préciser les motifs de l'intervention, la vulnérabilité ciblée et les partenaires associés."
              />
            </div>
          </div>

          <div className="separateur-stock" />

          <div className="titre-section">
            <div>
              <h2>B. Ciblage et prévisions</h2>
              <p>Objectifs généraux et critères d'éligibilité pour les provinces.</p>
            </div>
          </div>
          <div className="grille-territoriale">
            <div className="champ-territorial champ-large">
              <label htmlFor="opc-objectif">Objectif général de l'opération</label>
              <input
                id="opc-objectif"
                value={objectifGeneral}
                onChange={(e) => definirObjectifGeneral(e.target.value)}
                placeholder="Assister les ménages en insécurité alimentaire sévère affectés par la sécheresse"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-categories">Catégories de bénéficiaires ciblées</label>
              <input
                id="opc-categories"
                value={categoriesBeneficiaires}
                onChange={(e) => definirCategoriesBeneficiaires(e.target.value)}
                placeholder="Ménages ruraux vulnérables, personnes déplacées, retournés"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-criteres">Critères d'éligibilité</label>
              <input
                id="opc-criteres"
                value={criteresEligibilite}
                onChange={(e) => definirCriteresEligibilite(e.target.value)}
                placeholder="Pertes de récoltes > 50 %, cheptel décimé, ménages dirigés par des femmes"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-prev-menages">Nombre prévisionnel de ménages (national)</label>
              <input
                id="opc-prev-menages"
                type="number"
                min="0"
                value={nbPrevMenages}
                onChange={(e) => definirNbPrevMenages(e.target.value)}
                placeholder="Ex: 50000"
              />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-prev-personnes">Nombre prévisionnel de personnes (national)</label>
              <input
                id="opc-prev-personnes"
                type="number"
                min="0"
                value={nbPrevPersonnes}
                onChange={(e) => definirNbPrevPersonnes(e.target.value)}
                placeholder="Ex: 300000"
              />
            </div>
          </div>

          <div className="separateur-stock" />

          <div className="titre-section">
            <div>
              <h2>C. Couverture territoriale (Sélection des Provinces)</h2>
              <p>
                <strong>{provincesSelectionnees.size} / 23 provinces sélectionnées.</strong> Seules les provinces cochées recevront un dossier d'exécution lors de l'ouverture.
              </p>
            </div>
            <div className="actions-ligne">
              <button className="bouton bouton-discret" onClick={toutSelectionner} type="button">
                Tout sélectionner
              </button>
              <button className="bouton bouton-discret" onClick={toutDeselectionner} type="button">
                Tout désélectionner
              </button>
            </div>
          </div>

          <div className="barre-recherche-provinces">
            <input
              type="search"
              placeholder="Rechercher une province par nom ou code..."
              value={rechercheProvince}
              onChange={(e) => definirRechercheProvince(e.target.value)}
            />
          </div>

          <div className="grille-selection-provinces" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem", padding: "0.75rem", background: "var(--sigad-surface-2)", borderRadius: "6px" }}>
            {provincesFiltrees.map((prov) => {
              const provId = `prov-${prov.identifiantCompte}`;
              const coche = provincesSelectionnees.has(provId);
              return (
                <label key={prov.code} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem", cursor: "pointer", borderRadius: "4px", background: coche ? "var(--sigad-surface-accent, rgba(14, 116, 144, 0.15))" : "transparent" }}>
                  <input
                    type="checkbox"
                    checked={coche}
                    onChange={() => basculerProvince(provId)}
                  />
                  <span>
                    <strong>{prov.nom}</strong> <small style={{ opacity: 0.7 }}>({prov.code})</small>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="separateur-stock" />

          <div className="titre-section">
            <div>
              <h2>D. Calendrier prévisionnel</h2>
              <p>Échéances nationales et provinciales.</p>
            </div>
          </div>
          <div className="grille-territoriale">
            <div className="champ-territorial">
              <label htmlFor="opc-debut">Date de début prévisionnelle</label>
              <input id="opc-debut" type="date" value={dateDebutPrevue} onChange={(e) => definirDateDebutPrevue(e.target.value)} />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-fin">Date de fin prévisionnelle</label>
              <input id="opc-fin" type="date" value={dateFinPrevue} onChange={(e) => definirDateFinPrevue(e.target.value)} />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-limite-prepa">Date limite préparation provinciale</label>
              <input id="opc-limite-prepa" type="date" value={dateLimitePrepa} onChange={(e) => definirDateLimitePrepa(e.target.value)} />
            </div>
            <div className="champ-territorial">
              <label htmlFor="opc-limite-rapports">Date limite transmission des rapports</label>
              <input id="opc-limite-rapports" type="date" value={dateLimiteRapports} onChange={(e) => definirDateLimiteRapports(e.target.value)} />
            </div>
          </div>

          <div className="separateur-stock" />

          <div className="titre-section">
            <div>
              <h2>E. Ressources et origine des vivres</h2>
              <p>Origine institutionnelle des vivres (ne génère aucun mouvement de stock automatique).</p>
            </div>
          </div>
          <div className="grille-territoriale">
            <div className="champ-territorial">
              <label htmlFor="opc-source">Source principale des vivres *</label>
              <select id="opc-source" value={sourceVivres} onChange={(e) => definirSourceVivres(e.target.value)}>
                <option value="ONASA">ONASA (Office National de Sécurité Alimentaire)</option>
                <option value="PARTENAIRE">Partenaire humanitaire / Donateur</option>
                <option value="STOCK_EXISTANT">Stock existant d'intervention</option>
                <option value="ACHAT_PUBLIC">Achat public / Marché de l'État</option>
                <option value="DON_EXTERNE">Don externe</option>
                <option value="MIXTE">Sources mixtes</option>
              </select>
            </div>
            <div className="champ-territorial champ-large">
              <label htmlFor="opc-notes-transport">Consignes de transport, sécurisation et acheminement</label>
              <textarea id="opc-notes-transport" rows={2} value={notesTransport} onChange={(e) => definirNotesTransport(e.target.value)} placeholder="Préciser les modalités de convoi, escortes ou points de transit..." />
            </div>
          </div>

          <div className="actions-formulaire" style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
            <button className="bouton bouton-principal" disabled={soumission} type="submit">
              {soumission ? "Enregistrement sécurisé..." : "Enregistrer le brouillon de l'opération"}
            </button>
            <button className="bouton bouton-discret" onClick={() => definirEcran("liste")} type="button">
              Annuler
            </button>
          </div>
        </SIGADFormGrid>
      </section>
    );
  }

  // VUE 2 : DÉTAIL D'UNE OPÉRATION CENTRALE
  if (ecran === "detail" && detail) {
    return (
      <section className="contenu-tableau module-operations">
        <div className="entete-section">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <span className="code-reference" style={{ fontSize: "1rem", fontWeight: 700 }}>{detail.code_operation}</span>
              <span className={`pastille-statut ${classStatut(detail.statut)}`}>{LIBELLES_STATUT[detail.statut]}</span>
            </div>
            <h1>{detail.intitule}</h1>
            <p className="texte-secondaire">
              Campagne {detail.annee_campagne} · Institution : {detail.institution_responsable} · Source : {detail.source_vivres} · {detail.provinces.length} provinces ciblées
            </p>
          </div>
          <button className="bouton bouton-discret" onClick={() => definirEcran("liste")} type="button">
            Retour à la liste
          </button>
        </div>

        {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
        {message && <p className="message-succes" role="status">{message}</p>}

        {/* Barre d'actions du cycle de vie (Administration centrale uniquement) */}
        {estAdmin && (
          <div className="carte-section panneau-gouvernance-actions" style={{ background: "var(--sigad-surface-1)", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid var(--sigad-accent)" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Pilotage du cycle de vie</h3>
            <div className="actions-ligne" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {detail.statut === "BROUILLON" && (
                <button className="bouton bouton-principal" disabled={soumission} onClick={() => void changerStatut("SOUMISE_A_APPROBATION")} type="button">
                  Soumettre à approbation
                </button>
              )}
              {detail.statut === "SOUMISE_A_APPROBATION" && (
                <>
                  <button
                    className="bouton bouton-principal"
                    disabled={soumission || detail.approbations.length === 0}
                    onClick={() => void changerStatut("APPROUVEE")}
                    title={detail.approbations.length === 0 ? "Enregistrez au moins un acte formel d'approbation d'abord" : "Approuver l'opération"}
                    type="button"
                  >
                    Déclarer approuvée ({detail.approbations.length} acte(s))
                  </button>
                  <button
                    className="bouton bouton-secondaire"
                    disabled={soumission || motifAnnulation.trim().length < 5}
                    onClick={() => void changerStatut("BROUILLON")}
                    title="Retourner le dossier en statut Brouillon pour corrections (renseigner le motif dans le champ à droite)"
                    type="button"
                  >
                    Demander des corrections (retour Brouillon)
                  </button>
                </>
              )}
              {detail.statut === "APPROUVEE" && (
                <button className="bouton bouton-principal" disabled={soumission} onClick={() => void changerStatut("OUVERTE")} type="button">
                  Ouvrir l'opération aux provinces (Générer les dossiers d'exécution)
                </button>
              )}
              {detail.statut === "OUVERTE" && (
                <button className="bouton bouton-principal" disabled={soumission} onClick={() => void changerStatut("EN_COURS")} type="button">
                  Passer en exécution terrain
                </button>
              )}
              {detail.statut === "EN_COURS" && (
                <button className="bouton bouton-principal" disabled={soumission} onClick={() => void changerStatut("EN_CONSOLIDATION")} type="button">
                  Mettre en consolidation des résultats
                </button>
              )}
              {detail.statut === "EN_CONSOLIDATION" && (
                <button className="bouton bouton-principal" disabled={soumission} onClick={() => void changerStatut("CLOTUREE")} type="button">
                  Clôturer définitivement l'opération nationale
                </button>
              )}
              {detail.statut !== "CLOTUREE" && detail.statut !== "ANNULEE" && (
                <div style={{ display: "inline-flex", gap: "0.5rem", marginLeft: "auto" }}>
                  <input
                    placeholder="Motif (annulation ou retour correction)..."
                    value={motifAnnulation}
                    onChange={(e) => definirMotifAnnulation(e.target.value)}
                    style={{ fontSize: "0.85rem", padding: "0.25rem 0.5rem" }}
                  />
                  <button
                    className="bouton bouton-discret"
                    disabled={soumission || motifAnnulation.trim().length < 5}
                    onClick={() => void changerStatut("ANNULEE")}
                    style={{ color: "var(--sigad-danger, #e11d48)" }}
                    type="button"
                  >
                    Annuler l'opération
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation par onglets unifiée */}
        <div style={{ margin: "1.25rem 0" }}>
          <SIGADTabsList ariaLabel="Navigation détails opération centrale">
            <SIGADTab active={ongletDetail === "synthese"} onClick={() => definirOngletDetail("synthese")}>
              Synthèse & Cadrage
            </SIGADTab>
            <SIGADTab
              active={ongletDetail === "provinces"}
              badgeCount={detail.dossiers.length > 0 ? detail.dossiers.length : detail.provinces.length}
              onClick={() => definirOngletDetail("provinces")}
            >
              Provinces & Dossiers
            </SIGADTab>
            <SIGADTab
              active={ongletDetail === "approbations"}
              badgeCount={detail.approbations.length}
              onClick={() => definirOngletDetail("approbations")}
            >
              Gouvernance & Approbations
            </SIGADTab>
            <SIGADTab
              active={ongletDetail === "documents"}
              badgeCount={detail.documents.length}
              onClick={() => definirOngletDetail("documents")}
            >
              Documents officiels
            </SIGADTab>
            {!estDelegue && (
              <SIGADTab active={ongletDetail === "consolidation"} onClick={() => definirOngletDetail("consolidation")}>
                Consolidation nationale
              </SIGADTab>
            )}
          </SIGADTabsList>
        </div>

        {/* CONTENU ONGLET 1 : SYNTHÈSE */}
        {ongletDetail === "synthese" && (
          <div className="carte-section">
            <h2>Cadrage général et objectifs</h2>
            <div className="grille-recapitulatif" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div><strong>Référence juridique :</strong> {detail.reference_juridique || "Non spécifiée"}</div>
              <div><strong>Référence administrative :</strong> {detail.reference_administrative || "Aucune"}</div>
              <div><strong>Objectif général :</strong> {detail.objectif_general || "Non renseigné"}</div>
              <div><strong>Catégories bénéficiaires :</strong> {detail.categories_beneficiaires || "Non renseignées"}</div>
              <div><strong>Critères d'éligibilité :</strong> {detail.criteres_eligibilite || "Non renseignés"}</div>
              <div><strong>Prévisions nationales :</strong> {detail.nombre_previsionnel_menages ? `${detail.nombre_previsionnel_menages.toLocaleString()} ménages` : "Non quantifié"}</div>
              <div><strong>Période prévisionnelle :</strong> {detail.date_debut_prevue || "—"} au {detail.date_fin_prevue || "—"}</div>
              <div><strong>Source des vivres :</strong> {detail.source_vivres}</div>
            </div>
            {detail.description_contexte && (
              <div style={{ marginTop: "1rem" }}>
                <strong>Description et contexte :</strong>
                <p style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>{detail.description_contexte}</p>
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 2 : PROVINCES & DOSSIERS D'EXÉCUTION */}
        {ongletDetail === "provinces" && (
          <div className="carte-section">
            <div className="titre-section">
              <div>
                <h2>Dossiers d'exécution provinciaux</h2>
                <p>
                  {detail.dossiers.length > 0
                    ? `${detail.dossiers.length} dossier(s) d'exécution généré(s) pour les provinces sélectionnées.`
                    : "Les dossiers d'exécution seront automatiquement ouverts dès que l'opération passera au statut OUVERTE."}
                </p>
              </div>
            </div>

            <div className="tableau-defilement">
              <table>
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>Réf. Dossier</th>
                    <th>Statut d'exécution</th>
                    <th>Ménages servis</th>
                    <th>Personnes servies</th>
                    <th>Distributions liées</th>
                    <th>Dernière mise à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.dossiers.length > 0 ? (
                    detail.dossiers.map((dossier) => (
                      <tr key={dossier.id}>
                        <td><strong>{dossier.province_nom}</strong> <small>({dossier.province_code})</small></td>
                        <td className="code-reference">{dossier.reference_dossier}</td>
                        <td><span className="pastille-statut statut-distribution-neutre">{dossier.statut_execution}</span></td>
                        <td>{dossier.total_menages_servis.toLocaleString()}</td>
                        <td>{dossier.total_personnes_servies.toLocaleString()}</td>
                        <td>{dossier.nombre_distributions_provinciales ?? 0}</td>
                        <td>{dossier.modifie_le ? dossier.modifie_le.slice(0, 10) : "—"}</td>
                      </tr>
                    ))
                  ) : (
                    detail.provinces.map((prov) => (
                      <tr key={prov.id}>
                        <td><strong>{prov.province_nom}</strong></td>
                        <td colSpan={6} style={{ fontStyle: "italic", opacity: 0.7 }}>
                          En attente d'ouverture centrale de l'opération
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Section spécifique pour le délégué provincial pour mettre à jour son dossier */}
            {estDelegue && detail.dossiers.length > 0 && (
              <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--sigad-bordure)", paddingTop: "1rem" }}>
                <h3>Gestion de mon dossier provincial ({detail.dossiers[0]?.province_nom})</h3>
                <SIGADFormGrid onSubmit={(e) => void mettreAJourDossierDelegue(e)}>
                  <div className="grille-territoriale">
                    <div className="champ-territorial">
                      <label htmlFor="del-statut">Statut de mon exécution</label>
                      <select id="del-statut" value={statutExecutionLocal} onChange={(e) => definirStatutExecutionLocal(e.target.value)}>
                        <option value="ASSIGNE">Assigné (prise en compte)</option>
                        <option value="EN_PREPARATION">En préparation locale</option>
                        <option value="EN_DISTRIBUTION">En cours de distribution</option>
                        <option value="TERMINE">Terminé sur le terrain</option>
                        <option value="RAPPORT_TRANSMIS">Rapport transmis au niveau central</option>
                      </select>
                    </div>
                    <div className="champ-territorial champ-large">
                      <label htmlFor="del-plan">Plan opérationnel local et sites ciblés</label>
                      <textarea id="del-plan" rows={2} value={planLocal} onChange={(e) => definirPlanLocal(e.target.value)} placeholder="Préciser les départements et sites humanitaires retenus..." />
                    </div>
                    <div className="champ-territorial champ-large">
                      <label htmlFor="del-obs">Observations du délégué</label>
                      <textarea id="del-obs" rows={2} value={observationsDelegue} onChange={(e) => definirObservationsDelegue(e.target.value)} placeholder="Remarques éventuelles sur la logistique ou le déroulement..." />
                    </div>
                  </div>
                  <button className="bouton bouton-principal" disabled={soumission} type="submit" style={{ marginTop: "0.5rem" }}>
                    Enregistrer la mise à jour de mon dossier
                  </button>
                </SIGADFormGrid>
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 3 : APPROBATIONS & GOUVERNANCE */}
        {ongletDetail === "approbations" && (
          <div className="carte-section">
            <div className="titre-section">
              <div>
                <h2>Actes de gouvernance et approbations</h2>
                <p>Enregistrement des décisions du Comité de pilotage et validations ministérielles.</p>
              </div>
            </div>

            <div className="tableau-defilement">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Instance</th>
                    <th>Référence acte</th>
                    <th>Date décision</th>
                    <th>Signataire</th>
                    <th>Décision</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.approbations.length > 0 ? (
                    detail.approbations.map((appr) => (
                      <tr key={appr.id}>
                        <td><strong>{appr.type_approbation}</strong></td>
                        <td>{appr.instance_decisionnaire}</td>
                        <td className="code-reference">{appr.reference_acte}</td>
                        <td>{appr.date_decision}</td>
                        <td>{appr.signataire_nom} ({appr.signataire_qualite})</td>
                        <td><span className="pastille-statut statut-distribution-reussi">{appr.decision}</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="cellule-vide">Aucun acte formel d'approbation enregistré pour l'instant.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {estAdmin && detail.statut !== "CLOTUREE" && detail.statut !== "ANNULEE" && (
              <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--sigad-bordure)", paddingTop: "1rem" }}>
                <h3>Enregistrer une approbation officielle</h3>
                <SIGADFormGrid onSubmit={(e) => void ajouterApprobation(e)}>
                  <div className="grille-territoriale">
                    <div className="champ-territorial">
                      <label htmlFor="app-type">Type d'approbation</label>
                      <select id="app-type" value={typeApprobation} onChange={(e) => definirTypeApprobation(e.target.value as any)}>
                        <option value="COMITE_PILOTAGE">Comité de pilotage</option>
                        <option value="VALIDATION_MINISTERIELLE">Validation ministérielle</option>
                      </select>
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="app-inst">Instance décisionnaire</label>
                      <input id="app-inst" required value={instanceDecisionnaire} onChange={(e) => definirInstanceDecisionnaire(e.target.value)} />
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="app-ref">Référence de l'acte *</label>
                      <input id="app-ref" required placeholder="Ex: PV-COPIL-2026-001" value={referenceActe} onChange={(e) => definirReferenceActe(e.target.value)} />
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="app-date">Date de décision *</label>
                      <input id="app-date" required type="date" value={dateDecision} onChange={(e) => definirDateDecision(e.target.value)} />
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="app-nom">Nom du signataire *</label>
                      <input id="app-nom" required value={signataireNom} onChange={(e) => definirSignataireNom(e.target.value)} />
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="app-qual">Qualité du signataire</label>
                      <input id="app-qual" required value={signataireQualite} onChange={(e) => definirSignataireQualite(e.target.value)} />
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="app-dec">Décision</label>
                      <select id="app-dec" value={decision} onChange={(e) => definirDecision(e.target.value as any)}>
                        <option value="APPROUVE">Approuvé sans réserve</option>
                        <option value="APPROUVE_AVEC_RESERVES">Approuvé avec réserves</option>
                      </select>
                    </div>
                  </div>
                  <button className="bouton bouton-principal" disabled={soumission} type="submit" style={{ marginTop: "0.5rem" }}>
                    Enregistrer l'acte officiel
                  </button>
                </SIGADFormGrid>
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 4 : DOCUMENTS OFFICIELS & ARRÊTÉS */}
        {ongletDetail === "documents" && (
          <div className="carte-section">
            <div className="titre-section">
              <div>
                <h2>Documents de référence et arrêtés ministériels</h2>
                <p>Pièces justificatives et arrêtés conservés dans le coffre R2.</p>
              </div>
            </div>

            <div className="tableau-defilement">
              <table>
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th>Intitulé</th>
                    <th>Fichier original</th>
                    <th>Taille</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.documents.length > 0 ? (
                    detail.documents.map((doc) => (
                      <tr key={doc.id}>
                        <td><strong>{doc.categorie_document}</strong></td>
                        <td>{doc.intitule}</td>
                        <td className="code-reference">{doc.nom_fichier_original}</td>
                        <td>{Math.round(doc.taille_octets / 1024)} Ko</td>
                        <td>
                          <a
                            href={`/api/operations-centrales/${detail.id}/documents/${doc.id}`}
                            className="bouton bouton-discret"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Télécharger
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="cellule-vide">Aucun document téléversé pour le moment.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {estAdmin && (
              <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--sigad-bordure)", paddingTop: "1rem" }}>
                <h3>Téléverser un document officiel (PDF ou image)</h3>
                <SIGADFormGrid onSubmit={(e) => void televerserDocument(e)}>
                  <div className="grille-territoriale">
                    <div className="champ-territorial">
                      <label htmlFor="doc-cat">Catégorie de document</label>
                      <select id="doc-cat" value={categorieDoc} onChange={(e) => definirCategorieDoc(e.target.value)}>
                        <option value="ARRETE_MINISTERIEL">Arrêté ministériel</option>
                        <option value="DECISION_PILOTAGE">Décision du comité de pilotage</option>
                        <option value="PLAN_OPERATIONNEL_NATIONAL">Plan opérationnel national</option>
                        <option value="CADRE_DE_CIBLAGE">Cadre de ciblage</option>
                        <option value="BORDEREAU_CONSOLIDE">Bordereau consolidé</option>
                        <option value="AUTRE">Autre document officiel</option>
                      </select>
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="doc-int">Intitulé du document</label>
                      <input id="doc-int" required value={intituleDoc} onChange={(e) => definirIntituleDoc(e.target.value)} />
                    </div>
                    <div className="champ-territorial">
                      <label htmlFor="doc-file">Fichier (PDF ou image)</label>
                      <input
                        id="doc-file"
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        required
                        onChange={(e) => definirFichierDoc(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  </div>
                  <button className="bouton bouton-principal" disabled={soumission || !fichierDoc} type="submit" style={{ marginTop: "0.5rem" }}>
                    Archiver le document sur R2
                  </button>
                </SIGADFormGrid>
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 5 : CONSOLIDATION NATIONALE */}
        {ongletDetail === "consolidation" && (
          <div className="carte-section">
            <h2>Consolidation nationale des résultats</h2>
            {consolidation ? (
              <div>
                <div className="grille-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", margin: "1rem 0" }}>
                  <div className="carte-kpi" style={{ padding: "1rem", background: "var(--sigad-surface-2)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>Provinces ciblées</div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{consolidation.nombre_provinces_ciblees}</div>
                  </div>
                  <div className="carte-kpi" style={{ padding: "1rem", background: "var(--sigad-surface-2)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>Dossiers ouverts</div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{consolidation.nombre_dossiers_ouverts}</div>
                  </div>
                  <div className="carte-kpi" style={{ padding: "1rem", background: "var(--sigad-surface-2)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>Ménages servis au total</div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--sigad-accent)" }}>{consolidation.total_menages_servis_national.toLocaleString()}</div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>sur {consolidation.nombre_previsionnel_menages_national.toLocaleString()} prévus</div>
                  </div>
                  <div className="carte-kpi" style={{ padding: "1rem", background: "var(--sigad-surface-2)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>Personnes assistées</div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{consolidation.total_personnes_servies_national.toLocaleString()}</div>
                  </div>
                  <div className="carte-kpi" style={{ padding: "1rem", background: "var(--sigad-surface-2)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>Taux d'avancement</div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{consolidation.taux_avancement_global_pourcentage} %</div>
                  </div>
                </div>

                <h3>Répartition provinciale des résultats</h3>
                <div className="tableau-defilement">
                  <table>
                    <thead>
                      <tr>
                        <th>Province</th>
                        <th>Statut dossier</th>
                        <th>Ménages servis</th>
                        <th>Personnes servies</th>
                        <th>Quantité distribuée</th>
                        <th>Fin constatée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidation.provinces_detail.map((p) => (
                        <tr key={p.province_id}>
                          <td><strong>{p.province_nom}</strong></td>
                          <td><span className="pastille-statut statut-distribution-neutre">{p.statut_execution}</span></td>
                          <td>{p.total_menages_servis.toLocaleString()}</td>
                          <td>{p.total_personnes_servies.toLocaleString()}</td>
                          <td>{p.quantite_totale_distribuee.toLocaleString()}</td>
                          <td>{p.date_fin_reelle || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="texte-secondaire">Les données consolidées sont indisponibles ou l'opération n'a pas encore ouvert de dossiers provinciaux.</p>
            )}
          </div>
        )}
      </section>
    );
  }

  // VUE 0 : LISTE DES OPÉRATIONS CENTRALES
  return (
    <section aria-label={estDelegue ? "Opérations provinciales" : "Opérations centrales"} className="contenu-tableau module-operations">
      {estAdmin && <div className="sigad-compact-toolbar">
        {estAdmin && (
          <SIGADButton variant="primary" onClick={ouvrirFormulaire}>
            Nouvelle opération centrale
          </SIGADButton>
        )}
      </div>}

      {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
      {message && <SIGADAlert type="success" message={message} style={{ marginBottom: "1rem" }} />}

      <section className="carte-section">
        <SIGADFilterBar ariaLabel="Filtres des opérations centrales" fieldsClassName="barre-filtres-stock">
          <div className="champ-territorial">
            <label htmlFor="recherche-opc">Recherche</label>
            <input
              id="recherche-opc"
              value={recherche}
              onChange={(e) => { definirRecherche(e.target.value); definirDecalage(0); }}
              placeholder="Code, intitulé ou référence..."
            />
          </div>
          <div className="champ-territorial">
            <label htmlFor="statut-opc">Statut</label>
            <select id="statut-opc" value={statutFiltre} onChange={(e) => { definirStatutFiltre(e.target.value); definirDecalage(0); }}>
              <option value="">Tous les statuts</option>
              {Object.entries(LIBELLES_STATUT).map(([code, libelle]) => (
                <option key={code} value={code}>{libelle}</option>
              ))}
            </select>
          </div>
        </SIGADFilterBar>

        <div className="tableau-defilement">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Intitulé de l'opération</th>
                <th>Campagne</th>
                <th>Provinces</th>
                <th>Statut</th>
                <th>Ménages servis</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {operations.elements.map((op) => (
                <tr key={op.id}>
                  <td className="code-reference">{op.code_operation}</td>
                  <td>
                    <strong>{op.intitule}</strong>
                    {op.reference_juridique && <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{op.reference_juridique}</div>}
                  </td>
                  <td>{op.annee_campagne}</td>
                  <td>{op.nombre_provinces ?? "—"}</td>
                  <td>
                    <SIGADBadge
                      variant={
                        op.statut === "CLOTUREE" || op.statut === "APPROUVEE"
                          ? "success"
                          : op.statut === "ANNULEE"
                            ? "danger"
                            : op.statut === "OUVERTE" || op.statut === "EN_COURS" || op.statut === "EN_CONSOLIDATION"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {LIBELLES_STATUT[op.statut]}
                    </SIGADBadge>
                  </td>
                  <td>{(op.total_menages_servis_consolide ?? 0).toLocaleString()}</td>
                  <td>
                    <SIGADButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        definirOngletDetail("synthese");
                        void chargerDetail(op.id).then(() => definirEcran("detail"));
                      }}
                    >
                      Détails
                    </SIGADButton>
                  </td>
                </tr>
              ))}
              {operations.elements.length === 0 && (
                <tr>
                  <td className="cellule-vide" colSpan={7}>
                    {chargement ? "Chargement des opérations..." : "Aucune opération centrale trouvée."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <SIGADPagination
          total={operations.total}
          decalage={decalage}
          taillePage={TAILLE_PAGE}
          chargement={chargement}
          onPageChange={definirDecalage}
        />
      </section>
    </section>
  );
}
