import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { definirActivationMiseAJourPwa, signalerMiseAJourPwaDisponible } from "./services/pwa-update-state";
import "./styles.css";

const activerWorkerMisAJour = registerSW({
  immediate: true,
  onNeedRefresh: signalerMiseAJourPwaDisponible,
  onRegisteredSW: (_script, registration) => {
    if (!registration) return;
    const verifierUneMiseAJour = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      void registration.update().catch(() => undefined);
    };
    window.setInterval(verifierUneMiseAJour, 5 * 60 * 1000);
    window.addEventListener("focus", verifierUneMiseAJour);
    window.addEventListener("online", verifierUneMiseAJour);
  },
});
definirActivationMiseAJourPwa(() => activerWorkerMisAJour(true));

const racine = document.getElementById("root");
if (!racine) throw new Error("Le point de montage de l’application est introuvable.");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
