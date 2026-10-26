# SIGAD — MATRICE DES ACTIONS D'ADMINISTRATION TERRITORIALE
## Spécification d'habilitation, contrats d'interface et contrôles de sécurité

**Date :** 25 octobre 2026  
**Module :** `Administration du système → Référentiel territorial`  
**Rôle d'accès exclusif :** `PROPRIETAIRE` (en écriture et mutation)  
**Préfixe API :** `/api/proprietaire/territoire`

---

## 1. Matrice des habilitations et des endpoints API

| N° | Endpoint API | Méthode | Rôle requis | Périmètre | Fonction & Description |
| :---: | :--- | :---: | :---: | :---: | :--- |
| 1 | `/tableau-de-bord` | `GET` | `PROPRIETAIRE` | National | Dénombrement en temps réel des provinces, départements (validés / à vérifier), communes, localités, arrondissements, quartiers, carrés, anomalies. |
| 2 | `/arborescence` | `GET` | `PROPRIETAIRE` | National | Arborescence administrative complète dépliable avec gestion dérogatoire du statut spécial de N'Djaména. |
| 3 | `/recherche` | `GET` | `PROPRIETAIRE` | National | Recherche multicritère textuelle avec fil d'ariane complet et distinction des homonymes toponymiques. |
| 4 | `/unites` | `POST` | `PROPRIETAIRE` | National | Création certifiée d'une nouvelle unité territoriale avec source documentaire et référence juridique obligatoires. |
| 5 | `/unites/:id` | `PUT` | `PROPRIETAIRE` | National | Modification administrative d'une unité (nom, chef-lieu, coordonnées, découpage urbain) avec audit obligatoire. |
| 6 | `/unites/:id/simuler-rattachement` | `POST` | `PROPRIETAIRE` | National | Simulation d'impact avant changement de rattachement (calcul des ménages, bénéficiaires et distributions). |
| 7 | `/unites/:id/rattachement` | `POST` | `PROPRIETAIRE` | National | Exécution du changement de rattachement administratif (interdiction absolue de franchissement interprovincial). |
| 8 | `/fusions/simulation` | `POST` | `PROPRIETAIRE` | National | Simulation de regroupement de deux unités doublons avec détection des conflits (provinces ou types distincts). |
| 9 | `/fusions/executer` | `POST` | `PROPRIETAIRE` | National | Exécution de la fusion : réaffectation des ménages, inscription dans `correspondances_fusions_territoriales`, archivage du doublon. |
| 10 | `/unites/:id/archiver` | `POST` | `PROPRIETAIRE` | National | Bascule du statut d'une unité en `ARCHIVE` ou `REJETE` avec conservation intégrale des données historiques. |
| 11 | `/unites/:id` | `DELETE` | `PROPRIETAIRE` | National | Suppression physique sécurisée (rejet strict 409 si au moins un ménage, distribution ou entrepôt est rattaché). |
| 12 | `/unites/:id/valider` | `POST` | `PROPRIETAIRE` | National | Certification formelle (`A_VERIFIER` ➔ `VALIDE`) ou rétrogradation motivée d'une unité territoriale. |
| 13 | `/unites/valider-lot` | `POST` | `PROPRIETAIRE` | National | Validation ou rétrogradation administrative par lot d'unités territoriales après parution de textes officiels. |
| 14 | `/doublons` | `GET` | `PROPRIETAIRE` | National | Détection automatique des unités partageant une toponymie identique ou quasi-identique dans la même province. |
| 15 | `/import/previsualiser` | `POST` | `PROPRIETAIRE` | National | Prévisualisation contrôlée d'un fichier CSV : vérification des rattachements parents, détection des erreurs. |
| 16 | `/import/executer` | `POST` | `PROPRIETAIRE` | National | Importation effective des lignes valides sous le statut provisoire `A_VERIFIER` avec audit de traçabilité. |
| 17 | `/export` | `GET` | `PROPRIETAIRE` | National | Exportation exhaustive du référentiel territorial au format CSV (UTF-8) avec fil d'ariane et statuts légaux. |
| 18 | `/audits` | `GET` | `PROPRIETAIRE` | National | Consultation de l'historique immuable de toutes les mutations territoriales intervenues sur le système. |

---

## 2. Règles de sécurité et invariants d'intégrité

### 2.1 Invariant d'isolation provinciale et de non-régression
- **Interdiction de déplacement interprovincial :** Une sous-préfecture, commune ou localité ne peut en aucun cas être rattachée à un département situé hors de sa province d'origine. Tout appel violant cette règle est immédiatement rejeté avec le code HTTP 409.
- **Préservation des distributions historiques :** Lorsqu'un village ou quartier doublon est fusionné vers une unité principale, l'historique physique des distributions antérieures conserve l'identifiant originel tout en permettant la réconciliation analytique via `correspondances_fusions_territoriales`.

### 2.2 Verrouillage de suppression physique (Code HTTP 409)
La suppression physique (`DELETE /api/proprietaire/territoire/unites/:id`) effectue une vérification exhaustive préalable :
- Table `menages` : aucun ménage enregistré sur cette unité ;
- Table `distributions_provinciales` & `zones_distribution` : aucune distribution passée ou programmée ;
- Table `entrepots` & `lots_stock` : aucun magasin de vivres rattaché ;
- Tables enfants (`sous_prefectures`, `localites`, `quartiers`, `carres`) : aucune unité subordonnée active.
Si l'un de ces compteurs est supérieur à zéro, la suppression physique est bloquée et l'administrateur est invité à utiliser l'archivage ou la fusion contrôlée.

### 2.3 Traçabilité immuable (`audits_territoire`)
Toute mutation territoriale enregistre automatiquement :
- `id` : identifiant UUID unique de l'audit ;
- `action` : nature de la modification (`CREATION`, `MODIFICATION`, `MODIFICATION_RATTACHEMENT`, `FUSION`, `ARCHIVAGE`, `SUPPRESSION`, `VALIDATION`) ;
- `entite_type` et `entite_id` : cible de l'action ;
- `utilisateur_id` : compte du Propriétaire ayant ordonné la mutation ;
- `anciennes_valeurs` et `nouvelles_valeurs` : clichés JSON exhaustifs avant/après ;
- `justificatif` et `motif` : fondements légaux ou administratifs ;
- `adresse_ip` et horodatage UTC certifié.
