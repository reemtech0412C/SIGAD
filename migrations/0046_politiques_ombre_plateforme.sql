-- B3.2: extension Shadow des 8 routes de la console Plateforme (drapeaux et approbations), reprises à l'identique du catalogue Legacy.
-- Aucune permission opérationnelle n'est modifiée; le middleware Legacy reste décideur.

INSERT INTO permissions (code, methode, chemin, action, mode_acces, csrf_requis, source) VALUES
('API:GET:/api/proprietaire/plateforme/approbations', 'GET', '/api/proprietaire/plateforme/approbations', 'LECTURE', 'ROLE', 0, 'CATALOGUE_B3_2_PLATEFORME'),
('API:POST:/api/proprietaire/plateforme/approbations', 'POST', '/api/proprietaire/plateforme/approbations', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_PLATEFORME'),
('API:POST:/api/proprietaire/plateforme/approbations/:id/annuler', 'POST', '/api/proprietaire/plateforme/approbations/:id/annuler', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_PLATEFORME'),
('API:POST:/api/proprietaire/plateforme/approbations/:id/approuver', 'POST', '/api/proprietaire/plateforme/approbations/:id/approuver', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_PLATEFORME'),
('API:POST:/api/proprietaire/plateforme/approbations/:id/executer', 'POST', '/api/proprietaire/plateforme/approbations/:id/executer', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_PLATEFORME'),
('API:POST:/api/proprietaire/plateforme/approbations/:id/refuser', 'POST', '/api/proprietaire/plateforme/approbations/:id/refuser', 'COMMANDE', 'ROLE', 1, 'CATALOGUE_B3_2_PLATEFORME'),
('API:GET:/api/proprietaire/plateforme/drapeaux', 'GET', '/api/proprietaire/plateforme/drapeaux', 'LECTURE', 'ROLE', 0, 'CATALOGUE_B3_2_PLATEFORME'),
('API:PUT:/api/proprietaire/plateforme/drapeaux/:code', 'PUT', '/api/proprietaire/plateforme/drapeaux/:code', 'REMPLACEMENT', 'ROLE', 1, 'CATALOGUE_B3_2_PLATEFORME');

INSERT INTO roles_permissions (role_code, permission_code, condition_code) VALUES
('PROPRIETAIRE', 'API:GET:/api/proprietaire/plateforme/approbations', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/plateforme/approbations', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/plateforme/approbations/:id/annuler', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/plateforme/approbations/:id/approuver', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/plateforme/approbations/:id/executer', ''),
('PROPRIETAIRE', 'API:POST:/api/proprietaire/plateforme/approbations/:id/refuser', ''),
('PROPRIETAIRE', 'API:GET:/api/proprietaire/plateforme/drapeaux', ''),
('PROPRIETAIRE', 'API:PUT:/api/proprietaire/plateforme/drapeaux/:code', '');

