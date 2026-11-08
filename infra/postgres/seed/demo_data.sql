-- PULS SA : jeu de données de démonstration (S1)
-- 5 boutiques, 60 produits, variantes (taille x couleur), stocks, 10 zones de livraison, comptes de test.
-- Script rejouable : les lignes déjà présentes sont ignorées (ON CONFLICT DO NOTHING).
-- DONNÉES FICTIVES, pour le développement uniquement : prix, frais de livraison et numéros sont des valeurs de démonstration.
-- Tous les comptes de test ont le mot de passe : Demo1234
--
-- Exécution (PowerShell) :
--   docker compose cp infra/postgres/seed/demo_data.sql db:/tmp/demo_data.sql
--   docker compose exec db psql -U puls -d puls -v ON_ERROR_STOP=1 -f /tmp/demo_data.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt() / gen_salt('bf') : hachage bcrypt, compatible avec bcrypt côté Node

-- ===== Zones de livraison (frais fictifs, en FCFA) =====
INSERT INTO delivery_zones (name, base_fee_xof, per_kg_fee_xof, free_threshold_xof) VALUES
  ('Cocody',     1500, 200, 50000),
  ('Plateau',    1500, 200, 50000),
  ('Marcory',    1500, 200, 50000),
  ('Treichville',1500, 200, 50000),
  ('Yopougon',   2000, 200, 50000),
  ('Abobo',      2000, 200, 50000),
  ('Adjamé',     2000, 200, 50000),
  ('Koumassi',   2000, 200, 50000),
  ('Port-Bouët', 2500, 250, 50000),
  ('Bingerville',3000, 250, 50000)
ON CONFLICT DO NOTHING;

-- ===== Catégories (taux de commission dans la fourchette de 10 à 20 % du cahier des charges) =====
INSERT INTO categories (name, slug, commission_rate) VALUES
  ('Robes',                  'robes',                  15.00),
  ('Hauts',                  'hauts',                  12.00),
  ('Pantalons',              'pantalons',              12.00),
  ('Chaussures',             'chaussures',             18.00),
  ('Accessoires',            'accessoires',            20.00),
  ('Tenues traditionnelles', 'tenues-traditionnelles', 10.00)
ON CONFLICT DO NOTHING;

-- ===== Comptes de test =====
INSERT INTO users (email, phone, password_hash, full_name)
SELECT v.email, v.phone, crypt('Demo1234', gen_salt('bf', 10)), v.full_name
FROM (VALUES
  ('admin@puls.demo',   '+2250700000001', 'Admin PULS'),
  ('owner1@puls.demo',  '+2250700000011', 'Responsable Atelier Adjoua'),
  ('owner2@puls.demo',  '+2250700000012', 'Responsable Cocody Street'),
  ('owner3@puls.demo',  '+2250700000013', 'Responsable Marcory Sneakers'),
  ('owner4@puls.demo',  '+2250700000014', 'Responsable Lagune Accessoires'),
  ('owner5@puls.demo',  '+2250700000015', 'Responsable Plateau Élégance'),
  ('client1@puls.demo', '+2250700000021', 'Aya Kouassi'),
  ('client2@puls.demo', '+2250700000022', 'Yao Konan'),
  ('client3@puls.demo', '+2250700000023', 'Fatou Traoré'),
  ('logistique@puls.demo','+2250700000031','Agent Logistique Hub'),
  ('livreur@puls.demo', '+2250700000041', 'Livreur Démo')
) AS v(email, phone, full_name)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM (VALUES
  ('admin@puls.demo','ADMIN'),
  ('owner1@puls.demo','SHOP_OWNER'), ('owner2@puls.demo','SHOP_OWNER'), ('owner3@puls.demo','SHOP_OWNER'),
  ('owner4@puls.demo','SHOP_OWNER'), ('owner5@puls.demo','SHOP_OWNER'),
  ('client1@puls.demo','CUSTOMER'), ('client2@puls.demo','CUSTOMER'), ('client3@puls.demo','CUSTOMER'),
  ('logistique@puls.demo','LOGISTICS_AGENT'),
  ('livreur@puls.demo','COURIER')
) AS m(email, role)
JOIN users u ON u.email = m.email
JOIN roles r ON r.code = m.role
ON CONFLICT DO NOTHING;

INSERT INTO couriers (user_id, phone, vehicle)
SELECT id, phone, 'Moto' FROM users WHERE email = 'livreur@puls.demo'
ON CONFLICT DO NOTHING;

INSERT INTO addresses (id, user_id, zone_id, recipient_name, recipient_phone, commune, neighborhood, landmark, is_default)
SELECT md5('addr:' || u.email)::uuid, u.id, z.id, u.full_name, u.phone, m.commune, m.neighborhood, m.landmark, true
FROM (VALUES
  ('client1@puls.demo', 'Cocody',   'Riviera Palmeraie', 'Près de la pharmacie'),
  ('client2@puls.demo', 'Marcory',  'Zone 4',            'Derrière le marché'),
  ('client3@puls.demo', 'Yopougon', 'Niangon',           'Face à la station')
) AS m(email, commune, neighborhood, landmark)
JOIN users u ON u.email = m.email
JOIN delivery_zones z ON z.name = m.commune
ON CONFLICT DO NOTHING;

-- ===== Boutiques, marques, emplacements de stock =====
INSERT INTO shops (owner_id, name, slug, status, trade_register_no, validated_by, validated_at)
SELECT o.id, m.name, m.slug, 'ACTIVE'::shop_status, m.rc, a.id, now()
FROM (VALUES
  ('owner1@puls.demo', 'Atelier Adjoua',      'atelier-adjoua',      'CI-ABJ-DEMO-0001'),
  ('owner2@puls.demo', 'Cocody Street',       'cocody-street',       'CI-ABJ-DEMO-0002'),
  ('owner3@puls.demo', 'Marcory Sneakers',    'marcory-sneakers',    'CI-ABJ-DEMO-0003'),
  ('owner4@puls.demo', 'Lagune Accessoires',  'lagune-accessoires',  'CI-ABJ-DEMO-0004'),
  ('owner5@puls.demo', 'Plateau Élégance',    'plateau-elegance',    'CI-ABJ-DEMO-0005')
) AS m(email, name, slug, rc)
JOIN users o ON o.email = m.email
CROSS JOIN (SELECT id FROM users WHERE email = 'admin@puls.demo') a
ON CONFLICT DO NOTHING;

INSERT INTO brands (shop_id, name)
SELECT s.id, s.name FROM shops s
WHERE s.slug IN ('atelier-adjoua','cocody-street','marcory-sneakers','lagune-accessoires','plateau-elegance')
ON CONFLICT DO NOTHING;

INSERT INTO stock_locations (id, location_type, shop_id, name)
SELECT md5('loc:' || s.slug)::uuid, 'SHOP'::location_type, s.id, 'Stock ' || s.name
FROM shops s
WHERE s.slug IN ('atelier-adjoua','cocody-street','marcory-sneakers','lagune-accessoires','plateau-elegance')
ON CONFLICT DO NOTHING;

-- ===== Catalogue : 60 produits (12 par boutique, sauf répartition libre par catégorie) =====
CREATE TEMP TABLE demo_products (
  shop_slug text, name text, cat text, price bigint, colors text
) ON COMMIT DROP;

INSERT INTO demo_products VALUES
  -- Atelier Adjoua : tenues traditionnelles et robes
  ('atelier-adjoua','Boubou brodé homme',           'tenues-traditionnelles', 45000, 'blanc,bleu'),
  ('atelier-adjoua','Ensemble pagne wax femme',     'tenues-traditionnelles', 32000, 'orange,vert'),
  ('atelier-adjoua','Kaba et pagne 2 pièces',       'tenues-traditionnelles', 38000, 'jaune,rouge'),
  ('atelier-adjoua','Tunique bogolan',              'tenues-traditionnelles', 28000, 'marron'),
  ('atelier-adjoua','Complet en tissu Kita',        'tenues-traditionnelles', 55000, 'bleu,rouge'),
  ('atelier-adjoua','Robe longue en pagne',         'tenues-traditionnelles', 30000, 'multicolore'),
  ('atelier-adjoua','Robe wax évasée',              'robes',                  22000, 'orange,bleu'),
  ('atelier-adjoua','Robe cintrée imprimée',        'robes',                  24000, 'rouge'),
  ('atelier-adjoua','Robe portefeuille en wax',     'robes',                  26000, 'vert,jaune'),
  ('atelier-adjoua','Robe longue bohème',           'robes',                  29000, 'blanc'),
  ('atelier-adjoua','Robe courte pagne',            'robes',                  18000, 'multicolore'),
  ('atelier-adjoua','Robe trapèze en coton',        'robes',                  16000, 'noir,beige'),
  -- Cocody Street : hauts et pantalons décontractés
  ('cocody-street','T-shirt oversize coton',        'hauts',                   7500, 'noir,blanc'),
  ('cocody-street','Sweat à capuche',               'hauts',                  15000, 'gris,noir'),
  ('cocody-street','Polo piqué',                    'hauts',                   9000, 'bleu,blanc'),
  ('cocody-street','Débardeur côtelé',              'hauts',                   5500, 'noir'),
  ('cocody-street','Chemise en lin manches courtes','hauts',                  12500, 'beige,bleu'),
  ('cocody-street','Veste coupe-vent léger',        'hauts',                  18000, 'noir,vert'),
  ('cocody-street','Jean droit délavé',             'pantalons',              16000, 'bleu'),
  ('cocody-street','Pantalon cargo',                'pantalons',              17500, 'kaki,noir'),
  ('cocody-street','Jogging molleton',              'pantalons',              12000, 'gris,noir'),
  ('cocody-street','Short en jean',                 'pantalons',               9500, 'bleu'),
  ('cocody-street','Pantalon chino beige',          'pantalons',              14000, 'beige'),
  ('cocody-street','Pantalon large taille haute',   'pantalons',              15500, 'noir,crème'),
  -- Marcory Sneakers : chaussures
  ('marcory-sneakers','Baskets basses blanches',    'chaussures',             25000, 'blanc'),
  ('marcory-sneakers','Baskets montantes noires',   'chaussures',             32000, 'noir'),
  ('marcory-sneakers','Sandales plates en cuir',    'chaussures',             15000, 'marron,noir'),
  ('marcory-sneakers','Mocassins cuir marron',      'chaussures',             28000, 'marron'),
  ('marcory-sneakers','Sandales à talon bloc',      'chaussures',             22000, 'beige,noir'),
  ('marcory-sneakers','Escarpins noirs',            'chaussures',             26000, 'noir'),
  ('marcory-sneakers','Tongs confort',              'chaussures',              6000, 'noir,bleu'),
  ('marcory-sneakers','Sneakers running',           'chaussures',             38000, 'gris,bleu'),
  ('marcory-sneakers','Bottines cuir',              'chaussures',             42000, 'noir,marron'),
  ('marcory-sneakers','Espadrilles toile',          'chaussures',             11000, 'beige,bleu'),
  ('marcory-sneakers','Derbies cuir noir',          'chaussures',             35000, 'noir'),
  ('marcory-sneakers','Claquettes de plage',        'chaussures',              5000, 'noir,rouge'),
  -- Lagune Accessoires : sacs et accessoires
  ('lagune-accessoires','Sac à main simili cuir',   'accessoires',            19000, 'noir,rouge'),
  ('lagune-accessoires','Sac bandoulière wax',      'accessoires',            14000, 'multicolore'),
  ('lagune-accessoires','Pochette de soirée',       'accessoires',            12000, 'doré,noir'),
  ('lagune-accessoires','Sac à dos ville',          'accessoires',            17500, 'noir,gris'),
  ('lagune-accessoires','Ceinture cuir noir',       'accessoires',             8000, 'noir'),
  ('lagune-accessoires','Casquette coton',          'accessoires',             6000, 'noir,blanc'),
  ('lagune-accessoires','Lunettes de soleil',       'accessoires',             9500, 'noir'),
  ('lagune-accessoires','Bracelet en perles',       'accessoires',             4500, 'multicolore'),
  ('lagune-accessoires','Collier en wax',           'accessoires',             7000, 'orange'),
  ('lagune-accessoires','Foulard en soie',          'accessoires',            11000, 'bleu,rouge'),
  ('lagune-accessoires','Portefeuille homme',       'accessoires',            10500, 'marron,noir'),
  ('lagune-accessoires','Panier en raphia',         'accessoires',            13000, 'beige'),
  -- Plateau Élégance : tenues de bureau
  ('plateau-elegance','Chemise blanche classique',  'hauts',                  13500, 'blanc'),
  ('plateau-elegance','Chemise bleue rayée',        'hauts',                  14500, 'bleu'),
  ('plateau-elegance','Chemisier fluide femme',     'hauts',                  16000, 'blanc,rose'),
  ('plateau-elegance','Chemise col mao',            'hauts',                  15000, 'beige,noir'),
  ('plateau-elegance','Pantalon costume gris',      'pantalons',              24000, 'gris'),
  ('plateau-elegance','Pantalon tailleur noir',     'pantalons',              22500, 'noir'),
  ('plateau-elegance','Pantalon cigarette',         'pantalons',              19500, 'noir,beige'),
  ('plateau-elegance','Pantalon à pinces bleu marine','pantalons',            21000, 'bleu'),
  ('plateau-elegance','Robe fourreau bureau',       'robes',                  27000, 'noir,bleu'),
  ('plateau-elegance','Robe midi plissée',          'robes',                  25000, 'vert,noir'),
  ('plateau-elegance','Robe chemise ceinturée',     'robes',                  23500, 'beige'),
  ('plateau-elegance','Robe tailleur sans manches', 'robes',                  26500, 'gris,noir');

INSERT INTO products (id, shop_id, category_id, name, description, base_price_xof, status)
SELECT md5('product:' || d.shop_slug || ':' || d.name)::uuid,
       s.id, c.id, d.name, d.name || ' (donnée de démonstration)', d.price, 'PUBLISHED'::product_status
FROM demo_products d
JOIN shops s      ON s.slug = d.shop_slug
JOIN categories c ON c.slug = d.cat
ON CONFLICT DO NOTHING;

-- ===== Variantes : tailles selon la catégorie x couleurs du produit =====
INSERT INTO product_variants (id, product_id, shop_id, sku, size, color, price_xof, weight_g)
SELECT md5('variant:' || p.id::text || ':' || sz.val || ':' || col.val)::uuid,
       p.id, p.shop_id,
       'DM-' || upper(substr(md5(p.id::text || sz.val || col.val), 1, 8)),
       sz.val, col.val, p.base_price_xof,
       CASE c.slug WHEN 'chaussures' THEN 900 WHEN 'accessoires' THEN 300
                   WHEN 'tenues-traditionnelles' THEN 700 WHEN 'pantalons' THEN 500
                   WHEN 'robes' THEN 400 ELSE 250 END
FROM demo_products d
JOIN products p   ON p.id = md5('product:' || d.shop_slug || ':' || d.name)::uuid
JOIN categories c ON c.id = p.category_id
CROSS JOIN LATERAL unnest(
  CASE c.slug WHEN 'chaussures'  THEN ARRAY['40','41','42','43']
              WHEN 'accessoires' THEN ARRAY['Unique']
              ELSE ARRAY['S','M','L'] END) AS sz(val)
CROSS JOIN LATERAL unnest(string_to_array(d.colors, ',')) AS col(val)
ON CONFLICT DO NOTHING;

-- ===== Stocks : quantités pseudo-aléatoires mais stables (environ 1 variante sur 15 en rupture, utile pour les tests) =====
INSERT INTO inventory (variant_id, location_id, quantity_available)
SELECT v.id, md5('loc:' || s.slug)::uuid,
       CASE WHEN get_byte(decode(md5(v.id::text), 'hex'), 1) % 15 = 0 THEN 0
            ELSE 3 + get_byte(decode(md5(v.id::text), 'hex'), 0) % 25 END
FROM product_variants v
JOIN shops s ON s.id = v.shop_id
WHERE v.sku LIKE 'DM-%'
ON CONFLICT DO NOTHING;

INSERT INTO stock_movements (variant_id, location_id, movement_type, quantity, reason)
SELECT i.variant_id, i.location_id, 'RESTOCK'::movement_type, i.quantity_available, 'Stock initial (démo)'
FROM inventory i
JOIN product_variants v ON v.id = i.variant_id
WHERE v.sku LIKE 'DM-%' AND i.quantity_available > 0
  AND NOT EXISTS (SELECT 1 FROM stock_movements m
                  WHERE m.variant_id = i.variant_id AND m.location_id = i.location_id
                    AND m.reason = 'Stock initial (démo)');

COMMIT;

-- ===== Vérification : attendu 5 boutiques, 60 produits, 5 marques, 10 zones, 11 comptes =====
SELECT 'boutiques' AS element, count(*) AS total FROM shops WHERE slug IN ('atelier-adjoua','cocody-street','marcory-sneakers','lagune-accessoires','plateau-elegance')
UNION ALL SELECT 'marques',          count(*) FROM brands
UNION ALL SELECT 'produits',         count(*) FROM products
UNION ALL SELECT 'variantes',        count(*) FROM product_variants
UNION ALL SELECT 'lignes de stock',  count(*) FROM inventory
UNION ALL SELECT 'variantes en rupture', count(*) FROM inventory WHERE quantity_available = 0
UNION ALL SELECT 'zones de livraison', count(*) FROM delivery_zones
UNION ALL SELECT 'comptes de test',  count(*) FROM users WHERE email LIKE '%@puls.demo';
