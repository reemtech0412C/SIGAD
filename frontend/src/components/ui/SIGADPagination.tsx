import { SIGADButton } from "./SIGADButton";
import "./design-tokens.css";

export interface SIGADPaginationProps {
  total: number;
  decalage: number;
  limite?: number | undefined;
  taillePage?: number | undefined;
  chargement?: boolean | undefined;
  onChangement?: ((nouveauDecalage: number) => void) | undefined;
  onPageChange?: ((nouveauDecalage: number) => void) | undefined;
  className?: string | undefined;
  nomEntite?: string | undefined;
}

export function SIGADPagination({
  total,
  decalage,
  limite,
  taillePage,
  chargement = false,
  onChangement,
  onPageChange,
  className = "",
  nomEntite = "éléments",
}: SIGADPaginationProps) {
  const effectiveLimite = limite ?? taillePage ?? 20;
  const effectiveOnChange = onChangement ?? onPageChange ?? (() => undefined);
  const nombrePages = Math.max(1, Math.ceil(total / effectiveLimite));
  const pageCourante = Math.floor(decalage / effectiveLimite) + 1;
  const aPrecedent = decalage > 0;
  const aSuivant = decalage + effectiveLimite < total;

  function allerPrecedent() {
    if (aPrecedent && !chargement) {
      effectiveOnChange(Math.max(0, decalage - effectiveLimite));
    }
  }

  function allerSuivant() {
    if (aSuivant && !chargement) {
      effectiveOnChange(decalage + effectiveLimite);
    }
  }

  return (
    <nav
      aria-label="Pagination des données"
      className={`sigad-pagination ${className}`.trim()}
    >
      <span className="sigad-pagination__info">
        Page <strong className="sigad-tabular-nums">{pageCourante}</strong> sur{" "}
        <strong className="sigad-tabular-nums">{nombrePages}</strong>
        {" · "}
        <span className="sigad-tabular-nums">{total}</span> {nomEntite}
      </span>
      <div className="sigad-pagination__actions">
        <SIGADButton
          aria-label="Aller à la page précédente"
          chargement={false}
          disabled={!aPrecedent || chargement}
          onClick={allerPrecedent}
          taille="sm"
          type="button"
          variante="secondary"
        >
          Précédente
        </SIGADButton>
        <SIGADButton
          aria-label="Aller à la page suivante"
          chargement={false}
          disabled={!aSuivant || chargement}
          onClick={allerSuivant}
          taille="sm"
          type="button"
          variante="secondary"
        >
          Suivante
        </SIGADButton>
      </div>
    </nav>
  );
}
