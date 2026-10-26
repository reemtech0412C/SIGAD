import { useCallback, useEffect, useState } from "react";
import type {
  EntreeAuditSuppressionTest,
  NatureDonnees,
  RapportEligibiliteOperation,
  ResumeOperationDonneesTest,
} from "../../../../shared/types/donnees-test";
import { formaterDate } from "../../utils/formatters";
import { requeteApi } from "../../services/api";
import {
  SIGADConfirmPanel,
  SIGADDetailPanel,
  SIGADFormPanel,
  SIGADButton,
  SIGADBadge,
  SIGADTabsList,
  SIGADTab,
  SIGADPagination,
  SIGADAlert,
} from "../ui";

interface GestionDonneesTestProps {
  jetonCsrf: string;
}

const TAILLE_PAGE = 15;

export function GestionDonneesTest({ jetonCsrf }: GestionDonneesTestProps) {
  // Navigation sous-onglets
  const [sousOnglet, setSousOnglet] = useState<"operations" | "historique">("operations");

  // Liste des opérations
  const [operations, setOperations] = useState<ResumeOperationDonneesTest[]>([]);
  const [totalOperations, setTotalOperations] = useState(0);
  const [decalage, setDecalage] = useState(0);
  const [filtreNature, setFiltreNature] = useState<"TOUTES" | "TEST" | "REEL" | "INDETERMINE">("TOUTES");
  const [recherche, setRecherche] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // Sélection pour nettoyage par lot
  const [selectionLot, setSelectionLot] = useState<string[]>([]);
  const [modalLotOuvert, setModalLotOuvert] = useState(false);
  const [confirmationTexteLot, setConfirmationTexteLot] = useState("");
  const [motDePasseLot, setMotDePasseLot] = useState("");
  const [motifLot, setMotifLot] = useState("");
  const [enCoursLot, setEnCoursLot] = useState(false);

  // Modal inspection détaillée
  const [operationInspection, setOperationInspection] = useState<RapportEligibiliteOperation | null>(null);
  const [chargementInspection, setChargementInspection] = useState(false);

  // Modal suppression individuelle
  const [operationASupprimer, setOperationASupprimer] = useState<ResumeOperationDonneesTest | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [motDePasseSuppression, setMotDePasseSuppression] = useState("");
  const [motifSuppression, setMotifSuppression] = useState("");
  const [enCoursSuppression, setEnCoursSuppression] = useState(false);

  // Modal reclassification administrative
  const [operationAReclassifier, setOperationAReclassifier] = useState<ResumeOperationDonneesTest | null>(null);
  const [cibleNature, setCibleNature] = useState<"TEST" | "REEL">("TEST");
  const [motifReclassification, setMotifReclassification] = useState("");
  const [preuvesJustificatives, setPreuvesJustificatives] = useState("");
  const [motDePasseReclass, setMotDePasseReclass] = useState("");
  const [enCoursReclass, setEnCoursReclass] = useState(false);

  // Historique des suppressions
  const [historique, setHistorique] = useState<EntreeAuditSuppressionTest[]>([]);
  const [totalHistorique, setTotalHistorique] = useState(0);
  const [decalageHistorique, setDecalageHistorique] = useState(0);
  const [chargementHistorique, setChargementHistorique] = useState(false);

  // Chargement des opérations
  const chargerOperations = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const params = new URLSearchParams({
        limite: String(TAILLE_PAGE),
        decalage: String(decalage),
        nature: filtreNature,
      });
      if (recherche.trim()) params.set("recherche", recherche.trim());

      const res = await requeteApi<{
        elements: ResumeOperationDonneesTest[];
        total: number;
        limite: number;
        decalage: number;
      }>(`/api/proprietaire/donnees-test/operations?${params.toString()}`);

      setOperations(res.elements);
      setTotalOperations(res.total);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de chargement des données.");
    } finally {
      setChargement(false);
    }
  }, [decalage, filtreNature, recherche]);

  // Chargement de l'historique
  const chargerHistorique = useCallback(async () => {
    setChargementHistorique(true);
    try {
      const res = await requeteApi<{
        elements: EntreeAuditSuppressionTest[];
        total: number;
      }>(`/api/proprietaire/donnees-test/historique?limite=${TAILLE_PAGE}&decalage=${decalageHistorique}`);
      setHistorique(res.elements);
      setTotalHistorique(res.total);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de chargement de l'historique.");
    } finally {
      setChargementHistorique(false);
    }
  }, [decalageHistorique]);

  useEffect(() => {
    if (sousOnglet === "operations") {
      void chargerOperations();
    } else {
      void chargerHistorique();
    }
  }, [sousOnglet, chargerOperations, chargerHistorique]);

  // Ouvrir l'inspection détaillée
  async function inspecterOperation(id: string) {
    setChargementInspection(true);
    setErreur(null);
    try {
      const res = await requeteApi<RapportEligibiliteOperation>(
        `/api/proprietaire/donnees-test/operations/${encodeURIComponent(id)}/apercu`,
      );
      setOperationInspection(res);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Impossible de charger l'inspection de l'opération.");
    } finally {
      setChargementInspection(false);
    }
  }

  // Soumission de la reclassification
  async function soumettreReclassification(e: React.FormEvent) {
    e.preventDefault();
    if (!operationAReclassifier) return;
    setEnCoursReclass(true);
    setErreur(null);
    try {
      const res = await requeteApi<{ message: string }>(
        `/api/proprietaire/donnees-test/operations/${encodeURIComponent(operationAReclassifier.id)}/reclassifier`,
        {
          methode: "POST",
          jetonCsrf,
          corps: {
            nature_cible: cibleNature,
            motif: motifReclassification,
            preuves_justificatives: preuvesJustificatives,
            mot_de_passe_confirmation: motDePasseReclass,
          },
        },
      );
      setSucces(res.message);
      setOperationAReclassifier(null);
      setMotifReclassification("");
      setPreuvesJustificatives("");
      setMotDePasseReclass("");
      await chargerOperations();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de la reclassification administrative.");
    } finally {
      setEnCoursReclass(false);
    }
  }

  // Soumission de la suppression individuelle
  async function soumettreSuppression(e: React.FormEvent) {
    e.preventDefault();
    if (!operationASupprimer) return;
    setEnCoursSuppression(true);
    setErreur(null);
    try {
      const res = await requeteApi<{ code_operation: string; intitule: string; perimetre_supprime: Record<string, number> }>(
        `/api/proprietaire/donnees-test/operations/${encodeURIComponent(operationASupprimer.id)}/supprimer`,
        {
          methode: "POST",
          jetonCsrf,
          corps: {
            confirmation_code: confirmationCode,
            mot_de_passe_confirmation: motDePasseSuppression,
            motif: motifSuppression,
          },
        },
      );
      setSucces(`Opération ${res.code_operation} purgée avec succès.`);
      setOperationASupprimer(null);
      setOperationInspection(null);
      setConfirmationCode("");
      setMotDePasseSuppression("");
      setMotifSuppression("");
      await chargerOperations();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de la suppression sécurisée.");
    } finally {
      setEnCoursSuppression(false);
    }
  }

  // Soumission du nettoyage par lot
  async function soumettreNettoyageLot(e: React.FormEvent) {
    e.preventDefault();
    if (selectionLot.length === 0) return;
    setEnCoursLot(true);
    setErreur(null);
    try {
      const res = await requeteApi<{ total_supprime: number }>(
        "/api/proprietaire/donnees-test/nettoyage-lot",
        {
          methode: "POST",
          jetonCsrf,
          corps: {
            operation_ids: selectionLot,
            confirmation_texte: confirmationTexteLot,
            mot_de_passe_confirmation: motDePasseLot,
            motif: motifLot,
          },
        },
      );
      setSucces(`Nettoyage par lot achevé : ${res.total_supprime} opération(s) test purgée(s) définitivement.`);
      setModalLotOuvert(false);
      setSelectionLot([]);
      setConfirmationTexteLot("");
      setMotDePasseLot("");
      setMotifLot("");
      await chargerOperations();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec du nettoyage par lot.");
    } finally {
      setEnCoursLot(false);
    }
  }

  function basculerSelection(id: string) {
    setSelectionLot((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function badgeNature(nature: NatureDonnees) {
    switch (nature) {
      case "TEST":
        return <span className="pastille-statut statut-test" style={{ backgroundColor: "#8b5cf6", color: "#fff", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold" }}>TEST</span>;
      case "REEL":
        return <span className="pastille-statut statut-reel" style={{ backgroundColor: "#2563eb", color: "#fff", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold" }}>RÉEL</span>;
      case "INDETERMINE":
      default:
        return <span className="pastille-statut statut-indetermine" style={{ backgroundColor: "#f59e0b", color: "#000", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold" }}>NON CONFIRMÉ</span>;
    }
  }

  function badgeEligibilite(statut: ResumeOperationDonneesTest["statut_eligibilite"]) {
    switch (statut) {
      case "ELIGIBLE":
        return <span className="badge-eligibilite-ok" style={{ color: "#16a34a", fontWeight: "bold" }}>✓ Éligible suppression</span>;
      case "PROTEGE_REEL":
        return <span className="badge-eligibilite-bloque" style={{ color: "#2563eb" }}>🛡️ Protégé (Données réelles)</span>;
      case "NON_CONFIRME":
        return <span className="badge-eligibilite-attention" style={{ color: "#d97706" }}>⚠️ Examen requis</span>;
      case "BLOQUE_MOUVEMENTS_STOCK":
        return <span className="badge-eligibilite-bloque" style={{ color: "#dc2626", fontWeight: "bold" }}>⛔ Bloqué (Mouvements de stock)</span>;
      case "BLOQUE_DISTRIBUTIONS_VALIDEES":
        return <span className="badge-eligibilite-bloque" style={{ color: "#dc2626", fontWeight: "bold" }}>⛔ Bloqué (Distributions validées)</span>;
    }
  }

  return (
    <section className="carte-section" aria-labelledby="titre-gestion-donnees-test" style={{ marginTop: "1.5rem" }}>
      <div className="titre-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 id="titre-gestion-donnees-test">Gestion et purge sécurisée des données de test</h2>
          <p className="texte-secondaire">
            Contrôle d’intégrité, reclassification motivée et suppression stricte des données opérationnelles de démonstration.
          </p>
        </div>
        <SIGADTabsList ariaLabel="Sous-sections des données de test">
          <SIGADTab actif={sousOnglet === "operations"} onClick={() => setSousOnglet("operations")}>
            Données opérationnelles
          </SIGADTab>
          <SIGADTab actif={sousOnglet === "historique"} onClick={() => setSousOnglet("historique")}>
            Historique des suppressions
          </SIGADTab>
        </SIGADTabsList>
      </div>

      {erreur && <SIGADAlert titre="Erreur de traitement" variante="danger">{erreur}</SIGADAlert>}
      {succes && <SIGADAlert titre="Opération réussie" variante="success">{succes}</SIGADAlert>}

      {sousOnglet === "operations" && (
        <>
          {/* Barre d'outils et de filtres */}
          <div className="barre-filtres" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", margin: "1rem 0", padding: "1rem", backgroundColor: "rgba(0,0,0,0.03)", borderRadius: "8px" }}>
            <div style={{ flex: "1 1 250px" }}>
              <label htmlFor="recherche-operation" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Recherche par code ou intitulé :</label>
              <input
                id="recherche-operation"
                type="text"
                placeholder="Ex : OPC-2026-B839B0 ou vivres..."
                value={recherche}
                onChange={(e) => { setRecherche(e.target.value); setDecalage(0); }}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
            </div>
            <div>
              <label htmlFor="filtre-nature" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Nature :</label>
              <select
                id="filtre-nature"
                value={filtreNature}
                onChange={(e) => { setFiltreNature(e.target.value as any); setDecalage(0); }}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
              >
                <option value="TOUTES">Toutes les natures</option>
                <option value="TEST">TEST uniquement</option>
                <option value="REEL">RÉEL uniquement</option>
                <option value="INDETERMINE">NON CONFIRMÉ (Indéterminé)</option>
              </select>
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button
                className="bouton bouton-discret"
                onClick={() => void chargerOperations()}
                disabled={chargement}
                type="button"
              >
                Actualiser
              </button>
            </div>
            {selectionLot.length > 0 && (
              <div style={{ alignSelf: "flex-end" }}>
                <button
                  className="bouton"
                  style={{ backgroundColor: "#dc2626", color: "#fff" }}
                  onClick={() => setModalLotOuvert(true)}
                  type="button"
                >
                  Nettoyer le lot ({selectionLot.length})
                </button>
              </div>
            )}
          </div>

          {/* Tableau des opérations */}
          <div className="tableau-defilement">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={operations.length > 0 && operations.filter((o) => o.eligible_suppression).every((o) => selectionLot.includes(o.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectionLot(operations.filter((o) => o.eligible_suppression).map((o) => o.id));
                        } else {
                          setSelectionLot([]);
                        }
                      }}
                    />
                  </th>
                  <th>Référence</th>
                  <th>Intitulé de l’opération</th>
                  <th>Nature</th>
                  <th>Statut</th>
                  <th>Dépendances</th>
                  <th>Éligibilité à la purge</th>
                  <th>Actions de sécurité</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((op) => (
                  <tr key={op.id} style={{ backgroundColor: op.eligible_suppression ? "rgba(139, 92, 246, 0.04)" : undefined }}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${op.code_operation}`}
                        disabled={!op.eligible_suppression}
                        checked={selectionLot.includes(op.id)}
                        onChange={() => basculerSelection(op.id)}
                      />
                    </td>
                    <td className="code-reference" style={{ fontWeight: "bold" }}>{op.code_operation}</td>
                    <td style={{ maxWidth: "260px" }}>
                      <div style={{ fontWeight: "500" }}>{op.intitule}</div>
                      <small className="texte-secondaire">Créée le {formaterDate(op.cree_le)}</small>
                    </td>
                    <td>{badgeNature(op.nature_donnees)}</td>
                    <td><span className="pastille-statut">{op.statut}</span></td>
                    <td style={{ fontSize: "0.85rem" }}>
                      <div>Provinces : {op.nb_provinces} | Dossiers : {op.nb_dossiers}</div>
                      <div>Distributions : {op.nb_distributions} | Docs : {op.nb_documents}</div>
                      {op.nb_mouvements_stock > 0 && (
                        <div style={{ color: "#dc2626", fontWeight: "bold" }}>Mouvements stock : {op.nb_mouvements_stock}</div>
                      )}
                    </td>
                    <td>{badgeEligibilite(op.statut_eligibilite)}</td>
                    <td>
                      <div className="actions-ligne" style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <button
                          className="bouton bouton-discret"
                          disabled={chargementInspection}
                          onClick={() => void inspecterOperation(op.id)}
                          type="button"
                          style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                        >
                          {chargementInspection ? "Chargement…" : "Inspecter"}
                        </button>
                        <button
                          className="bouton bouton-discret"
                          onClick={() => {
                            setOperationAReclassifier(op);
                            setCibleNature(op.nature_donnees === "TEST" ? "REEL" : "TEST");
                          }}
                          type="button"
                          style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                        >
                          Reclassifier
                        </button>
                        <button
                          className="bouton"
                          style={{
                            padding: "4px 8px",
                            fontSize: "0.85rem",
                            backgroundColor: op.eligible_suppression ? "#dc2626" : "#9ca3af",
                            color: "#fff",
                            cursor: op.eligible_suppression ? "pointer" : "not-allowed",
                          }}
                          disabled={!op.eligible_suppression}
                          onClick={() => setOperationASupprimer(op)}
                          type="button"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!chargement && operations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="cellule-vide">
                      Aucune opération trouvée pour les critères spécifiés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <SIGADPagination
            total={totalOperations}
            decalage={decalage}
            limite={TAILLE_PAGE}
            chargement={chargement}
            onChangement={setDecalage}
            nomEntite="opérations"
          />
        </>
      )}

      {/* Sous-onglet Historique des suppressions */}
      {sousOnglet === "historique" && (
        <div style={{ marginTop: "1rem" }}>
          <div className="tableau-defilement">
            <table>
              <thead>
                <tr>
                  <th>Date & Heure</th>
                  <th>Auteur</th>
                  <th>Référence purgée</th>
                  <th>Périmètre supprimé</th>
                  <th>Fichiers R2</th>
                  <th>Motif documenté</th>
                  <th>Résultat</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((h) => (
                  <tr key={h.id}>
                    <td>{formaterDate(h.horodatage)}</td>
                    <td>
                      <div><strong>{h.utilisateur_nom}</strong></div>
                      <small className="texte-secondaire">{h.utilisateur_identifiant} ({h.adresse_ip ?? "Local"})</small>
                    </td>
                    <td>
                      <div className="code-reference">{h.code_entite}</div>
                      <small>{h.intitule_entite}</small>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {Object.entries(h.perimetre_supprime || {}).map(([table, nb]) => (
                        <div key={table}>{table} : <strong>{nb}</strong></div>
                      ))}
                    </td>
                    <td>{h.documents_r2_supprimes?.length ?? 0} purge(s)</td>
                    <td style={{ maxWidth: "250px", fontStyle: "italic" }}>{h.motif}</td>
                    <td>
                      <SIGADBadge variante="success">
                        {h.statut_resultat}
                      </SIGADBadge>
                    </td>
                  </tr>
                ))}
                {!chargementHistorique && historique.length === 0 && (
                  <tr>
                    <td colSpan={7} className="cellule-vide">
                      Aucune suppression enregistrée dans le journal d'audit immuable.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <SIGADPagination
            total={totalHistorique}
            decalage={decalageHistorique}
            limite={TAILLE_PAGE}
            chargement={chargementHistorique}
            onChangement={setDecalageHistorique}
            nomEntite="suppressions tracées"
          />
        </div>
      )}

      {/* PANNEAU LATÉRAL 1 : Inspection détaillée & Cartographie de l'opération */}
      <SIGADDetailPanel
        ouvert={!!operationInspection}
        onFermer={() => setOperationInspection(null)}
        titre={operationInspection ? `${operationInspection.code_operation} — ${operationInspection.intitule}` : "Inspection"}
        description="Cartographie des dépendances et règles d'éligibilité à la purge"
        taille="lg"
        actionsSecondaires={
          operationInspection && (
            operationInspection.eligible ? (
              <SIGADButton
                variante="danger"
                onClick={() => {
                  setOperationASupprimer({
                    id: operationInspection.operation_id,
                    code_operation: operationInspection.code_operation,
                    intitule: operationInspection.intitule,
                    statut: operationInspection.statut,
                    nature_donnees: operationInspection.nature_donnees,
                    statut_eligibilite: operationInspection.statut_eligibilite,
                    eligible_suppression: true,
                    nb_provinces: operationInspection.dependances.nb_provinces,
                    nb_dossiers: operationInspection.dependances.nb_dossiers,
                    nb_distributions: operationInspection.dependances.nb_distributions,
                    nb_documents: operationInspection.dependances.nb_documents,
                    nb_mouvements_stock: operationInspection.dependances.nb_mouvements_stock,
                    cree_le: "",
                  });
                }}
              >
                Procéder à la suppression sécurisée
              </SIGADButton>
            ) : (
              <SIGADButton
                variante="secondary"
                onClick={() => {
                  setOperationAReclassifier({
                    id: operationInspection.operation_id,
                    code_operation: operationInspection.code_operation,
                    intitule: operationInspection.intitule,
                    statut: operationInspection.statut,
                    nature_donnees: operationInspection.nature_donnees,
                    statut_eligibilite: operationInspection.statut_eligibilite,
                    eligible_suppression: false,
                    nb_provinces: operationInspection.dependances.nb_provinces,
                    nb_dossiers: operationInspection.dependances.nb_dossiers,
                    nb_distributions: operationInspection.dependances.nb_distributions,
                    nb_documents: operationInspection.dependances.nb_documents,
                    nb_mouvements_stock: operationInspection.dependances.nb_mouvements_stock,
                    cree_le: "",
                  });
                  setOperationInspection(null);
                }}
              >
                Initier une revue de reclassification
              </SIGADButton>
            )
          )
        }
      >
        {operationInspection && (
          <div>
            <h4>1. Règles de conformité et de sécurité</h4>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {operationInspection.regles.map((r) => (
                <li
                  key={r.code}
                  style={{
                    padding: "0.5rem",
                    marginBottom: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: r.satisfaite ? "rgba(22, 163, 74, 0.08)" : "rgba(220, 38, 38, 0.08)",
                    borderLeft: `4px solid ${r.satisfaite ? "#16a34a" : "#dc2626"}`,
                  }}
                >
                  <div style={{ fontWeight: "bold", color: r.satisfaite ? "#16a34a" : "#dc2626" }}>
                    {r.satisfaite ? "✓" : "✗"} {r.intitule}
                  </div>
                  <div style={{ fontSize: "0.9rem", marginTop: "2px" }}>{r.detail}</div>
                </li>
              ))}
            </ul>

            <h4>2. Volume des enregistrements associés</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ padding: "0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "6px" }}>Provinces : <strong>{operationInspection.dependances.nb_provinces}</strong></div>
              <div style={{ padding: "0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "6px" }}>Dossiers : <strong>{operationInspection.dependances.nb_dossiers}</strong></div>
              <div style={{ padding: "0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "6px" }}>Approbations : <strong>{operationInspection.dependances.nb_approbations}</strong></div>
              <div style={{ padding: "0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "6px" }}>Documents : <strong>{operationInspection.dependances.nb_documents}</strong></div>
              <div style={{ padding: "0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "6px" }}>Distributions : <strong>{operationInspection.dependances.nb_distributions}</strong></div>
              <div style={{ padding: "0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "6px" }}>Mouvements stock : <strong>{operationInspection.dependances.nb_mouvements_stock}</strong></div>
            </div>

            {operationInspection.dependances.documents_r2.length > 0 && (
              <div>
                <h5>Fichiers R2 rattachés :</h5>
                <ul style={{ fontSize: "0.85rem", color: "var(--sigad-text-tertiary)" }}>
                  {operationInspection.dependances.documents_r2.map((doc) => (
                    <li key={doc.id}>{doc.nom_fichier_original} ({Math.round(doc.taille_octets / 1024)} Ko)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SIGADDetailPanel>

      {/* PANNEAU LATÉRAL 2 : Suppression sécurisée individuelle */}
      <SIGADConfirmPanel
        ouvert={!!operationASupprimer}
        onFermer={() => setOperationASupprimer(null)}
        onConfirmer={() => void soumettreSuppression({ preventDefault: () => {} } as any)}
        titre="Suppression irréversible d'une opération de test"
        description={operationASupprimer ? `Purger définitivement l'opération ${operationASupprimer.code_operation}` : "Suppression"}
        taille="md"
        variante="danger"
        libelleConfirmer={enCoursSuppression ? "Purge en cours…" : "Confirmer la suppression irréversible"}
        chargement={enCoursSuppression}
        desactiveConfirmer={
          !operationASupprimer ||
          enCoursSuppression ||
          confirmationCode.trim().toUpperCase() !== operationASupprimer.code_operation.trim().toUpperCase() ||
          !motDePasseSuppression ||
          motifSuppression.length < 5
        }
      >
        {operationASupprimer && (
          <form onSubmit={soumettreSuppression}>
            <p>
              Vous êtes sur le point de purger définitivement l'opération <strong>{operationASupprimer.code_operation}</strong> ainsi que tous ses dossiers et fichiers R2 associés.
            </p>

            <SIGADAlert titre="Avertissement de sécurité" variante="warning">
              Cette action détruit définitivement les enregistrements de test. Les données réelles, les comptes et les référentiels du système ne sont pas impactés. Un audit immuable sera créé.
            </SIGADAlert>

            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="confirm-code" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>
                1. Tapez exactement le code de l'opération (<strong>{operationASupprimer.code_operation}</strong>) :
              </label>
              <input
                id="confirm-code"
                type="text"
                required
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                placeholder={operationASupprimer.code_operation}
                className="sigad-input"
                style={{ fontFamily: "monospace", fontWeight: "bold" }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="motif-suppression" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>
                2. Motif documenté de la suppression :
              </label>
              <input
                id="motif-suppression"
                type="text"
                required
                minLength={5}
                value={motifSuppression}
                onChange={(e) => setMotifSuppression(e.target.value)}
                placeholder="Ex : Purge d'opération de test technique post-recette..."
                className="sigad-input"
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="mdp-suppression" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>
                3. Mot de passe du compte Propriétaire (ré-authentification requise) :
              </label>
              <input
                id="mdp-suppression"
                type="password"
                required
                value={motDePasseSuppression}
                onChange={(e) => setMotDePasseSuppression(e.target.value)}
                placeholder="Mot de passe du propriétaire..."
                className="sigad-input"
              />
            </div>
          </form>
        )}
      </SIGADConfirmPanel>

      {/* PANNEAU LATÉRAL 3 : Reclassification formelle */}
      <SIGADFormPanel
        ouvert={!!operationAReclassifier}
        onFermer={() => setOperationAReclassifier(null)}
        onSoumettre={() => void soumettreReclassification({ preventDefault: () => {} } as any)}
        surtitre="Qualification des données"
        titre="Procédure administrative de reclassification"
        description={operationAReclassifier ? `Opération : ${operationAReclassifier.code_operation} (Actuel : ${operationAReclassifier.nature_donnees})` : "Reclassification"}
        taille="lg"
        libelleSoumettre={enCoursReclass ? "Enregistrement…" : "Valider la reclassification"}
        chargement={enCoursReclass}
        desactiveSoumettre={enCoursReclass || motifReclassification.length < 10 || preuvesJustificatives.length < 10 || !motDePasseReclass}
        modifieNonEnregistre={motifReclassification.length > 0 || preuvesJustificatives.length > 0}
      >
        {operationAReclassifier && (
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="reclass-cible" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Nouvelle classification :</label>
              <select
                id="reclass-cible"
                value={cibleNature}
                onChange={(e) => setCibleNature(e.target.value as any)}
                className="sigad-select"
              >
                <option value="TEST">TEST — Données de démonstration et tests techniques</option>
                <option value="REEL">RÉEL — Données opérationnelles réelles (protégées)</option>
              </select>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="reclass-motif" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Motif formel (min. 10 caractères) :</label>
              <input
                id="reclass-motif"
                type="text"
                required
                minLength={10}
                value={motifReclassification}
                onChange={(e) => setMotifReclassification(e.target.value)}
                placeholder="Ex : Certification d'opération créée lors de la recette technique..."
                className="sigad-input"
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="reclass-preuves" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Éléments justificatifs et preuves vérifiables :</label>
              <textarea
                id="reclass-preuves"
                required
                minLength={10}
                rows={3}
                value={preuvesJustificatives}
                onChange={(e) => setPreuvesJustificatives(e.target.value)}
                placeholder="Détaillez les preuves : aucun bénéficiaire réel, aucun stock réel mouvementé, tests d'acceptation..."
                className="sigad-textarea"
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="reclass-mdp" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Mot de passe Propriétaire pour validation :</label>
              <input
                id="reclass-mdp"
                type="password"
                required
                value={motDePasseReclass}
                onChange={(e) => setMotDePasseReclass(e.target.value)}
                placeholder="Mot de passe propriétaire..."
                className="sigad-input"
              />
            </div>
          </div>
        )}
      </SIGADFormPanel>

      {/* PANNEAU LATÉRAL 4 : Nettoyage par lot */}
      <SIGADConfirmPanel
        ouvert={modalLotOuvert}
        onFermer={() => setModalLotOuvert(false)}
        onConfirmer={() => void soumettreNettoyageLot({ preventDefault: () => {} } as any)}
        titre="Nettoyage par lot de données de test"
        description={`Vous avez sélectionné ${selectionLot.length} opération(s) de test confirmée(s) pour suppression définitive.`}
        taille="md"
        variante="danger"
        libelleConfirmer={enCoursLot ? "Suppression du lot…" : "Purger le lot sélectionné"}
        chargement={enCoursLot}
        desactiveConfirmer={
          enCoursLot ||
          confirmationTexteLot !== "SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST" ||
          !motDePasseLot ||
          motifLot.length < 5
        }
      >
        <form onSubmit={soumettreNettoyageLot}>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="lot-motif" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Motif du nettoyage :</label>
            <input
              id="lot-motif"
              type="text"
              required
              minLength={5}
              value={motifLot}
              onChange={(e) => setMotifLot(e.target.value)}
              placeholder="Ex : Clôture générale de la session de test..."
              className="sigad-input"
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="lot-confirm-text" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>
              Saisissez exactement : <code>SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST</code>
            </label>
            <input
              id="lot-confirm-text"
              type="text"
              required
              value={confirmationTexteLot}
              onChange={(e) => setConfirmationTexteLot(e.target.value)}
              placeholder="SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST"
              className="sigad-input"
              style={{ fontFamily: "monospace" }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="lot-mdp" className="texte-gras" style={{ display: "block", marginBottom: "4px" }}>Mot de passe Propriétaire :</label>
            <input
              id="lot-mdp"
              type="password"
              required
              value={motDePasseLot}
              onChange={(e) => setMotDePasseLot(e.target.value)}
              placeholder="Mot de passe propriétaire..."
              className="sigad-input"
            />
          </div>
        </form>
      </SIGADConfirmPanel>
    </section>
  );
}
