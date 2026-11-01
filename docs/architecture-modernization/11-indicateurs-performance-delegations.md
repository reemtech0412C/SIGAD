# B3.3 — Indicateurs « Performance des délégations » (définitions)

**Statut: définitions écrites et calcul testé sur jeu synthétique (31-10-2026).** Les indicateurs sont des agrégats par province calculés sur les données existantes; ils n’exposent aucune donnée nominative et ne modifient aucune donnée provinciale.

## Périmètre calculable aujourd’hui

Population: distributions provinciales **hors `BROUILLON`**, regroupées par `province_id`. Date de référence: jour du calcul (UTC).

| Code | Définition | Numérateur / dénominateur | Cas limite |
|---|---|---|---|
| `avancement_distributions` | Part des distributions terminées | `TERMINEE_PROVINCE` + `CLOTUREE_CENTRAL` / distributions hors brouillon | Dénominateur 0 ⇒ `null` (jamais 0 %) |
| `couverture_service` | Part des ménages assignés effectivement servis | ménages `SERVI` / ménages assignés (toutes distributions hors brouillon) | Aucun ménage assigné ⇒ `null`; `PARTIELLEMENT_SERVI` compté à part (`menages_partiels`) |
| `distributions_en_retard` | Distributions non terminées dont `date_prevue` est dépassée | nombre et taux sur les distributions hors brouillon | Statuts terminaux exclus; `RETOURNEE_POUR_CORRECTION` compte comme non terminée |
| `ponctualite_mediane_jours` | Écart médian entre `date_declaration_fin` et `date_prevue` | médiane des écarts en jours (négatif = en avance) | Distributions sans déclaration de fin ignorées; aucune ⇒ `null` |

Les deux rangs de lecture: par province (comparaison inter-provinciale, tri stable par taux d’avancement décroissant puis nom) et une ligne nationale.

## Non calculable avant la Phase 4 (documenté, non simulé)

Délais de validation et taux de rejet des ménages, activité de collecte: ces données (`collectes_menages` et états de vérification) n’existent pas encore. Aucune valeur n’est inventée; ils sont signalés « à venir ».

## Garde-fous

* Lecture seule, réservée à ADMIN_CENTRAL; aucune édition en masse.
* Agrégats uniquement (pas d’identifiant de ménage, de compte ou de distribution dans la réponse).
* Les contrats KPI de la carte (`ui-map-kpi-contract.test.mjs`) restent inchangés.
* Budget de performance: requête agrégée unique par table, mesurée en B6.4.
