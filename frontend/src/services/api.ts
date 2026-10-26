export class ErreurApi extends Error {
  readonly statutHttp: number;

  constructor(message: string, statutHttp: number) {
    super(message);
    this.name = "ErreurApi";
    this.statutHttp = statutHttp;
  }
}

export async function requeteApi<T>(
  chemin: string,
  options: {
    methode?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    jetonCsrf?: string;
    cleIdempotence?: string;
    corps?: unknown;
  } = {},
): Promise<T> {
  const entetes = new Headers({ Accept: "application/json" });
  const corpsFormulaire = options.corps instanceof FormData;
  if (options.corps !== undefined && !corpsFormulaire) entetes.set("Content-Type", "application/json");
  if (options.jetonCsrf) entetes.set("X-CSRF-Token", options.jetonCsrf);
  if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);

  const init: RequestInit = {
    method: options.methode ?? "GET",
    credentials: "same-origin",
    headers: entetes,
  };
  if (options.corps instanceof FormData) init.body = options.corps;
  else if (options.corps !== undefined) init.body = JSON.stringify(options.corps);
  const reponse = await fetch(chemin, init);

  let donnees: unknown;
  try {
    donnees = await reponse.json();
  } catch {
    throw new ErreurApi("Le serveur a renvoyé une réponse illisible.", reponse.status);
  }

  if (!reponse.ok) {
    const message = typeof donnees === "object" && donnees !== null && "erreur" in donnees && typeof Reflect.get(donnees, "erreur") === "string"
      ? Reflect.get(donnees, "erreur") as string
      : "La requête n’a pas abouti.";
    throw new ErreurApi(message, reponse.status);
  }
  return donnees as T;
}

export async function chargerJetonCsrf(): Promise<string> {
  const reponse = await requeteApi<{ jeton_csrf: string }>("/api/auth/csrf");
  return reponse.jeton_csrf;
}
