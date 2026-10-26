import { useCallback, useEffect, useState } from "react";
import { PROVINCES_TCHADIENNES } from "../../../../shared/constantes/provinces";
import type { EntreeJournalAudit, ReponsePagination, UtilisateurAdmin } from "../../../../shared/types/authentification";
import { formaterDate } from "../../utils/formatters";
import { requeteApi } from "../../services/api";
import {
  SIGADAlert,
  SIGADBadge,
  SIGADButton,
  SIGADCard,
  SIGADCardBody,
  SIGADCardHeader,
  SIGADCardSubtitle,
  SIGADCardTitle,
  SIGADDetailPanel,
  SIGADEmptyState,
  SIGADPagination,
  SIGADTab,
  SIGADTable,
  SIGADTabsList,
} from "../ui";
import { GestionDonneesTest } from "./GestionDonneesTest";
import { AdministrationTerritoriale } from "./AdministrationTerritoriale";

interface TableauProprietaireProps {
  jetonCsrf: string;
}

const TAILLE_PAGE = 20;

function nomProvince(provinceId: string | null): string {
  if (!provinceId) return "National";
  return PROVINCES_TCHADIENNES.find((province) => `prov-${province.identifiantCompte}` === provinceId)?.nom ?? provinceId;
}

function libelleRole(role: UtilisateurAdmin["role"]): string {
  if (role === "PROPRIETAIRE") return "Propriétaire";
  if (role === "ADMIN_CENTRAL") return "Administration centrale";
  return "Délégation provinciale";
}

export function TableauProprietaire({ jetonCsrf }: TableauProprietaireProps) {
  const lireOngletDepuisUrl = useCallback((): "comptes" | "audit" | "donnees_test" | "territoire" => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const search = window.location.search;
      if (hash === "#territoire" || search.includes("section=territoire") || search.includes("vue=")) {
        return "territoire";
      }
      if (hash === "#donnees-test" || search.includes("section=donnees-test")) {
        return "donnees_test";
      }
      if (hash === "#audit" || search.includes("section=audit")) {
        return "audit";
      }
    }
    return "comptes";
  }, []);

  const [onglet, setOnglet] = useState<"comptes" | "audit" | "donnees_test" | "territoire">(lireOngletDepuisUrl);
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurAdmin[]>([]);
  const [journaux, setJournaux] = useState<EntreeJournalAudit[]>([]);
  const [totalUtilisateurs, setTotalUtilisateurs] = useState(0);
  const [decalage, setDecalage] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [codeActivationReinitialise, setCodeActivationReinitialise] = useState<{
    identifiant: string;
    nom_complet: string;
    code_activation: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const synchroniser = () => setOnglet(lireOngletDepuisUrl());
    window.addEventListener("popstate", synchroniser);
    window.addEventListener("hashchange", synchroniser);
    const interval = window.setInterval(synchroniser, 250);
    return () => {
      window.removeEventListener("popstate", synchroniser);
      window.removeEventListener("hashchange", synchroniser);
      window.clearInterval(interval);
    };
  }, [lireOngletDepuisUrl]);

  const chargerDonnees = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const [reponseUtilisateurs, reponseJournaux] = await Promise.all([
        requeteApi<ReponsePagination<UtilisateurAdmin>>(`/api/proprietaire/utilisateurs?limite=${TAILLE_PAGE}&decalage=${decalage}`),
        requeteApi<ReponsePagination<EntreeJournalAudit>>(`/api/proprietaire/audit?limite=${TAILLE_PAGE}&decalage=0`),
      ]);
      setUtilisateurs(reponseUtilisateurs.elements);
      setTotalUtilisateurs(reponseUtilisateurs.total);
      setJournaux(reponseJournaux.elements);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le chargement des données a échoué.");
    } finally {
      setChargement(false);
    }
  }, [decalage]);

  useEffect(() => {
    if (onglet !== "donnees_test" && onglet !== "territoire") {
      void chargerDonnees();
    }
  }, [chargerDonnees, jetonCsrf, onglet]);

  async function modifierStatut(utilisateur: UtilisateurAdmin): Promise<void> {
    const statut = utilisateur.statut === "SUSPENDU" ? "ACTIF" : "SUSPENDU";
    try {
      await requeteApi<{ message: string }>(`/api/proprietaire/utilisateurs/${encodeURIComponent(utilisateur.id)}/statut`, {
        methode: "PATCH",
        jetonCsrf,
        corps: { statut },
      });
      await chargerDonnees();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La mise à jour du compte a échoué.");
    }
  }

  async function reinitialiserAcces(utilisateur: UtilisateurAdmin): Promise<void> {
    try {
      const reponse = await requeteApi<{ code_activation: string; message: string }>(
        `/api/proprietaire/utilisateurs/${encodeURIComponent(utilisateur.id)}/reinitialiser-acces`,
        { methode: "POST", jetonCsrf },
      );
      setCodeActivationReinitialise({
        identifiant: utilisateur.identifiant,
        nom_complet: utilisateur.nom_complet,
        code_activation: reponse.code_activation,
        message: reponse.message,
      });
      await chargerDonnees();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La réinitialisation de l’accès a échoué.");
    }
  }

  return (
    <div className="contenu-tableau">
      <div className="sigad-compact-meta">
        <SIGADBadge variant="neutral" withDot>
          Propriétaire
        </SIGADBadge>
      </div>

      {/* Navigation principale de l'administration propriétaire */}
      <div style={{ marginBottom: "1.5rem" }}>
        <SIGADTabsList ariaLabel="Navigation administration propriétaire">
          <SIGADTab
            active={onglet === "comptes"}
            badgeCount={totalUtilisateurs || 25}
            onClick={() => {
              setOnglet("comptes");
              window.history.replaceState(null, "", window.location.pathname);
            }}
          >
            Comptes utilisateurs
          </SIGADTab>

          <SIGADTab
            active={onglet === "audit"}
            onClick={() => {
              setOnglet("audit");
              window.history.replaceState(null, "", "#audit");
            }}
          >
            Journal d’audit
          </SIGADTab>

          <SIGADTab
            active={onglet === "territoire"}
            badge="112 dépts"
            onClick={() => {
              setOnglet("territoire");
              window.history.replaceState(null, "", "#territoire");
            }}
          >
            Référentiel territorial
          </SIGADTab>

          <SIGADTab
            active={onglet === "donnees_test"}
            badge="Purge / Données"
            onClick={() => {
              setOnglet("donnees_test");
              window.history.replaceState(null, "", "#donnees-test");
            }}
          >
            Gestion des données de test
          </SIGADTab>
        </SIGADTabsList>
      </div>

      {onglet === "territoire" && (
        <AdministrationTerritoriale jetonCsrf={jetonCsrf} />
      )}

      {onglet === "donnees_test" && (
        <GestionDonneesTest jetonCsrf={jetonCsrf} />
      )}

      {onglet === "comptes" && (
        <>
          {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
          <SIGADCard as="section" id="comptes" ariaLabelledby="titre-utilisateurs">
            <SIGADCardHeader>
              <div>
                <SIGADCardTitle as="h2" id="titre-utilisateurs">Comptes utilisateurs</SIGADCardTitle>
                <SIGADCardSubtitle>Gestion des 25 comptes de référence et de leurs accès.</SIGADCardSubtitle>
              </div>
              <SIGADBadge variant="neutral">{totalUtilisateurs} comptes</SIGADBadge>
            </SIGADCardHeader>
            <SIGADCardBody>
              <SIGADTable>
                <thead>
                  <tr>
                    <th>Identifiant</th>
                    <th>Nom complet</th>
                    <th>Fonction</th>
                    <th>Périmètre</th>
                    <th>Statut</th>
                    <th>Dernière connexion</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {utilisateurs.map((utilisateur) => (
                    <tr key={utilisateur.id}>
                      <td className="texte-gras">{utilisateur.identifiant}</td>
                      <td>{utilisateur.nom_complet}</td>
                      <td>{libelleRole(utilisateur.role)}</td>
                      <td>{nomProvince(utilisateur.province_id)}</td>
                      <td>
                        <SIGADBadge
                          variant={utilisateur.statut === "ACTIF" ? "success" : "danger"}
                          withDot
                        >
                          {utilisateur.statut}
                        </SIGADBadge>
                      </td>
                      <td>{formaterDate(utilisateur.derniere_connexion)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <SIGADButton
                            variant="outline"
                            size="sm"
                            onClick={() => void reinitialiserAcces(utilisateur)}
                          >
                            Réinitialiser l’accès
                          </SIGADButton>
                          <SIGADButton
                            variant={utilisateur.statut === "SUSPENDU" ? "secondary" : "danger"}
                            size="sm"
                            disabled={utilisateur.role === "PROPRIETAIRE" && utilisateur.statut === "ACTIF"}
                            onClick={() => void modifierStatut(utilisateur)}
                          >
                            {utilisateur.statut === "SUSPENDU" ? "Réactiver" : "Suspendre"}
                          </SIGADButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!chargement && utilisateurs.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <SIGADEmptyState
                          title="Aucun compte utilisateur"
                          description="Aucun compte utilisateur n'a été retourné pour cette sélection."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </SIGADTable>
              <SIGADPagination
                total={totalUtilisateurs}
                decalage={decalage}
                taillePage={TAILLE_PAGE}
                chargement={chargement}
                onPageChange={(nouveauDecalage) => setDecalage(nouveauDecalage)}
              />
            </SIGADCardBody>
          </SIGADCard>
        </>
      )}

      {onglet === "audit" && (
        <SIGADCard as="section" id="audit" ariaLabelledby="titre-audit">
          <SIGADCardHeader>
            <div>
              <SIGADCardTitle as="h2" id="titre-audit">Journal d’audit</SIGADCardTitle>
              <SIGADCardSubtitle>Historique des connexions et des actions de gestion des comptes.</SIGADCardSubtitle>
            </div>
          </SIGADCardHeader>
          <SIGADCardBody>
            <SIGADTable>
              <thead>
                <tr><th>Date</th><th>Utilisateur</th><th>Rôle</th><th>Action</th><th>Entité</th><th>Référence</th></tr>
              </thead>
              <tbody>
                {journaux.map((entree) => (
                  <tr key={entree.id}>
                    <td>{formaterDate(entree.cree_le)}</td>
                    <td>{entree.utilisateur_id}</td>
                    <td>{libelleRole(entree.role_utilisateur)}</td>
                    <td>{entree.action.replaceAll("_", " ")}</td>
                    <td>{entree.entite_type}</td>
                    <td className="code-reference">{entree.entite_id}</td>
                  </tr>
                ))}
                {!chargement && journaux.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <SIGADEmptyState
                        title="Journal d'audit vide"
                        description="Aucune action d’audit récente à afficher."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </SIGADTable>
          </SIGADCardBody>
        </SIGADCard>
      )}

      {chargement && onglet !== "donnees_test" && (
        <p className="texte-secondaire" role="status" style={{ marginTop: "1rem" }}>
          Chargement des données…
        </p>
      )}

      <SIGADDetailPanel
        open={Boolean(codeActivationReinitialise)}
        onClose={() => setCodeActivationReinitialise(null)}
        title="Code d’activation réinitialisé"
        subtitle={
          codeActivationReinitialise
            ? `Compte : ${codeActivationReinitialise.nom_complet} (${codeActivationReinitialise.identifiant})`
            : undefined
        }
        badge={<SIGADBadge variant="warning">Remise confidentielle</SIGADBadge>}
      >
        {codeActivationReinitialise && (
          <div style={{ display: "grid", gap: "1rem" }}>
            <SIGADAlert type="info" message={codeActivationReinitialise.message} />
            <div
              style={{
                padding: "1.25rem",
                background: "var(--sigad-surface-subtle)",
                border: "1px solid var(--sigad-border-default)",
                borderRadius: "var(--sigad-radius-md)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--sigad-text-secondary)", marginBottom: "0.35rem" }}>
                Code d’activation temporaire à transmettre à {codeActivationReinitialise.identifiant}
              </div>
              <output
                aria-label="Code d'activation réinitialisé"
                style={{
                  display: "block",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  color: "var(--sigad-primary)",
                }}
              >
                {codeActivationReinitialise.code_activation}
              </output>
            </div>
          </div>
        )}
      </SIGADDetailPanel>
    </div>
  );
}
