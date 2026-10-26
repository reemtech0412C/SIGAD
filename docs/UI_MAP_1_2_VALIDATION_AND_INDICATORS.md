# SIGAD — UI-MAP 1.2 — Validation juridique, audit des indicateurs et intégration

**Projet :** SIGAD v3.0  
**Branche :** `ui/interactive-map`  
**Date de vérification :** 23 octobre 2026  
**Environnement :** Worker Cloudflare, D1, R2 et Google Chrome locaux uniquement  
**Données des captures :** jeu d’acceptation synthétique local; aucun chiffre de ces captures ne représente la production.

```text
GEOGRAPHIC_LEGAL_VALIDATION: PARTIAL
INDICATORS_AUDIT: PARTIAL
RBAC_VALIDATION: PASS
REAL_DASHBOARD_INTEGRATION: PASS
API_CHANGES: NONE
REMOTE_CHANGES: NONE
OVERALL: PARTIAL
```

## Synthèse de décision

Le contrôle nominal rapproche les **23 provinces** de la Loi organique n°015/CNT/2024 des 23 entités ADM1 du jeu OCHA/HDX : les noms correspondent après normalisation de la ponctuation, des accents et de la casse. Les 23 P-codes OCHA sont uniques et disposent d’une correspondance 1:1 documentée vers les identifiants SIGAD. La loi n’attribue toutefois pas ces P-codes et ne fournit pas de fichier vectoriel ni de coordonnées qui permettraient de certifier les polygones.

Le GeoJSON satisfait les contrôles géométriques internes et la carte reste explicitement **expérimentale, non homologuée et dépourvue d’indicateurs**. Ces contrôles techniques ne prouvent pas la conformité juridique des limites. La discordance documentée entre les 70 départements ADM2 du COD-AB v01 et les 124 départements mentionnés dans l’annuaire INSEED associé à la restructuration de 2024 confirme que les niveaux infra-provinciaux OCHA ne doivent pas être activés comme référentiel national courant.

La carte est maintenant accessible dans le tableau de bord opérationnel par `/tableau-de-bord`; `/ui-preview` reste un alias compatible. Elle affiche des limites locales sans appeler une API statistique. Les indicateurs du tableau de bord proviennent de l’API actuelle et restent séparés de la carte. L’audit révèle toutefois que plusieurs libellés demandés n’ont pas encore de définition opérationnelle exacte dans cette API; aucun nouveau contrat ni endpoint n’a été créé.

## 1. Validation juridique et géographique

### Sources et portée

| Source | Éléments contrôlés | Date et limite d’interprétation |
|---|---|---|
| [Journal officiel, numéro spécial de juillet 2024 — Loi organique n°015/CNT/2024](https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf) | Article 3 et tableau des provinces/communes, pages imprimées 20–23; articles 4–5, page imprimée 24; décret n°0298/PR/2024, page imprimée 25. La loi a été adoptée le 31 juillet 2024 et promulguée le 16 août 2024. | Le document est une reproduction du Journal officiel du Secrétariat général du Gouvernement. L’article 5 renvoie aux unités administratives correspondantes et permet la modification des dénominations ou délimitations par décret; il ne publie pas de coordonnées ou de polygones numériques. |
| [INSEED — Annuaire statistique national 2024](https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024) | Le tableau 1 rattache à l’Ordonnance n°002/PR/2024 un décompte de 23 provinces, 124 départements et 489 communes administratives. | Photographie statistique publiée en septembre 2025 et attribuée au ministère de l’Intérieur. Les catégories « unités administratives » et « collectivités autonomes » ne sont pas assimilées sans texte de rapprochement. |
| [Journal officiel — octobre 2025, décret n°2681/PR/PM/MATD/2025](https://journalofficiel.td/storage/v1/object/public/archiva/journaux/2025/10/1764959752502-0u0ckxfe65pr.pdf) | Le décret change le nom du canton MISKI en « DONZA GALALA à MISKI » dans le département de l’Emi-Koussi, province du Tibesti. | Exemple officiel d’évolution d’un niveau inférieur. Il ne suffit pas à établir une modification de la limite géométrique de la province. |
| [Journal officiel — janvier 2026](https://journalofficiel.td/storage/v1/object/public/archiva/journaux/2026/01/1770735788949-n35idbhp96p.pdf) | Publication des décrets de promulgation des lois ratifiant l’Ordonnance n°002/PR/2024 sur la restructuration des unités administratives et l’Ordonnance n°005/PR/2025 sur les principes fondamentaux de l’organisation administrative du territoire. | Source officielle postérieure à la Loi organique n°015. La présente revue n’a pas établi une couche géographique officielle consolidée correspondant à ces textes. |
| [OCHA/HDX — Chad administrative boundaries, COD-AB](https://data.humdata.org/dataset/cod-ab-tcd) et [ressource GeoJSON/ZIP](https://data.humdata.org/dataset/f01c8222-b67d-41ff-954a-731aafd4466b/resource/575b9fe1-a995-43b8-9e12-de98d4d7d7d1/download/tcd_admin_boundaries.geojson.zip) | Ressource `575b9fe1-a995-43b8-9e12-de98d4d7d7d1`, version `v01`, ADM1 = 23 provinces, ADM2 = 70 départements; licence CC BY-IGO. | Valide pour l’usage humanitaire depuis le 12/02/2025; révision de complétude annoncée le 30/10/2025; création et dernière modification des limites source annoncées au 04/09/2012. La fiche HDX a été modifiée le 14/08/2026 : cette date de métadonnées ne constitue pas une nouvelle date de géométrie. |

L’article 3 de la Loi n°015 fixe 23 provinces et 500 communes, dont 125 urbaines et 375 rurales. L’annuaire INSEED décrit, pour l’Ordonnance n°002/PR/2024, 124 départements et 489 unités administratives communales. Ces chiffres ne sont pas traités comme une erreur arithmétique unique : les textes et l’annuaire n’emploient pas nécessairement le même périmètre juridique, et les textes de restructuration postérieurs doivent être rapprochés de manière exhaustive avant toute activation.

### Correspondance des noms et des codes ADM1

Le tableau reprend l’ordre des provinces de l’article 3. Le numéro de la loi est un ordre de présentation, non un code géographique. Le P-code OCHA est un identifiant de jeu de données; aucun P-code correspondant n’est attribué par la loi.

| N° loi | Province (dénomination normalisée) | Identifiant SIGAD | P-code OCHA | Noms | Limite géométrique |
|---:|---|---|---|---|---|
| 1 | Barh-El-Gazel | `prov-barh-el-gazel` | `TCD19` | Correspondance nominale | Non certifiée juridiquement |
| 2 | Batha | `prov-batha` | `TCD01` | Correspondance nominale | Non certifiée juridiquement |
| 3 | Borkou | `prov-borkou` | `TCD02` | Correspondance nominale | Non certifiée juridiquement |
| 4 | Chari-Baguirmi | `prov-chari-baguirmi` | `TCD03` | Correspondance nominale | Non certifiée juridiquement |
| 5 | Ennedi-Est | `prov-ennedi-est` | `TCD20` | Correspondance nominale | Non certifiée juridiquement |
| 6 | Ennedi-Ouest | `prov-ennedi-ouest` | `TCD23` | Correspondance nominale | Non certifiée juridiquement |
| 7 | Guéra | `prov-guera` | `TCD04` | Correspondance nominale | Non certifiée juridiquement |
| 8 | Hadjer-Lamis | `prov-hadjer-lamis` | `TCD05` | Correspondance nominale | Non certifiée juridiquement |
| 9 | Kanem | `prov-kanem` | `TCD06` | Correspondance nominale | Non certifiée juridiquement |
| 10 | Lac | `prov-lac` | `TCD07` | Correspondance nominale | Non certifiée juridiquement |
| 11 | Logone-Occidental | `prov-logone-occidental` | `TCD08` | Correspondance nominale | Non certifiée juridiquement |
| 12 | Logone-Oriental | `prov-logone-oriental` | `TCD09` | Correspondance nominale | Non certifiée juridiquement |
| 13 | Mandoul | `prov-mandoul` | `TCD10` | Correspondance nominale | Non certifiée juridiquement |
| 14 | Mayo-Kebbi-Est | `prov-mayo-kebbi-est` | `TCD11` | Correspondance nominale | Non certifiée juridiquement |
| 15 | Mayo-Kebbi-Ouest | `prov-mayo-kebbi-ouest` | `TCD12` | Correspondance nominale | Non certifiée juridiquement |
| 16 | Moyen-Chari | `prov-moyen-chari` | `TCD13` | Correspondance nominale | Non certifiée juridiquement |
| 17 | Ouaddaï | `prov-ouaddai` | `TCD14` | Correspondance nominale | Non certifiée juridiquement |
| 18 | Salamat | `prov-salamat` | `TCD15` | Correspondance nominale | Non certifiée juridiquement |
| 19 | Sila | `prov-sila` | `TCD21` | Correspondance nominale | Non certifiée juridiquement |
| 20 | Tandjilé | `prov-tandjile` | `TCD16` | Correspondance nominale | Non certifiée juridiquement |
| 21 | Tibesti | `prov-tibesti` | `TCD22` | Correspondance nominale | Non certifiée juridiquement |
| 22 | Wadi-Fira | `prov-wadi-fira` | `TCD17` | Correspondance nominale | Non certifiée juridiquement |
| 23 | N’Djamena | `prov-ndjamena` | `TCD18` | Correspondance nominale | Non certifiée juridiquement |

**Résultat nominal : 23/23.** Les noms ont été rapprochés après normalisation de casse, accents et séparateurs. Les codes OCHA sont distincts de la numérotation de la loi : par exemple, Barh-El-Gazel est n°1 dans le tableau légal et `TCD19`, tandis que Sila est n°19 et `TCD21`. La correspondance des 23 codes P-code ↔ identifiants SIGAD est conservée dans [`matching-cod-ab-adm1-ui-map-1.csv`](../sources/referentiel-territorial/matching-cod-ab-adm1-ui-map-1.csv).

**Résultat géométrique : techniquement vérifié, juridiquement non vérifiable avec les pièces disponibles.** La Loi n°015 liste et rattache les collectivités, mais le dossier examiné ne contient pas de fichier de limites légal, de coordonnées ni de décision cartographique homologuant cette version OCHA. Il n’est donc pas possible de qualifier les limites affichées d’officielles.

### Contrôles techniques du GeoJSON utilisé

Exécution de `node scripts/verifier-geojson-chad-adm1.mjs` : **PASS** pour la cohérence technique du fichier local.

- 23 entités ADM1, 23 P-codes uniques et 23 correspondances 1:1 avec les noms SIGAD normalisés.
- Version `v01`, `valid_on=2025-02-12`, `valid_to=null`; système CRS84/WGS84.
- 23 géométries `Polygon` valides; aucune auto-intersection ou intersection intérieure entre provinces détectée; 56 paires contrôlées.
- Les coordonnées sont comprises dans l’emprise ADM0; les surfaces ADM1 totalisent 1 265 079,45209754 km² et celles d’ADM0 1 265 079,45209752 km² (écart calculé : 0,000000020 km²).
- Empreinte SHA-256 ADM1 : `D583319369D7AEEA292FC3A9757E6426CBB5D94E4043918B82C3272697728E76`.
- Les 500 communes SIGAD restent en révision et ne sont ni représentées ni activées par cette carte.

La couche OCHA ADM2 indique 70 départements, alors que l’annuaire INSEED lié à la restructuration de 2024 donne 124. Ce différentiel est un **écart de version/périmètre non résolu**; aucun département, canton ou rattachement communal OCHA n’est activé sur la seule base de cette couche.

## 2. Audit du contrat des indicateurs

### Source et contrôle d’accès communs

- Endpoint existant : `GET /api/rapports/tableau-de-bord`; options de sélection : `GET /api/rapports/filtres`.
- Les middlewares `authMiddleware`, `csrfSessionMiddleware` et `exigerRoles("PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL")` sont exécutés avant les routes de rapports.
- `lireTableauDeBordRapports` appelle `appliquerPerimetreUtilisateur` avant de préparer les lectures D1. Pour un délégué, le `province_id` provient de l’utilisateur authentifié; un filtre de province différent est refusé en `403`.
- Le tableau de bord exécute trois lectures D1 dans un `db.batch` : synthèse agrégée, évolution mensuelle plafonnée à 12 lignes et agrégation provinciale plafonnée à 100 lignes (23 provinces actives attendues). `ressources_d1` expose les lignes lues et la durée retournée par D1. Il s’agit d’un lot de lectures, sans écriture ni transaction métier.
- Filtres actuellement visibles : période, partenaire, nature d’aide et statut; la province est sélectionnable seulement par les rôles centraux. Le schéma partagé accepte aussi `distribution_id` et `localite_id`, mais le filtre de localité ne restreint que les distributions et n’est pas propagé à toutes les agrégations d’approvisionnement, de réception et de stock. L’unité de ce filtre doit donc être précisée dans un futur contrat avant usage transversal.
- Les chiffres de coût capturés dans Chrome sont locaux et synthétiques : 513 lignes D1 lues / 1 ms pour la capture Sila et 624 / 1 ms pour la capture centrale mobile. Ils illustrent un jeu de test, pas une projection de quotas Cloudflare en production.

### Matrice des six indicateurs demandés

| Indicateur demandé | Source et calcul actuellement exécutés | Unité et interprétation | Filtres et rôles | Consommation D1 et décision |
|---|---|---|---|---|
| **Distributions réalisées** | `indicateurs.distributions`; `COUNT(*)` sur les distributions correspondant aux filtres. Aucun statut d’exécution ou de clôture n’est exigé par ce calcul. La série mensuelle compte également les distributions prévues dans le mois, tous statuts inclus. | Opérations enregistrées, et non opérations nécessairement réalisées. Le libellé demandé « réalisées » n’est pas satisfait par le champ actuel. | Période (sur `date_prevue`), partenaire bailleur/exécutant, nature d’aide, statut, province. Accès national des rôles centraux autorisés; province de session des délégués. | Part de la synthèse du premier des trois SELECT du même batch; dépend du nombre d’opérations correspondantes. **Contrat incomplet** pour « réalisées ». |
| **Distributions en cours** | Le champ affiché « Opérations en attente » additionne distributions dont le statut est différent de `CLOTUREE_CENTRAL` et approvisionnements dont le statut est différent de `CLOTUREE`. | Opérations non clôturées, mélangeant deux domaines et pouvant inclure des brouillons ou des états autres qu’« en cours ». Ne mesure pas une file de distributions en cours. | Les mêmes filtres sont appliqués selon le domaine; les approvisionnements sont filtrés par province via leurs destinations. Périmètres de session identiques. | Même SELECT agrégé; pas de scan des détails renvoyés au client. **Contrat incomplet**; la liste exacte des statuts à inclure doit être approuvée. |
| **Ménages bénéficiaires** | Tables `menages_distribution` et `menages`. `menages_cibles_uniques` compte les identifiants de ménages distincts ciblés; `menages_servis_uniques` regroupe par ménage et marque servi si au moins une distribution le porte `SERVI`; `menages_partiellement_servis_uniques` compte les ménages sans service complet mais avec au moins une occurrence `PARTIELLEMENT_SERVI`. | Ménages uniques sur l’ensemble filtré. Un même ménage présent dans plusieurs distributions est compté une fois; le statut servi prévaut si le même ménage a aussi une occurrence partielle dans la période. | Période, province, partenaire, nature et statut; localité pour le sous-ensemble de distributions seulement. Rôle et portée communs. | CTE et regroupement `mu` dans le SELECT agrégé; coûts croissants avec les opérations et relations ménage-distribution sélectionnées. Pas de lecture d’une liste complète au frontend. **Définition interprétable avec la priorité de statut documentée.** |
| **Personnes bénéficiaires** | Le tableau utilise `personnes_assistees_menages_uniques`, somme de `nombre_personnes` une fois par ménage ayant au moins une remise complète ou partielle. L’API expose aussi `personnes_assistees_cumulees`, qui somme la taille du ménage à chaque occurrence de remise. | Ce ne sont pas des personnes dédupliquées par identifiant individuel : aucune identité individuelle ne sert de clé dans ce calcul. Une remise partielle compte la taille entière déclarée du ménage; le cumul répète un ménage aidé dans plusieurs opérations. | Filtres et rôles communs aux distributions. | Même CTE et même SELECT agrégé. **Le libellé doit rester « personnes estimées dans les ménages uniques servis » ou recevoir une règle métier approuvée.** |
| **Stocks disponibles** | `stock_disponible_comptable`; agrégat des quantités physiques moins réservées, limité aux lots de qualité `BON` non périmés, à partir de `soldes_stock`, `entrepots` et `lots_stock`. | Somme numérique sans unité commune : kilogrammes, unités, colis ou autres unités peuvent être additionnés ensemble. Ce total ne constitue pas une quantité nationale opérationnellement interprétable. | Province, partenaire bailleur du lot et nature/catégorie d’aide. Pas de filtre d’article/unité dans cette synthèse; photographie courante sans période. | Sous-requête de stock incluse dans le premier SELECT agrégé et exécutée avec le batch de trois lectures. **Ne pas utiliser comme KPI quantitatif unique**; une ventilation par article et unité exigerait un contrat distinct. |
| **Validations en attente** | Aucun champ consolidé dans `TableauDeBordRapports`; les panneaux « Validations » et « Activités récentes » affichent explicitement « indicateur/flux indisponible ». Les validations existent dans des domaines et transitions distincts (distribution, approvisionnement, partenaire, référentiel territorial). | Aucun total ni unité commune définis. Une demande de validation, une observation, une correction et une proposition territoriale sont des objets de workflow différents. | Les filtres et permissions diffèrent selon le domaine et le rôle; le délégué ne traite pas les validations centrales. | Aucun comptage de validation n’est exécuté par les trois requêtes du dashboard. **Nouveau contrat à faire approuver avant tout agrégat/API.** |

**Conclusion de l’audit : `PARTIAL`.** Les données sources et les formules actuelles sont identifiées, mais « distributions réalisées », « distributions en cours », « personnes bénéficiaires » et « validations en attente » ne correspondent pas encore sans ambiguïté aux concepts demandés. Le total de stock additionne des unités hétérogènes. Aucun indicateur incertain n’est attaché aux polygones et aucune valeur n’est présentée sur la carte comme une statistique géographique réelle.

## 3. Validation des droits et de l’isolation

### Matrice de résultats

| Essai | Résultat observé | État |
|---|---|---|
| Délégué Sila, sans filtre de province : `province_id=prov-sila`, liste d’agrégations contenant uniquement `prov-sila`. | `200`; le tableau JSON est provincial et n’inclut aucune ligne Ouaddaï. | PASS |
| Délégué Sila demande `province_id=prov-ouaddai`. | `403`; le service applique le périmètre de session avant d’exécuter les lectures métier. | PASS |
| Délégué Ouaddaï, sans filtre de province : `province_id=prov-ouaddai`, liste d’agrégations contenant uniquement `prov-ouaddai`. | `200`; le tableau JSON n’inclut aucune ligne Sila. | PASS |
| Délégué Ouaddaï demande `province_id=prov-sila`. | `403`; le périmètre ne peut pas être élargi par le paramètre reçu. | PASS |
| Administration centrale autorisée, filtre national. | `200`, périmètre `NATIONAL`, exactement 23 lignes provinciales actives dans la réponse de test. | PASS |
| Mécanisme global de refus API. | Matrice exécutée sur 140 routes cataloguées : 137 essais anonymes et 123 refus RBAC; l’empreinte des 65 tables reste inchangée après les refus. | PASS |
| Données chargées par la carte. | GeoJSON statique avec 23 noms/codes/géométries; aucune clé de ménage, bénéficiaire, distribution, stock ou indicateur. Les autres provinces sont visibles comme limites publiques, mais non sélectionnables par le délégué. | PASS |

La réponse centrale nationale est permise seulement aux rôles couverts par le middleware de rapports. L’interface ne remplace pas le contrôle serveur. Les essais géographiques n’ont pas modifié D1 : les chemins concernés sont des lectures; la matrice globale confirme l’absence de mutation après les refus.

## 4. Intégration dans le tableau de bord réel

- Le composant existant [`CarteProvincesTchad.tsx`](../frontend/src/components/pilote/CarteProvincesTchad.tsx) reste celui utilisé dans [`TableauBordPilote.tsx`](../frontend/src/components/pilote/TableauBordPilote.tsx); il n’a pas été réécrit.
- Le tableau de bord opérationnel a un chemin canonique `/tableau-de-bord`. L’ancien `/ui-preview` reste reconnu comme alias et les tests de navigation confirment qu’il ouvre le même composant.
- [`App.tsx`](../frontend/src/App.tsx) route le tableau de bord sous le même `SIGADAppShell` que l’administration et conserve les vérifications de rôle existantes.
- L’en-tête de la carte indique maintenant « Mode expérimental · OCHA COD-AB v01 » et « validation juridique nationale en attente »; un avis précise que les limites ne sont pas homologuées et n’activent pas le référentiel administratif SIGAD.
- Les polygones ne reçoivent aucune donnée de l’API. Les statistiques restent dans les panneaux existants; les panneaux de validation et d’activité indiquent leur indisponibilité au lieu d’afficher une valeur inventée.
- Aucune API, permission, table, migration, donnée géographique D1, R2 ou ressource distante n’a été modifiée.

**REAL_DASHBOARD_INTEGRATION: PASS** — même carte et même API existantes, nouveau chemin explicite, ancien chemin conservé, statut expérimental visible, aucun couplage statistique ajouté.

## 5. Tests et mesures exécutés

| Vérification | Commande ou méthode | Résultat réel |
|---|---|---|
| TypeScript | `npm run typecheck`; vérification indépendante `npx tsc --noEmit -p tsconfig.json` | **PASS**, code de sortie 0. La première exécution isolée a affiché un avertissement Wrangler `EPERM` lors de l’écriture de son fichier de log utilisateur; la génération des types a abouti et le `tsc` indépendant a terminé avec le code 0. |
| Build frontend | `npm run build` | **PASS**, Vite 8.3.5; PWA et assets générés. |
| Tests unitaires | `npm run test:unit` | **PASS**, 9 fichiers, 36 tests. |
| Worker + D1 + R2 et sécurité | `npm run test:integration` | **PASS**, processus terminé avec le code 0. Le Worker de test a utilisé Wrangler en mode local; rapports 6/6, cycle provincial 10/10, matrice de refus réussie, et groupes stock/approvisionnement réussis. |
| Schéma local | Vérificateur SQLite/D1 du harnais d’acceptation | **PASS**, 21 migrations appliquées sur base locale neuve; 65 tables (62 métier + 3 MFA), 83 index, 68 déclencheurs, 25 comptes, 23 provinces, 500 communes en relecture (0 activée), contraintes et clés étrangères vérifiées. |
| Contrôle GeoJSON | `node scripts/verifier-geojson-chad-adm1.mjs` | **PASS** technique : 23 polygones, codes uniques, cohérence des surfaces et topologie contrôlée. **Ne vaut pas validation légale.** |
| Playwright / Google Chrome installé | `SIGAD_PLAYWRIGHT_EXECUTABLE=C:\Program Files\Google\Chrome\Application\chrome.exe npm run test:e2e` (syntaxe PowerShell équivalente) | **PASS**, 11 tests, durée Playwright 3,0 min. La première tentative avec Chromium embarqué a échoué car son exécutable n’existait pas; la relance avec Chrome local a terminé avec 11/11 et code de sortie 0. |
| DevTools / rendu de police | `CSS.getPlatformFontsForNode` dans Chrome | **PASS**, famille réellement rendue : `DM Sans`. Le Worker a servi les polices locales et le GeoJSON local en HTTP 200. |
| Vérification des modifications | `git diff --check` | **PASS** avant les derniers tests; des avertissements Git de normalisation LF/CRLF ont été signalés, sans erreur d’espacement. |

### Mesures de la liste des ménages — D1 locale uniquement

Dix mesures après échauffement ont été exécutées à chaque cardinalité avec `EXPLAIN QUERY PLAN`. L’index composite utilisé est `idx_menages_province_statut_date`; les plans ne signalent pas de tri temporaire.

| Ménages actifs synthétiques | Première exécution : médiane / p95 | Relance sous Chrome/E2E : médiane / p95 |
|---:|---:|---:|
| 502 | 48,42 ms / 79,02 ms | 47,10 ms / 50,79 ms |
| 1 500 | 43,14 ms / 76,17 ms | 46,91 ms / 52,91 ms |
| 5 000 | 58,20 ms / 67,73 ms | 34,42 ms / 46,68 ms |

Ces temps sont des mesures locales du chemin paginé des ménages, pas une mesure de Worker distant. Les lectures D1 effectives du dashboard sont exposées par `ressources_d1`; les deux captures donnent respectivement 513 et 624 lignes lues, avec 1 ms cumulé dans ce jeu d’acceptation. Ces observations ne doivent pas être extrapolées à la production ou aux quotas Cloudflare.

## 6. Captures réelles de Google Chrome

Captures plein écran produites par Playwright avec `C:\Program Files\Google\Chrome\Application\chrome.exe`, Worker et données de test locaux :

| Vue | Image |
|---|---|
| Délégué Sila, bureau 1440 px, mode sombre; seules ses statistiques de session sont présentes dans la réponse API; la carte n’affiche aucune donnée métrique. | [`carte-sila-bureau.png`](ui-map-1.2/carte-sila-bureau.png) |
| Délégué Sila, bureau, mode clair. | [`carte-sila-bureau-clair.png`](ui-map-1.2/carte-sila-bureau-clair.png) |
| Administration centrale, téléphone 390 px; sélection de la province Ouaddaï. | [`carte-centrale-mobile.png`](ui-map-1.2/carte-centrale-mobile.png) |

Les nombres visibles sur ces captures proviennent exclusivement du jeu de test synthétique de la base temporaire E2E.

## 7. Fichiers créés ou modifiés pour UI-MAP 1.2

**Modifiés :**

- [`frontend/src/App.tsx`](../frontend/src/App.tsx) — chemin opérationnel canonique et alias `/ui-preview`.
- [`frontend/src/components/administration/SIGADAppShell.tsx`](../frontend/src/components/administration/SIGADAppShell.tsx) — lien institutionnel vers le tableau de bord canonique.
- [`frontend/src/components/pilote/CarteProvincesTchad.tsx`](../frontend/src/components/pilote/CarteProvincesTchad.tsx) — avertissement expérimental et absence d’homologation explicités.
- [`frontend/src/components/pilote/TableauBordPilote.tsx`](../frontend/src/components/pilote/TableauBordPilote.tsx) — sous-titre de la carte sans qualification officielle.
- [`tests/e2e/carte-tchad.spec.ts`](../tests/e2e/carte-tchad.spec.ts) et [`tests/e2e/ui-preview.spec.ts`](../tests/e2e/ui-preview.spec.ts) — contrôle du nouveau chemin, de l’alias, du périmètre et de l’absence d’indicateurs dans le GeoJSON; captures Chrome.
- [`tests/integration/rapports-worker.test.mjs`](../tests/integration/rapports-worker.test.mjs) — assertions des réponses Sila, Ouaddaï et administration centrale.

**Créés :** ce rapport et les trois captures de Chrome dans `docs/ui-map-1.2/`.

Les autres changements déjà présents dans la branche n’ont pas été réinitialisés ni réécrits au cours de cette tâche. Aucun commit, push, déploiement ou changement distant n’a été exécuté.

## 8. Écarts restants et conditions de sortie

1. **Validation juridique des frontières :** obtenir de l’autorité tchadienne compétente une version géographique datée, son acte d’approbation, ses coordonnées/projections, son historique de modification et une table de correspondance approuvée. Jusqu’à cette validation, garder le badge expérimental.
2. **Référentiel infra-provincial :** rapprocher les 70 départements OCHA, les 124 départements de l’annuaire INSEED et les 500 communes de la Loi n°015 avec les ordonnances et décrets postérieurs. Les communes SIGAD restent en relecture.
3. **Contrat indicateurs :** approuver le statut exact qui caractérise une distribution « réalisée » et « en cours »; décider si les personnes bénéficiaires sont estimées par taille de ménage ou identifiées individuellement; décider si les validations sont rapportées par workflow ou par domaine; ventiler le stock par unité/article; clarifier le filtre transversal de localité.
4. **Données d’acceptation :** les comptes, opérations, ménages et indicateurs des captures sont temporaires et synthétiques. Ils ne constituent aucune preuve de données opérationnelles réelles.
5. **Coût distant :** aucune mesure Cloudflare distante n’a été faite; les temps et `rows_read` rapportés sont locaux.

**Verdict : UI-MAP 1.2 = PARTIAL.** L’intégration de la carte et l’isolation des agrégations passent localement. La validation juridique du tracé et l’approbation du contrat sémantique des indicateurs restent nécessaires avant toute activation statistique sur la carte.
