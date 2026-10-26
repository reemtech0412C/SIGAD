# MATRICE DES COMPOSANTS UI DE SIGAD

**Date de mise à jour :** Octobre 2026  
**Référentiel source :** `frontend/src/components/ui/`  
**Statut :** Homologué et appliqué sur l'ensemble des modules

---

## 1. TABLEAU DE CORRESPONDANCE DES COMPOSANTS (ANCIEN VS NOUVEAU)

| Composant unifié | Emplacement source | Ancien élément / classe remplacé | Rôle fonctionnel | Modules d'utilisation |
| :--- | :--- | :--- | :--- | :--- |
| **`SIGADButton`** | `components/ui/SIGADButton.tsx` | `.bouton`, `.bouton-principal`, `.bouton-primaire`, `.bouton-discret`, `.bouton-secondaire`, `.bouton-danger`, `.bouton-compact` | Actions utilisateur principales, secondaires, de danger et de navigation | AdministrationTerritoriale, GestionDonneesTest, TableauProprietaire, AdministrationComptes, MonCompte, ConnexionPage |
| **`SIGADBadge`** | `components/ui/SIGADBadge.tsx` | `.pastille-statut`, `.badge-role`, `.badge-statut`, `.badge-gravite` | Indication synthétique des statuts (ACTIF, SUSPENDU, DOUBLON, REQUIS, etc.) | AdministrationTerritoriale, GestionDonneesTest, TableauProprietaire, AdministrationComptes, MonCompte, Stocks, Bénéficiaires, Contrôle |
| **`SIGADCard`** (Header, Title, Subtitle, Body, Footer) | `components/ui/SIGADCard.tsx` | `.carte-section`, `.sigad-panel`, `.carte-espace`, conteneurs avec bordures manuelles | Conteneur de section avec élévation sobre et typographie hiérarchisée | TableauProprietaire, AdministrationComptes, MonCompte, AdministrationTerritoriale, GestionDonneesTest |
| **`SIGADTable`** | `components/ui/SIGADTable.tsx` | `.tableau-defilement > table`, `.sigad-table-wrapper > table.sigad-table` | Tableau de données dense avec en-têtes contrastés, survol subtil et chiffres tabulaires | TableauProprietaire, AdministrationComptes, AdministrationTerritoriale, GestionDonneesTest |
| **`SIGADPagination`** | `components/ui/SIGADPagination.tsx` | Fonctions `Pagination` locales répétées dans chaque composant de gestion | Pagination administrative uniforme avec bornes, compteurs et boutons accessibles | TableauProprietaire, GestionDonneesTest, TableauGestionBeneficiaires, TableauGestionStocks, TableauDistributions, TableauControle |
| **`SIGADFormField`**, **`SIGADInput`**, **`SIGADSelect`**, **`SIGADTextarea`** | `components/ui/SIGADFormField.tsx` | `.champ-territorial`, `.formulaire label`, champs non encapsulés avec astérisques manuels | Champs de saisie homogénéisés avec labels liés (`htmlFor`), astérisques obligatoires, textes d'aide et messages d'erreur | AdministrationTerritoriale, AdministrationComptes, MonCompte, ConnexionPage |
| **`SIGADTabsList`**, **`SIGADTab`** | `components/ui/SIGADTabs.tsx` | `.onglets-navigation`, `.sigad-tabs-comptes`, `.navigation-gestion`, boutons inline | Navigation par onglets institutionnelle avec indicateur inférieur et badges de compteurs | AdministrationTerritoriale, GestionDonneesTest, TableauProprietaire, AdministrationComptes, Stocks, Bénéficiaires |
| **`SIGADAlert`** | `components/ui/SIGADAlert.tsx` | `.message-erreur`, `.bandeau-erreur`, `.message-information`, `.message-succes`, `.alerte-distribution` | Bandeaux de notification critiques, informatifs ou de succès avec icônes SVG intégrées | AdministrationTerritoriale, GestionDonneesTest, TableauProprietaire, AdministrationComptes, MonCompte, ConnexionPage, Bénéficiaires |
| **`SIGADStatCard`** | `components/ui/SIGADStatCard.tsx` | Blocs KPI manuels dans l'espace propriétaire et le tableau de bord pilote | Cartes de statistiques clés avec grands chiffres formatés et libellés | AdministrationTerritoriale, GestionDonneesTest |
| **`SIGADEmptyState`** | `components/ui/SIGADEmptyState.tsx` | `.cellule-vide`, `.etat-vide`, `.sigad-etat-vide` | Remplacement des lignes vides froides par un encart avec icône sobre et explication claire | TableauProprietaire, AdministrationComptes, AdministrationTerritoriale, GestionDonneesTest |
| **`SIGADModal`** | `components/ui/SIGADModal.tsx` | Overlays fixes manuels (`div.sigad-modal-overlay`), `window.confirm` et `window.prompt` | Fenêtres modales de dialogue accessibles avec piégeage de focus, touche Échap et verrouillage du scroll | AdministrationTerritoriale (3 modales), GestionDonneesTest (4 modales) |

---

## 2. PROPRIÉTÉS ET VARIANTES DES COMPOSANTS DU DESIGN SYSTEM

```
SIGADButton
├── variant: "primary" | "secondary" | "outline" | "ghost" | "danger" | "icon"
├── size: "sm" (32px) | "md" (40px) | "lg" (48px)
└── loading: boolean (affiche spinner SVG, aria-busy=true, disabled=true)

SIGADBadge
├── variant: "success" | "warning" | "danger" | "info" | "neutral"
└── withDot: boolean (pastille avec puce ronde)

SIGADCard
├── as: "div" | "section" | "article" | "aside"
├── SIGADCardHeader (titre?, sousTitre?, actions?)
├── SIGADCardTitle (as: "h1" | "h2" | "h3" | "h4")
├── SIGADCardSubtitle
├── SIGADCardBody
└── SIGADCardFooter

SIGADTable
├── className?: string
└── children (thead, tbody, tr, th, td)

SIGADPagination
├── total: number
├── decalage: number
├── taillePage: number (défaut: 20)
├── chargement?: boolean
└── onPageChange: (nouveauDecalage: number) => void

SIGADFormField
├── label: string
├── required?: boolean
├── optionalTag?: boolean
├── hint?: string
├── error?: string
└── children (Input, Select, Textarea)

SIGADTabsList & SIGADTab
├── active: boolean
├── badge?: string | number
├── badgeCount?: number
├── disabled?: boolean
└── onClick: () => void

SIGADAlert
├── type: "info" | "success" | "warning" | "danger"
├── titre?: string
├── message: string
└── onClose?: () => void

SIGADStatCard
├── titre: string
├── valeur: string | number
├── sousTitre?: string
├── variation?: { valeur: string; positif?: boolean }
└── badge?: string

SIGADModal
├── open: boolean
├── onClose: () => void
├── titre: string
├── sousTitre?: string
├── taille?: "sm" | "md" | "lg" | "xl" | "full"
├── variante?: "defaut" | "danger"
└── footer?: ReactNode
```

---

## 3. CONFORMITÉ AUX NORMES DE GOUVERNANCE

1. **Standardisation HTML sémantique :** Élimination systématique des balises `div` cliquables non accessibles. Utilisation stricte de `<button type="button">`, `<dialog>` / `role="dialog"`, `<output>`, et `aria-labelledby`.
2. **Encapsulation CSS :** Toutes les classes sont préfixées par `sigad-` (`sigad-btn`, `sigad-badge`, `sigad-card`, `sigad-modal`, etc.) dans `design-tokens.css` pour prévenir tout conflit avec des feuilles de style tierces.
3. **Pérennité :** Les composants sont exportés via un point d'entrée unique (`frontend/src/components/ui/index.ts`), facilitant les développements futurs et garantissant la maintenabilité du socle applicatif.
