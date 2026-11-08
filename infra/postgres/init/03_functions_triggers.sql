-- PULS SA : fonctions et triggers (transitions de statut, tables en ajout seul, paiements confirmés, stock)

-- ===== Transitions de statut des sous-commandes (MLD4) =====
-- Le sens est contrôlé par la table shop_order_transitions ; chaque changement est historisé.
-- L'identité de l'acteur est lue dans le paramètre de session app.actor_id (à poser par l'API : SET LOCAL app.actor_id = '<uuid>').
CREATE FUNCTION trg_shop_order_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_history (shop_order_id, from_status, to_status, actor_id)
    VALUES (NEW.id, NULL, NEW.status, v_actor);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM shop_order_transitions
                   WHERE from_status = OLD.status AND to_status = NEW.status) THEN
      RAISE EXCEPTION 'Transition de statut interdite : % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO order_status_history (shop_order_id, from_status, to_status, actor_id, reason)
    VALUES (NEW.id, OLD.status, NEW.status, v_actor, NEW.refusal_reason);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER shop_orders_status_ins AFTER INSERT ON shop_orders
  FOR EACH ROW EXECUTE FUNCTION trg_shop_order_status();
CREATE TRIGGER shop_orders_status_upd BEFORE UPDATE OF status ON shop_orders
  FOR EACH ROW EXECUTE FUNCTION trg_shop_order_status();

-- ===== Tables en ajout seul =====
CREATE FUNCTION trg_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La table % est en ajout seul (% interdit)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION trg_append_only();
CREATE TRIGGER order_status_history_append_only BEFORE UPDATE OR DELETE ON order_status_history
  FOR EACH ROW EXECUTE FUNCTION trg_append_only();
CREATE TRIGGER shipment_events_append_only BEFORE UPDATE OR DELETE ON shipment_events
  FOR EACH ROW EXECUTE FUNCTION trg_append_only();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION trg_append_only();

-- ===== Paiement confirmé : non modifiable arbitrairement =====
CREATE FUNCTION trg_payment_confirmed_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CONFIRMED' AND (
       NEW.amount_xof IS DISTINCT FROM OLD.amount_xof
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Un paiement confirmé ne peut pas être modifié (paiement %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payments_confirmed_lock BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_payment_confirmed_lock();

-- ===== Stock : réservation, libération et vente (atomiques) =====
-- MLD3 : réserver = disponible - n, réservé + n ; vendre = réservé - n ; libérer = réservé - n, disponible + n.
-- L'UPDATE conditionnel est atomique : deux achats simultanés du dernier article, un seul réussit.
CREATE FUNCTION reserve_stock(p_variant uuid, p_location uuid, p_qty integer)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF p_qty <= 0 THEN RAISE EXCEPTION 'Quantité invalide : %', p_qty; END IF;
  UPDATE inventory
     SET quantity_available = quantity_available - p_qty,
         quantity_reserved  = quantity_reserved  + p_qty
   WHERE variant_id = p_variant AND location_id = p_location AND quantity_available >= p_qty;
  RETURN FOUND;           -- false : stock insuffisant, rien n'a changé
END $$;

CREATE FUNCTION release_stock(p_variant uuid, p_location uuid, p_qty integer)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory
     SET quantity_reserved  = quantity_reserved  - p_qty,
         quantity_available = quantity_available + p_qty
   WHERE variant_id = p_variant AND location_id = p_location AND quantity_reserved >= p_qty;
  RETURN FOUND;
END $$;

CREATE FUNCTION consume_reserved_stock(p_variant uuid, p_location uuid, p_qty integer)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory
     SET quantity_reserved = quantity_reserved - p_qty
   WHERE variant_id = p_variant AND location_id = p_location AND quantity_reserved >= p_qty;
  RETURN FOUND;
END $$;
