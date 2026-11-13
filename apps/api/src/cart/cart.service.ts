import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

interface CartItemRow {
  id: string;
  variant_id: string;
  product_id: string;
  name: string;
  description: string | null;
  shop_id: string;
  shop_name: string;
  category_name: string;
  size: string;
  color: string;
  sku: string;
  price_xof: string;
  quantity: number;
  available: number;
  product_status: string;
  shop_status: string;
  image: string | null;
}

@Injectable()
export class CartService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async get(userId: string) {
    const cart = await this.pool.query<{ id: string }>(
      `SELECT id FROM carts WHERE user_id = $1 AND status = 'ACTIVE'`, [userId]);
    if (!cart.rowCount) return { items: [], subtotalXof: '0', hasUnavailableItems: false };
    return this.readCart(this.pool, cart.rows[0].id);
  }

  async add(userId: string, variantId: string, quantity: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const variant = await this.lockPurchasableVariant(client, variantId);
      const available = await this.availableQuantity(client, variantId, variant.shop_id);
      const cartId = await this.ensureActiveCart(client, userId);
      const current = await client.query<{ id: string; quantity: number }>(
        `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE`,
        [cartId, variantId]);
      const nextQuantity = (current.rows[0]?.quantity ?? 0) + quantity;
      if (nextQuantity > available) {
        throw new ConflictException(`Stock insuffisant. Quantité disponible : ${available}.`);
      }
      const saved = await client.query<{ id: string; quantity: number }>(
        `INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity
         RETURNING id, quantity`, [cartId, variantId, nextQuantity]);
      await client.query('COMMIT');
      return { id: saved.rows[0].id, variantId, quantity: saved.rows[0].quantity, available };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(userId: string, itemId: string, quantity: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const item = await client.query<{ cart_id: string; variant_id: string }>(
        `SELECT ci.cart_id, ci.variant_id FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         WHERE ci.id = $1 AND c.user_id = $2 AND c.status = 'ACTIVE'`, [itemId, userId]);
      if (!item.rowCount) throw new NotFoundException('Cart item not found');
      const variant = await this.lockPurchasableVariant(client, item.rows[0].variant_id);
      const available = await this.availableQuantity(client, variant.id, variant.shop_id);
      if (quantity > available) {
        throw new ConflictException(`Stock insuffisant. Quantité disponible : ${available}.`);
      }
      const saved = await client.query(
        `UPDATE cart_items ci SET quantity = $1 FROM carts c
         WHERE ci.id = $2 AND ci.cart_id = c.id AND c.user_id = $3 AND c.status = 'ACTIVE'
         RETURNING ci.id`, [quantity, itemId, userId]);
      if (!saved.rowCount) throw new NotFoundException('Cart item not found');
      await client.query('COMMIT');
      return { id: itemId, variantId: variant.id, quantity, available };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(userId: string, itemId: string) {
    const deleted = await this.pool.query(
      `DELETE FROM cart_items ci USING carts c
       WHERE ci.cart_id = c.id AND ci.id = $1 AND c.user_id = $2 AND c.status = 'ACTIVE'
       RETURNING ci.id`, [itemId, userId]);
    if (!deleted.rowCount) throw new NotFoundException('Cart item not found');
    return { success: true };
  }

  private async readCart(db: Pool | PoolClient, cartId: string) {
    const result = await db.query<CartItemRow>(
      `SELECT ci.id, ci.quantity, v.id AS variant_id, v.sku, v.size, v.color, v.price_xof,
              p.id AS product_id, p.name, p.description, p.status AS product_status,
              s.id AS shop_id, s.name AS shop_name, s.status AS shop_status, c.name AS category_name,
              COALESCE(stock.available, 0)::int AS available,
              (SELECT pi.file_key FROM product_images pi WHERE pi.product_id = p.id
               ORDER BY pi.is_primary DESC, pi.position, pi.id LIMIT 1) AS image
         FROM cart_items ci
         JOIN product_variants v ON v.id = ci.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN shops s ON s.id = v.shop_id
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT sum(i.quantity_available)::int AS available
             FROM inventory i JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = v.shop_id
            WHERE i.variant_id = v.id
         ) stock ON true
        WHERE ci.cart_id = $1 ORDER BY s.name, p.name, v.size, v.color`, [cartId]);
    let subtotal = 0n;
    let hasUnavailableItems = false;
    const items = result.rows.map((row) => {
      const canBuy = row.product_status === 'PUBLISHED' && row.shop_status === 'ACTIVE'
        && row.available >= row.quantity;
      if (canBuy) subtotal += BigInt(row.price_xof) * BigInt(row.quantity);
      else hasUnavailableItems = true;
      return {
        id: row.id,
        variantId: row.variant_id,
        productId: row.product_id,
        name: row.name,
        description: row.description,
        shop: { id: row.shop_id, name: row.shop_name },
        category: row.category_name,
        size: row.size,
        color: row.color,
        sku: row.sku,
        unitPriceXof: row.price_xof,
        lineTotalXof: (BigInt(row.price_xof) * BigInt(row.quantity)).toString(),
        quantity: row.quantity,
        available: row.available,
        image: row.image,
        canBuy,
      };
    });
    return { items, subtotalXof: subtotal.toString(), hasUnavailableItems };
  }

  private async ensureActiveCart(client: PoolClient, userId: string) {
    const user = await client.query(
      `SELECT 1 FROM users WHERE id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL`, [userId]);
    if (!user.rowCount) throw new NotFoundException('User is unavailable');
    await client.query(
      `INSERT INTO carts (user_id, status) VALUES ($1, 'ACTIVE')
       ON CONFLICT (user_id) WHERE status = 'ACTIVE' DO NOTHING`, [userId]);
    const result = await client.query<{ id: string }>(
      `SELECT id FROM carts WHERE user_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [userId]);
    return result.rows[0].id as string;
  }

  private async lockPurchasableVariant(client: PoolClient, variantId: string) {
    const result = await client.query<{ id: string; shop_id: string }>(
      `SELECT v.id, v.shop_id FROM product_variants v
       JOIN products p ON p.id = v.product_id JOIN shops s ON s.id = v.shop_id
       WHERE v.id = $1 AND v.is_active AND p.status = 'PUBLISHED' AND p.deleted_at IS NULL
         AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
       FOR UPDATE OF v, p`, [variantId]);
    if (!result.rowCount) throw new NotFoundException('This product variant is not available');
    return result.rows[0];
  }

  private async availableQuantity(client: PoolClient, variantId: string, shopId: string) {
    await client.query(
      `SELECT i.variant_id FROM inventory i JOIN stock_locations sl
         ON sl.id = i.location_id AND sl.shop_id = $2
       WHERE i.variant_id = $1 FOR UPDATE OF i`, [variantId, shopId]);
    const result = await client.query<{ available: number }>(
      `SELECT COALESCE(sum(i.quantity_available), 0)::int AS available
         FROM inventory i JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = $2
        WHERE i.variant_id = $1`, [variantId, shopId]);
    return Number(result.rows[0]?.available ?? 0);
  }
}
