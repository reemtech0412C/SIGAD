/**
 * SIGAD — Configuration centralisée et typée de la navigation hiérarchique
 * Inspirée de l'architecture sidebar-data de satnaing/shadcn-admin (MIT License).
 * Filtre dynamiquement les groupes et sous-menus selon les permissions RBAC réelles.
 */
import type { RoleUtilisateur } from "../../../../shared/constantes/roles";
import type { NomIconeSIGAD } from "../ui/SIGADIcon";

export type ModuleAdministration =
  | "dashboard"
  | "operations"
  | "beneficiaires"
  | "stocks"
  | "approvisionnements"
  | "distributions"
  | "territoire"
  | "controle"
  | "rapports"
  | "comptes"
  | "mon-compte";

export type VueControleAdministration =
  | "tableau"
  | "observations"
  | "corrections"
  | "fermetures"
  | "audit"
  | "notifications";

export interface SousMenuNavigation {
  id: string;
  libelle: string;
  icone: NomIconeSIGAD;
  module: ModuleAdministration;
  chemin: string;
  badge?: string;
  rolesAutorises: readonly RoleUtilisateur[];
}

export interface GroupeMenuNavigation {
  id:
    | "tableau-de-bord"
    | "operations-aide"
    | "beneficiaires"
    | "territoire"
    | "suivi-controle"
    | "administration"
    | "mon-espace";
  codeSection: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  libelle: string;
  icone: NomIconeSIGAD;
  sousMenus: SousMenuNavigation[];
}

const TOUS_LES_ROLES: readonly RoleUtilisateur[] = [
  "PROPRIETAIRE",
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
  "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN",
  "AGENT_DISTRIBUTION",
  "CONSULTATION_INSTITUTIONNELLE",
];

const ROLES_OPERATIONNELS: readonly RoleUtilisateur[] = [
  "PROPRIETAIRE",
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
  "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN",
  "AGENT_DISTRIBUTION",
];

const ROLES_BENEFICIAIRES: readonly RoleUtilisateur[] = [
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
  "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN",
  "AGENT_DISTRIBUTION",
];

export function construireNavigationParRole(role: RoleUtilisateur): GroupeMenuNavigation[] {
  const vueControleDefaut: VueControleAdministration =
    role === "ADMIN_CENTRAL"
      ? "tableau"
      : role === "DELEGUE_PROVINCIAL"
        ? "observations"
        : "audit";

  const groupesBruts: GroupeMenuNavigation[] = [
    {
      id: "tableau-de-bord",
      codeSection: "A",
      libelle: "Tableau de bord",
      icone: "layout-dashboard",
      sousMenus: [
        {
          id: "dashboard-ensemble",
          libelle: "Vue d’ensemble",
          icone: "layout-dashboard",
          module: "dashboard",
          chemin: "/tableau-de-bord",
          rolesAutorises: TOUS_LES_ROLES,
        },
        {
          id: "dashboard-indicateurs",
          libelle: "Indicateurs existants",
          icone: "bar-chart-3",
          module: "dashboard",
          chemin: "/tableau-de-bord?vue=indicateurs",
          badge: "23 prov.",
          rolesAutorises: TOUS_LES_ROLES,
        },
      ],
    },
    {
      id: "operations-aide",
      codeSection: "B",
      libelle: "Opérations & aide",
      icone: "briefcase",
      sousMenus: [
        {
          id: "ops-centrales",
          libelle: "Opérations centrales",
          icone: "layers",
          module: "operations",
          chemin: "/operations-centrales",
          rolesAutorises: TOUS_LES_ROLES,
        },
        {
          id: "ops-approvisionnements",
          libelle: "Approvisionnements",
          icone: "truck",
          module: "approvisionnements",
          chemin: "/approvisionnements",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "ops-stocks",
          libelle: "Articles et stocks",
          icone: "package",
          module: "stocks",
          chemin: "/stocks",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "ops-distributions",
          libelle: "Distributions provinciales",
          icone: "send",
          module: "distributions",
          chemin: "/distributions",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
      ],
    },
    {
      id: "beneficiaires",
      codeSection: "C",
      libelle: "Bénéficiaires",
      icone: "users",
      sousMenus: [
        {
          id: "ben-menages",
          libelle: "Registre des ménages",
          icone: "home",
          module: "beneficiaires",
          chemin: "/gestion/beneficiaires?vue=menages",
          rolesAutorises: ROLES_BENEFICIAIRES,
        },
        {
          id: "ben-listes",
          libelle: "Listes de bénéficiaires",
          icone: "list-checks",
          module: "beneficiaires",
          chemin: "/gestion/beneficiaires?vue=listes",
          rolesAutorises: ROLES_BENEFICIAIRES,
        },
        {
          id: "ben-partenaires",
          libelle: "Partenaires",
          icone: "handshake",
          module: "beneficiaires",
          chemin: "/gestion/beneficiaires?vue=partenaires",
          rolesAutorises: ROLES_BENEFICIAIRES,
        },
      ],
    },
    {
      id: "territoire",
      codeSection: "D",
      libelle: "Territoire",
      icone: "map-pin",
      sousMenus: [
        {
          id: "terr-referentiel",
          libelle: "Vue d’ensemble territoriale",
          icone: "globe",
          module: "territoire",
          chemin: "/territoire?vue=dashboard",
          badge: "23 / 112",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "terr-provinces-deps",
          libelle: "Provinces et départements",
          icone: "building-2",
          module: "territoire",
          chemin: "/territoire?vue=arborescence",
          badge: "112 dépts",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "terr-localites",
          libelle: "Villes, quartiers et localités",
          icone: "compass",
          module: "territoire",
          chemin: "/territoire?vue=recherche",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "terr-sites",
          libelle: "Sites humanitaires",
          icone: "tent",
          module: "territoire",
          chemin: "/territoire?vue=sites",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "terr-corrections",
          libelle: "Corrections territoriales",
          icone: "git-pull-request",
          module: "territoire",
          chemin: role === "PROPRIETAIRE" ? "/territoire?vue=doublons" : "/territoire?vue=corrections",
          rolesAutorises: ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"],
        },
      ],
    },
    {
      id: "suivi-controle",
      codeSection: "E",
      libelle: "Suivi & contrôle",
      icone: "shield-check",
      sousMenus: [
        {
          id: "ctrl-operations",
          libelle: "Contrôles et audits",
          icone: "clipboard-check",
          module: "controle",
          chemin: `/controle?vue=${vueControleDefaut}`,
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "ctrl-corrections",
          libelle: "Demandes de correction",
          icone: "edit-3",
          module: "controle",
          chemin: "/controle?vue=corrections",
          rolesAutorises: ["ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"],
        },
        {
          id: "ctrl-rapports",
          libelle: "Rapports et exports",
          icone: "file-spreadsheet",
          module: "rapports",
          chemin: "/rapports",
          rolesAutorises: TOUS_LES_ROLES,
        },
        {
          id: "ctrl-historique",
          libelle: "Historique et traçabilité",
          icone: "history",
          module: "controle",
          chemin: "/controle?vue=audit",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
        {
          id: "ctrl-notifications",
          libelle: "Notifications",
          icone: "bell",
          module: "controle",
          chemin: "/controle?vue=notifications",
          rolesAutorises: ROLES_OPERATIONNELS,
        },
      ],
    },
    {
      id: "administration",
      codeSection: "F",
      libelle: "Administration",
      icone: "settings",
      sousMenus: [
        {
          id: "admin-comptes",
          libelle: "Gestion des comptes",
          icone: "user-cog",
          module: "comptes",
          chemin: "/administration/comptes",
          rolesAutorises: ["PROPRIETAIRE", "ADMIN_CENTRAL"],
        },
        {
          id: "admin-donnees-test",
          libelle: "Données de test",
          icone: "database",
          module: "comptes",
          chemin: "/administration/comptes?section=donnees-test",
          badge: "Purge",
          rolesAutorises: ["PROPRIETAIRE"],
        },
        {
          id: "admin-parametres",
          libelle: "Gouvernance et journal",
          icone: "sliders",
          module: "comptes",
          chemin:
            role === "PROPRIETAIRE"
              ? "/administration/comptes?section=audit"
              : "/administration/comptes?onglet=decisions",
          rolesAutorises: ["PROPRIETAIRE", "ADMIN_CENTRAL"],
        },
      ],
    },
    {
      id: "mon-espace",
      codeSection: "G",
      libelle: "Mon compte",
      icone: "user",
      sousMenus: [
        {
          id: "espace-profil",
          libelle: "Mon compte",
          icone: "user",
          module: "mon-compte",
          chemin: "/mon-compte",
          rolesAutorises: TOUS_LES_ROLES,
        },
        {
          id: "espace-securite",
          libelle: "Sécurité, mot de passe & MFA",
          icone: "key-round",
          module: "mon-compte",
          chemin: "/mon-compte?section=securite",
          rolesAutorises: TOUS_LES_ROLES,
        },
      ],
    },
  ];

  return groupesBruts
    .map((groupe) => ({
      ...groupe,
      sousMenus: groupe.sousMenus.filter((sm) => sm.rolesAutorises.includes(role)),
    }))
    .filter((groupe) => groupe.sousMenus.length > 0);
}

export function trouverContexteNavigation(
  groupes: GroupeMenuNavigation[],
  adresseCourante: string,
  moduleActif: ModuleAdministration,
): {
  groupeActif: GroupeMenuNavigation;
  sousMenuActif: SousMenuNavigation;
} {
  // 1. Correspondance exacte chemin + query
  for (const groupe of groupes) {
    for (const sm of groupe.sousMenus) {
      if (sm.chemin === adresseCourante) {
        return { groupeActif: groupe, sousMenuActif: sm };
      }
    }
  }

  // 2. Correspondance par pathname ou module
  const cheminSeul = adresseCourante.split("?", 1)[0] ?? "/";
  for (const groupe of groupes) {
    for (const sm of groupe.sousMenus) {
      if (sm.chemin.split("?", 1)[0] === cheminSeul || sm.module === moduleActif) {
        return { groupeActif: groupe, sousMenuActif: sm };
      }
    }
  }

  const premierGroupe = groupes[0]!;
  return {
    groupeActif: premierGroupe,
    sousMenuActif: premierGroupe.sousMenus[0]!,
  };
}
