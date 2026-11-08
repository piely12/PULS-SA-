-- PULS SA : tables (schéma relationnel du cahier des charges, section 10.6)
-- Conventions : snake_case pluriel, montants en bigint FCFA (_xof), dates en timestamptz UTC,
-- clés étrangères en RESTRICT par défaut (CASCADE seulement pour cart_items et product_images).
-- UUID : gen_random_uuid() (UUID v4) ; l'UUID v7 n'est pas disponible nativement dans PostgreSQL 16.

-- ===== UTILISATEURS ET BOUTIQUES =====
CREATE TABLE roles (
  id    smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code  text NOT NULL UNIQUE,
  label text NOT NULL
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE,
  phone         text UNIQUE,
  password_hash text NOT NULL,
  google_id     text UNIQUE,
  full_name     text NOT NULL,
  status        user_status NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT users_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE user_roles (
  user_id uuid     NOT NULL REFERENCES users(id),
  role_id smallint NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE delivery_zones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL UNIQUE,
  base_fee_xof        bigint NOT NULL CHECK (base_fee_xof >= 0),
  per_kg_fee_xof      bigint NOT NULL DEFAULT 0 CHECK (per_kg_fee_xof >= 0),
  free_threshold_xof  bigint CHECK (free_threshold_xof IS NULL OR free_threshold_xof >= 0)
);

CREATE TABLE addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  zone_id         uuid NOT NULL REFERENCES delivery_zones(id),
  recipient_name  text NOT NULL,
  recipient_phone text NOT NULL,
  commune         text NOT NULL,
  neighborhood    text,
  landmark        text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  is_default      boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX addresses_one_default_uq ON addresses (user_id) WHERE is_default;

CREATE TABLE shops (                                  -- MLD1 : un responsable (owner_id) au MVP
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES users(id),
  name              text NOT NULL UNIQUE,
  slug              text NOT NULL UNIQUE,
  status            shop_status NOT NULL DEFAULT 'PENDING',
  commission_rate   numeric(5,2) CHECK (commission_rate IS NULL OR commission_rate BETWEEN 0 AND 100),
  trade_register_no text,
  validated_by      uuid REFERENCES users(id),
  validated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TABLE shop_documents (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id  uuid NOT NULL REFERENCES shops(id),
  doc_type text NOT NULL,
  file_key text NOT NULL,
  status   doc_status NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE brands (                                 -- RG-MD02 : une marque par boutique
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id  uuid NOT NULL UNIQUE REFERENCES shops(id),
  name     text NOT NULL UNIQUE,
  logo_key text
);

-- ===== CATALOGUE =====
CREATE TABLE categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       uuid REFERENCES categories(id),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  commission_rate numeric(5,2) NOT NULL CHECK (commission_rate BETWEEN 0 AND 100)
);

CREATE TABLE products (                               -- MLD2 : pas de brand_id (voir v_products_with_brand)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id),
  category_id   uuid NOT NULL REFERENCES categories(id),
  name          text NOT NULL,
  description   text,
  base_price_xof bigint NOT NULL CHECK (base_price_xof >= 0),
  status        product_status NOT NULL DEFAULT 'DRAFT',
  search_vector tsvector,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT products_id_shop_uq UNIQUE (id, shop_id)
);

CREATE TABLE product_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  shop_id    uuid NOT NULL,                              -- redondance volontaire, protégée par la FK composite
  sku        text NOT NULL UNIQUE,
  size       text NOT NULL DEFAULT '',
  color      text NOT NULL DEFAULT '',
  price_xof  bigint NOT NULL CHECK (price_xof >= 0),
  weight_g   integer CHECK (weight_g IS NULL OR weight_g > 0),
  is_active  boolean NOT NULL DEFAULT true,
  CONSTRAINT variants_product_shop_fk FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id),
  CONSTRAINT variants_id_shop_uq UNIQUE (id, shop_id),
  CONSTRAINT variants_product_size_color_uq UNIQUE (product_id, size, color)
);

CREATE TABLE product_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_key   text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX product_images_one_primary_uq ON product_images (product_id) WHERE is_primary;

-- ===== PANIER, COMMANDES (créées avant le stock : stock_movements et stock_reservations référencent order_items) =====
CREATE TABLE carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  status     cart_status NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz
);
CREATE UNIQUE INDEX carts_one_active_uq ON carts (user_id) WHERE status = 'ACTIVE';

CREATE TABLE cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  CONSTRAINT cart_items_cart_variant_uq UNIQUE (cart_id, variant_id)
);

CREATE TABLE orders (                                 -- MLD6 : créée en PENDING_PAYMENT avant l'appel au prestataire
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text NOT NULL UNIQUE,
  user_id          uuid NOT NULL REFERENCES users(id),
  address_id       uuid REFERENCES addresses(id) ON DELETE SET NULL,
  shipping_address jsonb NOT NULL,                       -- instantané historique (seule exception à la 1FN)
  status           order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  subtotal_xof     bigint NOT NULL CHECK (subtotal_xof >= 0),
  discount_xof     bigint NOT NULL DEFAULT 0 CHECK (discount_xof >= 0),
  delivery_fee_xof bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_xof >= 0),
  total_xof        bigint NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_total_chk CHECK (total_xof = subtotal_xof - discount_xof + delivery_fee_xof)
);

CREATE TABLE shop_orders (                            -- RG-MD06 : une sous-commande par boutique
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id),
  shop_id           uuid NOT NULL REFERENCES shops(id),
  shop_order_number text NOT NULL UNIQUE,
  status            shop_order_status NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
  subtotal_xof      bigint NOT NULL CHECK (subtotal_xof >= 0),
  accept_deadline_at timestamptz,
  accepted_at       timestamptz,
  refusal_reason    text,
  CONSTRAINT shop_orders_order_shop_uq UNIQUE (order_id, shop_id),
  CONSTRAINT shop_orders_id_shop_uq    UNIQUE (id, shop_id)
);

CREATE TABLE order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id  uuid NOT NULL,
  shop_id        uuid NOT NULL,
  variant_id     uuid NOT NULL,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_price_xof bigint NOT NULL CHECK (unit_price_xof >= 0),
  line_total_xof bigint NOT NULL,
  product_name   text NOT NULL,                          -- instantanés au moment de la commande
  sku            text NOT NULL,
  size           text,
  color          text,
  status         order_item_status NOT NULL DEFAULT 'ORDERED',
  CONSTRAINT order_items_line_chk CHECK (line_total_xof = unit_price_xof * quantity),
  -- un article ne peut appartenir qu'à la boutique de sa sous-commande et de sa variante
  CONSTRAINT order_items_shop_order_fk FOREIGN KEY (shop_order_id, shop_id) REFERENCES shop_orders (id, shop_id),
  CONSTRAINT order_items_variant_fk    FOREIGN KEY (variant_id, shop_id)    REFERENCES product_variants (id, shop_id)
);

CREATE TABLE shop_order_transitions (
  from_status shop_order_status NOT NULL,
  to_status   shop_order_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

CREATE TABLE order_status_history (                    -- ajout seul
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id uuid NOT NULL REFERENCES shop_orders(id),
  from_status   shop_order_status,
  to_status     shop_order_status NOT NULL,
  actor_id      uuid REFERENCES users(id),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ===== STOCK =====
CREATE TABLE stock_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type location_type NOT NULL,
  shop_id       uuid REFERENCES shops(id),
  name          text NOT NULL,
  CONSTRAINT stock_locations_type_chk CHECK (
    (location_type = 'SHOP' AND shop_id IS NOT NULL) OR (location_type = 'HUB' AND shop_id IS NULL))
);

CREATE TABLE inventory (                               -- RG-MD05 : MLD3, disponible = quantité vendable
  variant_id         uuid NOT NULL REFERENCES product_variants(id),
  location_id        uuid NOT NULL REFERENCES stock_locations(id),
  quantity_available integer NOT NULL DEFAULT 0 CONSTRAINT inventory_available_nonneg CHECK (quantity_available >= 0),
  quantity_reserved  integer NOT NULL DEFAULT 0 CONSTRAINT inventory_reserved_nonneg  CHECK (quantity_reserved  >= 0),
  PRIMARY KEY (variant_id, location_id)
);

CREATE TABLE stock_movements (                         -- ajout seul
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id    uuid NOT NULL REFERENCES product_variants(id),
  location_id   uuid NOT NULL REFERENCES stock_locations(id),
  movement_type movement_type NOT NULL,
  quantity      integer NOT NULL CHECK (quantity <> 0),
  order_item_id uuid REFERENCES order_items(id),
  actor_id      uuid REFERENCES users(id),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_reservations (                      -- RG1 : 15 minutes
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id),
  variant_id    uuid NOT NULL REFERENCES product_variants(id),
  location_id   uuid NOT NULL REFERENCES stock_locations(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  status        reservation_status NOT NULL DEFAULT 'ACTIVE',
  expires_at    timestamptz NOT NULL
);
CREATE INDEX stock_reservations_expiry_idx ON stock_reservations (expires_at) WHERE status = 'ACTIVE';

-- ===== PAIEMENTS =====
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders(id),
  method             payment_method NOT NULL,
  gateway            payment_gateway NOT NULL,
  amount_xof         bigint NOT NULL CHECK (amount_xof > 0),
  status             payment_status NOT NULL DEFAULT 'INITIATED',
  idempotency_key    text NOT NULL UNIQUE,
  provider_reference text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_gateway_ref_uq UNIQUE (gateway, provider_reference)
);
CREATE UNIQUE INDEX payments_one_confirmed_per_order_uq ON payments (order_id) WHERE status = 'CONFIRMED';   -- RG11

CREATE TABLE payment_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        uuid NOT NULL REFERENCES payments(id),
  gateway           payment_gateway NOT NULL,
  provider_event_id text NOT NULL,
  payload           jsonb NOT NULL,
  signature_valid   boolean NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_dedup_uq UNIQUE (gateway, provider_event_id)       -- rejeu sans double traitement
);

CREATE TABLE refunds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    uuid NOT NULL REFERENCES payments(id),
  order_item_id uuid REFERENCES order_items(id),
  amount_xof    bigint NOT NULL CHECK (amount_xof > 0),
  reason        text NOT NULL,
  status        refund_status NOT NULL DEFAULT 'PENDING',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ===== LOGISTIQUE =====
CREATE TABLE shipments (                               -- RG-MD07 : une sous-commande = un colis
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id       uuid NOT NULL UNIQUE REFERENCES shop_orders(id),
  qr_code             text NOT NULL UNIQUE,
  status              shipment_status NOT NULL DEFAULT 'CREATED',
  current_location_id uuid REFERENCES stock_locations(id),
  otp_hash            text,
  otp_expires_at      timestamptz,
  otp_attempts        smallint NOT NULL DEFAULT 0 CHECK (otp_attempts >= 0),
  delivered_at        timestamptz
);

CREATE TABLE shipment_events (                         -- RG-MD08, ajout seul
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  event_type  text NOT NULL,
  location_id uuid REFERENCES stock_locations(id),
  actor_id    uuid REFERENCES users(id),
  note        text,
  photo_key   text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quality_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  agent_id    uuid NOT NULL REFERENCES users(id),
  result      quality_result NOT NULL,
  notes       text,
  photo_key   text,
  checked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE couriers (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  phone   text NOT NULL,
  vehicle text,
  status  courier_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE delivery_routes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES couriers(id),
  route_date date NOT NULL,
  status     route_status NOT NULL DEFAULT 'PLANNED'
);

CREATE TABLE delivery_route_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       uuid NOT NULL REFERENCES delivery_routes(id),
  shipment_id    uuid NOT NULL REFERENCES shipments(id),
  stop_order     integer NOT NULL CHECK (stop_order > 0),
  status         route_item_status NOT NULL DEFAULT 'PLANNED',
  failure_reason text,
  CONSTRAINT route_items_stop_uq     UNIQUE (route_id, stop_order),
  CONSTRAINT route_items_shipment_uq UNIQUE (route_id, shipment_id)
);
-- un colis ne peut être planifié que dans une seule tournée à la fois
CREATE UNIQUE INDEX route_items_one_planned_per_shipment_uq ON delivery_route_items (shipment_id) WHERE status = 'PLANNED';

-- ===== RETOURS ET FINANCE =====
CREATE TABLE returns (                                 -- pas de user_id : le client se déduit de la sous-commande
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id uuid NOT NULL REFERENCES shop_orders(id),
  status        return_status NOT NULL DEFAULT 'REQUESTED',
  reason        return_reason NOT NULL,
  description   text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    uuid REFERENCES users(id)
);

CREATE TABLE return_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     uuid NOT NULL REFERENCES returns(id),
  order_item_id uuid NOT NULL REFERENCES order_items(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  CONSTRAINT return_items_uq UNIQUE (return_id, order_item_id)
);

CREATE TABLE payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            uuid NOT NULL REFERENCES shops(id),
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  total_net_xof      bigint NOT NULL CHECK (total_net_xof >= 0),
  status             payout_status NOT NULL DEFAULT 'PENDING',
  paid_at            timestamptz,
  provider_reference text,
  CONSTRAINT payouts_period_chk CHECK (period_end >= period_start),
  CONSTRAINT payouts_period_uq  UNIQUE (shop_id, period_start, period_end)
);

CREATE TABLE commissions (                             -- MLD9, option A : la commission de la ligne remboursée est annulée
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id   uuid NOT NULL UNIQUE REFERENCES shop_orders(id),
  gross_xof       bigint NOT NULL CHECK (gross_xof >= 0),
  commission_rate numeric(5,2) NOT NULL CHECK (commission_rate BETWEEN 0 AND 100),
  commission_xof  bigint NOT NULL CHECK (commission_xof >= 0),   -- calculée sur (brut - remboursé), arrondie au franc
  refunded_xof    bigint NOT NULL DEFAULT 0 CHECK (refunded_xof >= 0),
  net_xof         bigint NOT NULL,
  status          commission_status NOT NULL DEFAULT 'PENDING',
  eligible_at     timestamptz,
  payout_id       uuid REFERENCES payouts(id),
  CONSTRAINT commissions_refund_chk CHECK (refunded_xof <= gross_xof),
  CONSTRAINT commissions_net_chk    CHECK (net_xof = gross_xof - refunded_xof - commission_xof),
  CONSTRAINT commissions_amount_chk CHECK (commission_xof = ROUND((gross_xof - refunded_xof) * commission_rate / 100))
);

-- ===== SERVICES =====
CREATE TABLE audit_logs (                              -- ajout seul
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tables reviews, favorites, promotions, notifications : à ajouter en S6 (non critiques pour le parcours achat).

-- ===== INDEX UTILES =====
CREATE INDEX products_shop_idx          ON products (shop_id) WHERE deleted_at IS NULL;
CREATE INDEX products_category_idx      ON products (category_id) WHERE deleted_at IS NULL;
CREATE INDEX shop_orders_shop_status_idx ON shop_orders (shop_id, status);
CREATE INDEX shop_orders_deadline_idx   ON shop_orders (accept_deadline_at) WHERE status = 'PAYEE';
CREATE INDEX orders_user_idx            ON orders (user_id, created_at DESC);
CREATE INDEX order_items_shop_order_idx ON order_items (shop_order_id);
CREATE INDEX shipment_events_shipment_idx ON shipment_events (shipment_id, occurred_at);
CREATE INDEX stock_movements_variant_idx ON stock_movements (variant_id, created_at);
