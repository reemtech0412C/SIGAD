# SIGAD — Rapport de traçabilité intégrée des opérations, approvisionnements et distributions

**Référence :** Chantier 05 — Programme intégral de refonte SIGAD  
**Statut :** PASS (Implémenté et vérifié localement)  
**Date :** 25 octobre 2026  
**Environnement :** Local Cloudflare Worker / D1 / SQLite  

---

## 1. Contexte et enjeux de la chaîne de traçabilité

Dans les opérations de distribution gratuite de vivres au Tchad régies par l'Arrêté n°0033/PR/PM/MASSNAH/SG/2026, la rupture de traçabilité entre les décisions budgétaires centrales (MASSNAH), les transferts de vivres (ONASA, donateurs) et les remises effectives aux ménages sur le terrain représentait un risque majeur de perte, d'avarie dissimulée ou de double comptage comptable.

Le Chantier 05 a unifié cette chaîne opérationnelle au moyen d'un modèle relationnel strict où chaque stade physique correspond à une pièce justificative et à une transaction vérifiée.

---

## 2. Distinction des neuf états de quantité

Pour éliminer toute ambiguïté comptable et statistique, SIGAD distingue formellement neuf quantités indépendantes :

```mermaid
flowchart LR
    A["1. Quantité Prévue (Plan National)"] --> B["2. Quantité Allouée (Par Province)"]
    B --> C["3. Quantité Expédiée (Bordereau Convoi)"]
    C --> D["4. Quantité Reçue Physique (Au Magasin)"]
    D --> E["5. Quantité Acceptée en Stock (PV Conforme)"]
    D --> F["6. Quantités Manquantes / Avariées (Ecart)"]
    E --> G["7. Quantité Réservée (Plan Distribution)"]
    G --> H["8. Quantité Distribuée (Émargement Réel)"]
    E --> I["9. Quantité Restante (Solde Magasin)"]
```

| N° | État de quantité | Entité / Table D1 | Règle de cohérence et de contrôle |
| :---: | :--- | :--- | :--- |
| **1** | **Quantité prévue** | `operations_centrales_distribution` | Définie dans le cadre stratégique de campagne. |
| **2** | **Quantité allouée** | `articles_approvisionnement` | Répartie par province destinataire ; ne peut excéder le disponible central. |
| **3** | **Quantité expédiée** | `lignes_expedition` | Associée à un bordereau de convoi (`expeditions`) et au lot central FEFO. |
| **4** | **Quantité reçue physique** | `lignes_reception_provinciale` | Quantité constatée contradictoirement à l'arrivée des camions. |
| **5** | **Quantité acceptée** | `lots_stock` (lot provincial créé) | Entrée officielle en stock provincial (`source_reference_id` = réception stock). |
| **6** | **Quantités écarts** | `lignes_reception_provinciale` | `quantite_manquante + quantite_endommagee = expédiée - acceptée`. Consignée en lot avarié séparé. |
| **7** | **Quantité réservée** | `articles_distribution` | Bloquée pour une distribution validée avant sa tenue sur le terrain. |
| **8** | **Quantité distribuée** | `articles_distribution` / `remises_vivres` | Constatée par émargement effectif des ménages servis. |
| **9** | **Quantité restante** | `soldes_stock` / `lots_stock` | Calculée en temps réel : `quantite_physique - quantite_distribuee`. |

---

## 3. Architecture relationnelle et non-régression historique

### 3.1. Liaison facultative et rétrocompatibilité
- **Approvisionnements :** [0031_tracabilite_operations_approvisionnements.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0031_tracabilite_operations_approvisionnements.sql) ajoute `operation_centrale_id TEXT REFERENCES operations_centrales_distribution(id)` sur `approvisionnements_centraux`.
- **Distributions :** [0026_operations_centrales_distribution.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0026_operations_centrales_distribution.sql) apporte `operation_centrale_id` et `dossier_execution_id` sur `distributions_provinciales`.
- **Rétrocompatibilité totale :** Les approvisionnements d'urgence autonomes ou les distributions provinciales directes sans opération centrale conservent `operation_centrale_id = NULL` sans aucune altération de flux.

### 3.2. Intégrité physique des stocks
Un approvisionnement ou une opération centrale ne modifie jamais directement les stocks : seul un acte physique documenté (`receptions_stock`, `expeditions`, `mouvements_stock`) opère une mutation d'inventaire. Le déclencheur SQLite `verifier_mouvement_apres_mutation_effective` bloque tout mouvement sans modification vérifiable.

---

## 4. Résultats des tests d'acceptation

Le scénario de traçabilité de bout en bout a été éprouvé dans [tracabilite-approvisionnements-0031.test.mjs](file:///C:/Users/Lenovo/Downloads/SIGAD/tests/unit/tracabilite-approvisionnements-0031.test.mjs) :

1. **Création de l'opération centrale :** `OPC-2026-TRAC-01` avec ciblage provincial Ouaddaï.
2. **Affectation d'approvisionnement :** 400 sacs de Sorgho (20 000 kg).
3. **Expédition centrale FEFO :** Sortie du lot `lot-sorg-cen-01` depuis N'Djaména.
4. **Réception physique avec avarie :** Réception de 400 sacs à Abéché : 398 sacs acceptés dans `lot-sorgho-abeche-01` et 2 sacs avariés consignés dans `lot-sorgho-abeche-endommage-01`.
5. **Distribution provinciale :** Réservation de 100 sacs, remise effective de 98 sacs à 98 ménages servis.
6. **Contrôle d'inventaire :** Solde restant exact en magasin de 300 sacs, sans aucun double comptage.

**Verdict du Chantier 05 : PASS**
