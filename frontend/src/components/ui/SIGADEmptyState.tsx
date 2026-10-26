import type { ReactNode } from "react";
import "./design-tokens.css";

export interface SIGADEmptyStateProps {
  titre?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  icone?: ReactNode | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}

export function SIGADEmptyState({
  titre,
  title,
  description,
  icone,
  action,
  className = "",
}: SIGADEmptyStateProps) {
  const effectiveTitre = titre ?? title ?? "";
  return (
    <div className={`sigad-empty-state ${className}`.trim()}>
      <div className="sigad-empty-state__icon">
        {icone ?? (
          <svg
            aria-hidden="true"
            fill="none"
            height="26"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            viewBox="0 0 24 24"
            width="26"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <line x1="2" x2="22" y1="10" y2="10" />
          </svg>
        )}
      </div>
      <h4 className="sigad-empty-state__title">{effectiveTitre}</h4>
      {description && <p className="sigad-empty-state__desc">{description}</p>}
      {action && <div className="sigad-empty-state__action">{action}</div>}
    </div>
  );
}
