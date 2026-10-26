# SIGAD — Feuille de route de refonte UI/UX

**Statut :** plan proposé, en attente de validation.<br>
**Dernière mise à jour :** 22 octobre 2026.<br>
**Limite de cette mission :** seule l’étape A est documentée ici. Le code d’interface n’a pas été modifié.

## Principes d’exécution

- Réutiliser le Worker, les API et les modèles de données existants; ne pas déplacer les règles métier dans React.
- Conserver React, TypeScript, Vite et les composants d’opération SIGAD.
- Avancer par petit module, derrière une possibilité de retour à l’ancienne présentation.
- Garder les migrations D1, les permissions et les flux métier hors de la refonte de présentation.
- Ne pas présenter des exemples ou l’absence de données comme des indicateurs réels.
- Ne pas activer les communes `PROPOSE` et ne pas considérer la clôture de Phase 9 comme une approbation du référentiel de Phase 2.
- Maintenir tous les textes visibles en français tant que la règle linguistique antérieure n’est pas explicitement modifiée. Le support arabe/RTL du document de conception est un point à arbitrer avant son implémentation.

## Étapes

| Étape | Portée | Critères de sortie | Retour arrière |
| --- | --- | --- | --- |
| **A — Audit et conception** | Audit de React/Vite/CSS, routes API, permissions, indicateurs, polices, cartographie et risques; quatre documents de conception | Les écarts sont reliés à des fichiers ou sources réelles; chaque KPI a une définition; la carte a une porte de validation; décision Tabler documentée | Aucune modification de code à annuler; retirer/corriger les documents de conception. Cette étape est livrée par la présente mission. |
| **B — Système de design** | Tokens, polices locales, icônes, shell commun, navigation responsive, composants primitifs et bac à sable visuel | Diff de dépendances justifié; licences incluses; pas de régression de build/typecheck; tests clavier, contraste et responsivité; parcours métier inchangés | Revenir au commit de l’étape B; retirer l’import de thème et réactiver les styles précédents. Les composants métier n’étant pas modifiés par petits lots, le retour reste ciblé. |
| **C — Tableau de bord pilote** | Premier écran central ou provincial; agrégats existants; graphiques seulement pour les données clairement définies; carte après approbation géographique | Chaque carte KPI pointe vers une API/champ réel; isolation vérifiée au Worker; « aucune donnée » distincte de zéro; map source/version/licence vérifiées; aucune donnée personnelle | Désactiver l’accès au nouveau module par configuration UI ou rétablir l’ancien composant dashboard; aucune écriture D1 liée à l’apparence. |
| **D — Tests d’acceptation** | Parcours UX, responsive, langue/direction validées, RBAC/isolation, accessibilité et performance | Playwright en navigateur réel; cas par rôle; vues mobile et bureau; exports et opérations fonctionnelles inchangés; assertions API/données sans fuite; seuils de performance approuvés | Bloquer la généralisation; rétablir le tableau précédent ou corriger le composant ciblé. Ne pas contourner une assertion de sécurité. |
| **E — Généralisation** | Modules de comptes, bénéficiaires, stocks, approvisionnements, distributions, contrôle et rapports migrés par lots | Chaque module satisfait la même liste d’acceptation que le pilote; revue visuelle et de sécurité; suivi d’erreurs fonctionnel | Revenir module par module au composant visuel antérieur; les API et contrats de données restent inchangés. |

## Séquence proposée pour les premiers lots

1. **Bac à sable de thème :** tester Tabler CSS avec Tailwind 4, tokens SIGAD et le logotype fourni sur fond clair. Ne pas intégrer d’interaction métier.
2. **Shell :** consolider l’en-tête et la navigation dans `AppShell`, contrôler les menus selon le rôle, ajouter repli desktop et navigation mobile accessible.
3. **Primitives :** boutons, champs, badges, alertes, panneaux, tableaux, pagination et états vides/erreur.
4. **Connexion :** appliquer le style en conservant connexion, MFA/TOTP, changement de mot de passe, CSRF et session.
5. **Dashboard pilote :** utiliser `GET /api/rapports/tableau-de-bord`; préciser les unités, période et définitions; ne pas mettre en production une carte avant la porte cartographique.
6. **Modules métier :** remplacer le style progressivement en conservant les composants de service et les appels API actuels.

## Portes d’acceptation transversales

### Fonction et sécurité

- Connexion, MFA, déconnexion, expiration de session, changement obligatoire du mot de passe et CSRF restent fonctionnels.
- Les menus visuels ne confèrent aucun droit; les appels refusés ne changent pas les données.
- Cas de lecture directe par identifiant entre Sila et Ouaddaï sur pages, rapports, archives et pièces jointes.
- Les flux FEFO, réservation, remise, retour pour correction et clôture centrale ne changent pas.
- Les tables chargent leurs pages côté serveur; les requêtes agrégées ne reçoivent pas un `LIMIT` arbitraire qui change les totaux.

### UX et accessibilité

- Parcours clavier et lecteur d’écran; focus visible; libellés et erreurs associés; contraste vérifié.
- Résolutions de test : 320, 390, 768, 1 024 et 1 440 px.
- Écrans de chargement, absence de données, résultat vide et erreur distincts.
- Mouvement réduit respecté; contenu lisible au zoom du navigateur.
- Test français obligatoire. Test arabe et RTL seulement après arbitrage formel de la règle linguistique.

### Tableau de bord et carte

- Résultat du dashboard lié à une période précise et à un périmètre issu de la session.
- Ménages distincts séparés des occurrences de service; personnes uniques du ménage estimées séparées des cumuls répétés.
- Quantités regroupées par article et unité lorsque leur somme hétérogène serait trompeuse.
- Statut de données explicite pour chaque province; aucune commune proposée dans les choix.
- Manifeste de GeoJSON, licence, attribution et correspondance des 23 codes acceptés avant chargement cartographique.

## Risques et contrôles

| Risque | Contrôle prévu |
| --- | --- |
| Préflight Tabler remplace les champs et tables actuels | Prévisualisation locale isolée; ordre d’import documenté; capture de comparaison. |
| Menu nouvellement partagé masque un module ou l’expose au mauvais rôle | Menus guidés par rôle et tests d’API existants; le serveur demeure l’autorité. |
| KPI trompeur par double comptage ou unités mélangées | Contrat KPI, calcul d’agrégat testé contre les tables et libellés explicites. |
| Carte périmée ou correspondance de province erronée | Source/version/licence revues, P-codes rapprochés à la main; publication bloquée en cas de conflit. |
| Fuite d’information provinciale dans les filtres | Tests Sila/Ouaddaï côté Worker, endpoint et téléchargement; aucun filtre client comme contrôle. |
| Baisse mobile, surcharge d’actifs ou appels externes | Chargement différé, pas de CDN de polices ou de carte, mesure des bundles et navigation avec réseau lent. |
| Rupture des opérations métier pendant remplacement visuel | Migration écran par écran, tests de parcours end-to-end, rollback indépendant. |
| Régression de langue/direction | Validation écrite de la portée linguistique; tests RTL seulement une fois autorisés. |

## Résultat de la mission actuelle

Les étapes **A — Audit et conception** sont livrées dans :

- `docs/UI_REDESIGN_AUDIT.md`
- `docs/UI_DESIGN_SYSTEM_PROPOSAL.md`
- `docs/CHAD_MAP_FEASIBILITY.md`
- `docs/UI_REDESIGN_ROADMAP.md`

Les contrôles ont consisté en lecture statique des sources et des tests existants. `typecheck`, `build`, les tests unitaires, d’intégration, Playwright et les requêtes Cloudflare n’ont pas été exécutés dans cette mission de documentation. Le statut signifie que l’audit est terminé; il ne certifie ni la refonte, ni la carte, ni une validation visuelle. Étape B à commencer après validation du plan et arbitrage de la langue.

