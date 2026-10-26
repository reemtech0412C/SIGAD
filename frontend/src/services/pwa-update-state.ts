type Abonne = () => void;

const abonnes = new Set<Abonne>();
let disponible = false;
let visible = false;
let appliquer: (() => Promise<void>) | null = null;
let minuterieReport: ReturnType<typeof setTimeout> | null = null;

export function lireEtatMiseAJourPwa(): boolean {
  return visible;
}

export function abonnerMiseAJourPwa(abonne: Abonne): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

function publier(): void {
  abonnes.forEach((abonne) => abonne());
}

export function signalerMiseAJourPwaDisponible(): void {
  disponible = true;
  visible = true;
  if (minuterieReport) clearTimeout(minuterieReport);
  minuterieReport = null;
  publier();
}

export function reporterMiseAJourPwa(delaiMs = 15 * 60 * 1000): void {
  visible = false;
  if (minuterieReport) clearTimeout(minuterieReport);
  minuterieReport = setTimeout(() => {
    visible = disponible;
    minuterieReport = null;
    publier();
  }, delaiMs);
  publier();
}

export function definirActivationMiseAJourPwa(activation: () => Promise<void>): void {
  appliquer = activation;
}

export async function activerMiseAJourPwa(): Promise<void> {
  if (!disponible || !appliquer) return;
  await appliquer();
}

export function reinitialiserEtatMiseAJourPwa(): void {
  if (minuterieReport) clearTimeout(minuterieReport);
  minuterieReport = null;
  disponible = false;
  visible = false;
  appliquer = null;
  publier();
}
