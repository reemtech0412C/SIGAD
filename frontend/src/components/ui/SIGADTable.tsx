import type { HTMLAttributes, ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import "./design-tokens.css";

export interface SIGADTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function SIGADTable({ children, className = "", ...props }: SIGADTableProps) {
  return (
    <div className="sigad-table-wrapper">
      <table className={`sigad-table ${className}`.trim()} {...props}>
        {children}
      </table>
    </div>
  );
}

export function SIGADTableHead({ children, className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  );
}

export function SIGADTableBody({ children, className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

export function SIGADTableRow({ children, className = "", ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={className} {...props}>
      {children}
    </tr>
  );
}

export interface SIGADTableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  children?: ReactNode;
}

export function SIGADTableHeaderCell({
  align = "left",
  children,
  className = "",
  style,
  ...props
}: SIGADTableHeaderCellProps) {
  return (
    <th
      className={className}
      style={{ textAlign: align, ...style }}
      {...props}
    >
      {children}
    </th>
  );
}

export interface SIGADTableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  children?: ReactNode;
  estNumerique?: boolean;
}

export function SIGADTableCell({
  align = "left",
  children,
  className = "",
  estNumerique = false,
  style,
  ...props
}: SIGADTableCellProps) {
  const classes = [
    estNumerique ? "sigad-tabular-nums" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td
      className={classes}
      style={{ textAlign: align, ...style }}
      {...props}
    >
      {children}
    </td>
  );
}
