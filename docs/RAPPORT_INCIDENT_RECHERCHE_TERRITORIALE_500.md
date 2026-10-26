# SIGAD — RAPPORT D'INCIDENT ET DE CORRECTION : HTTP 500 RECHERCHE TERRITORIALE

**Date d'intervention :** 25 octobre 2026  
**Environnement :** Cloudflare Staging (`https://sigad-staging.reemtech0412.workers.dev`)  
**Base de données :** Cloudflare D1 `sigad-staging-db` (`a54e1ea9-c49a-4729-ad06-a40ceb421127`)  
**Statut final :** **RÉSOLU ET VÉRIFIÉ EN PRODUCTION STAGING (0 ERREUR 500 RESTANTE)**  

---

## 1. Description de l'incident

Suite au déploiement des migrations `0028` à `0034` et de la refonte du référentiel territorial dans le compte Propriétaire, l'endpoint suivant présentait des erreurs systématiques `HTTP 500 Internal Server Error` :

`GET /api/proprietaire/territoire/recherche`

### Requêtes en échec constatées
1. `GET /api/proprietaire/territoire/recherche?limite=50`
2. `GET /api/proprietaire/territoire/recherche?recherche=%D8%B3&limite=50` (caractère Unicode arabe "س")
3. `GET /api/proprietaire/territoire/recherche?recherche=k&limite=50`
4. `GET /api/proprietaire/territoire/recherche?recherche=ker&limite=50`

Le symptôme survenait quel que soit le texte de recherche (vide, latin, arabe) dès lors que le filtre `type` était omis.

---

## 2. Diagnostic contradictoire et cause racine

### Reproduction en ligne et capture des logs Cloudflare Worker
L'incident a été reproduit immédiatement via une session de test autorisée Propriétaire (`usr-proprietaire`) sur le Worker Staging en ligne. La surveillance temps-réel via `wrangler tail` a capturé l'exception exacte générée au niveau du moteur SQL D1 :

```json
{
  "action": "erreur_administration_territoriale",
  "chemin": "/api/proprietaire/territoire/recherche",
  "message": "D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR"
}
```

### Analyse technique approfondie
1. **Règle moteur SQLite / Cloudflare D1 :** Dans l'implémentation SQLite embarquée par Cloudflare D1, la directive de compilation `SQLITE_LIMIT_COMPOUND_SELECT` est configurée à **5** termes maximum par requête composée (`UNION`, `UNION ALL`, `INTERSECT`, `EXCEPT`).
2. **Mécanisme du service `administration-territoriale.service.ts` :**
   - Lorsque le paramètre `type` n'était pas précisé, la fonction `rechercherUnitesTerritoriales` construisait 10 requêtes `SELECT` représentant l'intégralité des 14 échelons territoriaux nationaux (Provinces, Départements, Sous-préfectures, Communes, Cantons, Localités/Villes/Villages/Ferricks/Campements, Arrondissements, Quartiers, Carrés/Blocs/Secteurs, Sites humanitaires).
   - Ces 10 requêtes étaient jointes à plat via un unique `UNION ALL` :
     ```sql
     SELECT * FROM (q1 UNION ALL q2 UNION ALL ... UNION ALL q10) ORDER BY nom, id LIMIT ? OFFSET ?
     ```
   - Nombre de termes du SELECT composé : **10**, dépassant la limite D1 de 5.
   - En environnement local avec `node:sqlite` / SQLite par défaut (dont la limite est 500), la requête réussissait, ce qui explique pourquoi le problème n'apparaissait que sur l'environnement Cloudflare D1 distant.

---

## 3. Solution mise en œuvre

### Architecture de la correction
Aucune modification de base de données ni migration D1 n'était requise : la structure des données et l'intégrité des 14 types d'unités sont strictement préservées.

Dans [administration-territoriale.service.ts](file:///c:/Users/Lenovo/Downloads/SIGAD/backend/src/services/administration-territoriale.service.ts#L230-L253), une fonction récursive de composition hiérarchique `construireSqlUnion` a été introduite :

```typescript
/**
 * Construit une clause UNION ALL hiérarchique évitant la limite Cloudflare D1
 * (SQLITE_LIMIT_COMPOUND_SELECT = 5 termes max par SELECT composé).
 */
function construireSqlUnion(requetes: string[], tailleChunk = 4): string {
  if (requetes.length === 0) return "";
  if (requetes.length <= tailleChunk) {
    return requetes.join(" UNION ALL ");
  }
  const chunks: string[] = [];
  for (let i = 0; i < requetes.length; i += tailleChunk) {
    const groupe = requetes.slice(i, i + tailleChunk);
    if (groupe.length === 1) {
      chunks.push(groupe[0]);
    } else {
      chunks.push(`SELECT * FROM (${groupe.join(" UNION ALL ")})`);
    }
  }
  if (chunks.length > tailleChunk) {
    return construireSqlUnion(chunks, tailleChunk);
  }
  return chunks.join(" UNION ALL ");
}
```

### Avantages de la solution :
- **Respect strict de la limite D1 :** Chaque sous-requête contient au maximum 4 termes (`tailleChunk = 4 < 5`).
- **Niveau supérieur maîtrisé :** Pour 10 requêtes initiales, 3 sous-groupes sont formés (`SELECT * FROM (Chunk1 UNION ALL Chunk2 UNION ALL Chunk3)`), soit 3 termes au niveau supérieur (`3 < 5`).
- **Ordre préservé des bindings :** L'ordre séquentiel d'évaluation des placeholders `?` est rigoureusement identique de gauche à droite.
- **Support Unicode et Arabe :** Le filtrage insensible à la casse et la recherche de sous-chaînes en alphabet arabe ou latin s'exécutent fidèlement sans masque ni troncature.
- **Préservation intégrale des 14 catégories territoriales :** Aucune catégorie n'est retirée ou masquée.

---

## 4. Validation des tests automatisés

### Suite de tests ciblée : `tests/unit/recherche-territoire-500.test.mjs`
14 cas de test automatisés couvrant les 4 requêtes d'incident et les 10 scénarios de non-régression :
- `TC-01` : Recherche globale par défaut (`?limite=50`) -> **Succès (50 éléments retournés, total 665)**
- `TC-02` : Recherche Unicode Arabe (`?recherche=س&limite=50`) -> **Succès (0 élément sans erreur)**
- `TC-03` : Recherche textuelle courte (`?recherche=k&limite=50`) -> **Succès (164 éléments trouvés)**
- `TC-04` : Recherche textuelle partielle (`?recherche=ker&limite=50`) -> **Succès (2 communes : Kera, Kerfi)**
- `TC-05` : Recherche vide pagination (`?limite=20`) -> **Succès**
- `TC-06` : Recherche mixte français / majuscules (`NdJamEna`) -> **Succès**
- `TC-07` : Filtre par province (`?province_id=prov-ndjamena`) -> **Succès**
- `TC-08` : Filtre par type DEPARTEMENT (`?type=DEPARTEMENT`) -> **Succès (112 départements)**
- `TC-09` : Filtre par type COMMUNE (`?type=COMMUNE`) -> **Succès (500 communes)**
- `TC-10` : Pagination décalage (`LIMIT 5 OFFSET 5`) -> **Succès**
- `TC-11` : Recherche sans résultat (`XYZ_ENTITE_INEXISTANTE`) -> **Succès (0 résultat propre)**
- `TC-12` : Filtre combiné type et recherche (`DEPARTEMENT + barh`) -> **Succès**
- `TC-13` : Préservation des 14 catégories territoriales -> **Succès**
- `TC-14` : Fil d'Ariane cohérent sur chaque résultat -> **Succès**

**Résultat Vitest :** 14/14 tests passés en 96 ms.

### Non-régression globale du projet
- **Tests unitaires complets :** 27 fichiers de test, **121/121 tests passés avec succès**.
- **Banc d'essai administration territoriale et gouvernance :** **33/33 tests passés avec succès** ([tester-administration-territoriale-et-gouvernance.mjs](file:///c:/Users/Lenovo/Downloads/SIGAD/scripts/tester-administration-territoriale-et-gouvernance.mjs)).

---

## 5. Déploiement Staging

Le correctif a été compilé et publié sur Cloudflare Staging sans aucune modification de données ni migration D1 :

```
wrangler deploy --config wrangler.staging.toml
Uploaded sigad-staging (13.78 sec)
Deployed sigad-staging triggers (1.94 sec)
https://sigad-staging.reemtech0412.workers.dev
Current Version ID: 77d3537f-5d46-4841-addb-5e098cd438b3
```

---

## 6. Recette en ligne contradictoire sur Cloudflare Staging

La vérification a été exécutée directement contre `https://sigad-staging.reemtech0412.workers.dev` via [recette-incident-recherche-500.mjs](file:///c:/Users/Lenovo/Downloads/SIGAD/scripts/recette-incident-recherche-500.mjs) :

### 1. Contrôle des 4 requêtes de l'incident
| Requête HTTP | Statut avant | Statut après | Données reçues |
|---|---|---|---|
| `GET /api/proprietaire/territoire/recherche?limite=50` | 500 Error | **200 OK** | 50 éléments, total 665 unités |
| `GET /api/proprietaire/territoire/recherche?recherche=%D8%B3&limite=50` | 500 Error | **200 OK** | 0 élément, tableau valide |
| `GET /api/proprietaire/territoire/recherche?recherche=k&limite=50` | 500 Error | **200 OK** | 50 éléments (Abkar-Djombo...), total 164 |
| `GET /api/proprietaire/territoire/recherche?recherche=ker&limite=50` | 500 Error | **200 OK** | 2 communes (Kera, Kerfi) |

### 2. Contrôle des 10 scénarios de non-régression
- **NR-01 :** Recherche vide 20 items -> **200 OK**
- **NR-02 :** Recherche textuelle "ndjamena" -> **200 OK**
- **NR-03 :** Filtre province `prov-ndjamena` -> **200 OK** (tous les items rattachés à N'Djaména)
- **NR-04 :** Filtre type `DEPARTEMENT` -> **200 OK** (exactement 112 départements retournés)
- **NR-05 :** Filtre type `COMMUNE` -> **200 OK** (exactement 500 communes recensées)
- **NR-06 :** Pagination décalage (`limite=10&decalage=10`) -> **200 OK**
- **NR-07 :** Recherche sans résultat (`XYZ99INEXISTANT`) -> **200 OK** (`total: 0, elements: []`)
- **NR-08 :** Filtre combiné type et recherche (`DEPARTEMENT + barh`) -> **200 OK**
- **NR-09 :** Tableau de bord territorial en direct -> **200 OK** (23 provinces, 112 départements, 80 certifiés / 32 candidats)
- **NR-10 :** Sécurité RBAC -> Session `usr-batha` (Délégué Provincial) se voit refuser l'accès avec un **HTTP 403 Forbidden** strict.

### 3. Contrôle de l'intégrité de la base de données D1 distante
- **Départements D1 :** 112 départements présents, **112 actifs**, **112 valides** (80 certifiés / 32 candidats).
- **Migrations D1 :** 34 migrations appliquées (`0001` à `0034`).
- **Comptes utilisateurs D1 :** 25 comptes configurés et opérationnels.
- **Opérations centrales :** Opération nationale `OPC-2026-B839B0` en statut `SOUMISE_A_APPROBATION` intacte.

### 4. Recette Navigateur (Playwright Chromium)
Exécution complète sur [recette-navigateur-administration-territoriale.mjs](file:///c:/Users/Lenovo/Downloads/SIGAD/scripts/recette-navigateur-administration-territoriale.mjs) :
- Montage sans erreur du composant `AdministrationTerritoriale` dans l'espace Propriétaire.
- Métriques territoriales chargées (112 départements, 500 communes, 23 provinces).
- Arborescence hiérarchique dynamique fonctionnelle.
- Recherche multi-critères interactive opérationnelle en temps réel (Desktop 1280x800 et Mobile 375x667).
- **Verdict : SUCCÈS COMPLET.**

---

## 7. Conclusion

L'incident HTTP 500 sur la recherche territoriale est **entièrement résolu**. L'application Cloudflare Staging est 100 % opérationnelle, l'interface du Propriétaire est pleinement navigable et conforme aux directives, sans aucun impact sur les données ni régression fonctionnelle.
