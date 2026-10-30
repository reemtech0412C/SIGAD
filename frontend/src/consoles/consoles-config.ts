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

/** Drapeau de présentation: variable de build ou activation locale; désactivé en cas d'erreur de stockage. */
export function consolesV2Active(): boolean {
  if (import.meta.env?.VITE_SIGAD_CONSOLES_V2 === "true") return true;
  try {
    return window.localStorage.getItem("sigad.consoles_v2") === "1";
  } catch {
    return false;
  }
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
