/**
 * B3.1 — Aiguillage par console (drapeau consoles_v2, désactivé par défaut).
 * Purement présentationnel: le préfixe d'URL n'autorise rien, l'API reste l'autorité d'accès.
 */
import type { UtilisateurAuthentifie } from "../../../shared/types/authentification";

export type ConsoleSIGAD = "plateforme" | "national" | "provincial" | "institution";
type RoleSIGAD = UtilisateurAuthentifie["role"];

export const CONSOLES: readonly ConsoleSIGAD[] = ["plateforme", "national", "provincial", "institution"];

const CONSOLE_PAR_ROLE: Record<RoleSIGAD, ConsoleSIGAD> = {
  PROPRIETAIRE: "plateforme",
  ADMIN_CENTRAL: "national",
  DELEGUE_PROVINCIAL: "provincial",
  RESPONSABLE_STOCK: "provincial",
  SUPERVISEUR_TERRAIN: "provincial",
  AGENT_DISTRIBUTION: "provincial",
  CONSULTATION_INSTITUTIONNELLE: "institution",
};

export function consolePourRole(role: RoleSIGAD): ConsoleSIGAD {
  return CONSOLE_PAR_ROLE[role];
}

export const LIBELLES_CONSOLES: Record<ConsoleSIGAD, { titre: string; description: string }> = {
  plateforme: { titre: "Console Plateforme", description: "Comptes, sécurité et santé technique" },
  national: { titre: "Console Administration centrale", description: "Opérations et pilotage nationaux" },
  provincial: { titre: "Console Provinciale", description: "Opérations dans votre périmètre assigné" },
  institution: { titre: "Console Institutionnelle", description: "Consultation des rapports agrégés" },
};

/** Drapeau de présentation: choix local explicite (« 1 » ou « 0 ») sinon variable de build; désactivé par défaut. */
export function consolesV2Active(): boolean {
  try {
    const local = window.localStorage.getItem("sigad.consoles_v2");
    if (local === "1") return true;
    if (local === "0") return false;
  } catch {
    // Stockage indisponible: on retombe sur la variable de build.
  }
  return import.meta.env?.VITE_SIGAD_CONSOLES_V2 === "true";
}

function separer(adresse: string): { chemin: string; requete: string } {
  const index = adresse.indexOf("?");
  return index === -1
    ? { chemin: adresse, requete: "" }
    : { chemin: adresse.slice(0, index), requete: adresse.slice(index) };
}

export function consoleDepuisAdresse(adresse: string): ConsoleSIGAD | null {
  const premier = separer(adresse).chemin.split("/")[1] ?? "";
  return CONSOLES.find((console) => console === premier) ?? null;
}

/** Retire le préfixe de console: l'adresse logique est celle des routes historiques. */
export function retirerPrefixeConsole(adresse: string): string {
  const console = consoleDepuisAdresse(adresse);
  if (!console) return adresse;
  const { chemin, requete } = separer(adresse);
  return `${chemin.slice(console.length + 1) || "/"}${requete}`;
}

/** Place l'adresse historique dans la console du rôle; une console étrangère est remplacée, jamais suivie. */
export function adresseDansConsole(adresse: string, role: RoleSIGAD): string {
  const logique = retirerPrefixeConsole(adresse);
  const { chemin, requete } = separer(logique);
  if (chemin === "/ui-preview") return logique;
  return `/${consolePourRole(role)}${chemin === "/" ? "" : chemin}${requete}`;
}
