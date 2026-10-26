import type { HTMLAttributes, ReactNode } from "react";
import "./design-tokens.css";

export interface SIGADCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  as?: "div" | "section" | "article" | "aside";
  ariaLabelledby?: string;
}

export function SIGADCard({ children, className = "", as = "div", ariaLabelledby, ...props }: SIGADCardProps) {
  const Component = as;
  return (
    <Component
      className={`sigad-card ${className}`.trim()}
      aria-labelledby={ariaLabelledby}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface SIGADCardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  titre?: string;
  sousTitre?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function SIGADCardHeader({
  titre,
  sousTitre,
  actions,
  children,
  className = "",
  ...props
}: SIGADCardHeaderProps) {
  return (
    <div className={`sigad-card__header ${className}`.trim()} {...props}>
      {titre ? (
        <>
          <div className="sigad-card__title-group">
            <h3 className="sigad-card__title">{titre}</h3>
            {sousTitre && <p className="sigad-card__subtitle">{sousTitre}</p>}
          </div>
          {actions && <div className="sigad-card__actions">{actions}</div>}
        </>
      ) : (
        children
      )}
    </div>
  );
}

export interface SIGADCardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4";
  children: ReactNode;
}

export function SIGADCardTitle({ as = "h3", children, className = "", ...props }: SIGADCardTitleProps) {
  const Component = as;
  return (
    <Component className={`sigad-card__title ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export interface SIGADCardSubtitleProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function SIGADCardSubtitle({ children, className = "", ...props }: SIGADCardSubtitleProps) {
  return (
    <p className={`sigad-card__subtitle ${className}`.trim()} {...props}>
      {children}
    </p>
  );
}

export function SIGADCardBody({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`sigad-card__body ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function SIGADCardFooter({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`sigad-card__footer ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
