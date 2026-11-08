-- PULS SA : types ENUM (MLD4 : statuts en ENUM au MVP)
-- Les valeurs de l'annexe B du cahier des charges sont reprises telles quelles.
-- Les valeurs marquées « proposé » n'existent pas dans le cahier : à valider.

CREATE TYPE user_status        AS ENUM ('ACTIVE', 'SUSPENDED');                                   -- proposé
CREATE TYPE shop_status        AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');
CREATE TYPE doc_status         AS ENUM ('PENDING', 'APPROVED', 'REJECTED');                       -- proposé
CREATE TYPE product_status     AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'DISABLED');
CREATE TYPE location_type      AS ENUM ('SHOP', 'HUB');
CREATE TYPE movement_type      AS ENUM ('RESERVE', 'RELEASE', 'SALE', 'RESTOCK', 'ADJUSTMENT', 'RETURN'); -- proposé
CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');
CREATE TYPE cart_status        AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');                     -- proposé

CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'COMPLETED');
CREATE TYPE shop_order_status AS ENUM (
  'EN_ATTENTE_PAIEMENT', 'PAYEE', 'ACCEPTEE_PAR_BOUTIQUE', 'EN_PREPARATION', 'PRETE_A_COLLECTER',
  'COLLECTEE', 'RECUE_AU_HUB', 'CONTROLEE', 'EN_LIVRAISON', 'LIVREE',
  'REFUSEE_PAR_BOUTIQUE', 'RUPTURE_STOCK', 'ECHEC_LIVRAISON', 'ANNULEE', 'RETOUR_DEMANDE',
  'RETOURNEE', 'REMBOURSEE'
);
CREATE TYPE order_item_status AS ENUM ('ORDERED', 'CANCELLED', 'OUT_OF_STOCK', 'DELIVERED', 'RETURNED', 'REFUNDED'); -- proposé

CREATE TYPE payment_method AS ENUM ('WAVE', 'ORANGE_MONEY', 'MTN_MOMO', 'CASH_ON_DELIVERY');     -- proposé
CREATE TYPE payment_gateway AS ENUM ('SIMULATED', 'KADEV_PAY', 'NONE');                           -- proposé
CREATE TYPE payment_status  AS ENUM ('INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');
CREATE TYPE refund_status   AS ENUM ('PENDING', 'DONE', 'FAILED');                                 -- proposé

CREATE TYPE shipment_status AS ENUM ('CREATED', 'READY', 'COLLECTED', 'AT_HUB', 'CHECKED',
                                     'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED');      -- proposé
CREATE TYPE quality_result  AS ENUM ('CONFORME', 'NON_CONFORME', 'VERIFICATION_COMPLEMENTAIRE');
CREATE TYPE courier_status  AS ENUM ('ACTIVE', 'INACTIVE');                                        -- proposé
CREATE TYPE route_status    AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');                            -- proposé
CREATE TYPE route_item_status AS ENUM ('PLANNED', 'DELIVERED', 'FAILED', 'REASSIGNED');

CREATE TYPE return_reason   AS ENUM ('SIZE', 'DEFECT', 'NOT_AS_DESCRIBED');
CREATE TYPE return_status   AS ENUM ('REQUESTED', 'RECEIVED', 'APPROVED', 'REJECTED');             -- proposé
CREATE TYPE commission_status AS ENUM ('PENDING', 'ELIGIBLE', 'PAID', 'CANCELLED');
CREATE TYPE payout_status   AS ENUM ('PENDING', 'PAID', 'FAILED');                                 -- proposé
