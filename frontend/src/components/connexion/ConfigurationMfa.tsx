import { useEffect, useState, type FormEvent } from "react";
import qrcode from "qrcode-generator";
import { requeteApi } from "../../services/api";

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
          <h1 id="titre-mfa-codes">Codes de récupération</h1>
          <p className="texte-secondaire">Enregistrez ces codes dans un endroit sûr. Chaque code ne peut servir qu’une seule fois.</p>
          <ul className="liste-codes-mfa" aria-label="Codes de récupération">
            {codes.map((codeRecuperation) => <li key={codeRecuperation}><code>{codeRecuperation}</code></li>)}
          </ul>
          <button className="bouton bouton-principal bouton-large" onClick={onActivation} type="button">J’ai enregistré mes codes</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-connexion">
      <section className="carte-connexion" aria-labelledby="titre-mfa">
        <p className="surtitre">Sécurité obligatoire pour les comptes centraux</p>
        <h1 id="titre-mfa">Configurer l’authentification à deux facteurs</h1>
        <p className="texte-secondaire">Scannez le code avec une application compatible TOTP, puis saisissez le code à six chiffres affiché.</p>
        {imageQr && <img className="qr-mfa" alt="Code QR de configuration TOTP SIGAD" src={imageQr} />}
        {initialisation && <p className="secret-mfa">Clé de configuration : <code>{initialisation.secret_totp}</code></p>}
        <form className="formulaire" onSubmit={(event) => void confirmer(event)}>
          <label htmlFor="code-totp">Code de vérification</label>
          <input id="code-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.currentTarget.value)} />
          {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
          <button className="bouton bouton-principal bouton-large" disabled={chargement || !initialisation} type="submit">{chargement ? "Vérification…" : "Activer l’authentification à deux facteurs"}</button>
        </form>
      </section>
    </main>
  );
}
