# Procédure de réconciliation des archives de rapports R2

## Objet

Cette procédure supprime uniquement les objets R2 du préfixe `archives/rapports/` qui n'ont aucune référence dans `rapports_generes`. Elle est réservée au compte `PROPRIETAIRE` et ne modifie pas les données métier.

## Prévention

La génération écrit d'abord l'objet R2, puis enregistre sa référence dans D1 avec le journal d'audit dans un même lot D1. Si l'enregistrement échoue, le Worker tente de supprimer l'objet. Un échec de cette suppression laisse un objet candidat à la réconciliation. Un délai de sécurité de 24 heures protège les écritures tardives et les incidents temporaires.

## Prévisualisation

1. Se connecter avec un compte `PROPRIETAIRE`.
2. Lire `GET /api/rapports/archives/reconciliation?limite=100`.
3. Pour chaque page, conserver le curseur retourné et poursuivre tant que `suite_disponible` vaut `true`.
4. Examiner les clés, tailles et dates de téléversement. Cette lecture ne supprime aucun objet.

## Suppression confirmée

1. Reprendre le curseur de la page examinée et envoyer `POST /api/rapports/archives/reconciliation` avec `{ "limite": 100, "curseur": "…", "confirmer_suppression": true }`.
2. Le Worker reliste le préfixe, réapplique le délai de 24 heures, vérifie les références D1, inscrit un événement d'audit avant l'opération, puis revérifie chaque clé dans D1 juste avant la suppression R2.
3. Examiner `supprimees`, `echec`, `suite_disponible` et l'événement d'audit de fin. Reprendre les pages suivantes séparément.
4. Pour tout échec, conserver l'objet et les journaux pour analyse; ne pas supprimer manuellement une clé qui possède une référence D1.

## Contrôles et limites

- Les listes et suppressions sont bornées à 100 objets par requête.
- Les clés sont limitées au préfixe d'archives de rapports; les autres objets R2 ne sont pas candidats.
- L'accès exige une session authentifiée, le rôle `PROPRIETAIRE` et un jeton CSRF valide pour la suppression.
- Les erreurs sont journalisées et comptabilisées; une réponse partielle ne doit pas être interprétée comme une réconciliation complète.
- En cas d'interruption après suppression R2 et avant le journal final, vérifier les objets et journaux avant de relancer la page. Une nouvelle exécution ne supprime pas les références D1.
