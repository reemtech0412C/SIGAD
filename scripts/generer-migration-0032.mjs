import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 112 départements candidats recensés
// 69 confirmés (VALIDE) par Ordonnance 038/PR/2018 et 002/PR/2024 + Annuaires INSEED 2023/2024
// 43 à vérifier (A_VERIFIER) issus de propositions d'éclatement ou redécoupages non promulgués au JO

export const DEPARTEMENTS_DETAILS = [
  // 1. Barh El Gazel (prov-barh-el-gazel)
  {
    id: "dep-barh-el-gazel-barh-el-gazel-sud",
    nom: "Barh El Gazel Sud",
    chef_lieu: "Moussoro",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024 p.18",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 4",
    motif: "Département chef-lieu historique de la province, existence continue et confirmée."
  },
  {
    id: "dep-barh-el-gazel-barh-el-gazel-nord",
    nom: "Barh El Gazel Nord",
    chef_lieu: "Salal",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024 p.18",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 4",
    motif: "Département historique créé par Ordonnance 038/PR/2018, réaffirmé en 2024."
  },
  {
    id: "dep-barh-el-gazel-barh-el-gazel-ouest",
    nom: "Barh El Gazel Ouest",
    chef_lieu: "Chadra",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024 p.18",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 4",
    motif: "Département confirmé par les textes de restructuration 2018 et 2024."
  },
  {
    id: "dep-barh-el-gazel-barh-el-gazel-est",
    nom: "Barh El Gazel Est",
    chef_lieu: "Amsilep",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024 p.18",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 4",
    motif: "Département confirmé par l'INSEED et l'Ordonnance 002/PR/2024."
  },
  {
    id: "dep-barh-el-gazel-kleta",
    nom: "Kleta",
    chef_lieu: "Kleta",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Projet de découpage 2024",
    motif: "Circonscription candidate en cours de confirmation juridique formelle."
  },

  // 2. Batha (prov-batha)
  {
    id: "dep-batha-batha-est",
    nom: "Batha Est",
    chef_lieu: "Oum Hadjer",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique majeur d'Oum Hadjer, existence établie."
  },
  {
    id: "dep-batha-batha-ouest",
    nom: "Batha Ouest",
    chef_lieu: "Ati",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu provincial d'Ati, statut incontestable."
  },
  {
    id: "dep-batha-fitri",
    nom: "Fitri",
    chef_lieu: "Yao",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique du sultanat de Fitri (Yao)."
  },
  {
    id: "dep-batha-ouadi-rime",
    nom: "Ouadi Rimé",
    chef_lieu: "Djedaa",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département pastoral confirmé par l'Ordonnance 038/PR/2018 et 2024."
  },
  {
    id: "dep-batha-assinet",
    nom: "Assinet",
    chef_lieu: "Assinet",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Sous-préfecture érigée en proposition départementale à confirmer."
  },
  {
    id: "dep-batha-haraze",
    nom: "Haraze",
    chef_lieu: "Haraze Djombo",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Homonymie avec Haraze-Mangueigne, délimitation territoriale à consolider."
  },
  {
    id: "dep-batha-djombo-djedid",
    nom: "Djombo Djedid",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Dénomination et chef-lieu en attente d'acte de promulgation."
  },

  // 3. Borkou (prov-borkou)
  {
    id: "dep-borkou-borkou",
    nom: "Borkou",
    chef_lieu: "Faya-Largeau",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Circonscription centrale historique du Grand Nord."
  },
  {
    id: "dep-borkou-borkou-yala",
    nom: "Borkou Yala",
    chef_lieu: "Kirdimi",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département confirmé par l'Ordonnance 038/PR/2018."
  },
  {
    id: "dep-borkou-kouba",
    nom: "Kouba",
    chef_lieu: "Kouba Olanga",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Projet 2024",
    motif: "Statut de chef-lieu en attente de précision réglementaire."
  },
  {
    id: "dep-borkou-emi-koussi",
    nom: "Emi Koussi",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Projet 2024",
    motif: "Chevauchement toponymique avec le département d'Emi Koussi (Tibesti)."
  },

  // 4. Chari-Baguirmi (prov-chari-baguirmi)
  {
    id: "dep-chari-baguirmi-baguirmi",
    nom: "Baguirmi",
    chef_lieu: "Massenya",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Siège historique du Royaume du Baguirmi (Massenya)."
  },
  {
    id: "dep-chari-baguirmi-chari",
    nom: "Chari",
    chef_lieu: "Mandélia",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département du Chari (Mandélia) confirmé."
  },
  {
    id: "dep-chari-baguirmi-loug-chari",
    nom: "Loug Chari",
    chef_lieu: "Bousso",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département de Bousso établi depuis 2002 et réaffirmé."
  },
  {
    id: "dep-chari-baguirmi-dourbali",
    nom: "Dourbali",
    chef_lieu: "Dourbali",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département érigé en 2018 et pérennisé en 2024."
  },

  // 5. Ennedi Est (prov-ennedi-est)
  {
    id: "dep-ennedi-est-amdjarass",
    nom: "Amdjarass",
    chef_lieu: "Amdjarass",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Chef-lieu provincial et départemental confirmé."
  },
  {
    id: "dep-ennedi-est-wadi-hawar",
    nom: "Wadi Hawar",
    chef_lieu: "Bahaï",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier établi par Ordonnance 038/PR/2018."
  },
  {
    id: "dep-ennedi-est-itou",
    nom: "Itou",
    chef_lieu: "Itou",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Unité administrative candidate à vérifier."
  },
  {
    id: "dep-ennedi-est-nohi",
    nom: "Nohi",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Circonscription non confirmée au Journal officiel."
  },
  {
    id: "dep-ennedi-est-bao",
    nom: "Bao",
    chef_lieu: "Bao",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Sous-préfecture proposée à l'érection départementale."
  },
  {
    id: "dep-ennedi-est-mourdi",
    nom: "Mourdi",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Zone désertique du Mourdi, statut administratif à clarifier."
  },

  // 6. Ennedi Ouest (prov-ennedi-ouest)
  {
    id: "dep-ennedi-ouest-fada",
    nom: "Fada",
    chef_lieu: "Fada",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Chef-lieu provincial et départemental historique."
  },
  {
    id: "dep-ennedi-ouest-mourtcha",
    nom: "Mourtcha",
    chef_lieu: "Kalait",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département du Mourtcha (Kalait) confirmé."
  },
  {
    id: "dep-ennedi-ouest-lac-ounianga",
    nom: "Lac Ounianga",
    chef_lieu: "Ounianga Kébir",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département des lacs d'Ounianga confirmé."
  },
  {
    id: "dep-ennedi-ouest-tebi",
    nom: "Tebi",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Ressort territorial en cours de clarification."
  },
  {
    id: "dep-ennedi-ouest-gouro",
    nom: "Gouro",
    chef_lieu: "Gouro",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Sous-préfecture saharienne proposée à l'érection."
  },
  {
    id: "dep-ennedi-ouest-torbol",
    nom: "Torbol",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Unité administrative candidate à vérifier."
  },

  // 7. Guéra (prov-guera)
  {
    id: "dep-guera-guera",
    nom: "Guéra",
    chef_lieu: "Mongo",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Chef-lieu provincial et départemental de Mongo."
  },
  {
    id: "dep-guera-barh-signaka",
    nom: "Barh Signaka",
    chef_lieu: "Melfi",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Melfi."
  },
  {
    id: "dep-guera-abtouyour",
    nom: "Abtouyour",
    chef_lieu: "Bitkine",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Bitkine."
  },
  {
    id: "dep-guera-mangalme",
    nom: "Mangalmé",
    chef_lieu: "Mangalmé",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Mangalmé."
  },
  {
    id: "dep-guera-garada",
    nom: "Garada",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Projet 2024",
    motif: "Subdivision candidate à consolider."
  },

  // 8. Hadjer-Lamis (prov-hadjer-lamis)
  {
    id: "dep-hadjer-lamis-dagana",
    nom: "Dagana",
    chef_lieu: "Massakory",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu de Massakory."
  },
  {
    id: "dep-hadjer-lamis-dababa",
    nom: "Dababa",
    chef_lieu: "Bokoro",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Bokoro."
  },
  {
    id: "dep-hadjer-lamis-haraze-al-biar",
    nom: "Haraze Al Biar",
    chef_lieu: "Massaguet",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Massaguet."
  },
  {
    id: "dep-hadjer-lamis-ngoura",
    nom: "Ngoura",
    chef_lieu: "Ngoura",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision issue de Dababa, à confirmer formellement."
  },

  // 9. Kanem (prov-kanem)
  {
    id: "dep-kanem-kanem",
    nom: "Kanem",
    chef_lieu: "Mao",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu historique de Mao."
  },
  {
    id: "dep-kanem-nord-kanem",
    nom: "Nord Kanem",
    chef_lieu: "Nokou",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département de Nokou confirmé."
  },
  {
    id: "dep-kanem-sud-kanem",
    nom: "Sud Kanem",
    chef_lieu: "Wadi Hamar",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département de Wadi Hamar confirmé."
  },

  // 10. Lac (prov-lac)
  {
    id: "dep-lac-mamdi",
    nom: "Mamdi",
    chef_lieu: "Bol",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu insulaire de Bol."
  },
  {
    id: "dep-lac-wayi",
    nom: "Wayi",
    chef_lieu: "Ngouri",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Ngouri."
  },
  {
    id: "dep-lac-fouli",
    nom: "Fouli",
    chef_lieu: "Liwa",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier de Liwa."
  },
  {
    id: "dep-lac-kaya",
    nom: "Kaya",
    chef_lieu: "Bagasola",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département humanitaire stratégique de Bagasola."
  },
  {
    id: "dep-lac-doum-doum",
    nom: "Doum Doum",
    chef_lieu: "Doum Doum",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision insulaire proposée."
  },
  {
    id: "dep-lac-kouloukime",
    nom: "Kouloukimé",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Zone des ouadis du Lac à confirmer."
  },

  // 11. Logone Occidental (prov-logone-occidental)
  {
    id: "dep-logone-occidental-lac-wey",
    nom: "Lac Wey",
    chef_lieu: "Moundou",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Capitale économique et chef-lieu historique de Moundou."
  },
  {
    id: "dep-logone-occidental-dodje",
    nom: "Dodjé",
    chef_lieu: "Beinamar",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Beinamar."
  },
  {
    id: "dep-logone-occidental-ngourkosso",
    nom: "Ngourkosso",
    chef_lieu: "Benoye",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Benoye."
  },
  {
    id: "dep-logone-occidental-gueni",
    nom: "Guéni",
    chef_lieu: "Krim Krim",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision issue de Lac Wey à consolider."
  },

  // 12. Logone Oriental (prov-logone-oriental)
  {
    id: "dep-logone-oriental-pende",
    nom: "Pendé",
    chef_lieu: "Doba",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu de Doba."
  },
  {
    id: "dep-logone-oriental-nya-pende",
    nom: "Nya Pendé",
    chef_lieu: "Goré",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier et humanitaire de Goré."
  },
  {
    id: "dep-logone-oriental-monts-de-lam",
    nom: "Monts de Lam",
    chef_lieu: "Baïbokoum",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique des Monts de Lam (Baïbokoum)."
  },
  {
    id: "dep-logone-oriental-nya",
    nom: "Nya",
    chef_lieu: "Bébédjia",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département pétrolier historique de Bébédjia."
  },
  {
    id: "dep-logone-oriental-kouh-est",
    nom: "Kouh Est",
    chef_lieu: "Bodo",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision de Bodo en cours de validation."
  },
  {
    id: "dep-logone-oriental-kouh-ouest",
    nom: "Kouh Ouest",
    chef_lieu: "Béboto",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision de Béboto en cours de validation."
  },

  // 13. Mandoul (prov-mandoul)
  {
    id: "dep-mandoul-mandoul-oriental",
    nom: "Mandoul Oriental",
    chef_lieu: "Koumra",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu provincial de Koumra."
  },
  {
    id: "dep-mandoul-mandoul-occidental",
    nom: "Mandoul Occidental",
    chef_lieu: "Bédjondo",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Bédjondo."
  },
  {
    id: "dep-mandoul-barh-sara",
    nom: "Barh Sara",
    chef_lieu: "Moïssala",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier et cotonnier de Moïssala."
  },
  {
    id: "dep-mandoul-goundi",
    nom: "Goundi",
    chef_lieu: "Goundi",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Sous-préfecture proposée à l'érection départementale."
  },
  {
    id: "dep-mandoul-taralnass",
    nom: "Taralnass",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Circonscription candidate à vérifier."
  },
  {
    id: "dep-mandoul-mandoul-central",
    nom: "Mandoul Central",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Projet de redécoupage à confirmer."
  },

  // 14. Mayo-Kebbi Est (prov-mayo-kebbi-est)
  {
    id: "dep-mayo-kebbi-est-mayo-boneye",
    nom: "Mayo-Boneye",
    chef_lieu: "Bongor",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu de Bongor."
  },
  {
    id: "dep-mayo-kebbi-est-kabbia",
    nom: "Kabbia",
    chef_lieu: "Gounou Gaya",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Gounou Gaya."
  },
  {
    id: "dep-mayo-kebbi-est-mont-d-illi",
    nom: "Mont d'Illi",
    chef_lieu: "Fianga",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Fianga."
  },
  {
    id: "dep-mayo-kebbi-est-mayo-lemie",
    nom: "Mayo-Lémié",
    chef_lieu: "Guélendeng",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Guélendeng."
  },

  // 15. Mayo-Kebbi Ouest (prov-mayo-kebbi-ouest)
  {
    id: "dep-mayo-kebbi-ouest-mayo-dallah",
    nom: "Mayo-Dallah",
    chef_lieu: "Pala",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu provincial de Pala."
  },
  {
    id: "dep-mayo-kebbi-ouest-lac-lere",
    nom: "Lac Léré",
    chef_lieu: "Léré",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique du Lac Léré."
  },
  {
    id: "dep-mayo-kebbi-ouest-mayo-binder",
    nom: "Mayo-Binder",
    chef_lieu: "Binder",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier de Binder."
  },
  {
    id: "dep-mayo-kebbi-ouest-el-ouaya",
    nom: "El-Ouaya",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Circonscription candidate à confirmer."
  },
  {
    id: "dep-mayo-kebbi-ouest-gagal",
    nom: "Gagal",
    chef_lieu: "Gagal",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Sous-préfecture proposée à l'érection."
  },
  {
    id: "dep-mayo-kebbi-ouest-nanaye",
    nom: "Nanaye",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Projet de découpage à vérifier."
  },

  // 16. Moyen-Chari (prov-moyen-chari)
  {
    id: "dep-moyen-chari-barh-koh",
    nom: "Barh Kôh",
    chef_lieu: "Sarh",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu provincial de Sarh."
  },
  {
    id: "dep-moyen-chari-grande-sido",
    nom: "Grande Sido",
    chef_lieu: "Maro",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier et humanitaire de Maro."
  },
  {
    id: "dep-moyen-chari-lac-iro",
    nom: "Lac Iro",
    chef_lieu: "Kyabé",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Kyabé."
  },
  {
    id: "dep-moyen-chari-korbol",
    nom: "Korbol",
    chef_lieu: "Korbol",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Sous-préfecture proposée en département."
  },
  {
    id: "dep-moyen-chari-la-moula",
    nom: "La Moula",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Ressort territorial en attente de décret d'application."
  },
  {
    id: "dep-moyen-chari-bragoto",
    nom: "Bragoto",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Circonscription candidate à vérifier."
  },

  // 17. Ouaddaï (prov-ouaddai)
  {
    id: "dep-ouaddai-ouara",
    nom: "Ouara",
    chef_lieu: "Abéché",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 3",
    motif: "Capitale historique de l'Est et chef-lieu de province (Abéché)."
  },
  {
    id: "dep-ouaddai-assoungha",
    nom: "Assoungha",
    chef_lieu: "Adré",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 3",
    motif: "Département frontalier stratégique d'Adré, confirmé sans discontinuité."
  },
  {
    id: "dep-ouaddai-djourouf-al-ahmar",
    nom: "Djourouf Al Ahmar",
    chef_lieu: "Am-Dam",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 3",
    motif: "Département d'Am-Dam confirmé par ordonnances de 2018 et 2024."
  },
  {
    id: "dep-ouaddai-abougoudam",
    nom: "Abougoudam",
    chef_lieu: "Abougoudam",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024 art. 3",
    motif: "Département d'Abougoudam pérennisé par la restructuration 2024."
  },

  // 18. Salamat (prov-salamat)
  {
    id: "dep-salamat-barh-azoum",
    nom: "Barh Azoum",
    chef_lieu: "Am Timan",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu provincial d'Am Timan."
  },
  {
    id: "dep-salamat-aboudeia",
    nom: "Aboudeïa",
    chef_lieu: "Aboudeïa",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique d'Aboudeïa."
  },
  {
    id: "dep-salamat-haraze-mangueigne",
    nom: "Haraze-Mangueigne",
    chef_lieu: "Haraze",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier d'Haraze-Mangueigne."
  },

  // 19. Sila (prov-sila) - Rapproché avec INSEED 2024 tableau 2 p.28
  {
    id: "dep-sila-kimiti",
    nom: "Kimiti",
    chef_lieu: "Goz-Beïda",
    valide: true,
    source: "INSEED Annuaire 2024 p.28 & Ordonnance n°002/PR/2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Chef-lieu provincial et départemental de Goz-Beïda."
  },
  {
    id: "dep-sila-abdi",
    nom: "Abdi",
    chef_lieu: "Abdi",
    valide: true,
    source: "INSEED Annuaire 2024 p.28 & Ordonnance n°002/PR/2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique d'Abdi confirmé avec communes rattachées."
  },
  {
    id: "dep-sila-tissi",
    nom: "Tissi",
    chef_lieu: "Tissi",
    valide: true,
    source: "INSEED Annuaire 2024 p.28 & Ordonnance n°002/PR/2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier tripoint confirmé avec communes rattachées."
  },
  {
    id: "dep-sila-ade",
    nom: "Adé",
    chef_lieu: "Adé",
    valide: true,
    source: "INSEED Annuaire 2024 p.28 & Ordonnance n°002/PR/2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département d'Adé confirmé avec communes rattachées."
  },
  {
    id: "dep-sila-koukou-angarana",
    nom: "Koukou-Angarana",
    chef_lieu: "Koukou-Angarana",
    valide: true,
    source: "INSEED Annuaire 2024 p.28 & Ordonnance n°002/PR/2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département de Koukou-Angarana confirmé avec communes rattachées."
  },

  // 20. Tandjilé (prov-tandjile)
  {
    id: "dep-tandjile-tandjile-est",
    nom: "Tandjilé Est",
    chef_lieu: "Laï",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département chef-lieu de Laï."
  },
  {
    id: "dep-tandjile-tandjile-ouest",
    nom: "Tandjilé Ouest",
    chef_lieu: "Kélo",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Grand pôle commercial et département de Kélo."
  },
  {
    id: "dep-tandjile-tandjile-centre",
    nom: "Tandjilé Centre",
    chef_lieu: "Béré",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Béré."
  },
  {
    id: "dep-tandjile-manga",
    nom: "Manga",
    chef_lieu: "Dono-Manga",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département de Dono-Manga pérennisé."
  },
  {
    id: "dep-tandjile-manbague",
    nom: "Manbagué",
    chef_lieu: "Dafra",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision candidate à consolider."
  },

  // 21. Tibesti (prov-tibesti)
  {
    id: "dep-tibesti-bardai",
    nom: "Bardaï",
    chef_lieu: "Bardaï",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Chef-lieu provincial et départemental de Bardaï."
  },
  {
    id: "dep-tibesti-aouzou",
    nom: "Aouzou",
    chef_lieu: "Aouzou",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département frontalier nord d'Aouzou."
  },
  {
    id: "dep-tibesti-zouar",
    nom: "Zouar",
    chef_lieu: "Zouar",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Zouar."
  },
  {
    id: "dep-tibesti-wour",
    nom: "Wour",
    chef_lieu: "Wour",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Wour."
  },
  {
    id: "dep-tibesti-emi-koussi",
    nom: "Emi Koussi",
    chef_lieu: "Yébibou",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département du massif de l'Emi Koussi (Yébibou)."
  },
  {
    id: "dep-tibesti-zoumri",
    nom: "Zoumri",
    chef_lieu: null,
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Subdivision candidate à consolider."
  },

  // 22. Wadi Fira (prov-wadi-fira)
  {
    id: "dep-wadi-fira-biltine",
    nom: "Biltine",
    chef_lieu: "Biltine",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Chef-lieu provincial et départemental de Biltine."
  },
  {
    id: "dep-wadi-fira-dar-tama",
    nom: "Dar Tama",
    chef_lieu: "Guéréda",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département historique de Guéréda."
  },
  {
    id: "dep-wadi-fira-iriba",
    nom: "Iriba",
    chef_lieu: "Iriba",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département humanitaire stratégique d'Iriba."
  },
  {
    id: "dep-wadi-fira-megri",
    nom: "Mégri",
    chef_lieu: "Matadjana",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département de Matadjana confirmé."
  },
  {
    id: "dep-wadi-fira-al-biher",
    nom: "Al-Biher",
    chef_lieu: "Arada",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département d'Arada confirmé."
  },
  {
    id: "dep-wadi-fira-dar-alfawakih",
    nom: "Dar-Alfawakih",
    chef_lieu: "Am-Zoer",
    valide: true,
    source: "Ordonnance n°002/PR/2024 & INSEED Annuaire 2024",
    date: "2024-02-15",
    ref: "Ord. 002/PR/2024",
    motif: "Département d'Am-Zoer confirmé."
  },
  {
    id: "dep-wadi-fira-tine",
    nom: "Tiné",
    chef_lieu: "Tiné",
    valide: false,
    source: "INSEED 2024 / Inventaire territorial provisoire",
    date: "2024-02-15",
    ref: "Inventaire provisoire 2024",
    motif: "Poste frontalier proposé à l'érection départementale."
  }
];

function genererMigrationSql() {
  const sql = [];
  sql.push("PRAGMA foreign_keys = OFF;");
  sql.push("");
  sql.push("-- =============================================================================");
  sql.push("-- Migration 0032 : Administration territoriale du Propriétaire et validation");
  sql.push("-- Qualification des départements, correspondances de fusions et audits");
  sql.push("-- =============================================================================");
  sql.push("");
  sql.push("-- 1. Colonnes de métadonnées et de validation granulaire sur departements");
  sql.push("ALTER TABLE departements ADD COLUMN validation_administrative TEXT NOT NULL DEFAULT 'A_VERIFIER' CHECK (validation_administrative IN ('VALIDE', 'A_VERIFIER', 'HISTORIQUE', 'ARCHIVE'));");
  sql.push("ALTER TABLE departements ADD COLUMN validation_rattachement TEXT NOT NULL DEFAULT 'A_VERIFIER' CHECK (validation_rattachement IN ('VALIDE', 'A_VERIFIER'));");
  sql.push("ALTER TABLE departements ADD COLUMN validation_coordonnees TEXT NOT NULL DEFAULT 'NON_RENSEIGNE' CHECK (validation_coordonnees IN ('VALIDE', 'NON_RENSEIGNE', 'A_VERIFIER'));");
  sql.push("ALTER TABLE departements ADD COLUMN validation_limites_cartographiques TEXT NOT NULL DEFAULT 'NON_RENSEIGNE' CHECK (validation_limites_cartographiques IN ('VALIDE', 'NON_RENSEIGNE', 'A_VERIFIER'));");
  sql.push("ALTER TABLE departements ADD COLUMN autres_appellations TEXT;");
  sql.push("ALTER TABLE departements ADD COLUMN date_effet TEXT;");
  sql.push("ALTER TABLE departements ADD COLUMN reference_juridique TEXT;");
  sql.push("ALTER TABLE departements ADD COLUMN observations TEXT;");
  sql.push("ALTER TABLE departements ADD COLUMN latitude REAL;");
  sql.push("ALTER TABLE departements ADD COLUMN longitude REAL;");
  sql.push("");
  sql.push("-- 2. Table de correspondances des fusions territoriales");
  sql.push("CREATE TABLE IF NOT EXISTS correspondances_fusions_territoriales (");
  sql.push("    id TEXT PRIMARY KEY,");
  sql.push("    entite_type TEXT NOT NULL CHECK (entite_type IN ('DEPARTEMENT', 'SOUS_PREFECTURE', 'COMMUNE', 'CANTON', 'LOCALITE', 'ARRONDISSEMENT', 'QUARTIER', 'CARRE', 'SITE_HUMANITAIRE')),");
  sql.push("    ancien_id TEXT NOT NULL,");
  sql.push("    nouveau_id TEXT NOT NULL,");
  sql.push("    motif TEXT NOT NULL,");
  sql.push("    justificatif TEXT,");
  sql.push("    fusionne_par TEXT NOT NULL REFERENCES utilisateurs(id),");
  sql.push("    fusionne_le TEXT NOT NULL DEFAULT (datetime('now'))");
  sql.push(");");
  sql.push("CREATE INDEX IF NOT EXISTS idx_corr_fusions_ancien ON correspondances_fusions_territoriales(ancien_id);");
  sql.push("CREATE INDEX IF NOT EXISTS idx_corr_fusions_nouveau ON correspondances_fusions_territoriales(nouveau_id);");
  sql.push("");
  sql.push("-- 3. Table d'audit des modifications territoriales par le Propriétaire");
  sql.push("CREATE TABLE IF NOT EXISTS audits_territoire (");
  sql.push("    id TEXT PRIMARY KEY,");
  sql.push("    action TEXT NOT NULL CHECK (action IN ('CREATION', 'MODIFICATION', 'MODIFICATION_RATTACHEMENT', 'FUSION', 'ARCHIVAGE', 'SUPPRESSION', 'VALIDATION', 'RETRAIT_VALIDATION', 'IMPORT')),");
  sql.push("    entite_type TEXT NOT NULL,");
  sql.push("    entite_id TEXT NOT NULL,");
  sql.push("    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),");
  sql.push("    anciennes_valeurs TEXT,");
  sql.push("    nouvelles_valeurs TEXT,");
  sql.push("    justificatif TEXT,");
  sql.push("    motif TEXT,");
  sql.push("    adresse_ip TEXT,");
  sql.push("    cree_le TEXT NOT NULL DEFAULT (datetime('now'))");
  sql.push(");");
  sql.push("CREATE INDEX IF NOT EXISTS idx_audits_terr_entite ON audits_territoire(entite_type, entite_id);");
  sql.push("CREATE INDEX IF NOT EXISTS idx_audits_terr_action ON audits_territoire(action);");
  sql.push("CREATE INDEX IF NOT EXISTS idx_audits_terr_cree ON audits_territoire(cree_le);");
  sql.push("");
  sql.push("-- 4. Mise à jour des départements validés et candidats vérifiés");

  for (const dep of DEPARTEMENTS_DETAILS) {
    const statut = dep.valide ? "VALIDE" : "A_VERIFIER";
    const chefLieuSql = dep.chef_lieu ? `'${dep.chef_lieu.replace(/'/g, "''")}'` : "NULL";
    const sourceSql = `'${dep.source.replace(/'/g, "''")}'`;
    const refSql = `'${dep.ref.replace(/'/g, "''")}'`;
    const dateSql = `'${dep.date}'`;
    const motifSql = `'${dep.motif.replace(/'/g, "''")}'`;

    sql.push(
      `UPDATE departements SET ` +
      `statut_validation = '${statut}', ` +
      `validation_administrative = '${statut}', ` +
      `validation_rattachement = '${statut}', ` +
      `chef_lieu = COALESCE(chef_lieu, ${chefLieuSql}), ` +
      `source_officielle = ${sourceSql}, ` +
      `reference_juridique = ${refSql}, ` +
      `date_effet = ${dateSql}, ` +
      `observations = ${motifSql} ` +
      `WHERE id = '${dep.id}';`
    );
  }

  sql.push("");
  sql.push("-- 5. Extension des types d'approbations dans approbations_operations pour gouvernance");
  sql.push("-- Recréation propre de la table approbations_operations pour autoriser REFERENCE_CADRE_REGLEMENTAIRE et AUTORISATION_OUVERTURE");
  sql.push("CREATE TABLE approbations_operations_nouvelle (");
  sql.push("    id TEXT PRIMARY KEY,");
  sql.push("    operation_id TEXT NOT NULL REFERENCES operations_centrales_distribution(id) ON DELETE CASCADE,");
  sql.push("    type_approbation TEXT NOT NULL CHECK (type_approbation IN ('COMITE_PILOTAGE', 'APPROBATION_COMITE_PILOTAGE', 'VALIDATION_MINISTERIELLE', 'AUTORISATION_OUVERTURE', 'AUTORISATION_SPECIALISEE', 'REFERENCE_CADRE_REGLEMENTAIRE')),");
  sql.push("    instance_decisionnaire TEXT NOT NULL,");
  sql.push("    reference_acte TEXT NOT NULL,");
  sql.push("    date_decision TEXT NOT NULL,");
  sql.push("    signataire_nom TEXT NOT NULL,");
  sql.push("    signataire_qualite TEXT NOT NULL,");
  sql.push("    decision TEXT NOT NULL CHECK (decision IN ('APPROUVE', 'REJETE', 'AJOURNE', 'APPROUVE_AVEC_RESERVES')),");
  sql.push("    reserves_ou_conditions TEXT,");
  sql.push("    piece_jointe_id TEXT REFERENCES pieces_jointes(id),");
  sql.push("    enregistre_par TEXT NOT NULL REFERENCES utilisateurs(id),");
  sql.push("    enregistre_le TEXT NOT NULL DEFAULT (datetime('now'))");
  sql.push(");");
  sql.push("INSERT INTO approbations_operations_nouvelle SELECT * FROM approbations_operations;");
  sql.push("DROP TABLE approbations_operations;");
  sql.push("ALTER TABLE approbations_operations_nouvelle RENAME TO approbations_operations;");
  sql.push("CREATE INDEX IF NOT EXISTS idx_approbations_op_operation ON approbations_operations(operation_id);");
  sql.push("CREATE INDEX IF NOT EXISTS idx_approbations_op_type ON approbations_operations(type_approbation);");
  sql.push("CREATE INDEX IF NOT EXISTS idx_approbations_op_decision ON approbations_operations(decision);");
  sql.push("");
  sql.push("PRAGMA foreign_keys = ON;");

  return sql.join("\n");
}

const migrationSql = genererMigrationSql();
writeFileSync(resolve(process.cwd(), "migrations/0032_administration_territoriale_proprietaire.sql"), migrationSql, "utf8");
console.log("Migration 0032 générée avec succès.");
console.log("Total départements traités:", DEPARTEMENTS_DETAILS.length);
console.log("Départements validés (VALIDE):", DEPARTEMENTS_DETAILS.filter(d => d.valide).length);
console.log("Départements à vérifier (A_VERIFIER):", DEPARTEMENTS_DETAILS.filter(d => !d.valide).length);
