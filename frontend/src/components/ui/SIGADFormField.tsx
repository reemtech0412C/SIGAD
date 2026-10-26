import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import "./design-tokens.css";

/* --- CONTENEUR DE CHAMP AVEC LABEL, AIDE ET ERREUR --- */
export interface SIGADFormFieldProps {
  label: string;
  obligatoire?: boolean | undefined;
  required?: boolean | undefined;
  facultatif?: boolean | undefined;
  optionalTag?: boolean | undefined;
  aide?: string | undefined;
  hint?: string | undefined;
  erreur?: string | null | undefined;
  htmlFor?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}

export function SIGADFormField({
  label,
  obligatoire,
  required,
  facultatif,
  optionalTag,
  aide,
  hint,
  erreur,
  htmlFor,
  children,
  className = "",
}: SIGADFormFieldProps) {
  const generatedId = useId();
  const childId = isValidElement<{ id?: string }>(children) ? children.props.id : undefined;
  const fieldId = htmlFor ?? childId ?? generatedId;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const effectiveObligatoire = Boolean(obligatoire ?? required);
  const effectiveFacultatif = Boolean(facultatif ?? optionalTag);
  const effectiveAide = aide ?? hint;
  const renderedChild =
    isValidElement<{ id?: string }>(children) && !children.props.id
      ? cloneElement(children as ReactElement<{ id?: string }>, { id: fieldId })
      : children;

  return (
    <div className={`sigad-form-field ${className}`.trim()}>
      <div className="sigad-form-label">
        <span>
          <label htmlFor={fieldId} style={{ cursor: "pointer" }}>
            {label}
          </label>
          {effectiveObligatoire && <span aria-hidden="true" className="sigad-form-label__required">*</span>}
        </span>
        {effectiveFacultatif && <span className="sigad-form-label__optional">(facultatif)</span>}
      </div>

      {renderedChild}

      {effectiveAide && !erreur && (
        <p className="sigad-form-help" id={helpId}>
          {effectiveAide}
        </p>
      )}

      {erreur && (
        <p aria-live="polite" className="sigad-form-error" id={errorId} role="alert">
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <span>{erreur}</span>
        </p>
      )}
    </div>
  );
}

/* --- CHAMP INPUT --- */
export interface SIGADInputProps extends InputHTMLAttributes<HTMLInputElement> {
  aErreur?: boolean;
}

export const SIGADInput = forwardRef<HTMLInputElement, SIGADInputProps>(
  ({ aErreur = false, className = "", ...props }, ref) => {
    return (
      <input
        aria-invalid={aErreur || undefined}
        className={`sigad-input ${aErreur ? "sigad-input--error" : ""} ${className}`.trim()}
        ref={ref}
        {...props}
      />
    );
  }
);
SIGADInput.displayName = "SIGADInput";

/* --- CHAMP SELECT --- */
export interface SIGADSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  aErreur?: boolean;
}

export const SIGADSelect = forwardRef<HTMLSelectElement, SIGADSelectProps>(
  ({ aErreur = false, className = "", children, ...props }, ref) => {
    return (
      <select
        aria-invalid={aErreur || undefined}
        className={`sigad-select ${aErreur ? "sigad-select--error" : ""} ${className}`.trim()}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
SIGADSelect.displayName = "SIGADSelect";

/* --- CHAMP TEXTAREA --- */
export interface SIGADTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  aErreur?: boolean;
}

export const SIGADTextarea = forwardRef<HTMLTextAreaElement, SIGADTextareaProps>(
  ({ aErreur = false, className = "", ...props }, ref) => {
    return (
      <textarea
        aria-invalid={aErreur || undefined}
        className={`sigad-textarea ${aErreur ? "sigad-textarea--error" : ""} ${className}`.trim()}
        ref={ref}
        {...props}
      />
    );
  }
);
SIGADTextarea.displayName = "SIGADTextarea";
