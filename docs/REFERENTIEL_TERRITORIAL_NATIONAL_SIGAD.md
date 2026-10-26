# SIGAD — RÉFÉRENTIEL TERRITORIAL NATIONAL DE LA RÉPUBLIQUE DU TCHAD
## Cadre officiel, architecture administrative et règles d'intégrité opérationnelle

**Date d'établissement :** 25 octobre 2026  
**Autorité émettrice :** Compte Propriétaire SIGAD / Cellule Nationale de Gouvernance des Données  
**Contexte opérationnel :** Système Intégré de Gestion des Aides et des Distributions (SIGAD)  
**Textes juridiques de référence :**
- Ordonnance n°002/PR/2024 du 15 février 2024 portant restructuration et organisation des circonscriptions administratives en République du Tchad ;
- Ordonnance n°038/PR/2018 portant création des unités administratives et des collectivités autonomes ;
- Arrêté n°0033/PR/PM/MASSNAH/SG/2026 du 7 octobre 2026 portant organisation des opérations de distribution gratuite de vivres ;
- INSEED — Annuaire Statistique National 2024 et nomenclature officielle des localités.

---

## 1. Principes fondamentaux du découpage administratif

Le référentiel géographique de SIGAD modélise l'ensemble des divisions administratives et des établissements humains du Tchad nécessaires au ciblage équitable, à l'acheminement des vivres et au contrôle des distributions.

Le référentiel repose sur quatre principes directeurs :
1. **Intégrité constitutionnelle :** Vingt-trois (23) provinces nationales immuables, constituant les périmètres d'action des délégations provinciales du Ministère.
2. **Double régime provincial :**
   - Vingt-deux (22) provinces territoriales ordinaires articulées selon la chaîne hiérarchique classique : `Province → Département → Sous-préfecture / Canton → Localités (Villes, Villages, Ferricks, Campements)`.
   - Une (1) province à régime urbain spécial : **N'Djaména**, capitale politique, subdivisée directement sans échelon départemental : `Province de N'Djaména → Ville de N'Djaména → 10 Arrondissements communaux → Quartiers → Carrés`.
3. **Statut de validation granulaire :** Chaque division et établissement humain porte un statut explicite :
   - `VALIDE` : Unité formellement certifiée par les textes législatifs ou réglementaires en vigueur (80 départements certifiés).
   - `A_VERIFIER` : Circonscription candidate issue de l'inventaire préparatoire ou d'un projet de découpage en attente de décret d'application formel (32 départements candidats).
   - `ARCHIVE` / `REJETE` : Circonscription historique ou doublon ayant fait l'objet d'un regroupement ou d'une invalidation.
4. **Conservation immuable de l'historique physique :** Aucune distribution passée, aucun bordereau de livraison ni mouvement de stock n'est dénaturé en cas de modification administrative ultérieure. Une table de correspondance (`correspondances_fusions_territoriales`) garantit la traçabilité des unités regroupées.

---

## 2. Inventaire national des 23 Provinces

| Code Province | Identifiant D1 | Nom officiel | Chef-lieu officiel | Régime administratif | Départements | Statut |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| `TD-BA` | `prov-batha` | **Batha** | Ati | Ordinaire | 6 | `VALIDE` |
| `TD-BG` | `prov-barh-el-gazel` | **Barh-El-Gazel** | Moussoro | Ordinaire | 5 | `VALIDE` |
| `TD-BO` | `prov-borkou` | **Borkou** | Faya-Largeau | Ordinaire | 4 | `VALIDE` |
| `TD-CB` | `prov-chari-baguirmi` | **Chari-Baguirmi** | Massenya | Ordinaire | 5 | `VALIDE` |
| `TD-EN` | `prov-ennedi-est` | **Ennedi-Est** | Am-Djarass | Ordinaire | 5 | `VALIDE` |
| `TD-EO` | `prov-ennedi-ouest` | **Ennedi-Ouest** | Fada | Ordinaire | 3 | `VALIDE` |
| `TD-GR` | `prov-gueran` | **Guéra** | Mongo | Ordinaire | 5 | `VALIDE` |
| `TD-HL` | `prov-hadjer-lamis` | **Hadjer-Lamis** | Massakory | Ordinaire | 4 | `VALIDE` |
| `TD-KA` | `prov-kanem` | **Kanem** | Mao | Ordinaire | 5 | `VALIDE` |
| `TD-LC` | `prov-lac` | **Lac** | Bol | Ordinaire | 5 | `VALIDE` |
| `TD-LO` | `prov-logone-occidental` | **Logone-Occidental** | Moundou | Ordinaire | 4 | `VALIDE` |
| `TD-LR` | `prov-logone-oriental` | **Logone-Oriental** | Doba | Ordinaire | 6 | `VALIDE` |
| `TD-MA` | `prov-mandoul` | **Mandoul** | Koumra | Ordinaire | 6 | `VALIDE` |
| `TD-MO` | `prov-mayo-kebbi-ouest` | **Mayo-Kebbi-Ouest** | Pala | Ordinaire | 4 | `VALIDE` |
| `TD-ME` | `prov-mayo-kebbi-est` | **Mayo-Kebbi-Est** | Bongor | Ordinaire | 4 | `VALIDE` |
| `TD-MC` | `prov-moyen-chari` | **Moyen-Chari** | Sarh | Ordinaire | 4 | `VALIDE` |
| `TD-ND` | `prov-ndjamena` | **N'Djaména** | N'Djaména | **Urbain spécial (10 Arrondissements)** | 0 | `VALIDE` |
| `TD-OD` | `prov-ouaddai` | **Ouaddaï** | Abéché | Ordinaire | 6 | `VALIDE` |
| `TD-SA` | `prov-salamat` | **Salamat** | Am Timan | Ordinaire | 4 | `VALIDE` |
| `TD-SI` | `prov-sila` | **Sila** | Goz-Beïda | Ordinaire | 5 | `VALIDE` |
| `TD-TI` | `prov-tibesti` | **Tibesti** | Bardaï | Ordinaire | 5 | `VALIDE` |
| `TD-TA` | `prov-tandjile` | **Tandjilé** | Laï | Ordinaire | 4 | `VALIDE` |
| `TD-WF` | `prov-wadi-fira` | **Wadi-Fira** | Biltine | Ordinaire | 5 | `VALIDE` |
| **Total** | **23 Provinces** | — | — | **1 Spécial / 22 Ordinaires** | **112 Dép.** | **100% VALIDE** |

---

## 3. Régime spécial de N'Djaména

La capitale de la République du Tchad est régie par un statut particulier dérogatoire au droit commun départemental.

### 3.1 Architecture institutionnelle
Dans la base SIGAD, la province de N'Djaména (`prov-ndjamena`, `statut_particulier = 1`) n'a aucun département ni sous-préfecture. Son articulation territoriale s'organise selon la pyramide urbaine suivante :
```
Province de N'Djaména (prov-ndjamena)
  └── Ville de N'Djaména (loc-ndjamena-ville, mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS')
        ├── 1er Arrondissement (arr-ndj-1)
        │     ├── Farcha (qrt-ndj-1-farcha) ── Carrés
        │     └── Milezi (qrt-ndj-1-milezi) ── Carrés
        ├── 2e Arrondissement (arr-ndj-2)
        │     ├── Bololo (qrt-ndj-2-bololo) ── Carrés
        │     └── Klémat (qrt-ndj-2-klemat) ── Carrés
        ├── 3e Arrondissement (arr-ndj-3)
        │     ├── Ardep-Djoumal (qrt-ndj-3-ardep-djoumal) ── Carrés
        │     └── Gardolé (qrt-ndj-3-gardole) ── Carrés
        ├── 4e Arrondissement (arr-ndj-4)
        │     ├── Repos (qrt-ndj-4-repos) ── Carrés
        │     └── Blabline (qrt-ndj-4-blabline) ── Carrés
        ├── 5e Arrondissement (arr-ndj-5)
        │     ├── Ridina (qrt-ndj-5-ridina) ── Carrés
        │     └── Amriguébé (qrt-ndj-5-amriguebe) ── Carrés
        ├── 6e Arrondissement (arr-ndj-6)
        │     ├── Moursal (qrt-ndj-6-moursal) ── Carrés
        │     └── Paris-Congo (qrt-ndj-6-paris-congo) ── Carrés
        ├── 7e Arrondissement (arr-ndj-7)
        │     ├── Chagoua (qrt-ndj-7-chagoua) ── Carrés
        │     ├── Dembé (qrt-ndj-7-dembe) ── Carrés
        │     └── Habena (qrt-ndj-7-habena) ── Carrés
        ├── 8e Arrondissement (arr-ndj-8)
        │     ├── Diguel (qrt-ndj-8-diguel) ── Carrés
        │     └── Madjorio (qrt-ndj-8-madjorio) ── Carrés
        ├── 9e Arrondissement (arr-ndj-9)
        │     ├── Walia (qrt-ndj-9-walia) ── Carrés
        │     └── Toukra (qrt-ndj-9-toukra) ── Carrés
        └── 10e Arrondissement (arr-ndj-10)
              └── Gaoui (qrt-ndj-10-gaoui) ── Carrés
```

### 3.2 Règles d'intégrité strictes pour N'Djaména
- **Interdiction des départements :** L'enregistrement d'un ménage ou d'une distribution à N'Djaména avec un `departement_id` non-nul est strictement refusé par les contraintes et triggers de la base.
- **Obligation de l'arrondissement :** Tout quartier rattaché à N'Djaména doit être expressément associé à l'un des 10 arrondissements communaux officiels.
- **Carrés :** Le carré constitue la plus petite cellule de ciblage en milieu urbain dense.

---

## 4. Typologie des établissements humains et modes d'intervention

Le système SIGAD gère quatre grandes catégories d'établissements humains adaptées aux réalités géographiques et sociales du Tchad :

### 4.1 Villes ordinaires (`VILLE`)
- Communes urbaines chefs-lieux de province ou de département (ex: Moundou, Abéché, Sarh, Bongor, Mongo, Ati).
- Mode de découpage urbain : généralement `SANS_ARRONDISSEMENT` (les quartiers se rattachent directement à la ville), sauf exception métropolitaine.

### 4.2 Villages ruraux sédentaires (`VILLAGE`)
- Communautés rurales agricoles regroupées sous l'autorité d'un chef de village, rattachées à un canton ou une sous-préfecture.
- Ciblage par listes d'émargement villageoises visées par le chef traditionnel et le comité de ciblage local.

### 4.3 Ferricks et Campements pastoraux nomades (`FERRICK`, `CAMPEMENT`)
- Unités d'habitation mobiles de pasteurs éleveurs nomades et semi-nomades, caractérisées par une mobilité saisonnière (transhumance).
- Rattachement administratif flexible sous la supervision directe du département ou de la sous-préfecture d'attache pastorale.

### 4.4 Sites et centres d'accueil humanitaires (`SITE_HUMANITAIRE`)
- Circonscriptions d'accueil spécifiques destinées aux réfugiés (frontières est et sud) et aux personnes déplacées internes (PDI, région du Lac).
- Catégories de sites : `CAMP_REFUGIES`, `SITE_DEPLACES`, `CENTRE_ACCUEIL`, `SITE_TRANSIT`, `AUTRE_SITE`.

---

## 5. Synthèse des flux et de la traçabilité des mutations

Toute opération de création, modification, validation, réaffectation, fusion ou suppression d'entités territoriales est strictement soumise à la gouvernance du compte **`PROPRIETAIRE`**.

1. **Recherche et fil d'Ariane :** Chaque unité est indexée avec son arborescence complète pour éviter toute confusion entre homonymes (ex: multiples villages portant le nom "Am-Djoum" ou "Karkour" dans des départements distincts).
2. **Simulation d'impact :** Tout projet de fusion ou de déplacement fait l'objet d'un calcul prédictif préalable quantifiant les ménages, bénéficiaires et distributions concernés.
3. **Table de correspondances :** Les unités doublons absorbées sont conservées en base avec le statut `ARCHIVE` ou `REJETE` et référencées dans `correspondances_fusions_territoriales`.
4. **Verrouillage de suppression :** Une suppression physique est rejetée avec code HTTP 409 si au moins un ménage, un entrepôt ou une distribution y est rattaché.
