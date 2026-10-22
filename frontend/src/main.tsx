import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

registerSW({ immediate: true });

const racine = document.getElementById("root");
if (!racine) throw new Error("Le point de montage de l’application est introuvable.");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
