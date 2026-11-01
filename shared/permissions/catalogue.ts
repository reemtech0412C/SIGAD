export type RoleSIGAD = "PROPRIETAIRE" | "ADMIN_CENTRAL" | "DELEGUE_PROVINCIAL" | "RESPONSABLE_STOCK" | "SUPERVISEUR_TERRAIN" | "AGENT_DISTRIBUTION" | "CONSULTATION_INSTITUTIONNELLE";
export type ModeAccesPolitique = "PUBLIC" | "PREAUTH" | "SESSION" | "ROLE";
export type ActionPolitique = "LECTURE" | "COMMANDE" | "REMPLACEMENT" | "MODIFICATION" | "SUPPRESSION";

export interface PolitiqueRouteAPI {
  readonly permission: string;
  readonly methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly action: ActionPolitique;
  readonly chemin: string;
  readonly accessMode: ModeAccesPolitique;
  readonly rolesAutorises: readonly RoleSIGAD[];
  readonly rolesConditionnels: readonly { readonly role: RoleSIGAD; readonly condition: "RAPPORT_NON_SENSIBLE" }[];
  readonly portee: string;
  readonly csrf: boolean;
}

// Généré depuis backend/src/routes, backend/src/index.ts et les règles de montage ci-dessus.
// Une différence avec la matrice B1.1 exige une revue explicite avant régénération.
export const CATALOGUE_POLITIQUES_API = [
  {
    "permission": "API:GET:/api/administration/comptes/appareils",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/administration/comptes/appareils",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée centrale nationale; délégué provincial non autorisé avant validation de D-04; propriétaire résolu depuis l’appareil en base",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/administration/comptes/appareils/:id/approuver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/appareils/:id/approuver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée centrale nationale; délégué provincial non autorisé avant validation de D-04; propriétaire résolu depuis l’appareil en base",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/appareils/:id/revoquer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/appareils/:id/revoquer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée centrale nationale; délégué provincial non autorisé avant validation de D-04; propriétaire résolu depuis l’appareil en base",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/appareils/:id/suspendre",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/appareils/:id/suspendre",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée centrale nationale; délégué provincial non autorisé avant validation de D-04; propriétaire résolu depuis l’appareil en base",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/administration/comptes/consultation",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/administration/comptes/consultation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/administration/comptes/consultation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/consultation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/administration/comptes/consultation/:id/perimetre",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/administration/comptes/consultation/:id/perimetre",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/consultation/:id/reactiver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/consultation/:id/reactiver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/consultation/:id/renvoyer-invitation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/consultation/:id/renvoyer-invitation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/consultation/:id/revoquer-sessions",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/consultation/:id/revoquer-sessions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/consultation/:id/suspendre",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/consultation/:id/suspendre",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/administration/comptes/decisions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/administration/comptes/decisions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/administration/comptes/delegues",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/administration/comptes/delegues",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:id/approuver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:id/approuver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:id/refuser",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:id/refuser",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:id/remplacer/:utilisateurId",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:id/remplacer/:utilisateurId",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:utilisateurId/reactiver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:utilisateurId/reactiver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:utilisateurId/renvoyer-invitation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:utilisateurId/renvoyer-invitation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:utilisateurId/revoquer-sessions",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:utilisateurId/revoquer-sessions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/administration/comptes/delegues/:utilisateurId/suspendre",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/administration/comptes/delegues/:utilisateurId/suspendre",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/administration/comptes/delegues/comptes",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/administration/comptes/delegues/comptes",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central; province de délégation relue en D1; remplacement et unicité protégés par transaction et index partiel",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements/:id/destinations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements/:id/destinations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements/:id/expeditions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements/:id/expeditions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements/:id/receptions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements/:id/receptions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements/:id/receptions/:receptionId",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements/:id/receptions/:receptionId",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/approvisionnements/:id/repartition",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/approvisionnements/:id/repartition",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session, y compris les ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/auth/changer-mot-de-passe-initial",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/changer-mot-de-passe-initial",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Aucune",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/auth/connexion",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/connexion",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Aucune avant authentification; province jointe depuis le compte en base",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/auth/csrf",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/auth/csrf",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Aucune",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/auth/deconnexion",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/deconnexion",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Aucune",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/auth/mfa/confirmer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/mfa/confirmer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Compte de la session authentifiée",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/auth/mfa/initialiser",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/mfa/initialiser",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Compte de la session authentifiée",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/auth/mfa/reinitialiser/:utilisateurId",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/mfa/reinitialiser/:utilisateurId",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Opération nationale auditée; le compte cible est résolu en base",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/auth/mfa/statut",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/auth/mfa/statut",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Aucune",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/auth/mfa/verifier",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/mfa/verifier",
    "accessMode": "PREAUTH",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Identité et province issues du défi associé au compte en base",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/auth/recuperation-proprietaire",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/recuperation-proprietaire",
    "accessMode": "PREAUTH",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Compte propriétaire SIGAD fixé côté serveur; aucune donnée métier ni session complète",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/auth/recuperation-proprietaire/revoquer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/auth/recuperation-proprietaire/revoquer",
    "accessMode": "PREAUTH",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Compte propriétaire SIGAD fixé côté serveur; aucune donnée métier ni session complète",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/auth/session",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/auth/session",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Aucune",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/central/approvisionnements",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/approvisionnements",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; destinations et expéditions sont explicitement liées à chaque province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/approvisionnements/:id/cloture",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/approvisionnements/:id/cloture",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; destinations et expéditions sont explicitement liées à chaque province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/approvisionnements/:id/expeditions",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/approvisionnements/:id/expeditions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; destinations et expéditions sont explicitement liées à chaque province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/approvisionnements/:id/receptions/:receptionId/rapprochement",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/approvisionnements/:id/receptions/:receptionId/rapprochement",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; destinations et expéditions sont explicitement liées à chaque province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/approvisionnements/:id/validation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/approvisionnements/:id/validation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; destinations et expéditions sont explicitement liées à chaque province",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/central/approvisionnements/referentiels/entrepots-centraux",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/approvisionnements/referentiels/entrepots-centraux",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; destinations et expéditions sont explicitement liées à chaque province",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/audit",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/audit",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/controle/corrections",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/controle/corrections",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/controle/distributions/:id/cloture",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/controle/distributions/:id/cloture",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/controle/fermetures",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/controle/fermetures",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/controle/observations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/controle/observations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/central/controle/observations",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/controle/observations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/controle/observations/:id/cloture",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/controle/observations/:id/cloture",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/central/controle/operations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/controle/operations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/controle/synthese",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/controle/synthese",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; filtre provincial validé pour les dossiers ciblés",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/central/distributions/:id/cloture",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/distributions/:id/cloture",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; le dossier et ses lignes gardent la province enregistrée en base",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/distributions/:id/corrections/:correctionId/validation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/distributions/:id/corrections/:correctionId/validation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; le dossier et ses lignes gardent la province enregistrée en base",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/distributions/:id/retour-correction",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/distributions/:id/retour-correction",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "National; le dossier et ses lignes gardent la province enregistrée en base",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/central/exceptions-nominatives",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/exceptions-nominatives",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/central/exceptions-nominatives",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/exceptions-nominatives",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/exceptions-nominatives/:id/annuler",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/exceptions-nominatives/:id/annuler",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/exceptions-nominatives/:id/approuver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/exceptions-nominatives/:id/approuver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/exceptions-nominatives/:id/executer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/exceptions-nominatives/:id/executer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/central/exceptions-nominatives/:id/refuser",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/exceptions-nominatives/:id/refuser",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; enregistre une exception inerte, aucun accès nominatif accordé par cette route",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/central/performance-delegations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/performance-delegations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Périmètre central national; indicateurs agrégés par province, aucune donnée nominative",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/central/referentiel-territorial/propositions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/central/referentiel-territorial/propositions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Relecture nationale; décision liée au demandeur et aux règles territoriales",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/central/referentiel-territorial/propositions/:type/:id/decision",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/central/referentiel-territorial/propositions/:type/:id/decision",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Relecture nationale; décision liée au demandeur et aux règles territoriales",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/compte",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/compte",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": false
  },
  {
    "permission": "API:PATCH:/api/compte",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/compte",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/compte/appareils",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/compte/appareils",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/compte/appareils",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/appareils",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/appareils/:id/revoquer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/appareils/:id/revoquer",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/appareils/defis",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/appareils/defis",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/courriel",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/courriel",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/courriel/verifier",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/courriel/verifier",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/mot-de-passe",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/mot-de-passe",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/compte/sessions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/compte/sessions",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/compte/sessions/:id/revoquer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/sessions/:id/revoquer",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/sessions/revoquer-autres",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/sessions/revoquer-autres",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/compte/sessions/revoquer-toutes",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/compte/sessions/revoquer-toutes",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province, rôle, statut et périmètre administratif immuables depuis ce formulaire; la portée vient de la session et de D1",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/distributions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/distributions",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/distributions/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:PUT:/api/distributions/:id",
    "methode": "PUT",
    "action": "REMPLACEMENT",
    "chemin": "/api/distributions/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/distributions/:id/corrections",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/corrections",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/distributions/:id/declaration-fin",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/declaration-fin",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/distributions/:id/execution",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/execution",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/distributions/:id/menages",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/:id/menages",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/distributions/:id/menages/:menageDistributionId/allocations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/:id/menages/:menageDistributionId/allocations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/distributions/:id/preparation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/preparation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/distributions/:id/pv",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/:id/pv",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/distributions/:id/pv",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/pv",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/distributions/:id/remises",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/remises",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/distributions/:id/synthese",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/:id/synthese",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/distributions/:id/validation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/distributions/:id/validation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/distributions/menages",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/menages",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/distributions/referentiels",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/distributions/referentiels",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session propagé aux requêtes métier et aux ressources enfants",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/gestion/listes-beneficiaires",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/listes-beneficiaires",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/listes-beneficiaires",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/listes-beneficiaires",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/gestion/listes-beneficiaires/:listeId/export",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/listes-beneficiaires/:listeId/export",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/listes-beneficiaires/:listeId/inscriptions",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/listes-beneficiaires/:listeId/inscriptions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/gestion/listes-beneficiaires/:listeId/menages",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/listes-beneficiaires/:listeId/menages",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/gestion/menages",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/menages",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/menages",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/menages",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/gestion/menages/:menageId",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/menages/:menageId",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/menages/:menageId/validation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/menages/:menageId/validation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée nationale d’examen; ménages et signalements résolus par leurs identifiants en base, sans province fournie par le client",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/gestion/menages/importations",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/menages/importations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/gestion/partenaires",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/partenaires",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/partenaires",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/partenaires",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/gestion/partenaires/:partenaireId",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/partenaires/:partenaireId",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/partenaires/:partenaireId/validation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/partenaires/:partenaireId/validation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/gestion/referentiels",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/referentiels",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/gestion/signalements-doublons",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/gestion/signalements-doublons",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session; central: province validée du corps ou du filtre",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/gestion/signalements-doublons/:signalementId/decision",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/signalements-doublons/:signalementId/decision",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée nationale d’examen; ménages et signalements résolus par leurs identifiants en base, sans province fournie par le client",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/gestion/signalements-doublons/:signalementId/reouverture",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/gestion/signalements-doublons/:signalementId/reouverture",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Portée nationale d’examen; ménages et signalements résolus par leurs identifiants en base, sans province fournie par le client",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/inscriptions/delegues",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/inscriptions/delegues",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Province reçue uniquement pour la demande; aucune autorisation provinciale avant création explicite du compte par ADMIN_CENTRAL",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/inscriptions/delegues/provinces",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/inscriptions/delegues/provinces",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Province reçue uniquement pour la demande; aucune autorisation provinciale avant création explicite du compte par ADMIN_CENTRAL",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/inscriptions/delegues/renvoyer-code",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/inscriptions/delegues/renvoyer-code",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Province reçue uniquement pour la demande; aucune autorisation provinciale avant création explicite du compte par ADMIN_CENTRAL",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/inscriptions/delegues/verifier-courriel",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/inscriptions/delegues/verifier-courriel",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Province reçue uniquement pour la demande; aucune autorisation provinciale avant création explicite du compte par ADMIN_CENTRAL",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/notifications",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/notifications",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province et rôle du destinataire comparés à la session en base",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/notifications/:id/lecture",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/notifications/:id/lecture",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province et rôle du destinataire comparés à la session en base",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/notifications/lecture-toutes",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/notifications/lecture-toutes",
    "accessMode": "SESSION",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Province et rôle du destinataire comparés à la session en base",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/operations-centrales",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/operations-centrales",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/operations-centrales",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/operations-centrales",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/operations-centrales/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/operations-centrales/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": false
  },
  {
    "permission": "API:PUT:/api/operations-centrales/:id",
    "methode": "PUT",
    "action": "REMPLACEMENT",
    "chemin": "/api/operations-centrales/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/operations-centrales/:id/approbations",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/operations-centrales/:id/approbations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/operations-centrales/:id/consolidation",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/operations-centrales/:id/consolidation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/operations-centrales/:id/documents",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/operations-centrales/:id/documents",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/operations-centrales/:id/documents/:docId",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/operations-centrales/:id/documents/:docId",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "CONSULTATION_INSTITUTIONNELLE"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/operations-centrales/:id/statut",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/operations-centrales/:id/statut",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: provinces autorisées de sa session; Central/Propriétaire: national",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/appareils",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/appareils",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/appareils/:id/revoquer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/appareils/:id/revoquer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/audit",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/audit",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/proprietaire/donnees-test/historique",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/donnees-test/historique",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/donnees-test/nettoyage-lot",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/donnees-test/nettoyage-lot",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/donnees-test/operations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/donnees-test/operations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": false
  },
  {
    "permission": "API:DELETE:/api/proprietaire/donnees-test/operations/:id",
    "methode": "DELETE",
    "action": "SUPPRESSION",
    "chemin": "/api/proprietaire/donnees-test/operations/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/donnees-test/operations/:id/apercu",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/donnees-test/operations/:id/apercu",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/donnees-test/operations/:id/reclassifier",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/donnees-test/operations/:id/reclassifier",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/donnees-test/operations/:id/supprimer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/donnees-test/operations/:id/supprimer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/donnees-test/reconciliation-r2",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/donnees-test/reconciliation-r2",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/donnees-test/reconciliation-r2/traiter",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/donnees-test/reconciliation-r2/traiter",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; gouvernance et purge des données de test",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/plateforme/approbations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/plateforme/approbations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/plateforme/approbations",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/plateforme/approbations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/plateforme/approbations/:id/annuler",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/plateforme/approbations/:id/annuler",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/plateforme/approbations/:id/approuver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/plateforme/approbations/:id/approuver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/plateforme/approbations/:id/executer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/plateforme/approbations/:id/executer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/plateforme/approbations/:id/refuser",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/plateforme/approbations/:id/refuser",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/plateforme/drapeaux",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/plateforme/drapeaux",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": false
  },
  {
    "permission": "API:PUT:/api/proprietaire/plateforme/drapeaux/:code",
    "methode": "PUT",
    "action": "REMPLACEMENT",
    "chemin": "/api/proprietaire/plateforme/drapeaux/:code",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; drapeaux et demandes d’approbation de plateforme, aucune donnée bénéficiaire",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/referentiel-territorial/propositions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/referentiel-territorial/propositions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Relecture nationale; décision liée au demandeur et aux règles territoriales",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/referentiel-territorial/propositions/:type/:id/decision",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/referentiel-territorial/propositions/:type/:id/decision",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Relecture nationale; décision liée au demandeur et aux règles territoriales",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/arborescence",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/arborescence",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/audits",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/audits",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/doublons",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/doublons",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/export",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/export",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/export-xlsx",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/export-xlsx",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/fusions/executer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/fusions/executer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/fusions/simulation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/fusions/simulation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/import/executer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/import/executer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/import/previsualiser",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/import/previsualiser",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/recherche",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/recherche",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/proprietaire/territoire/tableau-de-bord",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/territoire/tableau-de-bord",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:DELETE:/api/proprietaire/territoire/unites/:id",
    "methode": "DELETE",
    "action": "SUPPRESSION",
    "chemin": "/api/proprietaire/territoire/unites/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:PUT:/api/proprietaire/territoire/unites/:id",
    "methode": "PUT",
    "action": "REMPLACEMENT",
    "chemin": "/api/proprietaire/territoire/unites/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites/:id/archiver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites/:id/archiver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites/:id/rattachement",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites/:id/rattachement",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites/:id/reactiver",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites/:id/reactiver",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites/:id/simuler-rattachement",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites/:id/simuler-rattachement",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites/:id/valider",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites/:id/valider",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/territoire/unites/valider-lot",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/territoire/unites/valider-lot",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; administration nationale du référentiel territorial",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/proprietaire/utilisateurs",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/proprietaire/utilisateurs",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/proprietaire/utilisateurs/:id/reinitialiser-acces",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/utilisateurs/:id/reinitialiser-acces",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/proprietaire/utilisateurs/:id/revoquer",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/proprietaire/utilisateurs/:id/revoquer",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/proprietaire/utilisateurs/:id/statut",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/proprietaire/utilisateurs/:id/statut",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Sans restriction de province; périmètre technique national",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/provincial/:provinceId/profil",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/:provinceId/profil",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "province_id retourné depuis utilisateur.province_id de la session",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/provincial/audit",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/audit",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session et filtre SQL des observations, corrections et audits",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/provincial/corrections",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/corrections",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session et filtre SQL des observations, corrections et audits",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/provincial/expeditions",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/expeditions",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; contrôlé par middleware et services",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/provincial/expeditions/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/expeditions/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; contrôlé par middleware et services",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/provincial/expeditions/:id/pv",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/expeditions/:id/pv",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; contrôlé par middleware et services",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/provincial/expeditions/:id/pv",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/provincial/expeditions/:id/pv",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; contrôlé par middleware et services",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/provincial/expeditions/:id/reception",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/provincial/expeditions/:id/reception",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; contrôlé par middleware et services",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/provincial/observations",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/observations",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session et filtre SQL des observations, corrections et audits",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/provincial/observations/:id/reponse",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/provincial/observations/:id/reponse",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session et filtre SQL des observations, corrections et audits",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/provincial/operations-centrales",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/operations-centrales",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; vérifié par middleware et service",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/provincial/operations-centrales/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/provincial/operations-centrales/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; vérifié par middleware et service",
    "csrf": false
  },
  {
    "permission": "API:PATCH:/api/provincial/operations-centrales/:id/dossier",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/provincial/operations-centrales/:id/dossier",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "utilisateur.province_id de session; vérifié par middleware et service",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/rapports/:type/apercu",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/:type/apercu",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/rapports/:type/export",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/rapports/:type/export",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [
      {
        "role": "CONSULTATION_INSTITUTIONNELLE",
        "condition": "RAPPORT_NON_SENSIBLE"
      }
    ],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/rapports/archives",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/archives",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/rapports/archives/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/archives/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/rapports/archives/reconciliation",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/archives/reconciliation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/rapports/archives/reconciliation",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/rapports/archives/reconciliation",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/rapports/catalogue",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/catalogue",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/rapports/filtres",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/filtres",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/rapports/indicateurs-carte",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/indicateurs-carte",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/rapports/tableau-de-bord",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/rapports/tableau-de-bord",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour aperçu, export, archive et téléchargement",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/sante",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/sante",
    "accessMode": "PUBLIC",
    "rolesAutorises": [],
    "rolesConditionnels": [],
    "portee": "Aucune donnée métier",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/stocks/ajustements-stock",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/ajustements-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/ajustements-stock",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/ajustements-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/articles",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/articles",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/articles",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/articles",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/stocks/articles/:id",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/stocks/articles/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/categories-aide",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/categories-aide",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/categories-aide",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/categories-aide",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/stocks/categories-aide/:id",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/stocks/categories-aide/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/conditionnements",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/conditionnements",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/conditionnements",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/conditionnements",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/stocks/conditionnements/:id",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/stocks/conditionnements/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/entrepots",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/entrepots",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/entrepots",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/entrepots",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/stocks/entrepots/:id",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/stocks/entrepots/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/lots-stock",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/lots-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/stocks/mouvements-stock",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/mouvements-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/stocks/mouvements-stock/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/mouvements-stock/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/stocks/receptions-stock",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/receptions-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/receptions-stock",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/receptions-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/receptions-stock/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/receptions-stock/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/stocks/soldes-stock",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/soldes-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/transferts-stock",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/transferts-stock",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/stocks/unites-mesure",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/stocks/unites-mesure",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/stocks/unites-mesure",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/stocks/unites-mesure",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:PATCH:/api/stocks/unites-mesure/:id",
    "methode": "PATCH",
    "action": "MODIFICATION",
    "chemin": "/api/stocks/unites-mesure/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL"
    ],
    "rolesConditionnels": [],
    "portee": "Délégué: utilisateur.province_id de session pour filtre, entrepôt, lots, mouvements et écritures",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/territoire/arrondissements",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/arrondissements",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/cantons",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/cantons",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/carres",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/carres",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/communes",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/communes",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/departements",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/departements",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/localites",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/localites",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/localites/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/localites/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/territoire/propositions/corrections",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/territoire/propositions/corrections",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; DELEGUE_PROVINCIAL: utilisateur.province_id de session et rattachement à une entité de la même province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/territoire/propositions/localites",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/territoire/propositions/localites",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; DELEGUE_PROVINCIAL: utilisateur.province_id de session et rattachement à une entité de la même province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/territoire/propositions/quartiers",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/territoire/propositions/quartiers",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; DELEGUE_PROVINCIAL: utilisateur.province_id de session et rattachement à une entité de la même province",
    "csrf": true
  },
  {
    "permission": "API:POST:/api/territoire/propositions/sites-humanitaires",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/territoire/propositions/sites-humanitaires",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; DELEGUE_PROVINCIAL: utilisateur.province_id de session et rattachement à une entité de la même province",
    "csrf": true
  },
  {
    "permission": "API:GET:/api/territoire/provinces",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/provinces",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/quartiers",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/quartiers",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/rattachements-territoriaux",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/rattachements-territoriaux",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/sites-humanitaires",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/sites-humanitaires",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/sites-humanitaires/:id",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/sites-humanitaires/:id",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:GET:/api/territoire/sous-prefectures",
    "methode": "GET",
    "action": "LECTURE",
    "chemin": "/api/territoire/sous-prefectures",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL"
    ],
    "rolesConditionnels": [],
    "portee": "DELEGUE_PROVINCIAL: utilisateur.province_id issu de la session; autres rôles selon filtres et ressources validés",
    "csrf": false
  },
  {
    "permission": "API:POST:/api/territoire/unites-dynamiques",
    "methode": "POST",
    "action": "COMMANDE",
    "chemin": "/api/territoire/unites-dynamiques",
    "accessMode": "ROLE",
    "rolesAutorises": [
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION"
    ],
    "rolesConditionnels": [],
    "portee": "PROPRIETAIRE et ADMIN_CENTRAL: portée nationale; rôles provinciaux: province issue de la session; création de département réservée aux rôles centraux",
    "csrf": true
  }
] as const satisfies readonly PolitiqueRouteAPI[];
