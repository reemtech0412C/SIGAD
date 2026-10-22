import { useState, type FormEvent } from "react";
import { requeteApi } from "../../services/api";

interface ChangementMotDePasseProps {
  jetonCsrf: string;
  onModification: () => void;
}

export function ChangementMotDePasse({ jetonCsrf, onModification }: ChangementMotDePasseProps) {
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function soumettre(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    if (nouveauMotDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setChargement(true);
    try {
      await requeteApi<{ message: string }>("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST",
        jetonCsrf,
        corps: { nouveau_mot_de_passe: nouveauMotDePasse },
      });
      onModification();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le changement du mot de passe a échoué.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="page-connexion">
      <section className="carte-connexion" aria-labelledby="titre-changement">
        <p className="surtitre">Sécurité du compte</p>
        <h1 id="titre-changement">Créer un nouveau mot de passe</h1>
        <p className="texte-secondaire">Cette modification est obligatoire avant l’accès aux fonctions de l’application.</p>
        <form className="formulaire" onSubmit={(event) => void soumettre(event)}>
          <label htmlFor="nouveau-mot-de-passe">Nouveau mot de passe</label>
          <input
            autoComplete="new-password"
            id="nouveau-mot-de-passe"
            minLength={12}
            required
            type="password"
            value={nouveauMotDePasse}
            onChange={(event) => setNouveauMotDePasse(event.currentTarget.value)}
          />
          <p className="aide-saisie">12 caractères minimum, avec une majuscule, une minuscule et un chiffre.</p>
          <label htmlFor="confirmation-mot-de-passe">Confirmer le nouveau mot de passe</label>
          <input
            autoComplete="new-password"
            id="confirmation-mot-de-passe"
            required
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
          />
          {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
          <button className="bouton bouton-principal bouton-large" disabled={chargement} type="submit">
            {chargement ? "Enregistrement en cours…" : "Enregistrer le nouveau mot de passe"}
          </button>
        </form>
      </section>
    </main>
  );
}
