export interface ProvinceInitiale {
  readonly code: string;
  readonly identifiantCompte: string;
  readonly nom: string;
  readonly chefLieu: string;
  readonly statutParticulier: 0 | 1;
}

export const PROVINCES_TCHADIENNES = [
  { code: "TD-BA", identifiantCompte: "batha", nom: "Batha", chefLieu: "Ati", statutParticulier: 0 },
  { code: "TD-BO", identifiantCompte: "borkou", nom: "Borkou", chefLieu: "Faya-Largeau", statutParticulier: 0 },
  { code: "TD-CB", identifiantCompte: "chari-baguirmi", nom: "Chari-Baguirmi", chefLieu: "Massenya", statutParticulier: 0 },
  { code: "TD-EE", identifiantCompte: "ennedi-est", nom: "Ennedi-Est", chefLieu: "Amdjarass", statutParticulier: 0 },
  { code: "TD-EO", identifiantCompte: "ennedi-ouest", nom: "Ennedi-Ouest", chefLieu: "Fada", statutParticulier: 0 },
  { code: "TD-GR", identifiantCompte: "guera", nom: "Guéra", chefLieu: "Mongo", statutParticulier: 0 },
  { code: "TD-HL", identifiantCompte: "hadjer-lamis", nom: "Hadjer-Lamis", chefLieu: "Massakory", statutParticulier: 0 },
  { code: "TD-KA", identifiantCompte: "kanem", nom: "Kanem", chefLieu: "Mao", statutParticulier: 0 },
  { code: "TD-LC", identifiantCompte: "lac", nom: "Lac", chefLieu: "Bol", statutParticulier: 0 },
  { code: "TD-LO", identifiantCompte: "logone-occidental", nom: "Logone-Occidental", chefLieu: "Moundou", statutParticulier: 0 },
  { code: "TD-LR", identifiantCompte: "logone-oriental", nom: "Logone-Oriental", chefLieu: "Doba", statutParticulier: 0 },
  { code: "TD-MA", identifiantCompte: "mandoul", nom: "Mandoul", chefLieu: "Koumra", statutParticulier: 0 },
  { code: "TD-ME", identifiantCompte: "mayo-kebbi-est", nom: "Mayo-Kebbi-Est", chefLieu: "Bongor", statutParticulier: 0 },
  { code: "TD-MO", identifiantCompte: "mayo-kebbi-ouest", nom: "Mayo-Kebbi-Ouest", chefLieu: "Pala", statutParticulier: 0 },
  { code: "TD-MC", identifiantCompte: "moyen-chari", nom: "Moyen-Chari", chefLieu: "Sarh", statutParticulier: 0 },
  { code: "TD-ND", identifiantCompte: "ndjamena", nom: "N'Djamena", chefLieu: "N'Djamena", statutParticulier: 1 },
  { code: "TD-OD", identifiantCompte: "ouaddai", nom: "Ouaddaï", chefLieu: "Abéché", statutParticulier: 0 },
  { code: "TD-SA", identifiantCompte: "salamat", nom: "Salamat", chefLieu: "Am Timan", statutParticulier: 0 },
  { code: "TD-SI", identifiantCompte: "sila", nom: "Sila", chefLieu: "Goz Beïda", statutParticulier: 0 },
  { code: "TD-TA", identifiantCompte: "tandjile", nom: "Tandjilé", chefLieu: "Laï", statutParticulier: 0 },
  { code: "TD-TI", identifiantCompte: "tibesti", nom: "Tibesti", chefLieu: "Bardaï", statutParticulier: 0 },
  { code: "TD-WF", identifiantCompte: "wadi-fira", nom: "Wadi-Fira", chefLieu: "Biltine", statutParticulier: 0 },
  { code: "TD-BG", identifiantCompte: "barh-el-gazel", nom: "Barh-El-Gazel", chefLieu: "Moussoro", statutParticulier: 0 },
] as const satisfies readonly ProvinceInitiale[];
