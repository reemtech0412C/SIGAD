import { useEffect, useState } from "react";
import { requeteApi } from "../../services/api";
import { formaterDate } from "../../utils/formatters";
import {
  formaterEcartJours,
  formaterPourcentage,
  type IndicateursPerformanceUI,
  type ReponsePerformanceUI,
} from "../../consoles/performance-format";
import { SIGADAlert, SIGADCard, SIGADCardBody, SIGADCardHeader, SIGADCardSubtitle, SIGADCardTitle, SIGADEmptyState, SIGADTable } from "../ui";

function Ligne({ indicateurs, national = false }: { indicateurs: IndicateursPerformanceUI; national?: boolean }) {
  return (
    <tr data-testid={national ? "performance-national" : "performance-province"} style={national ? { fontWeight: 700 } : undefined}>
      <td>{indicateurs.provinceNom}</td>
      <td>{indicateurs.distributions}</td>
      <td>{formaterPourcentage(indicateurs.avancementDistributions)}</td>
      <td>{formaterPourcentage(indicateurs.couvertureService)}</td>
      <td>{indicateurs.menagesServis} / {indicateurs.menagesAssignes}</td>
      <td>{indicateurs.distributionsEnRetard} ({formaterPourcentage(indicateurs.tauxRetard)})</td>
      <td>{formaterEcartJours(indicateurs.ponctualiteMedianeJours)}</td>
    </tr>
  );
}

export function PerformanceDelegations() {
  const [donnees, setDonnees] = useState<ReponsePerformanceUI | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    requeteApi<ReponsePerformanceUI>("/api/central/performance-delegations")
      .then((reponse) => { if (actif) setDonnees(reponse); })
      .catch((cause: unknown) => { if (actif) setErreur(cause instanceof Error ? cause.message : "Le chargement a échoué."); });
    return () => { actif = false; };
  }, []);

  return (
    <div className="contenu-tableau" style={{ display: "grid", gap: "1.5rem" }}>
      <SIGADCard as="section" ariaLabelledby="titre-performance">
        <SIGADCardHeader>
          <div>
            <SIGADCardTitle as="h1" id="titre-performance">Performance des délégations</SIGADCardTitle>
            <SIGADCardSubtitle>
              Indicateurs agrégés par province, calculés sur les distributions hors brouillon. Lecture seule, aucune donnée nominative.
              {donnees ? ` Calculé le ${formaterDate(donnees.genere_le)}.` : ""}
            </SIGADCardSubtitle>
          </div>
        </SIGADCardHeader>
        <SIGADCardBody>
          {erreur && <SIGADAlert variante="danger">{erreur}</SIGADAlert>}
          {donnees && (
            <SIGADTable>
              <thead>
                <tr>
                  <th>Province</th><th>Distributions</th><th>Avancement</th><th>Couverture de service</th>
                  <th>Ménages servis</th><th>En retard</th><th>Ponctualité (médiane)</th>
                </tr>
              </thead>
              <tbody>
                <Ligne indicateurs={donnees.national} national />
                {donnees.provinces.map((province) => <Ligne indicateurs={province} key={province.provinceId} />)}
                {donnees.provinces.length === 0 && (
                  <tr><td colSpan={7}><SIGADEmptyState title="Aucune distribution" description="Aucune distribution hors brouillon à analyser." /></td></tr>
                )}
              </tbody>
            </SIGADTable>
          )}
        </SIGADCardBody>
      </SIGADCard>

      <SIGADCard as="section" ariaLabelledby="titre-definitions">
        <SIGADCardHeader>
          <SIGADCardTitle as="h2" id="titre-definitions">Définitions</SIGADCardTitle>
        </SIGADCardHeader>
        <SIGADCardBody>
          <ul>
            <li><strong>Avancement</strong>: distributions terminées ou clôturées / distributions hors brouillon.</li>
            <li><strong>Couverture de service</strong>: ménages servis / ménages assignés (les services partiels sont comptés à part).</li>
            <li><strong>En retard</strong>: distributions non terminées dont la date prévue est dépassée.</li>
            <li><strong>Ponctualité</strong>: écart médian entre la déclaration de fin et la date prévue.</li>
            <li><strong>n/d</strong>: aucune population à mesurer; ce n’est pas une performance nulle.</li>
          </ul>
          {donnees && donnees.indicateurs_a_venir.length > 0 && (
            <SIGADAlert variante="info">
              À venir avec la collecte (Phase 4): délai de validation des ménages, taux de rejet, activité de collecte.
            </SIGADAlert>
          )}
        </SIGADCardBody>
      </SIGADCard>
    </div>
  );
}
