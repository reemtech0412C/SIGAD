/**
 * Service prototype de préparation du mode hors-ligne pour SIGAD.
 *
 * RÈGLE FONDAMENTALE DE SÉCURITÉ MÉTIER (Arrêté n°0033 / Contrôle Interne) :
 * L'enregistrement de brouillons locaux de ciblage ou la consultation de référentiels
 * est autorisé hors-ligne. En revanche, TOUTE REMISE PHYSIQUE EFFECTIVE DE VIVRES
 * OU DÉSTOCKAGE DOIT ÊTRE VALIDÉE AVEC PREUVE CRITIQUE EN LIGNE (aucun déstockage
 * aveugle hors-ligne n'est permis).
 */

export interface ElementFileSynchronisation {
  id: string;
  cleIdempotence: string;
  typeAction: "ENREGISTREMENT_BROUILLON_MENAGE" | "PROPOSITION_LOCALITE" | "RAPPORT_OBSERVATION";
  donnees: Record<string, unknown>;
  creeLe: string;
  tentatives: number;
  statut: "EN_ATTENTE" | "EN_COURS" | "ECHEC" | "SYNCHRONISE";
  erreurDerniere?: string;
}

export const CONFIGURATION_HORS_LIGNE = {
  nomBaseIdb: "sigad_offline_v1",
  magasinFile: "file_synchronisation",
  magasinBrouillons: "brouillons_locaux",
} as const;

class ServiceHorsLigne {
  private estEnLigne = typeof navigator !== "undefined" ? navigator.onLine : true;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.estEnLigne = true;
      });
      window.addEventListener("offline", () => {
        this.estEnLigne = false;
      });
    }
  }

  public estConnecte(): boolean {
    return this.estEnLigne;
  }

  /**
   * Sauvegarde un brouillon local de saisie de ménage pour éviter toute perte accidentelle sur smartphone.
   */
  public sauvegarderBrouillonLocal(cle: string, valeur: unknown): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(`sigad_brouillon_${cle}`, JSON.stringify({
        valeur,
        modifieLe: new Date().toISOString(),
      }));
    } catch {
      // Ignorer si stockage saturé
    }
  }

  public lireBrouillonLocal<T>(cle: string): T | null {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
      const brut = window.localStorage.getItem(`sigad_brouillon_${cle}`);
      if (!brut) return null;
      const parsed = JSON.parse(brut) as { valeur: T };
      return parsed.valeur;
    } catch {
      return null;
    }
  }

  public effacerBrouillonLocal(cle: string): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.removeItem(`sigad_brouillon_${cle}`);
    } catch {
      // Ignorer
    }
  }

  /**
   * INTERDICTION MÉTIER : Vérifie formellement qu'une confirmation de remise de vivres
   * ou une mutation de stock n'est JAMAIS exécutée en mode déconnecté non vérifié.
   */
  public interdireRemiseVivresHorsLigne(): void {
    if (!this.estEnLigne) {
      throw new Error(
        "Interdiction de sécurité : la confirmation effective de distribution de vivres " +
        "et la décrémentation des stocks exigent une connexion sécurisée active avec le serveur SIGAD."
      );
    }
  }

  /**
   * Purge toutes les données locales sensibles lors de la déconnexion ou de la révocation de session.
   */
  public purgerDonneesLocalesSensibles(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const cles = Object.keys(window.localStorage).filter((k) => k.startsWith("sigad_"));
      for (const cle of cles) {
        window.localStorage.removeItem(cle);
      }
    } catch {
      // Ignorer
    }
  }
}

export const serviceHorsLigne = new ServiceHorsLigne();
