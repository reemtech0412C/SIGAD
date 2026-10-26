/**
 * SIGAD — Bibliothèque unifiée de panneaux latéraux animés (Sheet / Drawer)
 * Inspirée des primitives Sheet / Dialog de satnaing/shadcn-admin (MIT License - Copyright (c) Sat Naing).
 * Remplace les fenêtres modales centrales par des panneaux latéraux accessibles.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { SIGADAlert } from "./SIGADAlert";
import { SIGADBadge } from "./SIGADBadge";
import { SIGADButton } from "./SIGADButton";
import { SIGADIcon } from "./SIGADIcon";
import "./design-tokens.css";

export type SIGADPanelSize = "sm" | "md" | "lg" | "xl" | "full" | "standard" | "wide";
export type SIGADPanelVariant = "default" | "danger";
export type SIGADPanelSide = "right" | "left";

function normaliserTaille(taille?: SIGADPanelSize): "sm" | "md" | "lg" | "xl" | "full" {
  if (!taille || taille === "standard" || taille === "md") return "md";
  if (taille === "wide" || taille === "lg") return "lg";
  return taille;
}

export interface SIGADSidePanelProps {
  ouvert?: boolean | undefined;
  open?: boolean | undefined;
  onFermer?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  titre?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  subtitle?: string | undefined;
  surtitre?: string | undefined;
  badge?: ReactNode | undefined;
  taille?: SIGADPanelSize | undefined;
  size?: SIGADPanelSize | undefined;
  variante?: SIGADPanelVariant | undefined;
  cote?: SIGADPanelSide | undefined;
  empecherFermetureExterieure?: boolean | undefined;
  modifieNonEnregistre?: boolean | undefined;
  isDirty?: boolean | undefined;
  chargement?: boolean | undefined;
  isSubmitting?: boolean | undefined;
  erreur?: string | null | undefined;
  errorMessage?: string | null | undefined;
  children: ReactNode;
  pied?: ReactNode | undefined;
  footer?: ReactNode | undefined;
}

export function SIGADSidePanel({
  ouvert,
  open,
  onFermer,
  onClose,
  titre,
  title,
  description,
  subtitle,
  surtitre,
  badge,
  taille,
  size,
  variante = "default",
  cote = "right",
  empecherFermetureExterieure = false,
  modifieNonEnregistre,
  isDirty,
  chargement,
  isSubmitting,
  erreur,
  errorMessage,
  children,
  pied,
  footer,
}: SIGADSidePanelProps) {
  const estOuvert = Boolean(ouvert ?? open);
  const fermerPanneau = onFermer ?? onClose ?? (() => undefined);
  const titreEffectif = titre ?? title ?? "";
  const descriptionEffective = description ?? subtitle;
  const tailleNormalisee = normaliserTaille(taille ?? size);
  const estModifie = Boolean(modifieNonEnregistre ?? isDirty);
  const estEnChargement = Boolean(chargement ?? isSubmitting);
  const messageErreur = erreur ?? errorMessage ?? null;
  const piedEffectif = pied ?? footer;

  const titreId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const declencheurPrecedentRef = useRef<HTMLElement | null>(null);
  const [renduVisible, setRenduVisible] = useState(estOuvert);
  const [enFermeture, setEnFermeture] = useState(false);
  const [confirmationAbandonActive, setConfirmationAbandonActive] = useState(false);

  useEffect(() => {
    if (estOuvert) {
      setRenduVisible(true);
      setEnFermeture(false);
      setConfirmationAbandonActive(false);
      return undefined;
    }
    if (renduVisible) {
      setEnFermeture(true);
      const timer = window.setTimeout(() => {
        setRenduVisible(false);
        setEnFermeture(false);
        setConfirmationAbandonActive(false);
      }, 180);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [estOuvert, renduVisible]);

  useEffect(() => {
    if (!estOuvert) return undefined;
    declencheurPrecedentRef.current = document.activeElement as HTMLElement | null;
    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => {
      if (panelRef.current) {
        const focusable = panelRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not(.sigad-side-panel__close), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable) {
          focusable.focus();
        } else {
          panelRef.current.focus();
        }
      }
    }, 45);

    return () => {
      document.body.style.overflow = overflowOriginal;
      window.clearTimeout(timer);
      declencheurPrecedentRef.current?.focus();
    };
  }, [estOuvert]);

  function demanderFermeture() {
    if (estEnChargement) return;
    if (estModifie && !confirmationAbandonActive) {
      setConfirmationAbandonActive(true);
      return;
    }
    setConfirmationAbandonActive(false);
    fermerPanneau();
  }

  function confirmerAbandon() {
    setConfirmationAbandonActive(false);
    fermerPanneau();
  }

  function gererKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (confirmationAbandonActive) {
        setConfirmationAbandonActive(false);
        return;
      }
      demanderFermeture();
      return;
    }

    if (e.key === "Tab" && panelRef.current) {
      const elementsFocusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

      if (elementsFocusables.length === 0) return;

      const premier = elementsFocusables[0];
      const dernier = elementsFocusables[elementsFocusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === premier) {
          e.preventDefault();
          dernier?.focus();
        }
      } else {
        if (document.activeElement === dernier) {
          e.preventDefault();
          premier?.focus();
        }
      }
    }
  }

  function gererBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !empecherFermetureExterieure) {
      demanderFermeture();
    }
  }

  if (!renduVisible && !estOuvert) return null;

  const classesConteneur = [
    "sigad-side-panel",
    `sigad-side-panel--${tailleNormalisee}`,
    `sigad-side-panel--${cote}`,
    variante === "danger" ? "sigad-side-panel--danger" : "",
    enFermeture ? "sigad-side-panel--closing" : "sigad-side-panel--open",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`sigad-side-panel-backdrop ${enFermeture ? "sigad-side-panel-backdrop--closing" : "sigad-side-panel-backdrop--open"}`}
      onClick={gererBackdropClick}
      onKeyDown={gererKeyDown}
      role="presentation"
    >
      <div
        aria-describedby={descriptionEffective ? descId : undefined}
        aria-labelledby={titreId}
        aria-modal="true"
        className={classesConteneur}
        data-panel-type="side-panel"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="sigad-side-panel__header">
          <div className="sigad-side-panel__header-content">
            {(surtitre || badge) && (
              <div className="sigad-side-panel__meta">
                {surtitre && <span className="sigad-side-panel__eyebrow">{surtitre}</span>}
                {typeof badge === "string" ? (
                  <SIGADBadge variant={variante === "danger" ? "danger" : "info"}>
                    {badge}
                  </SIGADBadge>
                ) : (
                  badge
                )}
              </div>
            )}
            <h2 className="sigad-side-panel__title" id={titreId}>
              {titreEffectif}
            </h2>
            {descriptionEffective && (
              <p className="sigad-side-panel__description" id={descId}>
                {descriptionEffective}
              </p>
            )}
          </div>
          <button
            aria-label="Fermer le panneau latéral"
            className="sigad-side-panel__close"
            disabled={estEnChargement}
            onClick={demanderFermeture}
            title="Fermer (Échap)"
            type="button"
          >
            <SIGADIcon nom="x" taille={18} />
          </button>
        </header>

        {confirmationAbandonActive && (
          <div className="sigad-side-panel__unsaved-guard" role="alert">
            <div className="sigad-side-panel__unsaved-text">
              <SIGADIcon nom="alert-triangle" taille={16} />
              <span>
                Des modifications non enregistrées seront perdues. Voulez-vous fermer ce panneau ?
              </span>
            </div>
            <div className="sigad-side-panel__unsaved-actions">
              <SIGADButton
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => setConfirmationAbandonActive(false)}
              >
                Continuer la saisie
              </SIGADButton>
              <SIGADButton
                size="sm"
                type="button"
                variant="danger"
                onClick={confirmerAbandon}
              >
                Abandonner les modifications
              </SIGADButton>
            </div>
          </div>
        )}

        <div className="sigad-side-panel__body">
          {messageErreur && (
            <div style={{ marginBottom: "1rem" }}>
              <SIGADAlert variante="danger">{messageErreur}</SIGADAlert>
            </div>
          )}
          {children}
        </div>

        {piedEffectif && <footer className="sigad-side-panel__footer">{piedEffectif}</footer>}
      </div>
    </div>
  );
}

/* ==========================================================================
   1. SIGADDetailPanel — Panneau Inspecteur de consultation détaillée
   ========================================================================== */
export interface SIGADDetailPanelProps {
  ouvert?: boolean | undefined;
  open?: boolean | undefined;
  onFermer?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  titre?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  subtitle?: string | undefined;
  surtitre?: string | undefined;
  badge?: ReactNode | undefined;
  taille?: SIGADPanelSize | undefined;
  size?: SIGADPanelSize | undefined;
  children: ReactNode;
  actionsSecondaires?: ReactNode | undefined;
  libelleFermer?: string | undefined;
}

export function SIGADDetailPanel({
  ouvert,
  open,
  onFermer,
  onClose,
  titre,
  title,
  description,
  subtitle,
  surtitre = "Inspection détaillée",
  badge,
  taille,
  size,
  children,
  actionsSecondaires,
  libelleFermer = "Fermer le panneau",
}: SIGADDetailPanelProps) {
  const fermer = onFermer ?? onClose ?? (() => undefined);
  return (
    <SIGADSidePanel
      badge={badge}
      description={description ?? subtitle}
      onFermer={fermer}
      ouvert={ouvert ?? open}
      surtitre={surtitre}
      taille={taille ?? size ?? "lg"}
      titre={titre ?? title}
      pied={
        <>
          <SIGADButton type="button" variant="secondary" onClick={fermer}>
            {libelleFermer}
          </SIGADButton>
          {actionsSecondaires}
        </>
      }
    >
      <div className="sigad-detail-panel__content">{children}</div>
    </SIGADSidePanel>
  );
}

/* ==========================================================================
   2. SIGADFormPanel — Panneau latéral d'ajout ou de modification
   ========================================================================== */
export interface SIGADFormPanelProps {
  ouvert?: boolean | undefined;
  open?: boolean | undefined;
  onFermer?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onSoumettre?: ((event: FormEvent<HTMLFormElement>) => void | Promise<void>) | undefined;
  onSubmit?: ((event: FormEvent<HTMLFormElement>) => void | Promise<void>) | undefined;
  titre?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  subtitle?: string | undefined;
  surtitre?: string | undefined;
  taille?: SIGADPanelSize | undefined;
  size?: SIGADPanelSize | undefined;
  libelleSoumettre?: string | undefined;
  submitLabel?: string | undefined;
  libelleAnnuler?: string | undefined;
  cancelLabel?: string | undefined;
  chargement?: boolean | undefined;
  isSubmitting?: boolean | undefined;
  desactiveSoumettre?: boolean | undefined;
  modifieNonEnregistre?: boolean | undefined;
  isDirty?: boolean | undefined;
  erreur?: string | null | undefined;
  errorMessage?: string | null | undefined;
  variante?: SIGADPanelVariant | undefined;
  children: ReactNode;
}

export function SIGADFormPanel({
  ouvert,
  open,
  onFermer,
  onClose,
  onSoumettre,
  onSubmit,
  titre,
  title,
  description,
  subtitle,
  surtitre = "Formulaire latéral",
  taille,
  size,
  libelleSoumettre,
  submitLabel,
  libelleAnnuler,
  cancelLabel,
  chargement,
  isSubmitting,
  desactiveSoumettre = false,
  modifieNonEnregistre,
  isDirty,
  erreur,
  errorMessage,
  variante = "default",
  children,
}: SIGADFormPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fermer = onFermer ?? onClose ?? (() => undefined);
  const soumettre = onSoumettre ?? onSubmit;
  const enChargement = Boolean(chargement ?? isSubmitting);

  return (
    <SIGADSidePanel
      chargement={enChargement}
      description={description ?? subtitle}
      erreur={erreur ?? errorMessage}
      modifieNonEnregistre={modifieNonEnregistre ?? isDirty}
      onFermer={fermer}
      ouvert={ouvert ?? open}
      surtitre={surtitre}
      taille={taille ?? size ?? "md"}
      titre={titre ?? title}
      variante={variante}
      pied={
        <>
          <SIGADButton
            disabled={enChargement}
            type="button"
            variant="secondary"
            onClick={fermer}
          >
            {libelleAnnuler ?? cancelLabel ?? "Annuler"}
          </SIGADButton>
          <SIGADButton
            chargement={enChargement}
            disabled={enChargement || desactiveSoumettre}
            type="button"
            variant={variante === "danger" ? "danger" : "primary"}
            onClick={() => {
              if (formRef.current) {
                formRef.current.requestSubmit();
              }
            }}
          >
            {libelleSoumettre ?? submitLabel ?? "Enregistrer"}
          </SIGADButton>
        </>
      }
    >
      <form
        ref={formRef}
        className="sigad-form-panel__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!enChargement && !desactiveSoumettre && soumettre) {
            void soumettre(e);
          }
        }}
      >
        {children}
      </form>
    </SIGADSidePanel>
  );
}

/* ==========================================================================
   3. SIGADWizardPanel — Panneau latéral à étapes avec transition fluide
   ========================================================================== */
export interface EtapeWizardSIGAD {
  id: string;
  titre: string;
  description?: string | undefined;
  contenu: ReactNode;
  valide?: boolean | undefined;
}

export interface SIGADWizardPanelProps {
  ouvert?: boolean | undefined;
  open?: boolean | undefined;
  onFermer?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onTerminer: () => void | Promise<void>;
  titre?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  subtitle?: string | undefined;
  etapes: EtapeWizardSIGAD[];
  etapeActiveIndex?: number | undefined;
  onChangementEtape?: ((index: number) => void) | undefined;
  taille?: SIGADPanelSize | undefined;
  size?: SIGADPanelSize | undefined;
  libelleTerminer?: string | undefined;
  chargement?: boolean | undefined;
  modifieNonEnregistre?: boolean | undefined;
  erreur?: string | null | undefined;
}

export function SIGADWizardPanel({
  ouvert,
  open,
  onFermer,
  onClose,
  onTerminer,
  titre,
  title,
  description,
  subtitle,
  etapes,
  etapeActiveIndex,
  onChangementEtape,
  taille,
  size,
  libelleTerminer = "Valider et enregistrer",
  chargement = false,
  modifieNonEnregistre = false,
  erreur = null,
}: SIGADWizardPanelProps) {
  const [indexInterne, setIndexInterne] = useState(0);
  const indexCourant = etapeActiveIndex ?? indexInterne;
  const etapeCourante = etapes[indexCourant] ?? etapes[0];
  const estDerniereEtape = indexCourant >= etapes.length - 1;
  const fermer = onFermer ?? onClose ?? (() => undefined);

  function allerAEtape(nouvelIndex: number) {
    if (nouvelIndex < 0 || nouvelIndex >= etapes.length) return;
    if (onChangementEtape) {
      onChangementEtape(nouvelIndex);
    } else {
      setIndexInterne(nouvelIndex);
    }
  }

  return (
    <SIGADSidePanel
      badge={`Étape ${indexCourant + 1} / ${etapes.length}`}
      chargement={chargement}
      description={description ?? subtitle}
      erreur={erreur}
      modifieNonEnregistre={modifieNonEnregistre}
      onFermer={fermer}
      ouvert={ouvert ?? open}
      surtitre="Assistant guidé"
      taille={taille ?? size ?? "lg"}
      titre={titre ?? title}
      pied={
        <>
          <SIGADButton
            disabled={chargement}
            type="button"
            variant="secondary"
            onClick={indexCourant > 0 ? () => allerAEtape(indexCourant - 1) : fermer}
          >
            {indexCourant > 0 ? "Étape précédente" : "Annuler"}
          </SIGADButton>
          {estDerniereEtape ? (
            <SIGADButton
              chargement={chargement}
              disabled={chargement || etapeCourante?.valide === false}
              type="button"
              variant="primary"
              onClick={() => void onTerminer()}
            >
              {libelleTerminer}
            </SIGADButton>
          ) : (
            <SIGADButton
              disabled={chargement || etapeCourante?.valide === false}
              type="button"
              variant="primary"
              onClick={() => allerAEtape(indexCourant + 1)}
            >
              Continuer
            </SIGADButton>
          )}
        </>
      }
    >
      <div className="sigad-wizard-panel__stepper" role="tablist" aria-label="Étapes du processus">
        {etapes.map((etape, idx) => {
          const etat = idx === indexCourant ? "active" : idx < indexCourant ? "done" : "pending";
          return (
            <button
              aria-selected={idx === indexCourant}
              className={`sigad-wizard-panel__step sigad-wizard-panel__step--${etat}`}
              disabled={idx > indexCourant && etapeCourante?.valide === false}
              key={etape.id}
              onClick={() => allerAEtape(idx)}
              role="tab"
              type="button"
            >
              <span className="sigad-wizard-panel__step-num">{idx + 1}</span>
              <span className="sigad-wizard-panel__step-label">{etape.titre}</span>
            </button>
          );
        })}
      </div>
      <div className="sigad-wizard-panel__stage" key={etapeCourante?.id ?? indexCourant}>
        {etapeCourante?.description && (
          <p className="sigad-wizard-panel__stage-desc">{etapeCourante.description}</p>
        )}
        {etapeCourante?.contenu}
      </div>
    </SIGADSidePanel>
  );
}

/* ==========================================================================
   4. SIGADConfirmPanel — Panneau latéral de confirmation d'action sensible
   ========================================================================== */
export interface SIGADConfirmPanelProps {
  ouvert?: boolean | undefined;
  open?: boolean | undefined;
  onFermer?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onConfirmer?: (() => void | Promise<void>) | undefined;
  onConfirm?: (() => void | Promise<void>) | undefined;
  titre?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  subtitle?: string | undefined;
  surtitre?: string | undefined;
  taille?: SIGADPanelSize | undefined;
  size?: SIGADPanelSize | undefined;
  variante?: SIGADPanelVariant | undefined;
  confirmVariant?: "danger" | "primary" | "default" | undefined;
  libelleConfirmer?: string | undefined;
  confirmLabel?: string | undefined;
  libelleAnnuler?: string | undefined;
  cancelLabel?: string | undefined;
  chargement?: boolean | undefined;
  isSubmitting?: boolean | undefined;
  desactiveConfirmer?: boolean | undefined;
  confirmDisabled?: boolean | undefined;
  erreur?: string | null | undefined;
  errorMessage?: string | null | undefined;
  children: ReactNode;
}

export function SIGADConfirmPanel({
  ouvert,
  open,
  onFermer,
  onClose,
  onConfirmer,
  onConfirm,
  titre,
  title,
  description,
  subtitle,
  surtitre = "Action sensible soumise à confirmation",
  taille,
  size,
  variante,
  confirmVariant,
  libelleConfirmer,
  confirmLabel,
  libelleAnnuler,
  cancelLabel,
  chargement,
  isSubmitting,
  desactiveConfirmer,
  confirmDisabled,
  erreur,
  errorMessage,
  children,
}: SIGADConfirmPanelProps) {
  const fermer = onFermer ?? onClose ?? (() => undefined);
  const confirmer = onConfirmer ?? onConfirm ?? (() => undefined);
  const enChargement = Boolean(chargement ?? isSubmitting);
  const desactive = Boolean(desactiveConfirmer ?? confirmDisabled);
  const varEffective: SIGADPanelVariant =
    variante ?? (confirmVariant === "primary" ? "default" : "danger");

  return (
    <SIGADSidePanel
      badge={varEffective === "danger" ? "Action critique" : "Confirmation"}
      chargement={enChargement}
      description={description ?? subtitle}
      empecherFermetureExterieure
      erreur={erreur ?? errorMessage}
      onFermer={fermer}
      ouvert={ouvert ?? open}
      surtitre={surtitre}
      taille={taille ?? size ?? "md"}
      titre={titre ?? title}
      variante={varEffective}
      pied={
        <>
          <SIGADButton
            disabled={enChargement}
            type="button"
            variant="secondary"
            onClick={fermer}
          >
            {libelleAnnuler ?? cancelLabel ?? "Annuler"}
          </SIGADButton>
          <SIGADButton
            chargement={enChargement}
            disabled={enChargement || desactive}
            type="button"
            variant={varEffective === "danger" ? "danger" : "primary"}
            onClick={() => void confirmer()}
          >
            {libelleConfirmer ?? confirmLabel ?? "Confirmer l'opération"}
          </SIGADButton>
        </>
      }
    >
      <div className="sigad-confirm-panel__body">{children}</div>
    </SIGADSidePanel>
  );
}
