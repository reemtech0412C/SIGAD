import { useMemo, useState } from "react";
import type { RoleSIGAD } from "../../../../shared/permissions/catalogue";
import { decisionDeclaree, rechercherPolitiques, resumerParRole, type DecisionDeclaree } from "../../consoles/simulateur-permissions";
import { SIGADAlert, SIGADCard, SIGADCardBody, SIGADCardHeader, SIGADCardSubtitle, SIGADCardTitle, SIGADTable } from "../ui";

const ROLES: ReadonlyArray<{ code: RoleSIGAD; libelle: string }> = [
  { code: "PROPRIETAIRE", libelle: "Propriétaire" },
  { code: "ADMIN_CENTRAL", libelle: "Administration centrale" },
  { code: "DELEGUE_PROVINCIAL", libelle: "Délégué provincial" },
  { code: "RESPONSABLE_STOCK", libelle: "Responsable des stocks" },
  { code: "SUPERVISEUR_TERRAIN", libelle: "Superviseur de terrain" },
  { code: "AGENT_DISTRIBUTION", libelle: "Agent de distribution" },
  { code: "CONSULTATION_INSTITUTIONNELLE", libelle: "Consultation institutionnelle" },
];

const LIBELLES: Record<DecisionDeclaree, string> = {
  AUTORISE: "Autorisé",
  CONDITIONNEL: "Conditionnel",
  REFUSE: "Refusé",
  SESSION_SEULE: "Toute session",
  PUBLIC: "Public / pré-authentification",
};
const DECISIONS = Object.keys(LIBELLES) as DecisionDeclaree[];

export function PermissionsPlateforme() {
  const [role, setRole] = useState<RoleSIGAD>("PROPRIETAIRE");
  const [filtre, setFiltre] = useState("");
  const [decision, setDecision] = useState<DecisionDeclaree | "TOUTES">("TOUTES");
  const resume = useMemo(() => resumerParRole(role), [role]);
  const lignes = useMemo(
    () => rechercherPolitiques(filtre)
      .map((politique) => ({ politique, decision: decisionDeclaree(politique, role) }))
      .filter((ligne) => decision === "TOUTES" || ligne.decision === decision),
    [filtre, role, decision],
  );

  return (
    <SIGADCard as="section" ariaLabelledby="titre-permissions">
      <SIGADCardHeader>
        <div>
          <SIGADCardTitle as="h2" id="titre-permissions">Rôles et permissions</SIGADCardTitle>
          <SIGADCardSubtitle>Lecture et simulation de la politique déclarée. Aucune donnée nominative; aucune modification possible ici.</SIGADCardSubtitle>
        </div>
      </SIGADCardHeader>
      <SIGADCardBody>
        <SIGADAlert variante="info">
          Ce simulateur lit le catalogue des routes (politique Legacy déclarée). Il ne reflète ni l’état d’une session, ni l’affectation, ni la propriété d’une ressource: le serveur reste l’autorité d’accès.
        </SIGADAlert>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
          <label>Rôle simulé{" "}
            <select aria-label="Rôle simulé" onChange={(e) => setRole(e.target.value as RoleSIGAD)} value={role}>
              {ROLES.map((r) => <option key={r.code} value={r.code}>{r.libelle}</option>)}
            </select>
          </label>
          <label>Décision{" "}
            <select aria-label="Filtre de décision" onChange={(e) => setDecision(e.target.value as DecisionDeclaree | "TOUTES")} value={decision}>
              <option value="TOUTES">Toutes</option>
              {DECISIONS.map((d) => <option key={d} value={d}>{LIBELLES[d]}</option>)}
            </select>
          </label>
          <label>Route{" "}
            <input aria-label="Filtrer les routes" onChange={(e) => setFiltre(e.target.value)} placeholder="ex. GET /api/stocks" type="search" value={filtre} />
          </label>
        </div>
        <p data-testid="resume-permissions">{DECISIONS.map((d) => `${LIBELLES[d]}: ${resume[d]}`).join(" · ")}</p>
        <SIGADTable>
          <thead><tr><th>Méthode</th><th>Route</th><th>Décision déclarée</th><th>Portée</th></tr></thead>
          <tbody>
            {lignes.slice(0, 200).map(({ politique, decision: d }) => (
              <tr key={politique.permission}>
                <td>{politique.methode}</td>
                <td className="code-reference">{politique.chemin}</td>
                <td>{LIBELLES[d]}</td>
                <td>{politique.portee}</td>
              </tr>
            ))}
          </tbody>
        </SIGADTable>
      </SIGADCardBody>
    </SIGADCard>
  );
}
