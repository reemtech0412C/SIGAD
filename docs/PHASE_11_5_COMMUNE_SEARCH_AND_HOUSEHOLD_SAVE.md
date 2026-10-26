# Phase 11.5 — Recherche des communes et enregistrement des ménages

Date : 23 octobre 2026 (Africa/Ndjamena)
Périmètre : environnement local et bases D1 de test isolées uniquement.

```text
COMMUNE_SEARCH: PASS
HOUSEHOLD_SAVE: BLOCKED
DEPARTMENTS_REFERENCE: PARTIAL
PROVINCIAL_ISOLATION: PASS
LOCAL_TESTS: PASS
OVERALL: PARTIAL
```

## Décision

La recherche des communes est disponible dans le sélecteur territorial existant. Elle réutilise la liste paginée renvoyée par l’API déjà protégée, limitée à la province choisie et autorisée pour la session. Aucune API, migration, règle RBAC ou donnée distante n’a été modifiée.

La création d’un ménage reste bloquée avec le référentiel actuel. Le schéma requiert un département et les contrôles d’intégrité refusent tout département, commune ou lieu qui n’est pas actif et correctement rattaché. La base locale de développement examinée ne contient pas de département vérifié ni de relation territoriale exploitable. Aucun ménage n’a été ajouté et aucune valeur géographique de remplacement n’a été inventée.

## A. Recherche des communes

Le composant `SelecteurLocalisationDynamique` propose un champ de recherche par nom français au-dessus du sélecteur natif de commune. La normalisation ignore la casse, les accents, les formes d’apostrophes et les traits d’union usuelles. Le sélecteur natif conserve la navigation clavier ; les contrôles sont associés à leurs libellés et les retours de recherche utilisent `role="status"`.

La requête existante `GET /api/territoire/communes` est filtrée avec la province sélectionnée. Un délégué ne peut pas élargir son périmètre en fournissant une province différente : le contrôle reste effectué côté Worker. La recherche locale n’est activée que lorsque la page reçue contient la totalité de la liste de cette province ; sinon, le composant laisse la pagination serveur accessible et explique que la liste complète n’est pas chargée. Pour les jeux vérifiés dans le parcours isolé, 19 communes de Sila et 20 d’Ouaddaï sont renvoyées, dans la limite de 100 éléments utilisée par le sélecteur.

Le test Chrome couvre `BIYERE` → « Biyeré », la sélection par flèches et Entrée, la conservation de la sélection lorsqu’une recherche ne trouve aucun résultat, et la recherche autorisée d’« Télégueye » par un compte central. Aucun endpoint supplémentaire n’a été nécessaire.

## B. Cause exacte du blocage d’enregistrement

### Contrat de validation et relations

- `shared/validations/beneficiaires.ts` rend `departement_id` obligatoire dans `schemaMenage`. `province_id` peut être omis pour un délégué ; le Backend le déduit de la session authentifiée. `commune_id`, `sous_prefecture_id`, `localite_id` et les niveaux inférieurs sont facultatifs dans le schéma Zod.
- `migrations/0003_partenaires_beneficiaires.sql` déclare néanmoins `menages.departement_id TEXT NOT NULL REFERENCES departements(id)`. Le ménage est donc toujours rattaché à une province et à un département ; une commune seule n’est pas un enregistrement possible.
- Les contrôles de `backend/src/routes/gestion.routes.ts` exigent que le département soit actif et appartienne à la province effective du ménage. Si une commune est fournie, elle doit être active, validée, appartenir à cette même province et posséder une ligne de `rattachements_territoriaux` vers le département fourni, valide à la date courante. Les éventuelles sous-préfecture, localité, arrondissement, quartier, carré ou site doivent également respecter les relations correspondantes.
- Les déclencheurs d’insertion et de mise à jour de `migrations/0010_integrite_partenaires_menages.sql` reforcent ces relations dans D1. Une référence invalide est rejetée avant qu’elle puisse créer un ménage incohérent.
- Le formulaire est plus strict que les champs facultatifs de l’API : `TableauGestionBeneficiaires` ne soumet pas le formulaire sans sélection d’une localité validée ou d’un site humanitaire validé. Le bouton reste désactivé tant que cette sélection n’existe pas.

### Règle métier et comportement technique

Le département est requis à la fois par le contrat d’enregistrement et par le schéma relationnel ; cette contrainte n’est donc pas un simple besoin de présentation. La commune est facultative au niveau du schéma, mais sa présence impose une relation vérifiée. Le système peut techniquement enregistrer une adresse moins détaillée seulement si le département réel est valide et si les règles de création du ménage sont satisfaites. Il ne dispose pas, dans le flux vérifié, d’un statut provisoire de ménage permettant de contourner ces contrôles en attente d’une revue administrative.

Le test utilise une base temporaire et des références synthétiques de test pour vérifier que la commune de Sila sans rattachement départemental validé ne débloque pas le formulaire. Il ne crée aucun ménage. Les données de développement inspectées pour la phase 11.4 ne comportaient aucun département ni rattachement territorial utilisable ; ajouter un département fictif ou envoyer un identifiant arbitraire ne serait pas sûr et échouerait aux contrôles D1.

**Conclusion :** le blocage constaté est cohérent avec le modèle actuel. La création ne peut reprendre qu’après l’import contrôlé de départements et de relations documentés, ou après une décision métier distincte définissant explicitement un parcours de localisation incomplète, ses validations et son effet sur l’éligibilité. Aucun assouplissement n’a été effectué.

## C. Référence des départements

La source officielle repérée est l’[Annuaire statistique national du Tchad 2024 de l’INSEED](https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024). L’édition porte la mention imprimée « décembre 2024 » et a été publiée sur le site de l’INSEED en septembre 2025. Son tableau 1 rapporte 23 provinces, 124 départements et 489 communes, en référence à l’Ordonnance n°002/PR/2024. Ces totaux statistiques ne suffisent pas à démontrer une liste administrative actuelle exhaustive, et le total de 489 communes diffère du référentiel SIGAD de 500 communes issu de la Loi organique n°015/CNT/2024. Les deux référentiels ne sont donc pas fusionnés.

Le tableau 2 de l’annuaire, section Sila, page imprimée 28 selon le repérage textuel du document, fournit les cinq départements candidats suivants. La lecture n’a pas été confirmée visuellement sur le fac-similé ; les lignes restent explicitement non activables dans [la matrice source de contrôle Sila](../sources/referentiel-territorial/departements-sila-inseed-2024.csv).

| Province | Département candidat INSEED | Communes citées par INSEED | Contrôle par rapport au référentiel communal SIGAD | Vérification | Décision |
|---|---|---:|---|---|---|
| Sila | Abdi | 3 | Noms candidats à rapprocher | Relecture du fac-similé requise | Ne pas activer |
| Sila | Adé | 4 | Noms candidats à rapprocher | Relecture du fac-similé requise | Ne pas activer |
| Sila | Kimiti | 5 | Goz-Béida/Goz-Deida, Dankikao/Bandikno et Fagatar/Fagotar à vérifier | Relecture du fac-similé et arbitrage des noms requis | Ne pas activer |
| Sila | Koukou-Angarana | 3 | Noms candidats à rapprocher | Relecture du fac-similé requise | Ne pas activer |
| Sila | Tissi | 4 | Amdoukhoum-Kalma/AmdoukhounKalma à vérifier | Relecture du fac-similé et arbitrage du nom requis | Ne pas activer |

Le tableau fournit 5 départements candidats et 19 associations commune-département citées pour Sila ; cela ne vaut pas validation indépendante des 19 liens. Quatre variantes de noms restent à résoudre. Aucun inventaire départemental national détaillé, aucune sous-préfecture et aucun canton n’ont été importés ou activés dans cette phase. La [Loi organique n°015/CNT/2024 publiée au Journal officiel](https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf) reste la référence juridique du référentiel des communes ; le présent rapport ne lui attribue pas de relations départementales qui n’y sont pas établies.

## D. Tests et résultats réels

| Vérification | Résultat | Preuve |
|---|---|---|
| `npm run typecheck` | PASS | `wrangler types` puis `tsc --noEmit -p tsconfig.json`, code de sortie 0. Wrangler a utilisé des dossiers de configuration temporaires isolés. |
| `npm run build` | PASS | Build Vite exécuté par le runner local avant les tests Worker/Chrome, code de sortie 0. |
| `npm run test:unit` | PASS | 12 fichiers et 48 tests réussis, y compris la normalisation des accents, de la casse, des apostrophes, des traits d’union et des espaces. |
| Intégration Worker/D1/R2 locale | PASS | 22 tests réussis : authentification (2), matrice API (1), stocks (1), approvisionnements (1), distributions (10), rapports/KPI (7). |
| Parcours Playwright avec Google Chrome | PASS | 2 tests réussis : recherche provinciale Sila et refus d’élargissement vers Ouaddaï ; recherche par compte central autorisé dans Ouaddaï. Aucun test ignoré dans cette exécution ciblée. |
| Matrice de sécurité | PASS | 143 routes recensées, 140 essais anonymes et 128 refus RBAC ; l’empreinte des 65 tables est restée inchangée après les requêtes interdites. |
| Vérification du schéma D1 | PASS | 22 migrations, 65 tables (62 métier et 3 MFA), 86 index, 74 déclencheurs ; contraintes et clés étrangères vérifiées sans violation. Les communes sont restées en relecture dans la base vierge ; l’activation de 19 communes Sila et 20 Ouaddaï ne concerne que la D1 temporaire dédiée au navigateur. |
| `node --check tests/integration/run-auth-worker.mjs` | PASS | Syntaxe Node valide. |
| `git diff --check` | PASS | Code de sortie 0 ; seuls des avertissements de normalisation LF/CRLF ont été émis. |

Le test de navigateur de la phase 11.4 est déclaré `skip` par défaut dans `tests/e2e/communes-phase114.spec.ts` tant que `SIGAD_PHASE114_ACTIVATION` n’est pas défini à `1`, car il exige une D1 temporaire avec activation isolée. Le runner de cette phase a fourni l’activation isolée et le filtre `commune`; les deux parcours Chrome ont alors réellement été exécutés. Aucun test n’a été rendu passant en modifiant son assertion métier.

Commande Playwright utilisée dans PowerShell, après configuration du runner pour Chrome et pour la persistance temporaire :

```powershell
$env:SIGAD_RUN_PLAYWRIGHT = '1'
$env:SIGAD_PHASE114_ACTIVATION = '1'
$env:SIGAD_PLAYWRIGHT_GREP = 'commune'
npm run test:e2e
```

Les validations de schéma, l’intégration Worker et Playwright ont utilisé des persistance D1/R2 locales temporaires. Aucun `--remote`, changement de production, déploiement Cloudflare ou Git push n’a été effectué. Les mesures et observations locales ne constituent pas une mesure de performance Cloudflare.

## E. Fichiers de cette phase

- Modifié : `frontend/src/components/territoire/SelecteurLocalisationDynamique.tsx` — recherche de communes locale et par province, état sans résultat, conservation de la sélection, aide sur les relations non validées.
- Modifié : `frontend/src/styles.css` — présentation du champ de recherche et des messages d’état dans les styles SIGAD existants.
- Créé : `frontend/src/utils/recherche-territoire.ts` — normalisation française pour la recherche.
- Créé : `tests/unit/recherche-territoire.test.mjs` — tests de normalisation.
- Modifié : `tests/e2e/communes-phase114.spec.ts` — parcours Chrome de recherche, clavier, isolation, recherche centrale et blocage sûr de l’enregistrement.
- Modifié : `tests/integration/run-auth-worker.mjs` — corrections nécessaires à l’exécution complète locale du runner d’intégration.
- Modifié : `sources/referentiel-territorial/departements-sila-inseed-2024.csv` — provenance et état de vérification des lignes candidates de Sila.
- Créé : `docs/PHASE_11_5_COMMUNE_SEARCH_AND_HOUSEHOLD_SAVE.md` — présent rapport.

## F. Réserves et suite nécessaire

1. Faire relire visuellement le tableau INSEED sur le fac-similé, puis documenter l’identité des cinq départements et les quatre variantes de communes avant toute activation.
2. Établir, à partir de sources officielles, un référentiel détaillé des départements et les relations commune-département nécessaires ; les 124 unités annoncées ne remplacent pas cette liste.
3. Ne pas activer les communes pour l’enregistrement des ménages tant que les rattachements obligatoires ne sont pas vérifiés. Si une localisation provisoire est souhaitée, obtenir d’abord une décision métier sur son statut, ses permissions, ses rapports et son effet sur les processus aval.
4. Le test d’enregistrement valide ici le refus sûr en l’absence d’une relation vérifiée ; le scénario positif avec une relation officielle n’est pas exécutable sur les données disponibles.

