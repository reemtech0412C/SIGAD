const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Ndjamena",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formaterDate(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const valeurDate = isoString.includes("T") ? isoString : `${isoString.replace(" ", "T")}Z`;
  const date = new Date(valeurDate);
  return Number.isNaN(date.valueOf()) ? "—" : formatDate.format(date);
}
