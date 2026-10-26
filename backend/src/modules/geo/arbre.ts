export interface GeoAttachmentForTree {
  enfant_gid: string;
  parent_gid: string;
  statut: string;
  valide_du: string;
  valide_au: string | null;
}

export interface GeoClosureRow {
  ancetre_gid: string;
  descendant_gid: string;
  profondeur: number;
}

function dateIsoValide(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/** Stable comparison key; never use it as the unit identifier. */
export function normaliserNomGeo(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[’'`´]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/** Rebuilds current transitive ancestry from approved, temporally valid edges. */
export function construireFermetureGeo(
  attachments: readonly GeoAttachmentForTree[],
  asOf: string,
): GeoClosureRow[] {
  if (!dateIsoValide(asOf)) throw new Error("geo_invalid_reference_date");

  const parentByChild = new Map<string, string>();
  for (const attachment of attachments) {
    if (!attachment.enfant_gid || !attachment.parent_gid || attachment.enfant_gid === attachment.parent_gid) {
      throw new Error("geo_invalid_parent_edge");
    }
    if (!dateIsoValide(attachment.valide_du) || (attachment.valide_au !== null && !dateIsoValide(attachment.valide_au))) {
      throw new Error("geo_invalid_attachment_period");
    }
    if (attachment.valide_au !== null && attachment.valide_au <= attachment.valide_du) {
      throw new Error("geo_invalid_attachment_period");
    }
    if (attachment.statut !== "VALIDE" || attachment.valide_du > asOf || (attachment.valide_au !== null && attachment.valide_au <= asOf)) {
      continue;
    }
    if (parentByChild.has(attachment.enfant_gid)) throw new Error("geo_multiple_current_parents");
    parentByChild.set(attachment.enfant_gid, attachment.parent_gid);
  }

  const rows: GeoClosureRow[] = [];
  for (const descendant of parentByChild.keys()) {
    const visited = new Set<string>([descendant]);
    let ancestor = parentByChild.get(descendant);
    let depth = 1;
    while (ancestor !== undefined) {
      if (visited.has(ancestor)) throw new Error("geo_attachment_cycle");
      visited.add(ancestor);
      rows.push({ ancetre_gid: ancestor, descendant_gid: descendant, profondeur: depth });
      ancestor = parentByChild.get(ancestor);
      depth += 1;
    }
  }

  return rows.sort((a, b) => a.ancetre_gid.localeCompare(b.ancetre_gid)
    || a.descendant_gid.localeCompare(b.descendant_gid)
    || a.profondeur - b.profondeur);
}
