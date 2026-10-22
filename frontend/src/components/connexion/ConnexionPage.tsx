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

  async function soumettre(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const reponse = await requeteApi<{ utilisateur: UtilisateurAuthentifie }>("/api/auth/connexion", {
        methode: "POST",
        jetonCsrf,
        corps: { identifiant, mot_de_passe: motDePasse },
      });
      onConnexion(reponse.utilisateur);
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
        <form className="formulaire" onSubmit={(event) => void soumettre(event)}>
          <label htmlFor="identifiant">Identifiant</label>
          <input
            autoComplete="username"
            id="identifiant"
            name="identifiant"
            required
            value={identifiant}
            onChange={(event) => setIdentifiant(event.currentTarget.value)}
          />
          <label htmlFor="mot-de-passe">Mot de passe</label>
          <input
            autoComplete="current-password"
            id="mot-de-passe"
            name="mot-de-passe"
            required
            type="password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.currentTarget.value)}
          />
          {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
          <button className="bouton bouton-principal bouton-large" disabled={chargement} type="submit">
            {chargement ? "Connexion en cours…" : "Se connecter"}
          </button>
        </form>
        <p className="pied-connexion">Gestion publique des aides et des distributions</p>
      </section>
    </main>
  );
}
