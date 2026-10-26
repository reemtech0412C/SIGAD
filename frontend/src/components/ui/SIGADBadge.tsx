import type { HTMLAttributes, ReactNode } from "react";
import "./design-tokens.css";

export type SIGADBadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";
export type SIGADBadgeSize = "sm" | "md";

export interface SIGADBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variante?: SIGADBadgeVariant | "default" | undefined;
  variant?: SIGADBadgeVariant | "default" | undefined;
  taille?: SIGADBadgeSize | undefined;
  size?: SIGADBadgeSize | undefined;
  avecPoint?: boolean | undefined;
  withDot?: boolean | undefined;
  children: ReactNode;
}

export function SIGADBadge({
  variante,
  variant,
  taille,
  size,
  avecPoint,
  withDot,
  children,
  className = "",
  ...props
}: SIGADBadgeProps) {
  const effectiveVariant = (variante || variant || "neutral") === "default" ? "neutral" : (variante || variant || "neutral");
  const effectiveSize = taille || size || "md";
  const effectiveWithDot = Boolean(avecPoint ?? withDot);
  const classes = [
    "sigad-badge",
    `sigad-badge--${effectiveVariant}`,
    effectiveSize === "sm" ? "sigad-badge--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {effectiveWithDot && <span aria-hidden="true" className="sigad-badge__dot" />}
      <span>{children}</span>
    </span>
  );
}
