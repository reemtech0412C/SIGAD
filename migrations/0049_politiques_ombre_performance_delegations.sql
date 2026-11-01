-- B3.2: extension Shadow de la route centrale de performance des délégations, reprises à l'identique du catalogue Legacy.
-- Aucune permission opérationnelle n'est modifiée; le middleware Legacy reste décideur.

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis, source) VALUES
('API:GET:/api/central/performance-delegations', 'GET', '/api/central/performance-delegations', 'LECTURE', 'ROLE', 0, 'CATALOGUE_B3_3_CENTRAL');

INSERT INTO roles_permissions (role_code, permission_code, condition_code) VALUES
('ADMIN_CENTRAL', 'API:GET:/api/central/performance-delegations', '');

