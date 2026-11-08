-- Tests des contraintes critiques (S1). Exécution :
--   docker compose exec -T db psql -U puls -d puls -v ON_ERROR_STOP=1 < infra/postgres/tests/constraints_test.sql
-- Tout est exécuté dans une transaction annulée à la fin : la base reste intacte.
-- Chaque test réussit si l'opération interdite lève bien une erreur.

BEGIN;

-- Jeu minimal
INSERT INTO users (id, email, password_hash, full_name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'owner1@test.ci', 'x', 'Boutique A'),
  ('00000000-0000-0000-0000-0000000000a2', 'owner2@test.ci', 'x', 'Boutique B'),
  ('00000000-0000-0000-0000-0000000000c1', 'client@test.ci',  'x', 'Client');
INSERT INTO shops (id, owner_id, name, slug, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Shop A', 'shop-a', 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'Shop B', 'shop-b', 'ACTIVE');
INSERT INTO categories (id, name, slug, commission_rate) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'Robes', 'robes', 15);
INSERT INTO products (id, shop_id, category_id, name, base_price_xof) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'Robe A', 10000),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 'Robe B', 12000);
INSERT INTO product_variants (id, product_id, shop_id, sku, size, color, price_xof) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'SKU-A-M', 'M', 'rouge', 10000),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'SKU-B-M', 'M', 'bleu',  12000);
INSERT INTO stock_locations (id, location_type, shop_id, name) VALUES
  ('00000000-0000-0000-0000-000000000101', 'SHOP', '00000000-0000-0000-0000-0000000000b1', 'Stock A');
INSERT INTO inventory (variant_id, location_id, quantity_available) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000101', 1);
INSERT INTO orders (id, order_number, user_id, shipping_address, subtotal_xof, total_xof) VALUES
  ('00000000-0000-0000-0000-000000000201', 'CMD-TEST-1', '00000000-0000-0000-0000-0000000000c1', '{}', 22000, 22000);
INSERT INTO shop_orders (id, order_id, shop_id, shop_order_number, subtotal_xof) VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000b1', 'CMD-TEST-1-A', 10000);

-- T1 : stock négatif impossible (réservation du dernier article deux fois)
DO $$
DECLARE r1 boolean; r2 boolean;
BEGIN
  r1 := reserve_stock('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000101', 1);
  r2 := reserve_stock('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000101', 1);
  IF r1 AND NOT r2 THEN RAISE NOTICE 'T1a OK : la 2e réservation du dernier article est refusée';
  ELSE RAISE EXCEPTION 'T1a ÉCHEC : survente possible (r1=%, r2=%)', r1, r2; END IF;
  BEGIN
    UPDATE inventory SET quantity_available = -1;
    RAISE EXCEPTION 'T1b ÉCHEC : stock négatif accepté';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T1b OK : stock négatif refusé';
  END;
END $$;

-- T2 : double paiement confirmé impossible sur une même commande
DO $$
BEGIN
  INSERT INTO payments (order_id, method, gateway, amount_xof, status, idempotency_key)
  VALUES ('00000000-0000-0000-0000-000000000201', 'WAVE', 'SIMULATED', 22000, 'CONFIRMED', 'idem-1');
  BEGIN
    INSERT INTO payments (order_id, method, gateway, amount_xof, status, idempotency_key)
    VALUES ('00000000-0000-0000-0000-000000000201', 'WAVE', 'SIMULATED', 22000, 'CONFIRMED', 'idem-2');
    RAISE EXCEPTION 'T2a ÉCHEC : deux paiements confirmés acceptés';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'T2a OK : second paiement confirmé refusé';
  END;
  BEGIN
    UPDATE payments SET amount_xof = 1 WHERE idempotency_key = 'idem-1';
    RAISE EXCEPTION 'T2b ÉCHEC : paiement confirmé modifié';
  EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'T2b OK : paiement confirmé verrouillé';
  END;
END $$;

-- T3 : mélange de boutiques dans une ligne de commande impossible
DO $$
BEGIN
  BEGIN
    -- variante de la boutique B rattachée à une sous-commande de la boutique A
    INSERT INTO order_items (shop_order_id, shop_id, variant_id, quantity, unit_price_xof, line_total_xof, product_name, sku)
    VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000b1',
            '00000000-0000-0000-0000-0000000000f2', 1, 12000, 12000, 'Robe B', 'SKU-B-M');
    RAISE EXCEPTION 'T3 ÉCHEC : ligne mélangeant deux boutiques acceptée';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'T3 OK : mélange de boutiques refusé';
  END;
END $$;

-- T4 : transition de statut interdite, puis transition valide historisée
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    UPDATE shop_orders SET status = 'LIVREE' WHERE id = '00000000-0000-0000-0000-000000000301';
    RAISE EXCEPTION 'T4a ÉCHEC : transition EN_ATTENTE_PAIEMENT -> LIVREE acceptée';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T4a OK : transition interdite refusée';
  END;
  UPDATE shop_orders SET status = 'PAYEE' WHERE id = '00000000-0000-0000-0000-000000000301';
  SELECT count(*) INTO n FROM order_status_history WHERE shop_order_id = '00000000-0000-0000-0000-000000000301';
  IF n = 2 THEN RAISE NOTICE 'T4b OK : historique enregistré (création + transition)';
  ELSE RAISE EXCEPTION 'T4b ÉCHEC : % ligne(s) d''historique au lieu de 2', n; END IF;
  BEGIN
    DELETE FROM order_status_history;
    RAISE EXCEPTION 'T4c ÉCHEC : historique supprimable';
  EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'T4c OK : historique en ajout seul';
  END;
END $$;

-- T5 : commission cohérente avec l'option A (MLD9) : 10 000 FCFA, 15 %, ligne remboursée -> commission 0, net 0
DO $$
BEGIN
  INSERT INTO commissions (shop_order_id, gross_xof, commission_rate, commission_xof, refunded_xof, net_xof)
  VALUES ('00000000-0000-0000-0000-000000000301', 10000, 15, 0, 10000, 0);
  RAISE NOTICE 'T5a OK : commission annulée sur la ligne remboursée';
  BEGIN
    UPDATE commissions SET commission_xof = 1500, net_xof = -1500;
    RAISE EXCEPTION 'T5b ÉCHEC : commission conservée sur article remboursé acceptée';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T5b OK : commission sur part remboursée refusée';
  END;
END $$;

ROLLBACK;
