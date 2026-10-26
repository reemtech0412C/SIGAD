/**
 * SIGAD — Adaptateur SIGADModal vers SIGADSidePanel
 * Toutes les fenêtres dialog/modales s'ouvrent désormais en panneau latéral animé.
 */
import type { ReactNode } from "react";
import {
  SIGADSidePanel,
  type SIGADPanelSize,
  type SIGADPanelVariant,
} from "./SIGADSidePanel";

export type SIGADModalSize = SIGADPanelSize;
export type SIGADModalVariant = SIGADPanelVariant;

export interface SIGADModalProps {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  description?: string;
  taille?: SIGADModalSize;
  variante?: SIGADModalVariant;
  empecherFermetureExterieure?: boolean;
  modifieNonEnregistre?: boolean;
  chargement?: boolean;
  erreur?: string | null;
  children: ReactNode;
  pied?: ReactNode;
}

export function SIGADModal(props: SIGADModalProps) {
  return <SIGADSidePanel {...props} />;
}

export interface SIGADConfirmModalProps {
  ouvert: boolean;
  onFermer: () => void;
  onConfirmer: () => void;
  titre: string;
  description?: string;
  libelleConfirmer?: string;
  libelleAnnuler?: string;
  variante?: SIGADModalVariant;
  chargement?: boolean;
  desactiveConfirmer?: boolean;
  children: ReactNode;
}
