import { useState, type FormEvent } from "react";
import { requeteApi } from "../../services/api";
import { SIGADAlert, SIGADButton, SIGADFormField, SIGADInput } from "../ui";

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
        <h1 id="titre-changement" style={{ color: "var(--sigad-primary-dark)", marginBottom: "0.5rem" }}>
          Créer un nouveau mot de passe
        </h1>
        <p className="texte-secondaire" style={{ marginBottom: "1.5rem" }}>
          Cette modification est obligatoire avant l’accès aux fonctions de l’application.
        </p>

        {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}

        <form onSubmit={(event) => void soumettre(event)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SIGADFormField
            label="Nouveau mot de passe"
            hint="12 caractères minimum, avec une majuscule, une minuscule et un chiffre."
            required
          >
            <SIGADInput
              autoComplete="new-password"
              id="nouveau-mot-de-passe"
              minLength={12}
              required
              type="password"
              value={nouveauMotDePasse}
              onChange={(event) => setNouveauMotDePasse(event.currentTarget.value)}
            />
          </SIGADFormField>

          <SIGADFormField label="Confirmer le nouveau mot de passe" required>
            <SIGADInput
              autoComplete="new-password"
              id="confirmation-mot-de-passe"
              required
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
            />
          </SIGADFormField>

          <SIGADButton
            variant="primary"
            size="lg"
            loading={chargement}
            type="submit"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {chargement ? "Enregistrement en cours…" : "Enregistrer le nouveau mot de passe"}
          </SIGADButton>
        </form>
      </section>
    </main>
  );
}
