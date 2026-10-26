export interface ProvinceSIGADCartographie {
  readonly sigadId: string;
  readonly sigadName: string;
  readonly pcode: string;
  readonly nomOcha: string;
}

export const PROVINCES_TCHAD = [
  { sigadId: "prov-batha", sigadName: "Batha", pcode: "TCD01", nomOcha: "BATHA" },
  { sigadId: "prov-borkou", sigadName: "Borkou", pcode: "TCD02", nomOcha: "BORKOU" },
  { sigadId: "prov-chari-baguirmi", sigadName: "Chari-Baguirmi", pcode: "TCD03", nomOcha: "CHARI BAGUIRMI" },
  { sigadId: "prov-ennedi-est", sigadName: "Ennedi-Est", pcode: "TCD20", nomOcha: "ENNEDI EST" },
  { sigadId: "prov-ennedi-ouest", sigadName: "Ennedi-Ouest", pcode: "TCD23", nomOcha: "ENNEDI OUEST" },
  { sigadId: "prov-guera", sigadName: "Guéra", pcode: "TCD04", nomOcha: "GUÉRA" },
  { sigadId: "prov-hadjer-lamis", sigadName: "Hadjer-Lamis", pcode: "TCD05", nomOcha: "HADJER LAMIS" },
  { sigadId: "prov-kanem", sigadName: "Kanem", pcode: "TCD06", nomOcha: "KANEM" },
  { sigadId: "prov-lac", sigadName: "Lac", pcode: "TCD07", nomOcha: "LAC" },
  { sigadId: "prov-logone-occidental", sigadName: "Logone-Occidental", pcode: "TCD08", nomOcha: "LOGONE OCCIDENTAL" },
  { sigadId: "prov-logone-oriental", sigadName: "Logone-Oriental", pcode: "TCD09", nomOcha: "LOGONE ORIENTAL" },
  { sigadId: "prov-mandoul", sigadName: "Mandoul", pcode: "TCD10", nomOcha: "MANDOUL" },
  { sigadId: "prov-mayo-kebbi-est", sigadName: "Mayo-Kebbi-Est", pcode: "TCD11", nomOcha: "MAYO KEBBI EST" },
  { sigadId: "prov-mayo-kebbi-ouest", sigadName: "Mayo-Kebbi-Ouest", pcode: "TCD12", nomOcha: "MAYO KEBBI OUEST" },
  { sigadId: "prov-moyen-chari", sigadName: "Moyen-Chari", pcode: "TCD13", nomOcha: "MOYEN CHARI" },
  { sigadId: "prov-ndjamena", sigadName: "N'Djamena", pcode: "TCD18", nomOcha: "N'DJAMENA" },
  { sigadId: "prov-ouaddai", sigadName: "Ouaddaï", pcode: "TCD14", nomOcha: "OUADDAÏ" },
  { sigadId: "prov-salamat", sigadName: "Salamat", pcode: "TCD15", nomOcha: "SALAMAT" },
  { sigadId: "prov-sila", sigadName: "Sila", pcode: "TCD21", nomOcha: "SILA" },
  { sigadId: "prov-tandjile", sigadName: "Tandjilé", pcode: "TCD16", nomOcha: "TANDJILÉ" },
  { sigadId: "prov-tibesti", sigadName: "Tibesti", pcode: "TCD22", nomOcha: "TIBESTI" },
  { sigadId: "prov-wadi-fira", sigadName: "Wadi-Fira", pcode: "TCD17", nomOcha: "WADI FIRA" },
  { sigadId: "prov-barh-el-gazel", sigadName: "Barh-El-Gazel", pcode: "TCD19", nomOcha: "BARH EL GAZEL" },
] as const satisfies readonly ProvinceSIGADCartographie[];
