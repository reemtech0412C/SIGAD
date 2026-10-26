import { useId, useState, type ReactNode } from "react";

interface Props {
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  fieldsClassName?: string;
  primary?: ReactNode;
  advanced?: ReactNode;
  actions?: ReactNode;
}

export function SIGADFilterBar({ ariaLabel, children, className, fieldsClassName, primary, advanced, actions }: Props) {
  const [filtresAvancesOuverts, definirFiltresAvancesOuverts] = useState(false);
  const identifiantFiltresAvances = useId();
  const classes = ["sigad-filter-bar", className].filter(Boolean).join(" ");
  const fieldClasses = ["sigad-filter-bar__fields", fieldsClassName].filter(Boolean).join(" ");

  return (
    <section aria-label={ariaLabel} className={classes}>
      {primary ? (
        <div className={fieldClasses}>
          <div className="sigad-filter-bar__primary">{primary}</div>
          {actions && <div className="sigad-filter-bar__actions">{actions}</div>}
          {advanced && (
            <button
              aria-controls={identifiantFiltresAvances}
              aria-expanded={filtresAvancesOuverts}
              className="sigad-filter-bar__toggle"
              onClick={() => definirFiltresAvancesOuverts((ouvert) => !ouvert)}
              type="button"
            >
              {filtresAvancesOuverts ? "Masquer les filtres" : "Plus de filtres"}
            </button>
          )}
        </div>
      ) : (
        <div className={fieldClasses}>{children}</div>
      )}
      {advanced && filtresAvancesOuverts && (
        <div className="sigad-filter-bar__advanced" id={identifiantFiltresAvances}>
          {advanced}
        </div>
      )}
    </section>
  );
}
