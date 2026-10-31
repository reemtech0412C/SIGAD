import { useCallback, useEffect, useState } from "react";
import { requeteApi } from "../../services/api";
import { formaterDate } from "../../utils/formatters";
import {
  actionsDisponibles,
  codeTotpValide,
  libelleChangement,
  LIBELLES_STATUT,
  motifValide,
  type ActionDemande,
  type DemandeApprobationUI,
  type DrapeauUI,
  type StatutDemande,
} from "../../consoles/actions-approbation";
import {
  SIGADAlert,
  SIGADBadge,
  SIGADButton,
  SIGADCard,
  SIGADCardBody,
  SIGADCardHeader,
  SIGADCardSubtitle,
  SIGADCardTitle,
  SIGADEmptyState,
  SIGADTable,
} from "../ui";

interface Props {
  jetonCsrf: string;
  utilisateurId: string;
}

const BASE = "/api/proprietaire/plateforme";
const LIBELLES_ACTION: Record<ActionDemande, string> = {
  approuver: "Approuver",
  refuser: "Refuser",
  annuler: "Annuler",
  executer: "Exécuter",
};

type PanneauAction =
  | { type: "drapeau"; drapeau: DrapeauUI }
  | { type: "demande"; action: ActionDemande; demande: DemandeApprobationUI };

function variantePourStatut(statut: StatutDemande): "success" | "warning" | "danger" | "info" {
  if (statut === "EXECUTEE" || statut === "APPROUVEE") return "success";
  if (statut === "EN_ATTENTE") return "warning";
  if (statut === "REFUSEE") return "danger";
  return "info";
}

export function ApprobationsPlateforme({ jetonCsrf, utilisateurId }: Props) {
  const [drapeaux, setDrapeaux] = useState<DrapeauUI[]>([]);
  const [demandes, setDemandes] = useState<DemandeApprobationUI[]>([]);
  const [filtre, setFiltre] = useState<StatutDemande | "TOUTES">("EN_ATTENTE");
  const [panneau, setPanneau] = useState<PanneauAction | null>(null);
  const [motif, setMotif] = useState("");
  const [codeTotp, setCodeTotp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const statut = filtre === "TOUTES" ? "" : `?statut=${filtre}`;
      const [listeDrapeaux, listeDemandes] = await Promise.all([
        requeteApi<{ donnees: DrapeauUI[] }>(`${BASE}/drapeaux`),
        requeteApi<{ donnees: DemandeApprobationUI[] }>(`${BASE}/approbations${statut}`),
      ]);
      setDrapeaux(listeDrapeaux.donnees);
      setDemandes(listeDemandes.donnees);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le chargement a échoué.");
    }
  }, [filtre]);

  useEffect(() => { void charger(); }, [charger]);

  function ouvrir(nouveau: PanneauAction): void {
    setPanneau(nouveau);
    setMotif("");
    setCodeTotp("");
    setErreur(null);
    setMessage(null);
  }

  const motifRequis = panneau !== null && !(panneau.type === "demande" && panneau.action === "executer")
    && !(panneau.type === "demande" && panneau.action === "approuver");
  const formulaireValide = panneau !== null
    && (!motifRequis || motifValide(motif))
    && (panneau.type !== "demande" || panneau.action !== "approuver" || codeTotpValide(codeTotp));

  async function soumettre(): Promise<void> {
    if (!panneau || !formulaireValide) return;
    setEnvoi(true);
    setErreur(null);
    try {
      if (panneau.type === "drapeau") {
        const { drapeau } = panneau;
        if (drapeau.double_controle) {
          await requeteApi(`${BASE}/approbations`, {
            methode: "POST", jetonCsrf, corps: { drapeau_code: drapeau.code, actif: !drapeau.actif, motif: motif.trim() },
          });
          setMessage("Demande créée. Un autre propriétaire doit l’approuver avec son code MFA.");
        } else {
          await requeteApi(`${BASE}/drapeaux/${drapeau.code}`, {
            methode: "PUT", jetonCsrf, corps: { actif: !drapeau.actif, motif: motif.trim() },
          });
          setMessage("Drapeau modifié.");
        }
      } else {
        const { action, demande } = panneau;
        const corps = action === "approuver"
          ? { code_totp: codeTotp, ...(motif.trim() ? { motif_decision: motif.trim() } : {}) }
          : action === "executer" ? {} : { motif_decision: motif.trim() };
        await requeteApi(`${BASE}/approbations/${demande.id}/${action}`, { methode: "POST", jetonCsrf, corps });
        setMessage(`Action « ${LIBELLES_ACTION[action]} » enregistrée.`);
      }
      setPanneau(null);
      await charger();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "L’opération a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {message && <SIGADAlert variante="success">{message}</SIGADAlert>}
      {erreur && <SIGADAlert variante="danger">{erreur}</SIGADAlert>}

      <SIGADCard as="section" ariaLabelledby="titre-drapeaux">
        <SIGADCardHeader>
          <div>
            <SIGADCardTitle as="h2" id="titre-drapeaux">Drapeaux de plateforme</SIGADCardTitle>
            <SIGADCardSubtitle>Catalogue fermé. Un drapeau à double contrôle ne change qu’après approbation par un autre propriétaire.</SIGADCardSubtitle>
          </div>
        </SIGADCardHeader>
        <SIGADCardBody>
          <SIGADTable>
            <thead><tr><th>Drapeau</th><th>Catégorie</th><th>État</th><th>Contrôle</th><th>Action</th></tr></thead>
            <tbody>
              {drapeaux.map((drapeau) => (
                <tr key={drapeau.code}>
                  <td><span className="code-reference">{drapeau.code}</span><br /><small>{drapeau.description}</small></td>
                  <td>{drapeau.categorie}</td>
                  <td><SIGADBadge variante={drapeau.actif ? "success" : "info"}>{drapeau.actif ? "Actif" : "Inactif"}</SIGADBadge></td>
                  <td>{drapeau.double_controle ? "Double contrôle" : "Simple, motivé"}</td>
                  <td>
                    <SIGADButton onClick={() => ouvrir({ type: "drapeau", drapeau })} taille="sm" type="button" variante="secondary">
                      {drapeau.double_controle ? (drapeau.actif ? "Demander la désactivation" : "Demander l’activation")
                        : (drapeau.actif ? "Désactiver" : "Activer")}
                    </SIGADButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </SIGADTable>
        </SIGADCardBody>
      </SIGADCard>

      {panneau && (
        <SIGADCard as="section" ariaLabelledby="titre-action">
          <SIGADCardHeader>
            <div>
              <SIGADCardTitle as="h2" id="titre-action">
                {panneau.type === "drapeau"
                  ? `${panneau.drapeau.double_controle ? "Demande d’approbation" : "Bascule"} — ${panneau.drapeau.code}`
                  : `${LIBELLES_ACTION[panneau.action]} — ${libelleChangement(panneau.demande)}`}
              </SIGADCardTitle>
              <SIGADCardSubtitle>
                {panneau.type === "demande" && panneau.action === "approuver"
                  ? "Saisissez le code à 6 chiffres de votre application d’authentification: il prouve que vous êtes présent."
                  : panneau.type === "demande" && panneau.action === "executer"
                    ? "L’exécution est à usage unique et applique exactement l’action approuvée."
                    : "Un motif d’au moins 10 caractères est obligatoire et sera journalisé."}
              </SIGADCardSubtitle>
            </div>
          </SIGADCardHeader>
          <SIGADCardBody>
            <form onSubmit={(e) => { e.preventDefault(); void soumettre(); }} style={{ display: "grid", gap: "0.75rem", maxWidth: "36rem" }}>
              {panneau.type === "demande" && panneau.action === "approuver" && (
                <label>Code MFA
                  <input aria-label="Code MFA" autoComplete="one-time-code" inputMode="numeric" maxLength={6}
                    onChange={(e) => setCodeTotp(e.target.value.replace(/\D/gu, ""))} value={codeTotp} />
                </label>
              )}
              {!(panneau.type === "demande" && panneau.action === "executer") && (
                <label>{panneau.type === "demande" && panneau.action === "approuver" ? "Commentaire (facultatif)" : "Motif"}
                  <textarea aria-label="Motif" maxLength={500} onChange={(e) => setMotif(e.target.value)} rows={3} value={motif} />
                </label>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <SIGADButton chargement={envoi} disabled={!formulaireValide || envoi} type="submit">Confirmer</SIGADButton>
                <SIGADButton onClick={() => setPanneau(null)} type="button" variante="secondary">Fermer</SIGADButton>
              </div>
            </form>
          </SIGADCardBody>
        </SIGADCard>
      )}

      <SIGADCard as="section" ariaLabelledby="titre-demandes">
        <SIGADCardHeader>
          <div>
            <SIGADCardTitle as="h2" id="titre-demandes">Demandes d’approbation</SIGADCardTitle>
            <SIGADCardSubtitle>Valables 24 h. Vous ne pouvez ni approuver ni refuser vos propres demandes.</SIGADCardSubtitle>
          </div>
          <label>Statut{" "}
            <select aria-label="Filtre de statut" onChange={(e) => setFiltre(e.target.value as StatutDemande | "TOUTES")} value={filtre}>
              <option value="TOUTES">Toutes</option>
              {(Object.keys(LIBELLES_STATUT) as StatutDemande[]).map((s) => <option key={s} value={s}>{LIBELLES_STATUT[s]}</option>)}
            </select>
          </label>
        </SIGADCardHeader>
        <SIGADCardBody>
          <SIGADTable>
            <thead><tr><th>Changement</th><th>Motif</th><th>Statut</th><th>Créée</th><th>Expire</th><th>Actions</th></tr></thead>
            <tbody>
              {demandes.map((demande) => (
                <tr key={demande.id}>
                  <td>{libelleChangement(demande)}<br /><small>{demande.demandeur_id === utilisateurId ? "Votre demande" : "Demande d’un autre propriétaire"}</small></td>
                  <td>{demande.motif}{demande.motif_decision ? <><br /><small>Décision: {demande.motif_decision}</small></> : null}</td>
                  <td><SIGADBadge variante={variantePourStatut(demande.statut)}>{LIBELLES_STATUT[demande.statut]}</SIGADBadge></td>
                  <td>{formaterDate(demande.cree_le)}</td>
                  <td>{formaterDate(demande.expire_le)}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {actionsDisponibles(demande, utilisateurId).map((action) => (
                        <SIGADButton key={action} onClick={() => ouvrir({ type: "demande", action, demande })} taille="sm" type="button"
                          variante={action === "refuser" || action === "annuler" ? "secondary" : "primary"}>
                          {LIBELLES_ACTION[action]}
                        </SIGADButton>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {demandes.length === 0 && (
                <tr><td colSpan={6}><SIGADEmptyState title="Aucune demande" description="Aucune demande ne correspond à ce filtre." /></td></tr>
              )}
            </tbody>
          </SIGADTable>
        </SIGADCardBody>
      </SIGADCard>
    </div>
  );
}
