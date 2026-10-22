import { useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { requeteApi } from "../../services/api";

interface ConnexionPageProps {
  jetonCsrf: string;
  onConnexion: (utilisateur: UtilisateurAuthentifie) => void;
}

export function ConnexionPage({ jetonCsrf, onConnexion }: ConnexionPageProps) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [mfaRequis, setMfaRequis] = useState(false);

  async function soumettre(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      if (mfaRequis) {
        const reponse = await requeteApi<{ utilisateur: UtilisateurAuthentifie }>("/api/auth/mfa/verifier", {
          methode: "POST", jetonCsrf, corps: { code: motDePasse },
        });
        onConnexion(reponse.utilisateur);
      } else {
        const reponse = await requeteApi<{ utilisateur?: UtilisateurAuthentifie; mfa_requis?: boolean }>("/api/auth/connexion", {
          methode: "POST", jetonCsrf, corps: { identifiant, mot_de_passe: motDePasse },
        });
        if (reponse.mfa_requis) {
          setMfaRequis(true);
          setMotDePasse("");
        } else if (reponse.utilisateur) {
          onConnexion(reponse.utilisateur);
        }
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La connexion a échoué.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="page-connexion">
      <section className="carte-connexion" aria-labelledby="titre-connexion">
        <div className="marque-sigad" aria-hidden="true">S</div>
        <p className="surtitre">République du Tchad</p>
        <h1 id="titre-connexion">SIGAD</h1>
        <p className="texte-secondaire">Système intégré de gestion des aides et des distributions</p>
        {mfaRequis && <p className="message-information" role="status">Saisissez le code actuel de votre application d’authentification.</p>}
        <form className="formulaire" onSubmit={(event) => void soumettre(event)}>
          {!mfaRequis && <label htmlFor="identifiant">Identifiant</label>}
          {!mfaRequis && <input
            autoComplete="username"
            id="identifiant"
            name="identifiant"
            required
            value={identifiant}
            onChange={(event) => setIdentifiant(event.currentTarget.value)}
          />}
          <label htmlFor="mot-de-passe">{mfaRequis ? "Code d’authentification ou code de récupération" : "Mot de passe"}</label>
          <input
            autoComplete={mfaRequis ? "one-time-code" : "current-password"}
            id="mot-de-passe"
            inputMode={mfaRequis ? "numeric" : undefined}
            maxLength={mfaRequis ? 39 : undefined}
            name={mfaRequis ? "code-mfa" : "mot-de-passe"}
            required
            type={mfaRequis ? "text" : "password"}
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.currentTarget.value)}
          />
          {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
          <button className="bouton bouton-principal bouton-large" disabled={chargement} type="submit">
            {chargement ? "Vérification en cours…" : mfaRequis ? "Vérifier le code" : "Se connecter"}
          </button>
        </form>
        <p className="pied-connexion">Gestion publique des aides et des distributions</p>
      </section>
    </main>
  );
}
