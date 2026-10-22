import { useCallback, useEffect, useState } from "react";
import { PROVINCES_TCHADIENNES } from "../../../../shared/constantes/provinces";
import type { EntreeJournalAudit, ReponsePagination, UtilisateurAdmin } from "../../../../shared/types/authentification";
import { formaterDate } from "../../utils/formatters";
import { requeteApi } from "../../services/api";

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
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurAdmin[]>([]);
  const [journaux, setJournaux] = useState<EntreeJournalAudit[]>([]);
  const [totalUtilisateurs, setTotalUtilisateurs] = useState(0);
  const [decalage, setDecalage] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

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
    void chargerDonnees();
  }, [chargerDonnees, jetonCsrf]);

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
      window.alert(`${reponse.message}\n\nCode à transmettre à ${utilisateur.identifiant} : ${reponse.code_activation}`);
      await chargerDonnees();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La réinitialisation de l’accès a échoué.");
    }
  }

  const pageCourante = Math.floor(decalage / TAILLE_PAGE) + 1;
  const nombrePages = Math.max(1, Math.ceil(totalUtilisateurs / TAILLE_PAGE));

  return (
    <div className="contenu-tableau">
      <header className="entete-section">
        <div>
          <p className="surtitre">Espace de gouvernance</p>
          <h1>Administration des comptes</h1>
        </div>
        <span className="badge-role">Propriétaire</span>
      </header>
      {erreur && <p className="message-erreur bandeau-erreur" role="alert">{erreur}</p>}
      <section id="comptes" className="carte-section" aria-labelledby="titre-utilisateurs">
        <div className="titre-section">
          <div>
            <h2 id="titre-utilisateurs">Comptes utilisateurs</h2>
            <p>Gestion des 25 comptes de référence et de leurs accès.</p>
          </div>
          <span className="compteur">{totalUtilisateurs} comptes</span>
        </div>
        <div className="tableau-defilement">
          <table>
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
                  <td><span className={`pastille-statut statut-${utilisateur.statut.toLowerCase()}`}>{utilisateur.statut}</span></td>
                  <td>{formaterDate(utilisateur.derniere_connexion)}</td>
                  <td>
                    <div className="actions-ligne">
                      <button className="bouton bouton-discret" onClick={() => void reinitialiserAcces(utilisateur)} type="button">
                        Réinitialiser l’accès
                      </button>
                      <button
                        className="bouton bouton-discret"
                        disabled={utilisateur.role === "PROPRIETAIRE" && utilisateur.statut === "ACTIF"}
                        onClick={() => void modifierStatut(utilisateur)}
                        type="button"
                      >
                        {utilisateur.statut === "SUSPENDU" ? "Réactiver" : "Suspendre"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!chargement && utilisateurs.length === 0 && (
                <tr><td className="cellule-vide" colSpan={7}>Aucun compte utilisateur à afficher.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>Page {pageCourante} sur {nombrePages}</span>
          <div className="actions-ligne">
            <button className="bouton bouton-discret" disabled={decalage === 0 || chargement} onClick={() => setDecalage(Math.max(0, decalage - TAILLE_PAGE))} type="button">Précédente</button>
            <button className="bouton bouton-discret" disabled={decalage + TAILLE_PAGE >= totalUtilisateurs || chargement} onClick={() => setDecalage(decalage + TAILLE_PAGE)} type="button">Suivante</button>
          </div>
        </div>
      </section>

      <section id="audit" className="carte-section" aria-labelledby="titre-audit">
        <div className="titre-section">
          <div>
            <h2 id="titre-audit">Journal d’audit</h2>
            <p>Historique des connexions et des actions de gestion des comptes.</p>
          </div>
        </div>
        <div className="tableau-defilement">
          <table>
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
                <tr><td className="cellule-vide" colSpan={6}>Aucune action d’audit à afficher.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {chargement && <p className="texte-secondaire" role="status">Chargement des données…</p>}
    </div>
  );
}
