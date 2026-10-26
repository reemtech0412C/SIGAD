import { useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { requeteApi } from "../../services/api";
import { SIGADAlert, SIGADButton, SIGADFormField, SIGADInput } from "../ui";
import { InscriptionDelegue } from "./InscriptionDelegue";

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
  const [inscriptionOuverte, setInscriptionOuverte] = useState(false);

  async function chargerSessionAuthentifiee(): Promise<void> {
    const session = await requeteApi<{ utilisateur: UtilisateurAuthentifie }>("/api/auth/session");
    onConnexion(session.utilisateur);
  }

  async function soumettre(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      if (mfaRequis) {
        await requeteApi<{ utilisateur: UtilisateurAuthentifie }>("/api/auth/mfa/verifier", {
          methode: "POST", jetonCsrf, corps: { code: motDePasse },
        });
        await chargerSessionAuthentifiee();
      } else {
        const reponse = await requeteApi<{ utilisateur?: UtilisateurAuthentifie; mfa_requis?: boolean }>("/api/auth/connexion", {
          methode: "POST", jetonCsrf, corps: { identifiant, mot_de_passe: motDePasse },
        });
        if (reponse.mfa_requis) {
          setMfaRequis(true);
          setMotDePasse("");
        } else if (reponse.utilisateur) {
          await chargerSessionAuthentifiee();
        }
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La connexion a échoué.");
    } finally {
      setChargement(false);
    }
  }

  if (inscriptionOuverte && !mfaRequis) {
    return (
      <main className="page-connexion">
        <InscriptionDelegue jetonCsrf={jetonCsrf} onRetour={() => setInscriptionOuverte(false)} />
      </main>
    );
  }

  return (
    <main className="page-connexion">
      <section className="carte-connexion" aria-labelledby="titre-connexion">
        <div className="marque-sigad">
          <img src="/images/sigad-logo.png" alt="SIGAD" />
        </div>
        <h1 className="slogan-connexion" id="titre-connexion">
          Système Intégré de Gestion des Aides et des Distributions
        </h1>
        {mfaRequis && (
          <SIGADAlert
            type="info"
            message="Saisissez le code actuel de votre application d’authentification."
            style={{ marginTop: "1rem" }}
          />
        )}
        <form className="formulaire" onSubmit={(event) => void soumettre(event)}>
          {!mfaRequis && (
            <SIGADFormField label="Identifiant ou adresse e-mail" required>
              <SIGADInput
                autoComplete="username"
                id="identifiant"
                name="identifiant"
                required
                value={identifiant}
                onChange={(event) => setIdentifiant(event.currentTarget.value)}
              />
            </SIGADFormField>
          )}
          <SIGADFormField
            label={mfaRequis ? "Code d’authentification ou code de récupération" : "Mot de passe"}
            required
          >
            <SIGADInput
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
          </SIGADFormField>

          {erreur && <SIGADAlert type="danger" message={erreur} />}

          <SIGADButton
            variant="primary"
            size="lg"
            loading={chargement}
            type="submit"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {chargement ? "Vérification en cours…" : mfaRequis ? "Vérifier le code" : "Se connecter"}
          </SIGADButton>
        </form>

        {!mfaRequis && (
          <div style={{ marginTop: "1rem" }}>
            <SIGADButton
              variant="outline"
              size="md"
              onClick={() => setInscriptionOuverte(true)}
              style={{ width: "100%" }}
            >
              Créer un compte
            </SIGADButton>
          </div>
        )}

        <p className="pied-connexion" style={{ marginTop: "1.5rem", fontSize: "0.8125rem", color: "var(--sigad-text-muted)", textAlign: "center" }}>
          République du Tchad · Ministère de l'Action Sociale
        </p>
      </section>
    </main>
  );
}
