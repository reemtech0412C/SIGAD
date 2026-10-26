export interface ConfigurationCourriel {
  RESEND_API_KEY?: string;
  SIGAD_EMAIL_FROM?: string;
  SIGAD_EMAIL_API_URL?: string;
  SIGAD_EMAIL_PROVIDER?: { fetch(request: Request): Promise<Response> };
}

export type ObjetCourrielVerification = {
  destinataire: string;
  code: string;
  identifiantEnvoi: string;
  sujet: string;
  introduction: string;
};

export type MessageCourriel = {
  destinataire: string;
  sujet: string;
  texte: string;
  contenuHtml: string;
  identifiantEnvoi: string;
};

function echapperHtml(valeur: string): string {
  return valeur.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function courrielEstConfigure(configuration: ConfigurationCourriel): boolean {
  return Boolean(configuration.RESEND_API_KEY?.trim() && configuration.SIGAD_EMAIL_FROM?.trim());
}

export async function envoyerCodeVerification(
  configuration: ConfigurationCourriel,
  objet: ObjetCourrielVerification,
  emetteur: typeof fetch = fetch,
): Promise<void> {
  const codeEchappe = echapperHtml(objet.code);
  const corpsTexte = `${objet.introduction}\n\nVotre code de vérification SIGAD est : ${objet.code}\n\nCe code expire dans cinq minutes. Ne le communiquez à personne.`;
  const corpsHtml = `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#172b4d"><h1>SIGAD</h1><p>${echapperHtml(objet.introduction)}</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${codeEchappe}</p><p>Ce code expire dans cinq minutes. Ne le communiquez à personne.</p></main>`;
  await envoyerCourriel(configuration, {
    destinataire: objet.destinataire,
    sujet: objet.sujet,
    texte: corpsTexte,
    contenuHtml: corpsHtml,
    identifiantEnvoi: objet.identifiantEnvoi,
  }, emetteur);
}

export async function envoyerCourriel(
  configuration: ConfigurationCourriel,
  message: MessageCourriel,
  emetteur: typeof fetch = fetch,
): Promise<void> {
  const cle = configuration.RESEND_API_KEY?.trim();
  const expediteur = configuration.SIGAD_EMAIL_FROM?.trim();
  if (!cle || !expediteur) throw new Error("COURRIEL_NON_CONFIGURE");
  const adresseApi = configuration.SIGAD_EMAIL_PROVIDER
    ? "https://sigad-email-provider.local/emails"
    : configuration.SIGAD_EMAIL_API_URL?.trim() || "https://api.resend.com/emails";
  if (configuration.SIGAD_EMAIL_API_URL && !configuration.SIGAD_EMAIL_PROVIDER) {
    const url = new URL(adresseApi);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("DESTINATION_COURRIEL_TEST_NON_AUTORISEE");
    }
  }
  const requete = new Request(adresseApi, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.identifiantEnvoi,
    },
    body: JSON.stringify({
      from: expediteur,
      to: [message.destinataire],
      subject: message.sujet,
      text: message.texte,
      html: message.contenuHtml,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const reponse = configuration.SIGAD_EMAIL_PROVIDER
    ? await configuration.SIGAD_EMAIL_PROVIDER.fetch(requete)
    : await emetteur(requete);
  if (!reponse.ok) throw new Error("COURRIEL_REFUSE_PAR_LE_PRESTATAIRE");
}
