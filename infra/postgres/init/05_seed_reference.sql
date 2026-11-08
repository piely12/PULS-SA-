-- PULS SA : données de référence (rôles, hub, transitions autorisées)

INSERT INTO roles (code, label) VALUES
  ('CUSTOMER',        'Client'),
  ('SHOP_OWNER',      'Responsable de boutique'),
  ('LOGISTICS_AGENT', 'Agent logistique'),
  ('COURIER',         'Livreur'),
  ('ADMIN',           'Administrateur');

INSERT INTO stock_locations (location_type, shop_id, name) VALUES ('HUB', NULL, 'Hub PULS Abidjan');

-- Transitions autorisées des sous-commandes (proposition à valider : le cahier donne les statuts, pas le graphe complet)
INSERT INTO shop_order_transitions (from_status, to_status) VALUES
  ('EN_ATTENTE_PAIEMENT', 'PAYEE'),
  ('EN_ATTENTE_PAIEMENT', 'ANNULEE'),
  ('PAYEE',               'ACCEPTEE_PAR_BOUTIQUE'),
  ('PAYEE',               'REFUSEE_PAR_BOUTIQUE'),
  ('PAYEE',               'ANNULEE'),                 -- annulation automatique après 2 h sans réponse
  ('ACCEPTEE_PAR_BOUTIQUE','EN_PREPARATION'),
  ('ACCEPTEE_PAR_BOUTIQUE','RUPTURE_STOCK'),
  ('EN_PREPARATION',      'PRETE_A_COLLECTER'),
  ('EN_PREPARATION',      'RUPTURE_STOCK'),
  ('PRETE_A_COLLECTER',   'COLLECTEE'),
  ('COLLECTEE',           'RECUE_AU_HUB'),
  ('RECUE_AU_HUB',        'CONTROLEE'),
  ('CONTROLEE',           'EN_LIVRAISON'),
  ('EN_LIVRAISON',        'LIVREE'),
  ('EN_LIVRAISON',        'ECHEC_LIVRAISON'),
  ('ECHEC_LIVRAISON',     'EN_LIVRAISON'),
  ('LIVREE',              'RETOUR_DEMANDE'),
  ('RETOUR_DEMANDE',      'LIVREE'),                  -- demande de retour refusée
  ('RETOUR_DEMANDE',      'RETOURNEE'),
  ('RETOURNEE',           'REMBOURSEE'),
  ('REFUSEE_PAR_BOUTIQUE','REMBOURSEE'),
  ('RUPTURE_STOCK',       'REMBOURSEE'),
  ('ANNULEE',             'REMBOURSEE');
