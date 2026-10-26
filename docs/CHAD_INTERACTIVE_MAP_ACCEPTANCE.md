# SIGAD — UI-MAP 1.1 — Rapport d’acceptation de la carte du Tchad

- **Date de vérification locale :** 23 octobre 2026
- **Route vérifiée :** `/ui-preview`
- **Environnement :** Worker Cloudflare, D1, R2 et Chrome locaux uniquement
- **Statut UI-MAP 1.1 : PARTIAL**

```text
GEOGRAPHIC_DATA: PARTIAL — source et géométries vérifiées techniquement; validation juridique nationale en attente
PROVINCE_MATCHING: PASS — 23/23 noms SIGAD rapprochés des P-codes OCHA
INTERACTIVE_MAP: PASS — Chrome, 1440 px et 390 px
STATISTICS_INTEGRATION: PARTIAL — aucun indicateur n’est rattaché aux polygones
LOCAL_TESTS: PASS — typecheck, build, unitaires, intégration, sécurité et 11 tests Playwright
OVERALL: PARTIAL
```

La livraison technique de la carte est fonctionnelle. Le statut global reste **PARTIAL**, car les limites OCHA COD-AB sont une référence cartographique humanitaire, et leur conformité au découpage administratif juridique appliqué après la Loi organique n°015/CNT/2024 n’a pas été certifiée par une autorité nationale. Le contrôle géospatial n’active ni ne remplace le référentiel administratif SIGAD.

## Source, date et licence

La ressource utilisée est le GeoJSON ADM1 de la fiche primaire [OCHA/HDX — Chad administrative boundaries (COD-AB)](https://data.humdata.org/dataset/cod-ab-tcd), ressource `tcd_admin_boundaries.geojson.zip`, ID `575b9fe1-a995-43b8-9e12-de98d4d7d7d1`. La fiche identifie l’INSEED comme source de jeu de données et OCHA Field Information Services comme responsable de la qualité, de la configuration et de la publication.

Le téléchargement utilisé est le lien public HDX de cette ressource : [tcd_admin_boundaries.geojson.zip](https://data.humdata.org/dataset/f01c8222-b67d-41ff-954a-731aafd4466b/resource/575b9fe1-a995-43b8-9e12-de98d4d7d7d1/download/tcd_admin_boundaries.geojson.zip). Après l’échec DNS dans l’environnement isolé, l’accès a été vérifié et le fichier téléchargé dans une session Windows PowerShell ordinaire. Aucun contournement de protection, désactivation TLS ou miroir inconnu n’a été utilisé. geoBoundaries n’a pas été substitué à OCHA puisque la ressource primaire a été obtenue; Open Admin Data a seulement servi de comparaison.

- Version COD-AB : `v01`; ADM1 contient 23 provinces et ADM2 70 départements.
- `valid_on` de la ressource : 12 février 2025; validité annoncée pour l’usage humanitaire.
- Revue de complétude annoncée par HDX : 30 octobre 2025.
- Date de création et dernière modification des limites sources indiquées dans les métadonnées : 4 septembre 2012.
- Licence de la ressource : Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO). L’attribution et la licence sont affichées avec la carte.
- La fiche HDX a été mise à jour le 14 août 2026; cette date de métadonnées ne constitue pas une nouvelle date de modification des limites.

Les fichiers reçus et leur provenance sont conservés dans [`sources/referentiel-territorial/ocha-cod-ab/`](../sources/referentiel-territorial/ocha-cod-ab/). L’application embarque une copie locale du GeoJSON, sans requête de tuiles ou de données cartographiques externe à l’exécution. Sommes SHA-256 :

| Fichier | SHA-256 |
|---|---|
| `tcd_admin_boundaries.geojson.zip` | `7E31C4DACCA1966467DE3C6948F4CB11A3DD97049904FD710A66032CADE240E9` |
| `tcd_admin1.geojson` | `D583319369D7AEEA292FC3A9757E6426CBB5D94E4043918B82C3272697728E76` |
| `tcd_admin0.geojson` | `428CC9F881A182F6EF69494CFA558F20E00ED35139740F510DC0854AB23256C3` |

Le rapprochement Open Admin Data a servi uniquement de comparaison indépendante; aucune limite ni donnée OAD n’a été copiée dans l’application.

## Résultats de la validation géographique

Exécution de `node scripts/verifier-geojson-chad-adm1.mjs` :

- 23 entités ADM1 et 23 P-codes uniques `TCD01` à `TCD23`.
- 23/23 noms français normalisés correspondent individuellement aux provinces du seed SIGAD; le rapprochement contrôlable se trouve dans [`matching-cod-ab-adm1-ui-map-1.csv`](../sources/referentiel-territorial/matching-cod-ab-adm1-ui-map-1.csv).
- CRS `urn:ogc:def:crs:OGC:1.3:CRS84`, coordonnées longitude/latitude.
- 23 géométries `Polygon` valides; aucune auto-intersection, aucun croisement intérieur de provinces; toutes les coordonnées contrôlées se trouvent dans l’emprise géométrique ADM0.
- Les surfaces déclarées totalisent 1 265 079,45209754 km² pour ADM1 et 1 265 079,45209752 km² pour ADM0, soit un écart de 0,000000020 km².
- 56 paires de provinces ont été examinées pour les croisements intérieurs.
- Vérification comparative des noms et du compte : 23/23. Elle ne certifie pas l’actualité juridique du tracé.

Le vérificateur et les données sont livrés dans [`verifier-geojson-chad-adm1.mjs`](../scripts/verifier-geojson-chad-adm1.mjs), [`tcd_admin1.geojson`](../sources/referentiel-territorial/ocha-cod-ab/tcd_admin1.geojson) et [`tchad-admin1-ocha-v01.geojson`](../frontend/public/data/tchad-admin1-ocha-v01.geojson). Aucune commune des 500 en revue n’a été activée ou affichée.

## Intégration de l’interface

La carte interactive est intégrée au vrai tableau de bord `/ui-preview`, dans [`CarteProvincesTchad.tsx`](../frontend/src/components/pilote/CarteProvincesTchad.tsx), avec les identifiants et noms français dans [`provinces-tchad.ts`](../frontend/src/data/provinces-tchad.ts). Les styles sont isolés dans [`tableau-bord-pilote.css`](../frontend/src/components/pilote/tableau-bord-pilote.css); le contrôleur de sélection et de portée est [`carte-provinces-access.ts`](../frontend/src/components/pilote/carte-provinces-access.ts).

La carte permet de sélectionner et mettre en évidence une province. Le délégué provincial reste limité à sa province de session; Sila ne peut sélectionner Ouaddaï. Les limites cartographiques n’élargissent pas les permissions de l’API. La carte n’associe aucun indicateur aux polygones : le dashboard montre explicitement « Données provinciales indisponibles » pour la carte lorsque le contrat de données n’est pas assez sûr. Les compteurs éventuels des autres cartes du tableau de bord proviennent de l’API; les valeurs de l’environnement d’acceptation sont des données synthétiques locales et ne constituent pas des chiffres de production.

Le service worker met en cache le GeoJSON local. Aucune route API, règle RBAC/CSRF/MFA, migration, table D1, stock, dossier bénéficiaire, limite administrative SIGAD ou ressource distante n’a été modifié pour intégrer la carte.

## Captures Chrome réelles

Les images sont des captures plein écran de Chrome installé, produites par Playwright après authentification sur le Worker local. La base D1 d’acceptation est synthétique et temporaire.

| Contexte | Capture |
|---|---|
| Délégué Sila, bureau 1440 px, thème sombre; Ouaddaï non sélectionnable et indicateurs cartographiques indisponibles | [`carte-sila-bureau-sombre.png`](ui-map-1.1/carte-sila-bureau-sombre.png) |
| Délégué Sila, bureau, thème clair | [`carte-sila-bureau-clair.png`](ui-map-1.1/carte-sila-bureau-clair.png) |
| Administration centrale, mobile 390 px; sélection d’Ouaddaï | [`carte-centrale-mobile.png`](ui-map-1.1/carte-centrale-mobile.png) |

## Tests et résultats observés

Toutes les commandes ci-dessous ont été exécutées localement le 23 octobre 2026. Le lanceur E2E a appliqué les 21 migrations à une D1 temporaire vierge et affiché `Resource location: local`; aucun argument `--remote` n’a été utilisé.

| Commande ou contrôle | Résultat |
|---|---|
| `npm run typecheck` | **PASS**, Wrangler types et `tsc --noEmit` terminés avec le code 0. |
| `npm run build` (inclus et réussi dans `npm run test:e2e`) | **PASS**, Vite 8.3.5 et PWA; le GeoJSON est précaché. |
| `npm run test:unit` | **PASS**, 9 fichiers, 36 tests. |
| `npm run test:security-matrix` | **PASS**, matrice synchronisée avec les 140 routes API. |
| `node scripts/verifier-geojson-chad-adm1.mjs` | **PASS**, 23 provinces, correspondance et géométries validées techniquement. |
| D1 locale vierge dans le lanceur d’intégration | **PASS**, 21 migrations; 65 tables (62 métier + 3 MFA), 83 index, 68 déclencheurs, 25 comptes; aucune violation de clé étrangère; 500 communes en revue, zéro activée. |
| `npm run test:integration` (lancé dans le flux `npm run test:e2e`) | **PASS**, 21 tests d’intégration au total; matrice 140 routes avec 137 essais anonymes et 123 refus RBAC; empreinte des 65 tables inchangée après les requêtes interdites. Les scénarios de stock, approvisionnement, distribution, rapports et isolation ont réussi. |
| `npm run test:e2e` avec Chrome local | **PASS**, 11/11 tests Playwright, y compris les deux parcours de carte, le dashboard provincial, le responsive et les modules opérationnels. |
| Vérification Playwright de police | **PASS**, Chrome DevTools signale `DM Sans 9pt` comme police rendue sur le titre du dashboard. |
| `git diff --check` | **PASS**, aucun défaut d’espace; Git a seulement averti de conversions de fins de ligne LF/CRLF. |

Les mesures de performance de la liste des ménages exécutées dans le même lot local étaient : 502 lignes — médiane 49,33 ms / p95 65,16 ms; 1 500 — médiane 68,27 ms / p95 101,71 ms; 5 000 — médiane 66,05 ms / p95 75,65 ms. `EXPLAIN QUERY PLAN` a confirmé l’index composite `idx_menages_province_statut_date`. Ce sont des mesures locales synthétiques, pas des résultats Cloudflare hébergés, et elles ne mesurent pas le rendu cartographique.

## Fichiers créés ou modifiés pour UI-MAP 1.1

- Ajout des sources et métadonnées COD-AB : `sources/referentiel-territorial/ocha-cod-ab/`.
- Ajout du fichier de correspondance vérifié : `sources/referentiel-territorial/matching-cod-ab-adm1-ui-map-1.csv`.
- Ajout du validateur de géométrie : `scripts/verifier-geojson-chad-adm1.mjs`.
- Ajout des données de provinces, garde d’accès, composant carte et styles : `frontend/src/data/provinces-tchad.ts`, `frontend/src/components/pilote/carte-provinces-access.ts`, `frontend/src/components/pilote/CarteProvincesTchad.tsx`, `frontend/src/components/pilote/tableau-bord-pilote.css`.
- Intégration au dashboard réel et précache PWA : `frontend/src/components/pilote/TableauBordPilote.tsx`, `frontend/vite.config.ts`.
- Tests dédiés et parcours de navigateur : `tests/unit/carte-tchad.test.mjs`, `tests/e2e/carte-tchad.spec.ts`, ainsi que l’adaptation du test du dashboard `tests/e2e/ui-preview.spec.ts`.
- Captures Chrome archivées dans `docs/ui-map-1.1/` : `carte-sila-bureau-sombre.png`, `carte-sila-bureau-clair.png`, `carte-centrale-mobile.png`.

Des fixtures de tests opérationnels existantes ont également été ajustées pour satisfaire les quantités et unités de l’interface pendant la suite E2E; elles n’ajoutent pas de données d’application permanente.

## Réserves et décision

1. L’origine OCHA/HDX, la licence et l’intégrité technique sont vérifiées; la valeur du jeu est explicitement limitée à l’usage humanitaire indiqué par sa source.
2. La concordance juridique du tracé avec la Loi organique n°015/CNT/2024 et l’approbation du référentiel cartographique national restent à documenter par une source nationale compétente. Ne pas traiter cette livraison comme une activation du référentiel Phase 2.
3. Les statistiques provinciales de carte restent non raccordées. Leur activation nécessite un contrat qui donne les définitions métier, la disponibilité (`AUCUNE_DONNÉE` distincte de zéro) et les permissions de chaque indicateur.
4. Aucune performance Cloudflare distante, aucun déploiement, aucune migration distante et aucune donnée de bénéficiaire réelle n’ont été testés ou utilisés.

**Décision : PARTIAL.** La carte de référence est implémentée, attribuée, techniquement contrôlée, restreinte par rôle dans son interface et testée sur Chrome. L’activation juridique du référentiel et les indicateurs cartographiques nécessitent encore leur validation propre.
