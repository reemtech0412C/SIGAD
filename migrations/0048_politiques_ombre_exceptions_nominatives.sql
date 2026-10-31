-- B3.2: extension Shadow des 6 routes d'exceptions d'accès nominatif centrales, reprises à l'identique du catalogue Legacy.
-- Aucune permission opérationnelle n'est modifiée; le middleware Legacy reste décideur.

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis, source) VALUES
('API:GET:/api/central/exceptions-nominatives', 'GET', '/api/central/exceptions-nominatives', 'LECTURE', 'ROLE', 0, 'CATALOGUE_B3_2_CENTRAL'),
('API:POST:/api/central/exceptions-nominatives', 'POST', '/api/central/exceptions-nominatives', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_CENTRAL'),
('API:POST:/api/central/exceptions-nominatives/:id/annuler', 'POST', '/api/central/exceptions-nominatives/:id/annuler', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_CENTRAL'),
('API:POST:/api/central/exceptions-nominatives/:id/approuver', 'POST', '/api/central/exceptions-nominatives/:id/approuver', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_CENTRAL'),
('API:POST:/api/central/exceptions-nominatives/:id/executer', 'POST', '/api/central/exceptions-nominatives/:id/executer', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_CENTRAL'),
('API:POST:/api/central/exceptions-nominatives/:id/refuser', 'POST', '/api/central/exceptions-nominatives/:id/refuser', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_CENTRAL');

INSERT INTO roles_permissions (role_code, permission_code, condition_code) VALUES
('ADMIN_CENTRAL', 'API:GET:/api/central/exceptions-nominatives', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/exceptions-nominatives', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/exceptions-nominatives/:id/annuler', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/exceptions-nominatives/:id/approuver', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/exceptions-nominatives/:id/executer', ''),
('ADMIN_CENTRAL', 'API:POST:/api/central/exceptions-nominatives/:id/refuser', '');

