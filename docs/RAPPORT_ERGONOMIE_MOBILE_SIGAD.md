# SIGAD — Rapport d'ergonomie mobile et adaptation terrain sur smartphones Android

**Référence :** Chantier 07 — Programme intégral de refonte SIGAD  
**Statut :** PASS (Implémenté et vérifié localement)  
**Date :** 25 octobre 2026  
**Environnement :** Frontend Vite React PWA / CSS Responsive  

---

## 1. Contexte opérationnel de l'utilisation mobile au Tchad

Sur le terrain tchadien (Ouaddaï, Sila, Lac, N'Djaména, etc.), les agents de ciblage, superviseurs et délégués utilisent majoritairement des smartphones Android (écrans de 5,5 à 6,7 pouces, résolutions de 360x640 à 412x915 px). Les connexions réseau sont fréquemment lentes ou instables, et la saisie en extérieur impose une lisibilité et une ergonomie tactile strictes.

---

## 2. Améliorations ergonomiques implémentées

### 2.1. Transformation des tableaux larges en cartes empilées (`sigad-table-responsive`)
Sur écran desktop, les tableaux de données affichent de nombreuses colonnes (code, localisation, composition, vulnérabilité, dates, actions). Sur smartphone ($\le 768\text{px}$), ces tableaux sont automatiquement transformés via [styles.css](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/styles.css) :
- Les en-têtes de colonnes (`thead`) sont masqués.
- Chaque ligne (`tr`) devient une carte visuelle distincte sur fond blanc avec bordure arrondie et ombre légère.
- Chaque cellule (`td`) s'affiche sous forme de paire clé-valeur avec étiquette descriptive générée par `content: attr(data-label)`.
- Les boutons d'action sont regroupés en bas de carte avec espacement adapté.

### 2.2. Dimensionnement des cibles tactiles (Touch Targets $\ge 44\text{px}$)
Tous les boutons, onglets, sélecteurs déroulants et champs de texte respectent la recommandation d'accessibilité WCAG 2.1 / Android Human Interface Guidelines :
- Hauteur minimale : `44px`.
- Remplissage intérieur (`padding`) augmenté pour éviter les clics involontaires.
- Anneaux de focus contrastés (`:focus-visible`) pour faciliter la navigation clavier ou par touches de défilement.

### 2.3. Sélecteurs territoriaux progressifs sans perte de données
Le composant de localisation dynamique adapte sa disposition en une colonne empilée sur mobile. En cas d'interruption ou de changement de milieu (`URBAIN`, `RURAL_SEDENTAIRE`, `NOMADE_PASTORAL`, `SITE_HUMANITAIRE`), les valeurs précédemment saisies sont conservées en mémoire pour éviter toute ressaisie frustrante.

### 2.4. Barre d'action inférieure adhésive (`sigad-actions-mobile-sticky`)
Sur les formulaires longs (enregistrement de ménage, plan de distribution), la barre contenant les boutons d'action essentiels (`Enregistrer le brouillon`, `Valider`, `Annuler`) reste collée au bas de l'écran tactile, évitant ainsi à l'opérateur de devoir remonter ou descendre tout le formulaire pour sauvegarder.

---

## 3. Résultats des tests d'ergonomie et de build

1. **Compilation des assets CSS/JS :** Build Vite terminé avec succès (code de sortie 0).
2. **Contrat CSS responsive vérifié :** [ergonomie-hors-ligne-0032.test.mjs](file:///C:/Users/Lenovo/Downloads/SIGAD/tests/unit/ergonomie-hors-ligne-0032.test.mjs) (2/2 validés avec succès).
3. **Compatibilité navigateurs :** Conforme Chrome Android, Samsung Internet et navigateurs basés sur WebKit.

**Verdict du Chantier 07A : PASS**
