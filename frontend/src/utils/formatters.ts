const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Ndjamena",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatNombre = new Intl.NumberFormat("fr-FR");

export function formaterDate(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const valeurDate = isoString.includes("T") ? isoString : `${isoString.replace(" ", "T")}Z`;
  const date = new Date(valeurDate);
  return Number.isNaN(date.valueOf()) ? "—" : formatDate.format(date);
}

export function formaterNombre(valeur: number): string {
  return formatNombre.format(valeur);
}
