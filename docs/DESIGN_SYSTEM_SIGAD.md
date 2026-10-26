# DESIGN SYSTEM SIGAD — RÉFÉRENTIEL DE CONCEPTION & COMPOSANTS UI

**Projet :** SIGAD — Système Intégré de Gestion et de Distribution des Aides  
**Version du Design System :** 1.0.0 (Institutionnelle Tchadienne)  
**Date d'homologation :** Octobre 2026  
**Localisation du code source :** `frontend/src/components/ui/`  
**Feuille de styles de référence :** `frontend/src/components/ui/design-tokens.css`

---

## 1. VISION ET IDENTITÉ INSTITUTIONNELLE

Le Design System de SIGAD matérialise l'autorité et la sobriété du service public de la République du Tchad dans le domaine de la solidarité nationale, de l'action humanitaire et de la gestion des approvisionnements d'urgence.

### Principes directeurs :
1. **Sobriété et autorité publique :** Palette axée sur le bleu institutionnel profond, le bleu ardoise et des surfaces claires épurées, rejetant tout effet ludique ou cosmétique superflu.
2. **Cohérence globale :** Chaque écran (Administration, Gestion des stocks, Bénéficiaires, Distributions, Contrôle, Espace propriétaire) partage rigoureusement les mêmes tokens de couleurs, typographie, hauteurs de contrôle, rayons de courbure et élévations.
3. **Clarté cognitive et densité équilibrée :** Typographie optimisée pour la lecture de tableaux volumineux, de métriques chiffrées et de formulaires administratifs complexes.
4. **Accessibilité et ergonomie terrain :** Respect des contrastes WCAG 2.1 AA, navigation au clavier intégrale, zones tactiles adaptées aux tablettes et terminaux mobiles lors d'opérations hors ligne.

---

## 2. TOKENS DE CONCEPTION (DESIGN TOKENS)

### 2.1 Palette de Couleurs

| Token CSS | Code Hex / RGBA | Usage fonctionnel |
| :--- | :--- | :--- |
| `--sigad-primary` | `#1e56a0` | Boutons principaux, onglets actifs, liens majeurs |
| `--sigad-primary-hover` | `#16437e` | Survol des éléments interactifs primaires |
| `--sigad-primary-dark` | `#0f3d6e` | Titres majeurs, logos institutionnels, contrastes hauts |
| `--sigad-navy-deep` | `#071526` | Fond d'en-tête souverain, menu d'administration |
| `--sigad-surface-page` | `#f8fafc` | Fond de page global (slate-50) |
| `--sigad-surface-card` | `#ffffff` | Cartes, conteneurs, modales |
| `--sigad-surface-subtle` | `#f1f5f9` | Lignes alternées, en-têtes de tableaux, encarts |
| `--sigad-border-default` | `#e2e8f0` | Séparateurs, bordures de cartes et tableaux |
| `--sigad-border-subtle` | `#edf2f7` | Lignes intérieures légères |
| `--sigad-text-primary` | `#0f172a` | Textes principaux, labels, chiffres de KPI |
| `--sigad-text-secondary` | `#475569` | Sous-titres, aides de saisie, métadonnées |
| `--sigad-text-muted` | `#64748b` | Éléments désactivés, filtres inactifs |
| `--sigad-success` | `#15803d` | Statuts validés, réceptions complètes, pastilles vertes |
| `--sigad-warning` | `#b45309` | Actions en attente, alertes FEFO, contrôles requis |
| `--sigad-danger` | `#b91c1c` | Erreurs, suspensions, purges, rejets |
| `--sigad-info` | `#0284c7` | Informations contextuelles, référentiel territorial |

### 2.2 Typographie

- **Famille principale :** `"Plus Jakarta Sans", "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Chiffres tabulaires :** `"font-variant-numeric: tabular-nums"` imposé sur toutes les données numériques, codes de référence, dates et volumes pour un alignement vertical parfait.
- **Échelle typographique :**
  - Titre souverain H1 : `1.75rem (28px)` / `line-height: 1.25` / `font-weight: 700`
  - Titre de section H2 : `1.25rem (20px)` / `line-height: 1.35` / `font-weight: 600`
  - Sous-titre / En-tête H3 : `1rem (16px)` / `font-weight: 600`
  - Corps de texte standard : `0.875rem (14px)` / `line-height: 1.5` / `font-weight: 400`
  - Métadonnées & badges : `0.75rem (12px)` / `font-weight: 500-600`

### 2.3 Rayons de courbure et Ombres

- **Rayons de courbure (Border Radius) :**
  - `--sigad-radius-sm: 4px` (pastilles de statut, petits badges)
  - `--sigad-radius-md: 6px` (champs de saisie, boutons, alertes)
  - `--sigad-radius-lg: 8px` (cartes, conteneurs, tableaux)
  - `--sigad-radius-xl: 12px` (modales de confirmation, tiroirs latéraux)
  - `--sigad-radius-full: 9999px` (indicateurs ronds, pastilles pill)
- **Élévations & Ombres :**
  - `--sigad-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`
  - `--sigad-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)`
  - `--sigad-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)`
  - `--sigad-shadow-modal: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)`

### 2.4 Hauteurs de Contrôle Standardisées

- **Compact / Dense (sm) :** `32px` (actions de ligne dans les tableaux, filtres secondaires)
- **Standard (md) :** `40px` (boutons de formulaire standard, sélecteurs, inputs)
- **Large / Éminent (lg) :** `48px` (boutons d'authentification, validation d'opérations majeures)

---

## 3. CATALOGUE DES COMPOSANTS RÉUTILISABLES (`frontend/src/components/ui/`)

### 3.1 `SIGADButton`
Composant bouton polyvalent doté de retours d'état accessibles.
- **Variantes :** `primary`, `secondary`, `outline`, `ghost`, `danger`, `icon`
- **Tailles :** `sm`, `md`, `lg`
- **Gestion du chargement :** Spinner SVG intégré avec `aria-busy="true"` et désactivation automatique.

### 3.2 `SIGADBadge`
Pastille de statut institutionnelle pour marquer l'état d'un compte, d'un lot, d'un ménage ou d'une unité territoriale.
- **Variantes :** `success`, `warning`, `danger`, `info`, `neutral`
- **Option `withDot` :** Puce circulaire pulsante ou statique indiquant l'état en direct.

### 3.3 `SIGADCard`
Conteneur structuré composé des sous-éléments :
- `SIGADCardHeader` : Bandeau supérieur avec titre et actions optionnelles.
- `SIGADCardTitle` / `SIGADCardSubtitle` : En-tête hiérarchisé.
- `SIGADCardBody` : Corps principal avec marge intérieure homogène.
- `SIGADCardFooter` : Pied de carte pour boutons de validation ou totaux.

### 3.4 `SIGADTable`
Enveloppe responsive garantissant le défilement horizontal sans rupture de mise en page. En-têtes figés, survol subtil de ligne (`tr:hover`), typographie alignée et prise en charge des cellules numériques avec alignement à droite.

### 3.5 `SIGADPagination`
Contrôle de pagination unifié remplaçant les implémentations disparates :
- Affichage du numéro de page courante et total (`Page X sur Y · N éléments`).
- Boutons Précédente / Suivante avec états désactivés aux bornes et `aria-label` contextuel.

### 3.6 `SIGADFormField`, `SIGADInput`, `SIGADSelect`, `SIGADTextarea`
Composants de formulaire assurant la cohérence des libellés, des mentions obligatoires (`*`), des balises facultatives, des textes d'aide (`hint`) et des messages d'erreur associés par identifiant d'accessibilité.

### 3.7 `SIGADTabsList` et `SIGADTab`
Barre d'onglets horizontale institutionnelle avec indicateur actif inférieur bleu officiel, gestion des compteurs numériques et accessibilité au clavier (`role="tablist"` / `role="tab"`).

### 3.8 `SIGADAlert`
Bandeau d'information, d'avertissement ou d'erreur critique avec icône SVG vectorielle dédiée et attribut `role="alert"` ou `role="status"`.

### 3.9 `SIGADStatCard`
Carte métrique KPI pour tableaux de bord, affichant un grand chiffre formatté, une unité, une variation et un sous-titre explicatif.

### 3.10 `SIGADEmptyState`
Composant d'état vide épuré pour éviter les tableaux froids : icône thématique discrète, titre sobre et explication administrative claire.

### 3.11 `SIGADModal`
Fenêtre modale accessible conforme aux normes WAI-ARIA :
- Piégeage automatique du focus clavier à l'intérieur de la modale.
- Écoute de la touche `Escape` pour fermeture.
- Verrouillage du défilement de l'arrière-plan (`overflow: hidden`).
- Tailles paramétrables : `sm`, `md`, `lg`, `xl`, `full`.
- Variante d'avertissement / danger pour confirmations destructives.

---

## 4. RÈGLES D'ACCESSIBILITÉ & RESPONSIVE

1. **Focus visible :** Tout contrôle interactif affiche un anneau d'accentuation net `0 0 0 3px rgba(30, 86, 160, 0.25)` sans décalage de layout.
2. **Contraste textuel :** Ratio minimal de 4.5:1 garanti entre la couleur de texte et le fond.
3. **Comportement Mobile (375x667) :**
   - Transformation fluide des grilles à 2 ou 4 colonnes en flux vertical à 1 colonne.
   - Les tableaux conservent leur lisibilité grâce au défilement horizontal encadré.
   - Navigation mobile optimisée avec menu déroulant accessible au pouce.
