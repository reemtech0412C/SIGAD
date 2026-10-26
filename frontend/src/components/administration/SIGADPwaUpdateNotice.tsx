import { useState, useSyncExternalStore } from "react";
import {
  abonnerMiseAJourPwa,
  activerMiseAJourPwa,
  lireEtatMiseAJourPwa,
  reporterMiseAJourPwa,
} from "../../services/pwa-update-state";

function contientSaisieNonEnregistree(): boolean {
  if (document.querySelector('[role="dialog"][data-panel-type="side-panel"]')) return true;

  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea',
  )).some((champ) => champ.value !== champ.defaultValue ||
    (champ instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(champ.type) && champ.checked !== champ.defaultChecked));
}

export function SIGADPwaUpdateNotice() {
  const disponible = useSyncExternalStore(abonnerMiseAJourPwa, lireEtatMiseAJourPwa, () => false);
  const [confirmationSaisie, setConfirmationSaisie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!disponible) return null;

  async function activer(): Promise<void> {
    setErreur(null);
    try {
      await activerMiseAJourPwa();
    } catch {
      setErreur("La mise à jour n’a pas pu être activée. Votre session et vos données locales sont conservées.");
    }
  }

  function demanderActivation(): void {
    if (contientSaisieNonEnregistree()) {
      setConfirmationSaisie(true);
      return;
    }
    void activer();
  }

  return (
    <aside aria-live="polite" className="sigad-pwa-update" role={confirmationSaisie ? "alert" : "status"}>
      <div className="sigad-pwa-update__copy">
        <strong>{confirmationSaisie ? "Une saisie est en cours" : "Mise à jour SIGAD disponible"}</strong>
        <span>
          {confirmationSaisie
            ? "La mise à jour rechargera l’application. Enregistrez votre formulaire ou confirmez que vous acceptez de perdre les champs non enregistrés."
            : "Elle s’activera uniquement lorsque vous le déciderez."}
        </span>
        {erreur && <span role="alert">{erreur}</span>}
      </div>
      <div className="sigad-pwa-update__actions">
        {confirmationSaisie ? (
          <>
            <button onClick={() => setConfirmationSaisie(false)} type="button">Continuer la saisie</button>
            <button className="sigad-pwa-update__primary" onClick={() => void activer()} type="button">Actualiser maintenant</button>
          </>
        ) : (
          <>
            <button onClick={() => reporterMiseAJourPwa()} type="button">Plus tard</button>
            <button className="sigad-pwa-update__primary" onClick={demanderActivation} type="button">Mettre à jour</button>
          </>
        )}
      </div>
    </aside>
  );
}
