import { useEffect, useState, type FormEvent } from "react";
import qrcode from "qrcode-generator";
import { requeteApi } from "../../services/api";
import { SIGADAlert, SIGADButton, SIGADFormField, SIGADInput } from "../ui";

interface ConfigurationMfaProps {
  jetonCsrf: string;
  onActivation: () => void;
}

interface ReponseInitialisation {
  secret_totp: string;
  uri_provisionnement: string;
}

interface ReponseConfirmation {
  actif: true;
  codes_recuperation: string[];
}

export function ConfigurationMfa({ jetonCsrf, onActivation }: ConfigurationMfaProps) {
  const [initialisation, setInitialisation] = useState<ReponseInitialisation | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    let active = true;
    requeteApi<ReponseInitialisation>("/api/auth/mfa/initialiser", { methode: "POST", jetonCsrf })
      .then((reponse) => { if (active) setInitialisation(reponse); })
      .catch((cause: unknown) => { if (active) setErreur(cause instanceof Error ? cause.message : "La configuration MFA a échoué."); });
    return () => { active = false; };
  }, [jetonCsrf]);

  let imageQr: string | null = null;
  if (initialisation) {
    const codeQr = qrcode(0, "M");
    codeQr.addData(initialisation.uri_provisionnement);
    codeQr.make();
    imageQr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(codeQr.createSvgTag({ cellSize: 5, margin: 4, scalable: true }))}`;
  }

  async function confirmer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const reponse = await requeteApi<ReponseConfirmation>("/api/auth/mfa/confirmer", {
        methode: "POST",
        jetonCsrf,
        corps: { code },
      });
      setCodes(reponse.codes_recuperation);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le code MFA n’a pas pu être vérifié.");
    } finally {
      setChargement(false);
    }
  }

  if (codes) {
    return (
      <main className="page-connexion">
        <section className="carte-connexion" aria-labelledby="titre-mfa-codes">
          <p className="surtitre">Sécurité du compte</p>
          <h1 id="titre-mfa-codes" style={{ color: "var(--sigad-primary-dark)", marginBottom: "0.5rem" }}>
            Codes de récupération
          </h1>
          <p className="texte-secondaire" style={{ marginBottom: "1rem" }}>
            Enregistrez ces codes dans un endroit sûr. Chaque code ne peut servir qu’une seule fois.
          </p>
          <ul className="liste-codes-mfa" aria-label="Codes de récupération">
            {codes.map((codeRecuperation) => (
              <li key={codeRecuperation} style={{ background: "var(--sigad-surface-subtle)", borderRadius: "var(--sigad-radius-sm)", padding: "0.5rem", textAlign: "center" }}>
                <code style={{ fontSize: "1rem", fontWeight: 700 }}>{codeRecuperation}</code>
              </li>
            ))}
          </ul>
          <SIGADButton
            variant="primary"
            size="lg"
            onClick={onActivation}
            style={{ width: "100%", marginTop: "1rem" }}
          >
            J’ai enregistré mes codes
          </SIGADButton>
        </section>
      </main>
    );
  }

  return (
    <main className="page-connexion">
      <section className="carte-connexion" aria-labelledby="titre-mfa">
        <p className="surtitre">Sécurité obligatoire pour les comptes centraux</p>
        <h1 id="titre-mfa" style={{ color: "var(--sigad-primary-dark)", marginBottom: "0.5rem" }}>
          Configurer l’authentification à deux facteurs
        </h1>
        <p className="texte-secondaire" style={{ marginBottom: "1rem" }}>
          Scannez le code avec une application compatible TOTP, puis saisissez le code à six chiffres affiché.
        </p>
        {imageQr && (
          <img
            className="qr-mfa"
            alt="Code QR de configuration TOTP SIGAD"
            src={imageQr}
            style={{ borderRadius: "var(--sigad-radius-md)", border: "1px solid var(--sigad-border-default)" }}
          />
        )}
        {initialisation && (
          <p className="secret-mfa" style={{ background: "var(--sigad-surface-subtle)", borderRadius: "var(--sigad-radius-sm)", padding: "0.5rem 0.75rem", fontSize: "0.875rem", margin: "1rem 0" }}>
            Clé de configuration : <code style={{ fontWeight: 700 }}>{initialisation.secret_totp}</code>
          </p>
        )}

        {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}

        <form onSubmit={(event) => void confirmer(event)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SIGADFormField label="Code de vérification (6 chiffres)" required>
            <SIGADInput
              id="code-totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
              placeholder="000000"
              style={{ letterSpacing: "4px", fontSize: "1.25rem", textAlign: "center" }}
            />
          </SIGADFormField>

          <SIGADButton
            variant="primary"
            size="lg"
            disabled={!initialisation}
            loading={chargement}
            type="submit"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {chargement ? "Vérification…" : "Activer l’authentification à deux facteurs"}
          </SIGADButton>
        </form>
      </section>
    </main>
  );
}
