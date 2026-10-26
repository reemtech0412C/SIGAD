export interface AffectationRoleOmbre {
  role_code: string;
  type_unite: "NATIONALE" | "PROVINCE" | "LOCALITE" | null;
  gid: string | null;
  province_id_effectif: string | null;
  source_legacy: string | null;
}

export interface PorteeHistoriqueOmbre {
  role: string;
  province_id: string | null;
  provinces_autorisees: readonly string[];
  perimetre_consultation: string | null;
}

export interface ComparaisonRoleOmbre {
  role_effectif_nouveau: string | null;
  provinces_effectives_nouvelles: readonly string[];
  provinces_consultation_nouvelles: readonly string[];
  portee_nationale_nouvelle: boolean;
  divergences: readonly string[];
}

function trierUnique(valeurs: readonly (string | null | undefined)[]): string[] {
  return [...new Set(valeurs.filter((valeur): valeur is string => Boolean(valeur)))].sort();
}

function memesValeurs(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valeur, index) => valeur === b[index]);
}

/** Compare la représentation B2.2 sans participer à la décision d'accès. */
export function comparerRoleEtPorteeOmbre(
  historique: PorteeHistoriqueOmbre,
  affectations: readonly AffectationRoleOmbre[],
): ComparaisonRoleOmbre {
  const roles = trierUnique(affectations.map((affectation) => affectation.role_code));
  const roleEffectifNouveau = roles.length === 1 ? roles[0] ?? null : null;
  const sourcesProvince = new Set([
    "UTILISATEURS",
    "PROFILS_OPERATIONNELS_TERRAIN",
    "ENTREPOTS",
  ]);
  const provincesEffectivesNouvelles = trierUnique(
    affectations
      .filter((affectation) => affectation.source_legacy !== null && sourcesProvince.has(affectation.source_legacy))
      .map((affectation) => affectation.province_id_effectif),
  );
  const provincesConsultationNouvelles = trierUnique(
    affectations
      .filter((affectation) => affectation.source_legacy === "PERIMETRES_PROVINCIAUX_CONSULTATION")
      .map((affectation) => affectation.gid),
  );
  const porteeNationaleNouvelle = affectations.some((affectation) => affectation.type_unite === "NATIONALE");
  const provincesConsultationHistoriques = historique.role === "CONSULTATION_INSTITUTIONNELLE"
    ? trierUnique(historique.provinces_autorisees)
    : [];
  const porteeNationaleHistorique = historique.role === "PROPRIETAIRE"
    || historique.role === "ADMIN_CENTRAL"
    || (historique.role === "CONSULTATION_INSTITUTIONNELLE" && historique.perimetre_consultation === "NATIONAL");
  const divergences: string[] = [];

  if (roleEffectifNouveau !== historique.role) divergences.push("ROLE_EFFECTIF");
  if (provincesEffectivesNouvelles.length > 1
    || (provincesEffectivesNouvelles[0] ?? null) !== historique.province_id) {
    divergences.push("PROVINCE_EFFECTIVE");
  }
  if (!memesValeurs(provincesConsultationNouvelles, provincesConsultationHistoriques)) {
    divergences.push("PERIMETRE_CONSULTATION");
  }
  if (porteeNationaleNouvelle !== porteeNationaleHistorique) divergences.push("PORTEE_NATIONALE");

  return {
    role_effectif_nouveau: roleEffectifNouveau,
    provinces_effectives_nouvelles: provincesEffectivesNouvelles,
    provinces_consultation_nouvelles: provincesConsultationNouvelles,
    portee_nationale_nouvelle: porteeNationaleNouvelle,
    divergences,
  };
}
