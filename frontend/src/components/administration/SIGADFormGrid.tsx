import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type PropsCommunes = {
  children?: ReactNode;
  className?: string;
};

type PropsFormulaire = PropsCommunes & Omit<FormHTMLAttributes<HTMLFormElement>, "children" | "className"> & {
  as?: "form";
};

type PropsConteneur = PropsCommunes & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className"> & {
  as: "div";
};

function classesFormulaire(className?: string): string {
  return ["sigad-form-grid", className].filter(Boolean).join(" ");
}

export function SIGADFormGrid(props: PropsFormulaire | PropsConteneur) {
  const { children, className } = props;
  if (props.as === "div") {
    const { as: _as, children: _children, className: _className, ...attributs } = props;
    return <div {...attributs} className={classesFormulaire(className)}>{children}</div>;
  }

  const { as: _as, children: _children, className: _className, ...attributs } = props;
  return <form {...attributs} className={classesFormulaire(className)}>{children}</form>;
}
