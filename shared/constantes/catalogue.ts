export const CATEGORIES_AIDE = [
  { code: "ALIMENTAIRE", libelle: "Aide alimentaire" },
  { code: "MENAGER", libelle: "Articles ménagers essentiels" },
  { code: "HYGIENE", libelle: "Hygiène et assainissement" },
  { code: "ABRI", libelle: "Abri et matériaux de construction" },
  { code: "AUTRE_NFI", libelle: "Autres articles non alimentaires" },
] as const;

export const UNITES_MESURE = [
  { code: "KG", libelle: "Kilogramme", decimalesAutorisees: 3 },
  { code: "LITRE", libelle: "Litre", decimalesAutorisees: 3 },
  { code: "SAC", libelle: "Sac", decimalesAutorisees: 0 },
  { code: "CARTON", libelle: "Carton", decimalesAutorisees: 0 },
  { code: "PIECE", libelle: "Pièce", decimalesAutorisees: 0 },
  { code: "KIT", libelle: "Kit", decimalesAutorisees: 0 },
] as const;
