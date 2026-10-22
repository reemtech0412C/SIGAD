import type { MiddlewareHandler } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { comparerSecrets } from "../services/cryptographie.service";

const NOM_COOKIE_CSRF = "sigad_csrf";
const ENTETE_CSRF = "X-CSRF-Token";

function lireCookieCsrf(requete: Request): string | null {
  const cookies = requete.headers.get("Cookie");
  if (!cookies) return null;
  for (const element of cookies.split(";")) {
    const separateur = element.indexOf("=");
    if (separateur >= 0 && element.slice(0, separateur).trim() === NOM_COOKIE_CSRF) {
      return decodeURIComponent(element.slice(separateur + 1).trim());
    }
  }
  return null;
}

export const csrfPreAuthMiddleware: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  const cookie = lireCookieCsrf(c.req.raw);
  const entete = c.req.header(ENTETE_CSRF);
  if (!cookie || !entete || !(await comparerSecrets(cookie, entete))) {
    return c.json({ erreur: "La vérification de sécurité a échoué. Actualisez la page et réessayez." }, 403);
  }
  await suivant();
  return;
};

export const csrfSessionMiddleware: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return suivant();
  const entete = c.req.header(ENTETE_CSRF);
  const cookie = lireCookieCsrf(c.req.raw);
  const attendu = c.get("session").jeton_csrf;
  if (!entete || !cookie || !(await comparerSecrets(entete, attendu)) || !(await comparerSecrets(cookie, attendu))) {
    return c.json({ erreur: "La vérification de sécurité a échoué. Actualisez la page et réessayez." }, 403);
  }
  await suivant();
};

export function definirCookieCsrf(jeton: string, environnement: string): string {
  const securise = environnement === "production" ? "; Secure" : "";
  return `${NOM_COOKIE_CSRF}=${encodeURIComponent(jeton)}; Path=/; SameSite=Lax; Max-Age=28800${securise}`;
}

export function effacerCookieCsrf(environnement: string): string {
  const securise = environnement === "production" ? "; Secure" : "";
  return `${NOM_COOKIE_CSRF}=; Path=/; SameSite=Lax; Max-Age=0${securise}`;
}
