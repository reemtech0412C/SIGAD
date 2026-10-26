import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import "./design-tokens.css";

export type SIGADButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "icon";
export type SIGADButtonSize = "sm" | "md" | "lg";

export interface SIGADButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: SIGADButtonVariant | undefined;
  variant?: SIGADButtonVariant | undefined;
  taille?: SIGADButtonSize | undefined;
  size?: SIGADButtonSize | undefined;
  chargement?: boolean | undefined;
  loading?: boolean | undefined;
  pleineLargeur?: boolean | undefined;
  iconeGauche?: ReactNode | undefined;
  iconeDroite?: ReactNode | undefined;
  children?: ReactNode | undefined;
}

export const SIGADButton = forwardRef<HTMLButtonElement, SIGADButtonProps>(
  (
    {
      variante,
      variant,
      taille,
      size,
      chargement,
      loading,
      pleineLargeur = false,
      iconeGauche,
      iconeDroite,
      children,
      className = "",
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const effectiveVariant = variante || variant || "secondary";
    const effectiveSize = taille || size || "md";
    const isBusy = Boolean(chargement ?? loading);
    const classes = [
      "sigad-btn",
      `sigad-btn--${effectiveVariant}`,
      `sigad-btn--${effectiveSize}`,
      pleineLargeur ? "sigad-btn--full" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        aria-busy={isBusy || undefined}
        className={classes}
        disabled={disabled || isBusy}
        ref={ref}
        type={type}
        {...props}
      >
        {isBusy ? (
          <>
            <span aria-hidden="true" className="sigad-btn__spinner" />
            <span>Traitement…</span>
          </>
        ) : (
          <>
            {iconeGauche && <span aria-hidden="true" className="sigad-btn__icon-left">{iconeGauche}</span>}
            {children}
            {iconeDroite && <span aria-hidden="true" className="sigad-btn__icon-right">{iconeDroite}</span>}
          </>
        )}
      </button>
    );
  }
);

SIGADButton.displayName = "SIGADButton";
