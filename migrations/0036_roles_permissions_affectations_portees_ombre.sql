PRAGMA foreign_keys = ON;

-- B2.2 : modèle identitaire additif. Les tables restent en mode ombre ;
-- le middleware historique conserve seul la décision d'accès.
CREATE TABLE roles (
  code TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  systeme INTEGER NOT NULL DEFAULT 1 CHECK (systeme IN (0, 1)),
  statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF')),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE permissions (
  code TEXT PRIMARY KEY,
  methode TEXT NOT NULL CHECK (methode IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  chemin TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('LECTURE', 'COMMANDE', 'REMPLACEMENT', 'MODIFICATION', 'SUPPRESSION')),
  mode_acces TEXT NOT NULL CHECK (mode_acces IN ('PUBLIC', 'PREAUTH', 'SESSION', 'ROLE')),
  csrf_requis INTEGER NOT NULL CHECK (csrf_requis IN (0, 1)),
  source TEXT NOT NULL DEFAULT 'CATALOGUE_B2_1',
  UNIQUE (methode, chemin)
);

CREATE TABLE roles_permissions (
  role_code TEXT NOT NULL REFERENCES roles(code),
  permission_code TEXT NOT NULL REFERENCES permissions(code),
  condition_code TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'BASELINE_B2_1' CHECK (source = 'BASELINE_B2_1'),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role_code, permission_code, condition_code)
);

-- gid conserve l'identifiant source existant (future geo_unites.gid) ;
-- aucune FK géographique n'est ajoutée avant B2.3. La portée nationale
-- est explicitement marquée avec gid NULL.
CREATE TABLE portees_acces (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  type_unite TEXT NOT NULL CHECK (type_unite IN ('NATIONALE', 'PROVINCE', 'LOCALITE')),
  gid TEXT,
  inclut_descendants INTEGER NOT NULL DEFAULT 0 CHECK (inclut_descendants IN (0, 1)),
  valide_du TEXT,
  valide_au TEXT,
  accorde_par TEXT REFERENCES utilisateurs(id),
  statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'REVOQUE')),
  source_legacy TEXT NOT NULL CHECK (source_legacy IN (
    'ROLES_NATIONAUX',
    'COMPTES_CONSULTATION',
    'UTILISATEURS',
    'PROFILS_OPERATIONNELS_TERRAIN',
    'PERIMETRES_PROVINCIAUX_CONSULTATION',
    'ENTREPOTS'
  )),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (type_unite = 'NATIONALE' AND gid IS NULL AND inclut_descendants = 0)
    OR (type_unite <> 'NATIONALE' AND gid IS NOT NULL)
  ),
  CHECK (valide_au IS NULL OR valide_du IS NULL OR valide_au > valide_du)
);

CREATE TABLE affectations_roles (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(code),
  portee_id TEXT REFERENCES portees_acces(id),
  valide_du TEXT,
  valide_au TEXT,
  accorde_par TEXT REFERENCES utilisateurs(id),
  statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'REVOQUE')),
  source_legacy TEXT NOT NULL CHECK (source_legacy IN (
    'UTILISATEURS', 'PROFILS_OPERATIONNELS_TERRAIN', 'COMPTES_CONSULTATION'
  )),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (valide_au IS NULL OR valide_du IS NULL OR valide_au > valide_du)
);

CREATE INDEX idx_affectations_roles_utilisateur_statut
  ON affectations_roles(utilisateur_id, statut, valide_du, valide_au);
CREATE INDEX idx_portees_acces_utilisateur_statut
  ON portees_acces(utilisateur_id, statut, type_unite, gid);

INSERT INTO roles (code, libelle, systeme, statut)
VALUES
  ('PROPRIETAIRE', 'PROPRIETAIRE', 1, 'ACTIF'),
  ('ADMIN_CENTRAL', 'ADMIN_CENTRAL', 1, 'ACTIF'),
  ('DELEGUE_PROVINCIAL', 'DELEGUE_PROVINCIAL', 1, 'ACTIF'),
  ('CONSULTATION_INSTITUTIONNELLE', 'CONSULTATION_INSTITUTIONNELLE', 1, 'ACTIF'),
  ('RESPONSABLE_STOCK', 'RESPONSABLE_STOCK', 1, 'ACTIF'),
  ('SUPERVISEUR_TERRAIN', 'SUPERVISEUR_TERRAIN', 1, 'ACTIF'),
  ('AGENT_DISTRIBUTION', 'AGENT_DISTRIBUTION', 1, 'ACTIF')
;

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis)
VALUES
('API:GET:/api/administration/comptes/consultation', 'GET', '/api/administration/comptes/consultation', 'LECTURE', 'ROLE', 0),
('API:POST:/api/administration/comptes/consultation', 'POST', '/api/administration/comptes/consultation', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/administration/comptes/consultation/:id/perimetre', 'PATCH', '/api/administration/comptes/consultation/:id/perimetre', 'MODIFICATION', 'ROLE', 1),
('API:POST:/api/administration/comptes/consultation/:id/reactiver', 'POST', '/api/administration/comptes/consultation/:id/reactiver', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/consultation/:id/renvoyer-invitation', 'POST', '/api/administration/comptes/consultation/:id/renvoyer-invitation', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/consultation/:id/revoquer-sessions', 'POST', '/api/administration/comptes/consultation/:id/revoquer-sessions', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/consultation/:id/suspendre', 'POST', '/api/administration/comptes/consultation/:id/suspendre', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/administration/comptes/decisions', 'GET', '/api/administration/comptes/decisions', 'LECTURE', 'ROLE', 0),
('API:GET:/api/administration/comptes/delegues', 'GET', '/api/administration/comptes/delegues', 'LECTURE', 'ROLE', 0),
('API:POST:/api/administration/comptes/delegues/:id/approuver', 'POST', '/api/administration/comptes/delegues/:id/approuver', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/delegues/:id/refuser', 'POST', '/api/administration/comptes/delegues/:id/refuser', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/delegues/:id/remplacer/:utilisateurId', 'POST', '/api/administration/comptes/delegues/:id/remplacer/:utilisateurId', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/delegues/:utilisateurId/reactiver', 'POST', '/api/administration/comptes/delegues/:utilisateurId/reactiver', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/delegues/:utilisateurId/renvoyer-invitation', 'POST', '/api/administration/comptes/delegues/:utilisateurId/renvoyer-invitation', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/delegues/:utilisateurId/revoquer-sessions', 'POST', '/api/administration/comptes/delegues/:utilisateurId/revoquer-sessions', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/administration/comptes/delegues/:utilisateurId/suspendre', 'POST', '/api/administration/comptes/delegues/:utilisateurId/suspendre', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/administration/comptes/delegues/comptes', 'GET', '/api/administration/comptes/delegues/comptes', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements', 'GET', '/api/approvisionnements', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements/:id', 'GET', '/api/approvisionnements/:id', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements/:id/destinations', 'GET', '/api/approvisionnements/:id/destinations', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements/:id/expeditions', 'GET', '/api/approvisionnements/:id/expeditions', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements/:id/receptions', 'GET', '/api/approvisionnements/:id/receptions', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements/:id/receptions/:receptionId', 'GET', '/api/approvisionnements/:id/receptions/:receptionId', 'LECTURE', 'ROLE', 0),
('API:GET:/api/approvisionnements/:id/repartition', 'GET', '/api/approvisionnements/:id/repartition', 'LECTURE', 'ROLE', 0),
('API:POST:/api/auth/changer-mot-de-passe-initial', 'POST', '/api/auth/changer-mot-de-passe-initial', 'COMMANDE', 'SESSION', 1),
('API:POST:/api/auth/connexion', 'POST', '/api/auth/connexion', 'COMMANDE', 'PUBLIC', 1),
('API:GET:/api/auth/csrf', 'GET', '/api/auth/csrf', 'LECTURE', 'PUBLIC', 0),
('API:POST:/api/auth/deconnexion', 'POST', '/api/auth/deconnexion', 'COMMANDE', 'SESSION', 1),
('API:POST:/api/auth/mfa/confirmer', 'POST', '/api/auth/mfa/confirmer', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/auth/mfa/initialiser', 'POST', '/api/auth/mfa/initialiser', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/auth/mfa/reinitialiser/:utilisateurId', 'POST', '/api/auth/mfa/reinitialiser/:utilisateurId', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/auth/mfa/statut', 'GET', '/api/auth/mfa/statut', 'LECTURE', 'SESSION', 0),
('API:POST:/api/auth/mfa/verifier', 'POST', '/api/auth/mfa/verifier', 'COMMANDE', 'PREAUTH', 1),
('API:POST:/api/auth/recuperation-proprietaire', 'POST', '/api/auth/recuperation-proprietaire', 'COMMANDE', 'PREAUTH', 1),
('API:POST:/api/auth/recuperation-proprietaire/revoquer', 'POST', '/api/auth/recuperation-proprietaire/revoquer', 'COMMANDE', 'PREAUTH', 1),
('API:GET:/api/auth/session', 'GET', '/api/auth/session', 'LECTURE', 'SESSION', 0),
('API:POST:/api/central/approvisionnements', 'POST', '/api/central/approvisionnements', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/approvisionnements/:id/cloture', 'POST', '/api/central/approvisionnements/:id/cloture', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/approvisionnements/:id/expeditions', 'POST', '/api/central/approvisionnements/:id/expeditions', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/approvisionnements/:id/receptions/:receptionId/rapprochement', 'POST', '/api/central/approvisionnements/:id/receptions/:receptionId/rapprochement', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/approvisionnements/:id/validation', 'POST', '/api/central/approvisionnements/:id/validation', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/central/approvisionnements/referentiels/entrepots-centraux', 'GET', '/api/central/approvisionnements/referentiels/entrepots-centraux', 'LECTURE', 'ROLE', 0),
('API:GET:/api/central/audit', 'GET', '/api/central/audit', 'LECTURE', 'ROLE', 0),
('API:GET:/api/central/controle/corrections', 'GET', '/api/central/controle/corrections', 'LECTURE', 'ROLE', 0),
('API:GET:/api/central/controle/distributions/:id/cloture', 'GET', '/api/central/controle/distributions/:id/cloture', 'LECTURE', 'ROLE', 0),
('API:GET:/api/central/controle/fermetures', 'GET', '/api/central/controle/fermetures', 'LECTURE', 'ROLE', 0),
('API:GET:/api/central/controle/observations', 'GET', '/api/central/controle/observations', 'LECTURE', 'ROLE', 0),
('API:POST:/api/central/controle/observations', 'POST', '/api/central/controle/observations', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/controle/observations/:id/cloture', 'POST', '/api/central/controle/observations/:id/cloture', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/central/controle/operations', 'GET', '/api/central/controle/operations', 'LECTURE', 'ROLE', 0);

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis)
VALUES
('API:GET:/api/central/controle/synthese', 'GET', '/api/central/controle/synthese', 'LECTURE', 'ROLE', 0),
('API:POST:/api/central/distributions/:id/cloture', 'POST', '/api/central/distributions/:id/cloture', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/distributions/:id/corrections/:correctionId/validation', 'POST', '/api/central/distributions/:id/corrections/:correctionId/validation', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/central/distributions/:id/retour-correction', 'POST', '/api/central/distributions/:id/retour-correction', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/central/referentiel-territorial/propositions', 'GET', '/api/central/referentiel-territorial/propositions', 'LECTURE', 'ROLE', 0),
('API:POST:/api/central/referentiel-territorial/propositions/:type/:id/decision', 'POST', '/api/central/referentiel-territorial/propositions/:type/:id/decision', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/compte', 'GET', '/api/compte', 'LECTURE', 'SESSION', 0),
('API:PATCH:/api/compte', 'PATCH', '/api/compte', 'MODIFICATION', 'SESSION', 1),
('API:POST:/api/compte/courriel', 'POST', '/api/compte/courriel', 'COMMANDE', 'SESSION', 1),
('API:POST:/api/compte/courriel/verifier', 'POST', '/api/compte/courriel/verifier', 'COMMANDE', 'SESSION', 1),
('API:POST:/api/compte/mot-de-passe', 'POST', '/api/compte/mot-de-passe', 'COMMANDE', 'SESSION', 1),
('API:GET:/api/compte/sessions', 'GET', '/api/compte/sessions', 'LECTURE', 'SESSION', 0),
('API:POST:/api/compte/sessions/revoquer-autres', 'POST', '/api/compte/sessions/revoquer-autres', 'COMMANDE', 'SESSION', 1),
('API:GET:/api/distributions', 'GET', '/api/distributions', 'LECTURE', 'ROLE', 0),
('API:POST:/api/distributions', 'POST', '/api/distributions', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/distributions/:id', 'GET', '/api/distributions/:id', 'LECTURE', 'ROLE', 0),
('API:PUT:/api/distributions/:id', 'PUT', '/api/distributions/:id', 'REMPLACEMENT', 'ROLE', 1),
('API:POST:/api/distributions/:id/corrections', 'POST', '/api/distributions/:id/corrections', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/distributions/:id/declaration-fin', 'POST', '/api/distributions/:id/declaration-fin', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/distributions/:id/execution', 'POST', '/api/distributions/:id/execution', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/distributions/:id/menages', 'GET', '/api/distributions/:id/menages', 'LECTURE', 'ROLE', 0),
('API:GET:/api/distributions/:id/menages/:menageDistributionId/allocations', 'GET', '/api/distributions/:id/menages/:menageDistributionId/allocations', 'LECTURE', 'ROLE', 0),
('API:POST:/api/distributions/:id/preparation', 'POST', '/api/distributions/:id/preparation', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/distributions/:id/pv', 'GET', '/api/distributions/:id/pv', 'LECTURE', 'ROLE', 0),
('API:POST:/api/distributions/:id/pv', 'POST', '/api/distributions/:id/pv', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/distributions/:id/remises', 'POST', '/api/distributions/:id/remises', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/distributions/:id/synthese', 'GET', '/api/distributions/:id/synthese', 'LECTURE', 'ROLE', 0),
('API:POST:/api/distributions/:id/validation', 'POST', '/api/distributions/:id/validation', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/distributions/menages', 'GET', '/api/distributions/menages', 'LECTURE', 'ROLE', 0),
('API:GET:/api/distributions/referentiels', 'GET', '/api/distributions/referentiels', 'LECTURE', 'ROLE', 0),
('API:GET:/api/gestion/listes-beneficiaires', 'GET', '/api/gestion/listes-beneficiaires', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/listes-beneficiaires', 'POST', '/api/gestion/listes-beneficiaires', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/gestion/listes-beneficiaires/:listeId/export', 'GET', '/api/gestion/listes-beneficiaires/:listeId/export', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/listes-beneficiaires/:listeId/inscriptions', 'POST', '/api/gestion/listes-beneficiaires/:listeId/inscriptions', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/gestion/listes-beneficiaires/:listeId/menages', 'GET', '/api/gestion/listes-beneficiaires/:listeId/menages', 'LECTURE', 'ROLE', 0),
('API:GET:/api/gestion/menages', 'GET', '/api/gestion/menages', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/menages', 'POST', '/api/gestion/menages', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/gestion/menages/:menageId', 'GET', '/api/gestion/menages/:menageId', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/menages/:menageId/validation', 'POST', '/api/gestion/menages/:menageId/validation', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/gestion/menages/importations', 'POST', '/api/gestion/menages/importations', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/gestion/partenaires', 'GET', '/api/gestion/partenaires', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/partenaires', 'POST', '/api/gestion/partenaires', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/gestion/partenaires/:partenaireId', 'GET', '/api/gestion/partenaires/:partenaireId', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/partenaires/:partenaireId/validation', 'POST', '/api/gestion/partenaires/:partenaireId/validation', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/gestion/referentiels', 'GET', '/api/gestion/referentiels', 'LECTURE', 'ROLE', 0),
('API:GET:/api/gestion/signalements-doublons', 'GET', '/api/gestion/signalements-doublons', 'LECTURE', 'ROLE', 0),
('API:POST:/api/gestion/signalements-doublons/:signalementId/decision', 'POST', '/api/gestion/signalements-doublons/:signalementId/decision', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/gestion/signalements-doublons/:signalementId/reouverture', 'POST', '/api/gestion/signalements-doublons/:signalementId/reouverture', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/inscriptions/delegues', 'POST', '/api/inscriptions/delegues', 'COMMANDE', 'PUBLIC', 1),
('API:GET:/api/inscriptions/delegues/provinces', 'GET', '/api/inscriptions/delegues/provinces', 'LECTURE', 'PUBLIC', 0);

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis)
VALUES
('API:POST:/api/inscriptions/delegues/renvoyer-code', 'POST', '/api/inscriptions/delegues/renvoyer-code', 'COMMANDE', 'PUBLIC', 1),
('API:POST:/api/inscriptions/delegues/verifier-courriel', 'POST', '/api/inscriptions/delegues/verifier-courriel', 'COMMANDE', 'PUBLIC', 1),
('API:GET:/api/notifications', 'GET', '/api/notifications', 'LECTURE', 'SESSION', 0),
('API:POST:/api/notifications/:id/lecture', 'POST', '/api/notifications/:id/lecture', 'COMMANDE', 'SESSION', 1),
('API:POST:/api/notifications/lecture-toutes', 'POST', '/api/notifications/lecture-toutes', 'COMMANDE', 'SESSION', 1),
('API:GET:/api/operations-centrales', 'GET', '/api/operations-centrales', 'LECTURE', 'ROLE', 0),
('API:POST:/api/operations-centrales', 'POST', '/api/operations-centrales', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/operations-centrales/:id', 'GET', '/api/operations-centrales/:id', 'LECTURE', 'ROLE', 0),
('API:PUT:/api/operations-centrales/:id', 'PUT', '/api/operations-centrales/:id', 'REMPLACEMENT', 'ROLE', 1),
('API:POST:/api/operations-centrales/:id/approbations', 'POST', '/api/operations-centrales/:id/approbations', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/operations-centrales/:id/consolidation', 'GET', '/api/operations-centrales/:id/consolidation', 'LECTURE', 'ROLE', 0),
('API:POST:/api/operations-centrales/:id/documents', 'POST', '/api/operations-centrales/:id/documents', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/operations-centrales/:id/documents/:docId', 'GET', '/api/operations-centrales/:id/documents/:docId', 'LECTURE', 'ROLE', 0),
('API:POST:/api/operations-centrales/:id/statut', 'POST', '/api/operations-centrales/:id/statut', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/audit', 'GET', '/api/proprietaire/audit', 'LECTURE', 'ROLE', 0),
('API:GET:/api/proprietaire/donnees-test/historique', 'GET', '/api/proprietaire/donnees-test/historique', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/donnees-test/nettoyage-lot', 'POST', '/api/proprietaire/donnees-test/nettoyage-lot', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/donnees-test/operations', 'GET', '/api/proprietaire/donnees-test/operations', 'LECTURE', 'ROLE', 0),
('API:DELETE:/api/proprietaire/donnees-test/operations/:id', 'DELETE', '/api/proprietaire/donnees-test/operations/:id', 'SUPPRESSION', 'ROLE', 1),
('API:GET:/api/proprietaire/donnees-test/operations/:id/apercu', 'GET', '/api/proprietaire/donnees-test/operations/:id/apercu', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/donnees-test/operations/:id/reclassifier', 'POST', '/api/proprietaire/donnees-test/operations/:id/reclassifier', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/donnees-test/operations/:id/supprimer', 'POST', '/api/proprietaire/donnees-test/operations/:id/supprimer', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/donnees-test/reconciliation-r2', 'GET', '/api/proprietaire/donnees-test/reconciliation-r2', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/donnees-test/reconciliation-r2/traiter', 'POST', '/api/proprietaire/donnees-test/reconciliation-r2/traiter', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/referentiel-territorial/propositions', 'GET', '/api/proprietaire/referentiel-territorial/propositions', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/referentiel-territorial/propositions/:type/:id/decision', 'POST', '/api/proprietaire/referentiel-territorial/propositions/:type/:id/decision', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/territoire/arborescence', 'GET', '/api/proprietaire/territoire/arborescence', 'LECTURE', 'ROLE', 0),
('API:GET:/api/proprietaire/territoire/audits', 'GET', '/api/proprietaire/territoire/audits', 'LECTURE', 'ROLE', 0),
('API:GET:/api/proprietaire/territoire/doublons', 'GET', '/api/proprietaire/territoire/doublons', 'LECTURE', 'ROLE', 0),
('API:GET:/api/proprietaire/territoire/export', 'GET', '/api/proprietaire/territoire/export', 'LECTURE', 'ROLE', 0),
('API:GET:/api/proprietaire/territoire/export-xlsx', 'GET', '/api/proprietaire/territoire/export-xlsx', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/territoire/fusions/executer', 'POST', '/api/proprietaire/territoire/fusions/executer', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/fusions/simulation', 'POST', '/api/proprietaire/territoire/fusions/simulation', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/import/executer', 'POST', '/api/proprietaire/territoire/import/executer', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/import/previsualiser', 'POST', '/api/proprietaire/territoire/import/previsualiser', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/territoire/recherche', 'GET', '/api/proprietaire/territoire/recherche', 'LECTURE', 'ROLE', 0),
('API:GET:/api/proprietaire/territoire/tableau-de-bord', 'GET', '/api/proprietaire/territoire/tableau-de-bord', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/territoire/unites', 'POST', '/api/proprietaire/territoire/unites', 'COMMANDE', 'ROLE', 1),
('API:DELETE:/api/proprietaire/territoire/unites/:id', 'DELETE', '/api/proprietaire/territoire/unites/:id', 'SUPPRESSION', 'ROLE', 1),
('API:PUT:/api/proprietaire/territoire/unites/:id', 'PUT', '/api/proprietaire/territoire/unites/:id', 'REMPLACEMENT', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/unites/:id/archiver', 'POST', '/api/proprietaire/territoire/unites/:id/archiver', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/unites/:id/rattachement', 'POST', '/api/proprietaire/territoire/unites/:id/rattachement', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/unites/:id/reactiver', 'POST', '/api/proprietaire/territoire/unites/:id/reactiver', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/unites/:id/simuler-rattachement', 'POST', '/api/proprietaire/territoire/unites/:id/simuler-rattachement', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/unites/:id/valider', 'POST', '/api/proprietaire/territoire/unites/:id/valider', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/proprietaire/territoire/unites/valider-lot', 'POST', '/api/proprietaire/territoire/unites/valider-lot', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/proprietaire/utilisateurs', 'GET', '/api/proprietaire/utilisateurs', 'LECTURE', 'ROLE', 0),
('API:POST:/api/proprietaire/utilisateurs/:id/reinitialiser-acces', 'POST', '/api/proprietaire/utilisateurs/:id/reinitialiser-acces', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/proprietaire/utilisateurs/:id/statut', 'PATCH', '/api/proprietaire/utilisateurs/:id/statut', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/provincial/:provinceId/profil', 'GET', '/api/provincial/:provinceId/profil', 'LECTURE', 'ROLE', 0);

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis)
VALUES
('API:GET:/api/provincial/audit', 'GET', '/api/provincial/audit', 'LECTURE', 'ROLE', 0),
('API:GET:/api/provincial/corrections', 'GET', '/api/provincial/corrections', 'LECTURE', 'ROLE', 0),
('API:GET:/api/provincial/expeditions', 'GET', '/api/provincial/expeditions', 'LECTURE', 'ROLE', 0),
('API:GET:/api/provincial/expeditions/:id', 'GET', '/api/provincial/expeditions/:id', 'LECTURE', 'ROLE', 0),
('API:GET:/api/provincial/expeditions/:id/pv', 'GET', '/api/provincial/expeditions/:id/pv', 'LECTURE', 'ROLE', 0),
('API:POST:/api/provincial/expeditions/:id/pv', 'POST', '/api/provincial/expeditions/:id/pv', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/provincial/expeditions/:id/reception', 'POST', '/api/provincial/expeditions/:id/reception', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/provincial/observations', 'GET', '/api/provincial/observations', 'LECTURE', 'ROLE', 0),
('API:POST:/api/provincial/observations/:id/reponse', 'POST', '/api/provincial/observations/:id/reponse', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/provincial/operations-centrales', 'GET', '/api/provincial/operations-centrales', 'LECTURE', 'ROLE', 0),
('API:GET:/api/provincial/operations-centrales/:id', 'GET', '/api/provincial/operations-centrales/:id', 'LECTURE', 'ROLE', 0),
('API:PATCH:/api/provincial/operations-centrales/:id/dossier', 'PATCH', '/api/provincial/operations-centrales/:id/dossier', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/rapports/:type/apercu', 'GET', '/api/rapports/:type/apercu', 'LECTURE', 'ROLE', 0),
('API:POST:/api/rapports/:type/export', 'POST', '/api/rapports/:type/export', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/rapports/archives', 'GET', '/api/rapports/archives', 'LECTURE', 'ROLE', 0),
('API:GET:/api/rapports/archives/:id', 'GET', '/api/rapports/archives/:id', 'LECTURE', 'ROLE', 0),
('API:GET:/api/rapports/archives/reconciliation', 'GET', '/api/rapports/archives/reconciliation', 'LECTURE', 'ROLE', 0),
('API:POST:/api/rapports/archives/reconciliation', 'POST', '/api/rapports/archives/reconciliation', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/rapports/catalogue', 'GET', '/api/rapports/catalogue', 'LECTURE', 'ROLE', 0),
('API:GET:/api/rapports/filtres', 'GET', '/api/rapports/filtres', 'LECTURE', 'ROLE', 0),
('API:GET:/api/rapports/indicateurs-carte', 'GET', '/api/rapports/indicateurs-carte', 'LECTURE', 'ROLE', 0),
('API:GET:/api/rapports/tableau-de-bord', 'GET', '/api/rapports/tableau-de-bord', 'LECTURE', 'ROLE', 0),
('API:GET:/api/sante', 'GET', '/api/sante', 'LECTURE', 'PUBLIC', 0),
('API:GET:/api/stocks/ajustements-stock', 'GET', '/api/stocks/ajustements-stock', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/ajustements-stock', 'POST', '/api/stocks/ajustements-stock', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/stocks/articles', 'GET', '/api/stocks/articles', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/articles', 'POST', '/api/stocks/articles', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/stocks/articles/:id', 'PATCH', '/api/stocks/articles/:id', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/stocks/categories-aide', 'GET', '/api/stocks/categories-aide', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/categories-aide', 'POST', '/api/stocks/categories-aide', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/stocks/categories-aide/:id', 'PATCH', '/api/stocks/categories-aide/:id', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/stocks/conditionnements', 'GET', '/api/stocks/conditionnements', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/conditionnements', 'POST', '/api/stocks/conditionnements', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/stocks/conditionnements/:id', 'PATCH', '/api/stocks/conditionnements/:id', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/stocks/entrepots', 'GET', '/api/stocks/entrepots', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/entrepots', 'POST', '/api/stocks/entrepots', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/stocks/entrepots/:id', 'PATCH', '/api/stocks/entrepots/:id', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/stocks/lots-stock', 'GET', '/api/stocks/lots-stock', 'LECTURE', 'ROLE', 0),
('API:GET:/api/stocks/mouvements-stock', 'GET', '/api/stocks/mouvements-stock', 'LECTURE', 'ROLE', 0),
('API:GET:/api/stocks/mouvements-stock/:id', 'GET', '/api/stocks/mouvements-stock/:id', 'LECTURE', 'ROLE', 0),
('API:GET:/api/stocks/receptions-stock', 'GET', '/api/stocks/receptions-stock', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/receptions-stock', 'POST', '/api/stocks/receptions-stock', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/stocks/receptions-stock/:id', 'GET', '/api/stocks/receptions-stock/:id', 'LECTURE', 'ROLE', 0),
('API:GET:/api/stocks/soldes-stock', 'GET', '/api/stocks/soldes-stock', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/transferts-stock', 'POST', '/api/stocks/transferts-stock', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/stocks/unites-mesure', 'GET', '/api/stocks/unites-mesure', 'LECTURE', 'ROLE', 0),
('API:POST:/api/stocks/unites-mesure', 'POST', '/api/stocks/unites-mesure', 'COMMANDE', 'ROLE', 1),
('API:PATCH:/api/stocks/unites-mesure/:id', 'PATCH', '/api/stocks/unites-mesure/:id', 'MODIFICATION', 'ROLE', 1),
('API:GET:/api/territoire/arrondissements', 'GET', '/api/territoire/arrondissements', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/cantons', 'GET', '/api/territoire/cantons', 'LECTURE', 'ROLE', 0);

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis)
VALUES
('API:GET:/api/territoire/carres', 'GET', '/api/territoire/carres', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/communes', 'GET', '/api/territoire/communes', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/departements', 'GET', '/api/territoire/departements', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/localites', 'GET', '/api/territoire/localites', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/localites/:id', 'GET', '/api/territoire/localites/:id', 'LECTURE', 'ROLE', 0),
('API:POST:/api/territoire/propositions/corrections', 'POST', '/api/territoire/propositions/corrections', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/territoire/propositions/localites', 'POST', '/api/territoire/propositions/localites', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/territoire/propositions/quartiers', 'POST', '/api/territoire/propositions/quartiers', 'COMMANDE', 'ROLE', 1),
('API:POST:/api/territoire/propositions/sites-humanitaires', 'POST', '/api/territoire/propositions/sites-humanitaires', 'COMMANDE', 'ROLE', 1),
('API:GET:/api/territoire/provinces', 'GET', '/api/territoire/provinces', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/quartiers', 'GET', '/api/territoire/quartiers', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/rattachements-territoriaux', 'GET', '/api/territoire/rattachements-territoriaux', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/sites-humanitaires', 'GET', '/api/territoire/sites-humanitaires', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/sites-humanitaires/:id', 'GET', '/api/territoire/sites-humanitaires/:id', 'LECTURE', 'ROLE', 0),
('API:GET:/api/territoire/sous-prefectures', 'GET', '/api/territoire/sous-prefectures', 'LECTURE', 'ROLE', 0),
('API:POST:/api/territoire/unites-dynamiques', 'POST', '/api/territoire/unites-dynamiques', 'COMMANDE', 'ROLE', 1);

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('ADMIN_CENTRAL', 'API:GET:/api/administration/comptes/consultation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/consultation', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/administration/comptes/consultation/:id/perimetre', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/consultation/:id/reactiver', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/consultation/:id/renvoyer-invitation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/consultation/:id/revoquer-sessions', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/consultation/:id/suspendre', ''),
('ADMIN_CENTRAL', 'API:GET:/api/administration/comptes/decisions', ''),
('ADMIN_CENTRAL', 'API:GET:/api/administration/comptes/delegues', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:id/approuver', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:id/refuser', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:id/remplacer/:utilisateurId', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:utilisateurId/reactiver', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:utilisateurId/renvoyer-invitation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:utilisateurId/revoquer-sessions', ''),
('ADMIN_CENTRAL', 'API:POST:/api/administration/comptes/delegues/:utilisateurId/suspendre', ''),
('ADMIN_CENTRAL', 'API:GET:/api/administration/comptes/delegues/comptes', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements/:id/destinations', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements/:id/destinations', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements/:id/destinations', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements/:id/expeditions', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements/:id/expeditions', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements/:id/expeditions', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements/:id/receptions', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements/:id/receptions', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements/:id/receptions', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements/:id/receptions/:receptionId', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements/:id/receptions/:receptionId', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements/:id/receptions/:receptionId', ''),
('PROPRIETAIRE', 'API:GET:/api/approvisionnements/:id/repartition', ''),
('ADMIN_CENTRAL', 'API:GET:/api/approvisionnements/:id/repartition', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/approvisionnements/:id/repartition', ''),
('PROPRIETAIRE', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('ADMIN_CENTRAL', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/auth/changer-mot-de-passe-initial', ''),
('PROPRIETAIRE', 'API:POST:/api/auth/deconnexion', ''),
('ADMIN_CENTRAL', 'API:POST:/api/auth/deconnexion', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/auth/deconnexion', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/auth/deconnexion', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/auth/deconnexion', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('SUPERVISEUR_TERRAIN', 'API:POST:/api/auth/deconnexion', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/auth/deconnexion', ''),
('PROPRIETAIRE', 'API:POST:/api/auth/mfa/confirmer', ''),
('ADMIN_CENTRAL', 'API:POST:/api/auth/mfa/confirmer', ''),
('PROPRIETAIRE', 'API:POST:/api/auth/mfa/initialiser', ''),
('ADMIN_CENTRAL', 'API:POST:/api/auth/mfa/initialiser', ''),
('PROPRIETAIRE', 'API:POST:/api/auth/mfa/reinitialiser/:utilisateurId', ''),
('PROPRIETAIRE', 'API:GET:/api/auth/mfa/statut', ''),
('ADMIN_CENTRAL', 'API:GET:/api/auth/mfa/statut', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/auth/mfa/statut', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/auth/mfa/statut', ''),
('RESPONSABLE_STOCK', 'API:GET:/api/auth/mfa/statut', ''),
('SUPERVISEUR_TERRAIN', 'API:GET:/api/auth/mfa/statut', ''),
('AGENT_DISTRIBUTION', 'API:GET:/api/auth/mfa/statut', ''),
('PROPRIETAIRE', 'API:GET:/api/auth/session', ''),
('ADMIN_CENTRAL', 'API:GET:/api/auth/session', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/auth/session', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/auth/session', ''),
('RESPONSABLE_STOCK', 'API:GET:/api/auth/session', ''),
('SUPERVISEUR_TERRAIN', 'API:GET:/api/auth/session', ''),
('AGENT_DISTRIBUTION', 'API:GET:/api/auth/session', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/approvisionnements', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/approvisionnements/:id/cloture', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/approvisionnements/:id/expeditions', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/approvisionnements/:id/receptions/:receptionId/rapprochement', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/approvisionnements/:id/validation', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/approvisionnements/referentiels/entrepots-centraux', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/audit', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/controle/corrections', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/controle/distributions/:id/cloture', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/controle/fermetures', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/controle/observations', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/controle/observations', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/controle/observations/:id/cloture', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/controle/operations', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/controle/synthese', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/distributions/:id/cloture', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/distributions/:id/corrections/:correctionId/validation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/distributions/:id/retour-correction', ''),
('ADMIN_CENTRAL', 'API:GET:/api/central/referentiel-territorial/propositions', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/referentiel-territorial/propositions/:type/:id/decision', ''),
('PROPRIETAIRE', 'API:GET:/api/compte', ''),
('ADMIN_CENTRAL', 'API:GET:/api/compte', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/compte', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/compte', ''),
('RESPONSABLE_STOCK', 'API:GET:/api/compte', ''),
('SUPERVISEUR_TERRAIN', 'API:GET:/api/compte', ''),
('AGENT_DISTRIBUTION', 'API:GET:/api/compte', ''),
('PROPRIETAIRE', 'API:PATCH:/api/compte', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/compte', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('DELEGUE_PROVINCIAL', 'API:PATCH:/api/compte', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:PATCH:/api/compte', ''),
('RESPONSABLE_STOCK', 'API:PATCH:/api/compte', ''),
('SUPERVISEUR_TERRAIN', 'API:PATCH:/api/compte', ''),
('AGENT_DISTRIBUTION', 'API:PATCH:/api/compte', ''),
('PROPRIETAIRE', 'API:POST:/api/compte/courriel', ''),
('ADMIN_CENTRAL', 'API:POST:/api/compte/courriel', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/compte/courriel', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/compte/courriel', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/compte/courriel', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/compte/courriel', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/compte/courriel', ''),
('PROPRIETAIRE', 'API:POST:/api/compte/courriel/verifier', ''),
('ADMIN_CENTRAL', 'API:POST:/api/compte/courriel/verifier', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/compte/courriel/verifier', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/compte/courriel/verifier', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/compte/courriel/verifier', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/compte/courriel/verifier', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/compte/courriel/verifier', ''),
('PROPRIETAIRE', 'API:POST:/api/compte/mot-de-passe', ''),
('ADMIN_CENTRAL', 'API:POST:/api/compte/mot-de-passe', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/compte/mot-de-passe', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/compte/mot-de-passe', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/compte/mot-de-passe', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/compte/mot-de-passe', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/compte/mot-de-passe', ''),
('PROPRIETAIRE', 'API:GET:/api/compte/sessions', ''),
('ADMIN_CENTRAL', 'API:GET:/api/compte/sessions', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/compte/sessions', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/compte/sessions', ''),
('RESPONSABLE_STOCK', 'API:GET:/api/compte/sessions', ''),
('SUPERVISEUR_TERRAIN', 'API:GET:/api/compte/sessions', ''),
('AGENT_DISTRIBUTION', 'API:GET:/api/compte/sessions', ''),
('PROPRIETAIRE', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('ADMIN_CENTRAL', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/compte/sessions/revoquer-autres', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/:id', ''),
('DELEGUE_PROVINCIAL', 'API:PUT:/api/distributions/:id', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/corrections', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/declaration-fin', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/execution', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/:id/menages', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/:id/menages', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/:id/menages', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/:id/menages/:menageDistributionId/allocations', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/:id/menages/:menageDistributionId/allocations', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/:id/menages/:menageDistributionId/allocations', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/preparation', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/:id/pv', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/:id/pv', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/:id/pv', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/pv', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/remises', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/:id/synthese', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/:id/synthese', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/:id/synthese', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/distributions/:id/validation', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/menages', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/menages', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/menages', ''),
('PROPRIETAIRE', 'API:GET:/api/distributions/referentiels', ''),
('ADMIN_CENTRAL', 'API:GET:/api/distributions/referentiels', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/distributions/referentiels', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/listes-beneficiaires', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/listes-beneficiaires', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/listes-beneficiaires', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/listes-beneficiaires', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/gestion/listes-beneficiaires', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/listes-beneficiaires/:listeId/export', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/listes-beneficiaires/:listeId/export', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/listes-beneficiaires/:listeId/export', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/listes-beneficiaires/:listeId/inscriptions', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/gestion/listes-beneficiaires/:listeId/inscriptions', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/listes-beneficiaires/:listeId/menages', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/listes-beneficiaires/:listeId/menages', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/listes-beneficiaires/:listeId/menages', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/menages', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/menages', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/menages', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/menages', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/gestion/menages', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/menages/:menageId', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/menages/:menageId', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/menages/:menageId', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/menages/:menageId/validation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/menages/importations', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/gestion/menages/importations', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/partenaires', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/partenaires', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/partenaires', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('PROPRIETAIRE', 'API:POST:/api/gestion/partenaires', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/partenaires', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/gestion/partenaires', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/partenaires/:partenaireId', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/partenaires/:partenaireId', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/partenaires/:partenaireId', ''),
('PROPRIETAIRE', 'API:POST:/api/gestion/partenaires/:partenaireId/validation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/partenaires/:partenaireId/validation', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/referentiels', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/referentiels', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/referentiels', ''),
('PROPRIETAIRE', 'API:GET:/api/gestion/signalements-doublons', ''),
('ADMIN_CENTRAL', 'API:GET:/api/gestion/signalements-doublons', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/gestion/signalements-doublons', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/signalements-doublons/:signalementId/decision', ''),
('ADMIN_CENTRAL', 'API:POST:/api/gestion/signalements-doublons/:signalementId/reouverture', ''),
('PROPRIETAIRE', 'API:GET:/api/notifications', ''),
('ADMIN_CENTRAL', 'API:GET:/api/notifications', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/notifications', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/notifications', ''),
('RESPONSABLE_STOCK', 'API:GET:/api/notifications', ''),
('SUPERVISEUR_TERRAIN', 'API:GET:/api/notifications', ''),
('AGENT_DISTRIBUTION', 'API:GET:/api/notifications', ''),
('PROPRIETAIRE', 'API:POST:/api/notifications/:id/lecture', ''),
('ADMIN_CENTRAL', 'API:POST:/api/notifications/:id/lecture', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/notifications/:id/lecture', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/notifications/:id/lecture', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/notifications/:id/lecture', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/notifications/:id/lecture', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/notifications/:id/lecture', ''),
('PROPRIETAIRE', 'API:POST:/api/notifications/lecture-toutes', ''),
('ADMIN_CENTRAL', 'API:POST:/api/notifications/lecture-toutes', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/notifications/lecture-toutes', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/notifications/lecture-toutes', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/notifications/lecture-toutes', ''),
('SUPERVISEUR_TERRAIN', 'API:POST:/api/notifications/lecture-toutes', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/notifications/lecture-toutes', ''),
('PROPRIETAIRE', 'API:GET:/api/operations-centrales', ''),
('ADMIN_CENTRAL', 'API:GET:/api/operations-centrales', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/operations-centrales', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/operations-centrales', ''),
('ADMIN_CENTRAL', 'API:POST:/api/operations-centrales', ''),
('PROPRIETAIRE', 'API:GET:/api/operations-centrales/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/operations-centrales/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/operations-centrales/:id', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/operations-centrales/:id', ''),
('ADMIN_CENTRAL', 'API:PUT:/api/operations-centrales/:id', ''),
('ADMIN_CENTRAL', 'API:POST:/api/operations-centrales/:id/approbations', ''),
('PROPRIETAIRE', 'API:GET:/api/operations-centrales/:id/consolidation', ''),
('ADMIN_CENTRAL', 'API:GET:/api/operations-centrales/:id/consolidation', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('DELEGUE_PROVINCIAL', 'API:GET:/api/operations-centrales/:id/consolidation', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/operations-centrales/:id/consolidation', ''),
('ADMIN_CENTRAL', 'API:POST:/api/operations-centrales/:id/documents', ''),
('PROPRIETAIRE', 'API:GET:/api/operations-centrales/:id/documents/:docId', ''),
('ADMIN_CENTRAL', 'API:GET:/api/operations-centrales/:id/documents/:docId', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/operations-centrales/:id/documents/:docId', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:GET:/api/operations-centrales/:id/documents/:docId', ''),
('ADMIN_CENTRAL', 'API:POST:/api/operations-centrales/:id/statut', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/audit', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/donnees-test/historique', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/donnees-test/nettoyage-lot', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/donnees-test/operations', ''),
('PROPRIETAIRE', 'API:DELETE:/api/proprietaire/donnees-test/operations/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/donnees-test/operations/:id/apercu', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/donnees-test/operations/:id/reclassifier', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/donnees-test/operations/:id/supprimer', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/donnees-test/reconciliation-r2', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/donnees-test/reconciliation-r2/traiter', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/referentiel-territorial/propositions', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/referentiel-territorial/propositions/:type/:id/decision', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/arborescence', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/audits', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/doublons', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/export', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/export-xlsx', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/fusions/executer', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/fusions/simulation', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/import/executer', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/import/previsualiser', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/recherche', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/territoire/tableau-de-bord', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites', ''),
('PROPRIETAIRE', 'API:DELETE:/api/proprietaire/territoire/unites/:id', ''),
('PROPRIETAIRE', 'API:PUT:/api/proprietaire/territoire/unites/:id', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites/:id/archiver', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites/:id/rattachement', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites/:id/reactiver', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites/:id/simuler-rattachement', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites/:id/valider', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/territoire/unites/valider-lot', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/utilisateurs', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/utilisateurs/:id/reinitialiser-acces', ''),
('PROPRIETAIRE', 'API:PATCH:/api/proprietaire/utilisateurs/:id/statut', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/:provinceId/profil', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/audit', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/corrections', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/expeditions', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/expeditions/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/expeditions/:id/pv', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/provincial/expeditions/:id/pv', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('DELEGUE_PROVINCIAL', 'API:POST:/api/provincial/expeditions/:id/reception', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/observations', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/provincial/observations/:id/reponse', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/operations-centrales', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/provincial/operations-centrales/:id', ''),
('DELEGUE_PROVINCIAL', 'API:PATCH:/api/provincial/operations-centrales/:id/dossier', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/:type/apercu', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/:type/apercu', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/:type/apercu', ''),
('PROPRIETAIRE', 'API:POST:/api/rapports/:type/export', ''),
('ADMIN_CENTRAL', 'API:POST:/api/rapports/:type/export', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/rapports/:type/export', ''),
('CONSULTATION_INSTITUTIONNELLE', 'API:POST:/api/rapports/:type/export', 'RAPPORT_NON_SENSIBLE'),
('PROPRIETAIRE', 'API:GET:/api/rapports/archives', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/archives', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/archives', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/archives/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/archives/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/archives/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/archives/reconciliation', ''),
('PROPRIETAIRE', 'API:POST:/api/rapports/archives/reconciliation', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/catalogue', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/catalogue', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/catalogue', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/filtres', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/filtres', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/filtres', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/indicateurs-carte', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/indicateurs-carte', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/indicateurs-carte', ''),
('PROPRIETAIRE', 'API:GET:/api/rapports/tableau-de-bord', ''),
('ADMIN_CENTRAL', 'API:GET:/api/rapports/tableau-de-bord', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/rapports/tableau-de-bord', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/ajustements-stock', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/ajustements-stock', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/ajustements-stock', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/ajustements-stock', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/stocks/ajustements-stock', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/articles', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/articles', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/articles', ''),
('PROPRIETAIRE', 'API:POST:/api/stocks/articles', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/articles', ''),
('PROPRIETAIRE', 'API:PATCH:/api/stocks/articles/:id', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/stocks/articles/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/categories-aide', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/categories-aide', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/categories-aide', ''),
('PROPRIETAIRE', 'API:POST:/api/stocks/categories-aide', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/categories-aide', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('PROPRIETAIRE', 'API:PATCH:/api/stocks/categories-aide/:id', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/stocks/categories-aide/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/conditionnements', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/conditionnements', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/conditionnements', ''),
('PROPRIETAIRE', 'API:POST:/api/stocks/conditionnements', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/conditionnements', ''),
('PROPRIETAIRE', 'API:PATCH:/api/stocks/conditionnements/:id', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/stocks/conditionnements/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/entrepots', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/entrepots', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/entrepots', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/entrepots', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/stocks/entrepots', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/stocks/entrepots/:id', ''),
('DELEGUE_PROVINCIAL', 'API:PATCH:/api/stocks/entrepots/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/lots-stock', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/lots-stock', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/lots-stock', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/mouvements-stock', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/mouvements-stock', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/mouvements-stock', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/mouvements-stock/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/mouvements-stock/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/mouvements-stock/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/receptions-stock', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/receptions-stock', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/receptions-stock', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/receptions-stock', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/stocks/receptions-stock', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/receptions-stock/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/receptions-stock/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/receptions-stock/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/soldes-stock', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/soldes-stock', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/soldes-stock', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/transferts-stock', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/stocks/transferts-stock', ''),
('PROPRIETAIRE', 'API:GET:/api/stocks/unites-mesure', ''),
('ADMIN_CENTRAL', 'API:GET:/api/stocks/unites-mesure', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/stocks/unites-mesure', ''),
('PROPRIETAIRE', 'API:POST:/api/stocks/unites-mesure', ''),
('ADMIN_CENTRAL', 'API:POST:/api/stocks/unites-mesure', ''),
('PROPRIETAIRE', 'API:PATCH:/api/stocks/unites-mesure/:id', ''),
('ADMIN_CENTRAL', 'API:PATCH:/api/stocks/unites-mesure/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/arrondissements', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/arrondissements', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/arrondissements', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/cantons', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/cantons', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/cantons', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/carres', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/carres', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/carres', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/communes', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/communes', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/communes', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/departements', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/departements', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/departements', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/localites', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/localites', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/localites', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/localites/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/localites/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/localites/:id', ''),
('PROPRIETAIRE', 'API:POST:/api/territoire/propositions/corrections', ''),
('ADMIN_CENTRAL', 'API:POST:/api/territoire/propositions/corrections', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/territoire/propositions/corrections', ''),
('PROPRIETAIRE', 'API:POST:/api/territoire/propositions/localites', ''),
('ADMIN_CENTRAL', 'API:POST:/api/territoire/propositions/localites', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/territoire/propositions/localites', ''),
('PROPRIETAIRE', 'API:POST:/api/territoire/propositions/quartiers', ''),
('ADMIN_CENTRAL', 'API:POST:/api/territoire/propositions/quartiers', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/territoire/propositions/quartiers', ''),
('PROPRIETAIRE', 'API:POST:/api/territoire/propositions/sites-humanitaires', ''),
('ADMIN_CENTRAL', 'API:POST:/api/territoire/propositions/sites-humanitaires', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/territoire/propositions/sites-humanitaires', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/provinces', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/provinces', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/provinces', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/quartiers', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/quartiers', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/quartiers', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/rattachements-territoriaux', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/rattachements-territoriaux', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/rattachements-territoriaux', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/sites-humanitaires', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/sites-humanitaires', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/sites-humanitaires', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/sites-humanitaires/:id', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/sites-humanitaires/:id', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/sites-humanitaires/:id', ''),
('PROPRIETAIRE', 'API:GET:/api/territoire/sous-prefectures', ''),
('ADMIN_CENTRAL', 'API:GET:/api/territoire/sous-prefectures', ''),
('DELEGUE_PROVINCIAL', 'API:GET:/api/territoire/sous-prefectures', ''),
('PROPRIETAIRE', 'API:POST:/api/territoire/unites-dynamiques', ''),
('ADMIN_CENTRAL', 'API:POST:/api/territoire/unites-dynamiques', ''),
('DELEGUE_PROVINCIAL', 'API:POST:/api/territoire/unites-dynamiques', ''),
('RESPONSABLE_STOCK', 'API:POST:/api/territoire/unites-dynamiques', '');

INSERT INTO roles_permissions (role_code, permission_code, condition_code)
VALUES
('SUPERVISEUR_TERRAIN', 'API:POST:/api/territoire/unites-dynamiques', ''),
('AGENT_DISTRIBUTION', 'API:POST:/api/territoire/unites-dynamiques', '');

-- Rétro-remplissage sans modifier les tables ou colonnes sources.
-- Plusieurs profils terrain actifs pour le même compte sont ambigus dans
-- l'ancien CASE : ils ne sont pas devinés et produiront un écart observable.
WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain WHERE statut = 'ACTIF' GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.* FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT u.id AS utilisateur_id,
    CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
         WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
         WHEN pu.id IS NOT NULL THEN pu.role_terrain ELSE u.role END AS role_code,
    u.province_id AS province_utilisateur, pu.province_id AS province_profil,
    pu.entrepot_id, cc.id AS compte_consultation_id, cc.perimetre AS perimetre_consultation
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO portees_acces (id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut)
SELECT 'pa:' || utilisateur_id || ':NATIONALE:NATIONALE', utilisateur_id, 'NATIONALE', NULL, 0, 'ROLES_NATIONAUX', 'ACTIF'
FROM roles_effectifs WHERE role_code IN ('PROPRIETAIRE', 'ADMIN_CENTRAL');

WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain WHERE statut = 'ACTIF' GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.* FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT u.id AS utilisateur_id,
    CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
         WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
         WHEN pu.id IS NOT NULL THEN pu.role_terrain ELSE u.role END AS role_code,
    cc.perimetre AS perimetre_consultation
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO portees_acces (id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut)
SELECT 'pa:' || utilisateur_id || ':NATIONALE:NATIONALE', utilisateur_id, 'NATIONALE', NULL, 0, 'COMPTES_CONSULTATION', 'ACTIF'
FROM roles_effectifs WHERE role_code = 'CONSULTATION_INSTITUTIONNELLE' AND perimetre_consultation = 'NATIONAL';

WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain WHERE statut = 'ACTIF' GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.* FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT u.id AS utilisateur_id,
    CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
         WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
         WHEN pu.id IS NOT NULL THEN pu.role_terrain ELSE u.role END AS role_code,
    u.province_id AS province_utilisateur
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO portees_acces (id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut)
SELECT 'pa:' || utilisateur_id || ':PROVINCE:' || province_utilisateur, utilisateur_id, 'PROVINCE', province_utilisateur, 1, 'UTILISATEURS', 'ACTIF'
FROM roles_effectifs WHERE role_code = 'DELEGUE_PROVINCIAL' AND province_utilisateur IS NOT NULL;

WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain WHERE statut = 'ACTIF' GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.* FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT u.id AS utilisateur_id,
    CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
         WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
         WHEN pu.id IS NOT NULL THEN pu.role_terrain ELSE u.role END AS role_code,
    pu.province_id AS province_profil
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO portees_acces (id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut)
SELECT 'pa:' || utilisateur_id || ':PROVINCE:' || province_profil, utilisateur_id, 'PROVINCE', province_profil, 1, 'PROFILS_OPERATIONNELS_TERRAIN', 'ACTIF'
FROM roles_effectifs WHERE role_code IN ('SUPERVISEUR_TERRAIN', 'AGENT_DISTRIBUTION') AND province_profil IS NOT NULL;

WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain WHERE statut = 'ACTIF' GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.* FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT u.id AS utilisateur_id,
    CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
         WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
         WHEN pu.id IS NOT NULL THEN pu.role_terrain ELSE u.role END AS role_code,
    pu.entrepot_id, pu.province_id AS province_profil
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO portees_acces (id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut)
SELECT 'pa:' || r.utilisateur_id || ':LOCALITE:' || e.localite_id, r.utilisateur_id, 'LOCALITE', e.localite_id, 0, 'ENTREPOTS', 'ACTIF'
FROM roles_effectifs r
JOIN entrepots e ON e.id = r.entrepot_id
WHERE r.role_code = 'RESPONSABLE_STOCK'
  AND e.niveau = 'PROVINCIAL' AND e.actif = 1
  AND e.province_id = r.province_profil AND e.localite_id IS NOT NULL;

WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain WHERE statut = 'ACTIF' GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.* FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT u.id AS utilisateur_id,
    CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
         WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
         WHEN pu.id IS NOT NULL THEN pu.role_terrain ELSE u.role END AS role_code,
    cc.id AS compte_consultation_id
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO portees_acces (id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut)
SELECT 'pa:' || r.utilisateur_id || ':PROVINCE:' || p.province_id, r.utilisateur_id, 'PROVINCE', p.province_id, 1, 'PERIMETRES_PROVINCIAUX_CONSULTATION', 'ACTIF'
FROM roles_effectifs r
JOIN perimetres_provinciaux_consultation p ON p.compte_consultation_id = r.compte_consultation_id
WHERE r.role_code = 'CONSULTATION_INSTITUTIONNELLE';

WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain
  WHERE statut = 'ACTIF'
  GROUP BY utilisateur_id
),
profils_uniques AS (
  SELECT p.*
  FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
),
roles_effectifs AS (
  SELECT
    u.id AS utilisateur_id,
    CASE
      WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
      WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
      WHEN pu.id IS NOT NULL THEN pu.role_terrain
      ELSE u.role
    END AS role_code,
    CASE
      WHEN cc.id IS NOT NULL THEN 'COMPTES_CONSULTATION'
      WHEN COALESCE(pc.nombre, 0) > 1 THEN 'UTILISATEURS'
      WHEN pu.id IS NOT NULL THEN 'PROFILS_OPERATIONNELS_TERRAIN'
      ELSE 'UTILISATEURS'
    END AS source_legacy
  FROM utilisateurs u
  LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
  LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
  LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id
)
INSERT INTO affectations_roles (
  id, utilisateur_id, role_code, portee_id, source_legacy, statut
)
SELECT
  'ar:' || r.utilisateur_id || ':' || r.role_code || ':' || COALESCE(p.id, 'SANS_PORTEE'),
  r.utilisateur_id, r.role_code, p.id, r.source_legacy, 'ACTIF'
FROM roles_effectifs r
LEFT JOIN portees_acces p ON p.utilisateur_id = r.utilisateur_id AND p.statut = 'ACTIF'
WHERE r.role_code IS NOT NULL
;

