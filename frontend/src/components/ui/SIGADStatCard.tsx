import type { ReactNode } from "react";
import "./design-tokens.css";

export interface SIGADStatCardProps {
  titre: string;
  valeur: number | string;
  description?: string;
  icone?: ReactNode;
  className?: string;
}

export function SIGADStatCard({
  titre,
  valeur,
  description,
  icone,
  className = "",
}: SIGADStatCardProps) {
  return (
    <div className={`sigad-stat-card ${className}`.trim()}>
      <div className="sigad-stat-card__content">
        <h4 className="sigad-stat-card__title">{titre}</h4>
        <div className="sigad-stat-card__value sigad-tabular-nums">{valeur}</div>
        {description && <p className="sigad-stat-card__desc">{description}</p>}
      </div>
      {icone && <div className="sigad-stat-card__icon">{icone}</div>}
    </div>
  );
}
