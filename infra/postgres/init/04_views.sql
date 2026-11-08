-- PULS SA : vues

-- MLD2 : la marque d'un produit se lit via sa boutique
CREATE VIEW v_products_with_brand AS
SELECT p.*, b.id AS brand_id, b.name AS brand_name
  FROM products p
  JOIN brands b ON b.shop_id = p.shop_id;

-- Stock physique = disponible + réservé (MLD3)
CREATE VIEW v_inventory_physical AS
SELECT variant_id, location_id, quantity_available, quantity_reserved,
       quantity_available + quantity_reserved AS quantity_physical
  FROM inventory;
