import type { CSSProperties, ReactNode } from "react";
import "./design-tokens.css";

export type SIGADAlertVariant = "success" | "warning" | "danger" | "info";

export interface SIGADAlertProps {
  variante?: SIGADAlertVariant | undefined;
  type?: SIGADAlertVariant | undefined;
  titre?: string | undefined;
  title?: string | undefined;
  message?: ReactNode | undefined;
  children?: ReactNode | undefined;
  onFermer?: (() => void) | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export function SIGADAlert({
  variante,
  type,
  titre,
  title,
  message,
  children,
  onFermer,
  className = "",
  style,
}: SIGADAlertProps) {
  const effectiveVariante = variante ?? type ?? "info";
  const effectiveTitre = titre ?? title;
  const effectiveChildren = children ?? message;
  const icones: Record<SIGADAlertVariant, ReactNode> = {
    success: (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    warning: (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" x2="12" y1="9" y2="13" />
        <line x1="12" x2="12.01" y1="17" y2="17" />
      </svg>
    ),
    danger: (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" x2="9" y1="9" y2="15" />
        <line x1="9" x2="15" y1="9" y2="15" />
      </svg>
    ),
    info: (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="16" y2="12" />
        <line x1="12" x2="12.01" y1="8" y2="8" />
      </svg>
    ),
  };

  return (
    <div
      className={`sigad-alert sigad-alert--${effectiveVariante} ${className}`.trim()}
      role={effectiveVariante === "danger" ? "alert" : "status"}
      style={style}
    >
      <span className="sigad-alert__icon">{icones[effectiveVariante]}</span>
      <div className="sigad-alert__content">
        {effectiveTitre && <h5 className="sigad-alert__title">{effectiveTitre}</h5>}
        <div>{effectiveChildren}</div>
      </div>
      {onFermer && (
        <button
          aria-label="Fermer l'alerte"
          className="sigad-modal__close"
          onClick={onFermer}
          style={{ width: "24px", height: "24px", marginTop: "-2px" }}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="14"
          >
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
