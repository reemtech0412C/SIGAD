# B3.2 — Conception: drapeaux de plateforme et approbations (D-15 à D-17)

**Statut: conception et fondations inertes (31-10-2026).** Aucune route, aucun middleware, aucune permission et aucune interface ne lit encore ces objets. Les décisions D-15/D-16/D-17 sont approuvées pour conception.

## Objets livrés

| Objet | Rôle |
|---|---|
| Migration `0045_drapeaux_et_approbations_plateforme.sql` (additive) | Tables `drapeaux_plateforme` (5 drapeaux semés, tous désactivés) et `demandes_approbation`; 4 déclencheurs de validation, 3 index. |
| `backend/src/core/approbation/politique-approbation.ts` | Module pur: classes A/B, actions interdites, autorité requise, évaluation création/approbation/exécution, empreinte SHA-256 de l’action. |
| `tests/unit/approbation-plateforme-b3-2.test.mjs` | 8 tests (politique et schéma). |

## Règles appliquées par le schéma (défense en profondeur)

* Un drapeau de catégorie AUTORISATION est toujours à double contrôle (CHECK).
* Une demande naît EN_ATTENTE, sans décideur, avec une durée de vie ≤ 24 h; l’action, la cible, l’empreinte, le motif (≥ 10 caractères) et l’expiration sont immuables.
* Transitions: EN_ATTENTE → APPROUVEE/REFUSEE/EXPIREE/ANNULEE; APPROUVEE → EXECUTEE/EXPIREE; états terminaux figés.
* Le décideur n’est ni le demandeur ni la cible (compte), est actif et possède le rôle requis.
* Une seule demande ouverte (EN_ATTENTE ou APPROUVEE) par action, cible et empreinte; l’exécution libère l’empreinte.

## Règles de la politique (code, hors schéma)

* Autorité requise par action (D-17): PROPRIETAIRE pour les opérations de plateforme, ADMIN_CENTRAL pour l’exception d’accès nominatif.
* Repli: avec moins de deux propriétaires actifs, toute opération de plateforme de classe A échoue fermé.
* MFA vérifiée dans les 15 minutes précédant l’approbation; usage unique; l’exécution exige l’empreinte exactement approuvée.
* Actions interdites à tous: modifier/supprimer le journal d’audit, retirer le dernier propriétaire.

## Reste à concevoir et construire (non fait)

1. API `plateforme:*` (demander, lister, approuver, refuser, annuler, exécuter) avec entrées au catalogue de permissions, au registre Shadow et à la matrice (aujourd’hui 229 routes).
2. Écriture dans `evenements_audit` (acteur, cible, `request_id`, motif, résultat) pour chaque transition.
3. Lecture du nombre de propriétaires actifs et de la fraîcheur MFA de session côté serveur (jamais fournis par le client).
4. Interface de la console Plateforme: demandes en attente, historique, gestion des drapeaux.
5. Procédure de création d’un second propriétaire (prérequis du repli D-17) — décision d’exploitation à confirmer.
6. Rejeu des expirations (EXPIREE) par tâche planifiée ou à la lecture.

Migration non déployée sur Staging.
