import type { HTMLAttributes, ReactNode } from "react";
import "./design-tokens.css";

export interface SIGADTabsListProps extends HTMLAttributes<HTMLDivElement> {
  ariaLabel: string;
  children: ReactNode;
}

export function SIGADTabsList({ ariaLabel, children, className = "", ...props }: SIGADTabsListProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={`sigad-tabs-list ${className}`.trim()}
      role="tablist"
      {...props}
    >
      {children}
    </div>
  );
}

export interface SIGADTabProps {
  actif?: boolean | undefined;
  active?: boolean | undefined;
  onClick: () => void;
  badge?: number | string | undefined;
  badgeCount?: number | string | undefined;
  children: ReactNode;
  className?: string | undefined;
  id?: string | undefined;
  controls?: string | undefined;
}

export function SIGADTab({
  actif,
  active,
  onClick,
  badge,
  badgeCount,
  children,
  className = "",
  id,
  controls,
}: SIGADTabProps) {
  const effectiveActif = Boolean(actif ?? active);
  const effectiveBadge = badge ?? badgeCount;
  const classes = [
    "sigad-tab",
    effectiveActif ? "sigad-tab--active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-controls={controls}
      aria-selected={effectiveActif}
      className={classes}
      id={id}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span>{children}</span>
      {effectiveBadge !== undefined && effectiveBadge !== null && (
        <span className="sigad-tab__badge">{effectiveBadge}</span>
      )}
    </button>
  );
}
