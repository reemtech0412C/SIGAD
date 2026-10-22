import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = String.raw`
prov-barh-el-gazel|BARH EL-GAZEL|Salal|Dourgoulanga;Islet;Mandjoura;Toumia
prov-barh-el-gazel|BARH EL-GAZEL|Moussoro|Fizigui;Gaba;Meleat
prov-barh-el-gazel|BARH EL-GAZEL|Chadra|Mouzaragui;Billigoni
prov-barh-el-gazel|BARH EL-GAZEL|Amsilep|Dolock;Eberia;Grentessi;Kandara
prov-barh-el-gazel|BARH EL-GAZEL|Michemire|Sofa
prov-batha|BATHA|Oum-Hadjer|Assartini;Adjob;Am-naïmoun;Am-sack;Dob-dob;Gnalkata;Assafik
prov-batha|BATHA|Ati|Koundjourou;Alifa
prov-batha|BATHA|Yao|NDjamena-Bilala;Abourda;Ambassatna
prov-batha|BATHA|Djedda|Djaarine;Assountaya-dar-Hamida;Aboutahir;Abou-Hidjelidjé;Aboulmatarik;Aradib
prov-batha|BATHA|Assinet|Koundjar;Rimelé;Al-Falah;Wadi-Djedid;Al-Guideh;Kachako
prov-batha|BATHA|Haraze|Djombo-Kiézi;Am-salam
prov-borkou|BORKOU|Faya|Arnoul;Kolou
prov-borkou|BORKOU|Kirdimi|Olboye;Gourma;Wadi-Douwor
prov-borkou|BORKOU|Kouba-Olanga|Bourkya;Korotoro;Louha;Dazanga-Barka
prov-borkou|BORKOU|Am-Chaloba|Todi;Sohoya
prov-borkou|BORKOU|Yarda|Tigui;Boudo;Kourodi
prov-borkou|BORKOU|Kossanga|Addama;Djaguir
prov-chari-baguirmi|CHARI-BAGUIRMI|Massenya|Billi;Bodoro;Mandjaffa
prov-chari-baguirmi|CHARI-BAGUIRMI|Mandelia|Koundoul;La-Loumia;Lougoun-Gana
prov-chari-baguirmi|CHARI-BAGUIRMI|Bousso|Ba-Illi;Bogomoro;Kouno;Mbarlé;Mogol
prov-chari-baguirmi|CHARI-BAGUIRMI|Dourbali|Maï-Ache;Ligna;Bougournene
prov-ennedi-est|ENNEDI-EST|Amdjarass|Birdouane;Kaoura;Sogoya
prov-ennedi-est|ENNEDI-EST|Bahaï|Kariari
prov-ennedi-est|ENNEDI-EST|Itou|Marri;Bachikele;Menou
prov-ennedi-est|ENNEDI-EST|Nohi|Aliba;Arou;Ouhourou
prov-ennedi-est|ENNEDI-EST|Bao|Moudougouni;Gaour
prov-ennedi-est|ENNEDI-EST|Djona|Aouli;Bao-Katchoudan;Oura
prov-ennedi-ouest|ENNEDI-OUEST|Fada|Oyi;Wadi-Ounou;Archi;Toukou
prov-ennedi-ouest|ENNEDI-OUEST|Kalaït|Wargala;Oula
prov-ennedi-ouest|ENNEDI-OUEST|Ounianga-Kebir|Ounianga-Serir;Ouadi-Dom
prov-ennedi-ouest|ENNEDI-OUEST|Tebi|Kourdi;Eliche;Wourta
prov-ennedi-ouest|ENNEDI-OUEST|Gouro|Gouri;Moyenga
prov-ennedi-ouest|ENNEDI-OUEST|Torbol|Tema;Darba
prov-guera|GUERA|Mongo|Niergui;Baro;Delep;Dabra
prov-guera|GUERA|Bitkine|Bang-Bang;Mawa;Korbo
prov-guera|GUERA|Chinguil|Daguil;Zane;Malakondjo;Bara-sorki
prov-guera|GUERA|Mangalme|Bitchotchi;Eref;Katalog;Kouka-Margni
prov-guera|GUERA|Melfi|Ali-Dinar;Sila;Mokofi;Goguimi;Amkarouma
prov-hadjer-lamis|HADJER-LAMIS|Massakory|Karal;Tourba
prov-hadjer-lamis|HADJER-LAMIS|Bokoro|Maïgama;Gama;Kindji;Arboutchatack
prov-hadjer-lamis|HADJER-LAMIS|Massaguet|Djermaya;Karmé;Mani;Douguia;Djamena-Fara;Boutalfil
prov-hadjer-lamis|HADJER-LAMIS|Ngoura|Moïto
prov-kanem|KANEM|Mao|Kekedina;Meléa;Wadjigui
prov-kanem|KANEM|Nokou|Ntiona;Makalata
prov-kanem|KANEM|Mondo|Am-Doback;Yillili;Darbalabane
prov-kanem|KANEM|Djara|Yogoum
prov-kanem|KANEM|Rig-Rig|Saada;Tellah
prov-kanem|KANEM|Zigueye|Tababa;Guliguli;Djomoga;Kali
prov-lac|LAC|Bol|Kangalom;Kinesserom;Ngarangou
prov-lac|LAC|Ngouri|Ndjigdada;Galla-Bira;Dibinentchi
prov-lac|LAC|Baga-Sola|Ngouboua
prov-lac|LAC|Liwa|Kaïga-Kindjiria;Daboua
prov-lac|LAC|Kouloudia|Balladja;Makarrati;Doum-Doum;Isseïrom;Yourtou;Amerom
prov-logone-occidental|LOGONE OCCIDENTAL|Moundou|Bah;Deli;Dodinda;Mballa-Banyo;Mbalkabra;Ngondong
prov-logone-occidental|LOGONE OCCIDENTAL|Krim-Krim|Bao;Bemangra;Doguindi
prov-logone-occidental|LOGONE OCCIDENTAL|Benoye|Bebalem;Saar-Gogné;Bourou;Beladja;Bekiri
prov-logone-occidental|LOGONE OCCIDENTAL|Beinamar|Beissa;Laoukassy;Tapol
prov-logone-oriental|LOGONE ORIENTAL|Doba|Kara;Madana
prov-logone-oriental|LOGONE ORIENTAL|Bebidja|Beboni;Mbikou;Komé;Miandoum
prov-logone-oriental|LOGONE ORIENTAL|Gore|Bekan;Donia;Yamodo
prov-logone-oriental|LOGONE ORIENTAL|Bodo|Bedjo;Beti
prov-logone-oriental|LOGONE ORIENTAL|Beboto|Baké;Dobiti
prov-logone-oriental|LOGONE ORIENTAL|Baïbokoum|Bessao;Mbaïkoro;Larmanaye;Mbitoye
prov-mandoul|MANDOUL|Moïssala|Beboro;Bekourou;Bouna
prov-mandoul|MANDOUL|Bedjondo|Bebopen;Bekamba
prov-mandoul|MANDOUL|Koumra|Bedaya;Bessada
prov-mandoul|MANDOUL|Goundi|Palloum;Morom;Dobo
prov-mandoul|MANDOUL|MouroumGoulaye|Ngangara;Maymtoki
prov-mandoul|MANDOUL|Peni|Nderdigui
prov-mayo-kebbi-est|MAYO-KEDBI EST|Bongor|Moulkou;Rigaza;Samga;Kim;Garn;Koyom
prov-mayo-kebbi-est|MAYO-KEDBI EST|Guelendeng|Nanguigoto;Katoa
prov-mayo-kebbi-est|MAYO-KEDBI EST|Fianga|Hollom;Gamé;Kera;Tikem;Gamba;Youé
prov-mayo-kebbi-est|MAYO-KEDBI EST|Gounou-Gaya|Berem;Djoddo-Gassa;Pont-Carol;Domo;Léo;Gounou
prov-mayo-kebbi-ouest|MAYO-KEDBI OUEST|Pala|Lamé;Torrock
prov-mayo-kebbi-ouest|MAYO-KEDBI OUEST|Binder|Ribao;Mbraou;Mboursou
prov-mayo-kebbi-ouest|MAYO-KEDBI OUEST|Lere|Trené;Guegou;Yanli
prov-mayo-kebbi-ouest|MAYO-KEDBI OUEST|Lagon|Guelo;Bissi-Mafou;Guetallet
prov-mayo-kebbi-ouest|MAYO-KEDBI OUEST|Gagal|Keni;Salmata
prov-moyen-chari|MOYEN-CHARI|Sarh|Balimba;Moussa-Foyo
prov-moyen-chari|MOYEN-CHARI|Maro|Sido;Danamadji;Djéké-Djéké
prov-moyen-chari|MOYEN-CHARI|Kyabe|Bohobé;Baltoubaye;Singako;Dindjebo;Ngondeï;Roro;Alako;Boum-Kebir
prov-moyen-chari|MOYEN-CHARI|Korbol|Wamsaou;Karma;Gnilim;Toulala;Romtoye
prov-moyen-chari|MOYEN-CHARI|Dembo|Modelé;Bekamba;Nadili
prov-moyen-chari|MOYEN-CHARI|Koumogo|Dira;Magoumbou;Boro;Goro I
prov-ouaddai|OUADDAÏ|Abeche|Amleyouna;Bourtail;Am-Sidir;Chokoyan;Gueri;Marfa
prov-ouaddai|OUADDAÏ|Abougoudam|Marchoud;Abkhouta
prov-ouaddai|OUADDAÏ|Am-Dam|Haouiche;Magrane;Télégueye
prov-ouaddai|OUADDAÏ|Adre|Borota;Mabrone;Hadjer-Hadid;Molou (Farchana);Tourane
prov-salamat|SALAMAT|Am-Timan|Khachkhacha;Ali AlIak;Mirer;Djouna;Takalow;Djaggo;Almidodil;Ciheb;Ardo;Mouraye
prov-salamat|SALAMAT|Aboudeia|Abgué;Darasna;Addaradir;Dagour;Foulounga;Addileiba;Am-Habilé
prov-salamat|SALAMAT|Haraze|Kya-Ndepto;Koubo-Abgara;Daha;Arnbassirigne;Manachir;Dordoura;Karr Mangueigne
prov-sila|SILA|Goz-Deida|Kerfi;Koutoufou;Bandikno;Fagotar
prov-sila|SILA|Abdi|Abkar-Djombo;Biyeré
prov-sila|SILA|Tissi|AmdoukhounKalma;Sarafborgou;Haraza
prov-sila|SILA|Ade|Mogororo;Modeina;Koumou
prov-sila|SILA|Koukou-Angarana|Aradib;Marrena
prov-tandjile|TANDJILE|Laï|Deressia
prov-tandjile|TANDJILE|Bere|Delbian;Choua
prov-tandjile|TANDJILE|Kelo|Bologo;Dogou;Baktchoro;Kolon
prov-tandjile|TANDJILE|Dono-Manga|Ndam;Guidari
prov-tandjile|TANDJILE|Dafra|Nangassou;Miambé;Bouguidang
prov-tibesti|TIBESTI|Bardaï|Yébissoma;Modra
prov-tibesti|TIBESTI|Zouar|Goubonne;Zouarké;Maro-Ogui
prov-tibesti|TIBESTI|Wour|Taou;Madigué;Kouribougoudi
prov-tibesti|TIBESTI|Aouzou|Ournou;Guizendo
prov-tibesti|TIBESTI|Yebibou|Miski;Goumour
prov-tibesti|TIBESTI|Wonoufou|Zournri;Woichi
prov-wadi-fira|WADI-FIRA|Biltine|Atalang (Mimi-Hadjer);Kirzim (Mimi-Goz)
prov-wadi-fira|WADI-FIRA|Guereda|Kolonga;Sérimbirké (Koulbous)
prov-wadi-fira|WADI-FIRA|Matadjana|Tronga;Bakaoré;Wé;Nanou;Mardébé;Ourda;Bakoussouri
prov-wadi-fira|WADI-FIRA|Iriba|Ourba;Dougouba;Erre;Bagoufou;Kouba
prov-wadi-fira|WADI-FIRA|Arada|Sabou;Fama;Kharma;Kadjmar;Albendjedid
prov-wadi-fira|WADI-FIRA|Am-Zoer|Mata;Gourmaka
prov-wadi-fira|WADI-FIRA|Tine|Maïba;Bourba;Bamina;Keïra-Mara
`;

const pagesParProvince = new Map([
  ["prov-barh-el-gazel", "20"], ["prov-batha", "20"], ["prov-borkou", "20-21"],
  ["prov-chari-baguirmi", "21"], ["prov-ennedi-est", "21"], ["prov-ennedi-ouest", "21"],
  ["prov-guera", "21"], ["prov-hadjer-lamis", "21"], ["prov-kanem", "21-22"],
  ["prov-lac", "22"], ["prov-logone-occidental", "22"], ["prov-logone-oriental", "22"],
  ["prov-mandoul", "22"], ["prov-mayo-kebbi-est", "22"], ["prov-mayo-kebbi-ouest", "22-23"],
  ["prov-moyen-chari", "23"], ["prov-ouaddai", "23"], ["prov-salamat", "23"],
  ["prov-sila", "23"], ["prov-tandjile", "23"], ["prov-tibesti", "24"], ["prov-wadi-fira", "24"],
]);

const nomsProvincesD1 = new Map([
  ["prov-barh-el-gazel", "Barh-El-Gazel"], ["prov-batha", "Batha"], ["prov-borkou", "Borkou"],
  ["prov-chari-baguirmi", "Chari-Baguirmi"], ["prov-ennedi-est", "Ennedi-Est"], ["prov-ennedi-ouest", "Ennedi-Ouest"],
  ["prov-guera", "Guéra"], ["prov-hadjer-lamis", "Hadjer-Lamis"], ["prov-kanem", "Kanem"], ["prov-lac", "Lac"],
  ["prov-logone-occidental", "Logone-Occidental"], ["prov-logone-oriental", "Logone-Oriental"], ["prov-mandoul", "Mandoul"],
  ["prov-mayo-kebbi-est", "Mayo-Kebbi-Est"], ["prov-mayo-kebbi-ouest", "Mayo-Kebbi-Ouest"], ["prov-moyen-chari", "Moyen-Chari"],
  ["prov-ndjamena", "N'Djamena"], ["prov-ouaddai", "Ouaddaï"], ["prov-salamat", "Salamat"], ["prov-sila", "Sila"],
  ["prov-tandjile", "Tandjilé"], ["prov-tibesti", "Tibesti"], ["prov-wadi-fira", "Wadi-Fira"],
]);

const enregistrements = source.trim().split("\n").map((ligne) => {
  const [provinceId, provinceNom, communeUrbaine, listeRurale] = ligne.split("|");
  if (!provinceId || !provinceNom || !communeUrbaine || listeRurale === undefined) {
    throw new Error("Une ligne de la transcription légale est incomplète.");
  }
  const page = pagesParProvince.get(provinceId);
  if (!page) throw new Error(`Aucune page de référence n’est définie pour ${provinceNom}.`);
  const provinceNomD1 = nomsProvincesD1.get(provinceId);
  if (!provinceNomD1) throw new Error(`La province ${provinceId} n’existe pas dans la correspondance D1 contrôlée.`);
  const communesRurales = listeRurale.split(";").filter(Boolean);
  return {
    provinceId,
    provinceNom,
    provinceNomD1,
    page,
    communeUrbaine,
    communesRurales,
  };
});

if (enregistrements.length !== 114 || pagesParProvince.size !== 22) throw new Error(`La transcription doit couvrir 114 communes urbaines provinciales et les 22 provinces hors N’Djaména, valeurs obtenues : ${enregistrements.length} et ${pagesParProvince.size}.`);
const nombreCommunesRurales = enregistrements.reduce((total, ligne) => total + ligne.communesRurales.length, 0);
if (nombreCommunesRurales !== 375) throw new Error(`La transcription doit contenir 375 communes rurales, valeur obtenue : ${nombreCommunesRurales}.`);

const communes = [];
for (const ligne of enregistrements) {
  communes.push({
    provinceId: ligne.provinceId,
    provinceNom: ligne.provinceNom,
    provinceNomD1: ligne.provinceNomD1,
    nom: ligne.communeUrbaine,
    type: "URBAINE",
    page: ligne.page,
    source: "Loi organique n°015/CNT/2024, article 3",
  });
  for (const nom of ligne.communesRurales) {
    communes.push({ provinceId: ligne.provinceId, provinceNom: ligne.provinceNom, provinceNomD1: ligne.provinceNomD1, nom, type: "RURALE", page: ligne.page, source: "Loi organique n°015/CNT/2024, article 3" });
  }
}

communes.push({ provinceId: "prov-ndjamena", provinceNom: "N'DJAMENA", provinceNomD1: nomsProvincesD1.get("prov-ndjamena"), nom: "Ville de N'Djaména", type: "URBAINE", page: "24", source: "Loi organique n°015/CNT/2024, article 3; Loi n°022/CNT/2024, article 2" });
for (let numero = 1; numero <= 10; numero += 1) {
  const suffixe = numero === 1 ? "er" : "e";
  communes.push({
    provinceId: "prov-ndjamena",
    provinceNom: "N'DJAMENA",
    provinceNomD1: nomsProvincesD1.get("prov-ndjamena"),
    nom: `Commune d’arrondissement du ${numero}${suffixe} arrondissement`,
    type: "URBAINE",
    page: "24",
    source: "Loi organique n°015/CNT/2024, article 3; Loi n°022/CNT/2024, article 2",
  });
}

if (communes.length !== 500) throw new Error(`La base légale doit produire 500 communes, valeur obtenue : ${communes.length}.`);
const cleNoms = new Set(communes.map((commune) => `${commune.provinceId}\u0000${commune.nom.normalize("NFKC").toLocaleLowerCase("fr")}`));
if (cleNoms.size !== communes.length) throw new Error("Des noms de communes sont dupliqués dans une même province.");

function protegerCsv(valeur) {
  return `"${valeur.replaceAll('"', '""')}"`;
}

function protegerSql(valeur) {
  return `'${valeur.replaceAll("'", "''")}'`;
}

const lignesCsv = [
  ["code_interne", "province_id_d1", "province_nom_d1", "province_telle_que_publiee", "nom_transcrit", "type_commune", "date_effet", "source_legale", "article", "page_imprimee", "statut_verification", "relation_documentee", "note_transcription"].join(";"),
  ...communes.map((commune, index) => [
    `LO015-COM-${String(index + 1).padStart(3, "0")}`,
    commune.provinceId,
    commune.provinceNomD1 ?? "N'Djamena",
    commune.provinceNom,
    commune.nom,
    commune.type,
    "2024-07-31",
    commune.source,
    "Article 3",
    commune.page,
    "A_RELIRE_VISUELLEMENT_AVANT_ACTIVATION",
    "Province indiquée dans le tableau de l’article 3; aucun rattachement à un département ou à une sous-préfecture n’est déduit",
    "Transcription issue du texte PDF; casse et espaces normalisés; les graphies et accents doivent être relus sur le fac-similé avant activation opérationnelle",
  ].map(protegerCsv).join(";")),
];

const lignesSql = [
  "PRAGMA foreign_keys = ON;",
  "INSERT INTO communes (id, province_id, code, nom, type_commune, statut_validation, source_officielle, date_effet, actif) VALUES",
  communes.map((commune, index) => {
    const numero = String(index + 1).padStart(3, "0");
    return `  (${protegerSql(`commune-lo015-${numero.toLowerCase()}`)}, ${protegerSql(commune.provinceId)}, ${protegerSql(`LO015-COM-${numero}`)}, ${protegerSql(commune.nom)}, ${protegerSql(commune.type)}, 'PROPOSE', ${protegerSql(commune.source)}, '2024-07-31', 1)`;
  }).join(",\n") + "\nON CONFLICT(id) DO NOTHING;",
];

const dossierSources = resolve(racine, "sources/referentiel-territorial");
await mkdir(dossierSources, { recursive: true });
await writeFile(resolve(dossierSources, "communes-loi-015-2024.csv"), `${lignesCsv.join("\n")}\n`, "utf8");
await writeFile(resolve(racine, "migrations/0011_import_communes_loi_015.sql"), `${lignesSql.join("\n")}\n`, "utf8");
process.stdout.write(`Données produites : ${communes.length} communes, ${enregistrements.length} communes urbaines provinciales, ${nombreCommunesRurales} communes rurales, 11 communes urbaines de N’Djaména.\n`);
