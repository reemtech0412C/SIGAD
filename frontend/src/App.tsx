import { useEffect, useState } from "react";
import type { UtilisateurAuthentifie } from "../../shared/types/authentification";
import { ChangementMotDePasse } from "./components/connexion/ChangementMotDePasse";
import { ConnexionPage } from "./components/connexion/ConnexionPage";
import { TableauGestionBeneficiaires } from "./components/gestion/TableauGestionBeneficiaires";
import { TableauApprovisionnements } from "./components/gestion/TableauApprovisionnements";
import { TableauGestionStocks } from "./components/gestion/TableauGestionStocks";
import { TableauDistributions } from "./components/gestion/TableauDistributions";
import { TableauControle } from "./components/gestion/TableauControle";
import { TableauRapports } from "./components/gestion/TableauRapports";
import { TableauProprietaire } from "./components/proprietaire/TableauProprietaire";
import { ErreurApi, chargerJetonCsrf, requeteApi } from "./services/api";

interface ReponseSession {
  utilisateur: UtilisateurAuthentifie;
  expire_le: string;
}

export default function App() {
  const [jetonCsrf, setJetonCsrf] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<UtilisateurAuthentifie | null>(null);
  const [erreurDemarrage, setErreurDemarrage] = useState<string | null>(null);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [afficherStocks, setAfficherStocks] = useState(false);
  const [afficherApprovisionnements, setAfficherApprovisionnements] = useState(false);
  const [afficherDistributions, setAfficherDistributions] = useState(false);
  const [afficherControle, setAfficherControle] = useState(false);
  const [afficherRapports, setAfficherRapports] = useState(false);

  function choisirModule(module: "comptes" | "stocks" | "approvisionnements" | "beneficiaires" | "distributions" | "controle" | "rapports"): void {
    setAfficherStocks(module === "stocks");
    setAfficherApprovisionnements(module === "approvisionnements");
    setAfficherDistributions(module === "distributions");
    setAfficherControle(module === "controle");
    setAfficherRapports(module === "rapports");
  }

  useEffect(() => {
    let actif = true;
    async function initialiser(): Promise<void> {
      try {
        const jeton = await chargerJetonCsrf();
        if (actif) setJetonCsrf(jeton);
        try {
          const session = await requeteApi<ReponseSession>("/api/auth/session");
          if (actif) setUtilisateur(session.utilisateur);
        } catch (cause) {
          if (!(cause instanceof ErreurApi) || cause.statutHttp !== 401) {
            if (actif) setErreurDemarrage(cause instanceof Error ? cause.message : "La session n’a pas pu être chargée.");
          }
        }
      } catch (cause) {
        if (actif) setErreurDemarrage(cause instanceof Error ? cause.message : "Le service est momentanément indisponible.");
      } finally {
        if (actif) setChargement(false);
      }
    }
    void initialiser();
    return () => { actif = false; };
  }, []);

  async function deconnexion(): Promise<void> {
    if (!jetonCsrf) return;
    setErreurAction(null);
    try {
      await requeteApi<{ message: string }>("/api/auth/deconnexion", { methode: "POST", jetonCsrf });
      setUtilisateur(null);
      setJetonCsrf(await chargerJetonCsrf());
    } catch (cause) {
      setErreurAction(cause instanceof Error ? cause.message : "La déconnexion a échoué.");
    }
  }

  if (chargement) {
    return <main className="ecran-attente"><p>Chargement de votre espace sécurisé…</p></main>;
  }
  if (erreurDemarrage) {
    return <main className="ecran-attente"><p className="message-erreur">{erreurDemarrage}</p></main>;
  }
  if (!jetonCsrf) {
    return <main className="ecran-attente"><p className="message-erreur">Le contrôle de sécurité n’a pas pu être initialisé.</p></main>;
  }
  if (!utilisateur) return <ConnexionPage jetonCsrf={jetonCsrf} onConnexion={setUtilisateur} />;
  if (utilisateur.doit_changer_mot_de_passe) {
    return <ChangementMotDePasse jetonCsrf={jetonCsrf} onModification={() => setUtilisateur({ ...utilisateur, doit_changer_mot_de_passe: false })} />;
  }
  if (utilisateur.role === "PROPRIETAIRE") {
    return (
      <div className="application">
        <aside className="barre-laterale">
          <div className="logo-barre"><span>S</span><div><strong>SIGAD</strong><small>République du Tchad</small></div></div>
          <nav aria-label="Navigation principale">
            <button className={!afficherStocks && !afficherApprovisionnements && !afficherDistributions && !afficherControle && !afficherRapports ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("comptes")} type="button">Administration des comptes</button>
            <button className={afficherStocks ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("stocks")} type="button">Articles et stocks</button>
            <button className={afficherApprovisionnements ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("approvisionnements")} type="button">Approvisionnements</button>
            <button className={afficherDistributions ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("distributions")} type="button">Distributions provinciales</button>
            <button className={afficherControle ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("controle")} type="button">Audit et notifications</button>
            <button className={afficherRapports ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("rapports")} type="button">Rapports et tableaux de bord</button>
          </nav>
          <div className="profil-barre">
            <span className="avatar">{utilisateur.nom_complet.charAt(0).toUpperCase()}</span>
            <div><strong>{utilisateur.nom_complet}</strong><small>Propriétaire</small></div>
          </div>
        </aside>
        <main className="zone-principale">
          <header className="barre-haute"><span>Gestion intégrée des aides et des distributions</span><button className="bouton bouton-discret" onClick={() => void deconnexion()} type="button">Se déconnecter</button></header>
          {erreurAction && <p className="message-erreur bandeau-erreur" role="alert">{erreurAction}</p>}
          {afficherRapports
            ? <TableauRapports utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
            : afficherControle
            ? <TableauControle utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
            : afficherDistributions
            ? <TableauDistributions utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
            : afficherApprovisionnements
            ? <TableauApprovisionnements utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
            : afficherStocks
              ? <TableauGestionStocks utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
              : <TableauProprietaire jetonCsrf={jetonCsrf} />}
        </main>
      </div>
    );
  }

  return (
    <div className="application">
      <aside className="barre-laterale">
        <div className="logo-barre"><span>S</span><div><strong>SIGAD</strong><small>République du Tchad</small></div></div>
        <nav aria-label="Navigation principale">
          <button className={!afficherStocks && !afficherApprovisionnements && !afficherDistributions && !afficherControle && !afficherRapports ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("beneficiaires")} type="button">Gestion des bénéficiaires</button>
          <button className={afficherStocks ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("stocks")} type="button">Articles et stocks</button>
          <button className={afficherApprovisionnements ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("approvisionnements")} type="button">Approvisionnements</button>
          <button className={afficherDistributions ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("distributions")} type="button">Distributions provinciales</button>
          <button className={afficherControle ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("controle")} type="button">{utilisateur.role === "ADMIN_CENTRAL" ? "Contrôle central" : "Contrôle et notifications"}</button>
          <button className={afficherRapports ? "lien-module actif" : "lien-module"} onClick={() => choisirModule("rapports")} type="button">Rapports et tableaux de bord</button>
        </nav>
        <div className="profil-barre">
          <span className="avatar">{utilisateur.nom_complet.charAt(0).toUpperCase()}</span>
          <div><strong>{utilisateur.nom_complet}</strong><small>{utilisateur.role === "ADMIN_CENTRAL" ? "Administration centrale" : "Délégation provinciale"}</small></div>
        </div>
      </aside>
      <main className="zone-principale">
        <header className="barre-haute"><span>Gestion intégrée des aides et des distributions</span><button className="bouton bouton-discret" onClick={() => void deconnexion()} type="button">Se déconnecter</button></header>
        {erreurAction && <p className="message-erreur bandeau-erreur">{erreurAction}</p>}
        {afficherRapports
          ? <TableauRapports utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
          : afficherControle
          ? <TableauControle utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
          : afficherDistributions
          ? <TableauDistributions utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
          : afficherApprovisionnements
            ? <TableauApprovisionnements utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
            : afficherStocks
              ? <TableauGestionStocks utilisateur={utilisateur} jetonCsrf={jetonCsrf} />
              : <TableauGestionBeneficiaires utilisateur={utilisateur} jetonCsrf={jetonCsrf} />}
      </main>
    </div>
  );
}
