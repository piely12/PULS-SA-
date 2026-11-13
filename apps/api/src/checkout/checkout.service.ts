import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { CreateAddressDto } from './checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async zones() {
    const result = await this.pool.query(
      `SELECT id, name FROM delivery_zones ORDER BY name`,
    );
    return result.rows;
  }

  async addresses(userId: string) {
    const result = await this.pool.query(
      `SELECT a.id, a.zone_id AS "zoneId", z.name AS "zoneName", a.recipient_name AS "recipientName",
              a.recipient_phone AS "recipientPhone", a.commune, a.neighborhood, a.landmark,
              a.latitude, a.longitude, a.is_default AS "isDefault"
         FROM addresses a JOIN delivery_zones z ON z.id = a.zone_id
        WHERE a.user_id = $1 ORDER BY a.is_default DESC, a.id`,
      [userId],
    );
    return result.rows;
  }

  async createAddress(userId: string, input: CreateAddressDto) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const zone = await client.query<{ id: string; name: string }>(`SELECT id, name FROM delivery_zones WHERE id = $1`, [input.zoneId]);
      if (!zone.rowCount) throw new NotFoundException('Delivery zone not found');
      const existing = await client.query(`SELECT 1 FROM addresses WHERE user_id = $1 LIMIT 1`, [userId]);
      const makeDefault = input.isDefault ?? !existing.rowCount;
      if (makeDefault) await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default`, [userId]);
      const result = await client.query(
        `INSERT INTO addresses (user_id, zone_id, recipient_name, recipient_phone, commune, neighborhood,
                                landmark, latitude, longitude, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, zone_id AS "zoneId", recipient_name AS "recipientName",
                   recipient_phone AS "recipientPhone", commune, neighborhood, landmark,
                   latitude, longitude, is_default AS "isDefault"`,
        [userId, input.zoneId, input.recipientName.trim(), input.recipientPhone.trim(), input.commune.trim(),
          input.neighborhood?.trim() || null, input.landmark?.trim() || null, input.latitude ?? null,
          input.longitude ?? null, makeDefault],
      );
      await client.query('COMMIT');
      return { ...result.rows[0], zoneName: zone.rows[0].name };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async quote(userId: string, addressId: string) {
    if (!addressId) throw new BadRequestException('addressId is required');
    const result = await this.pool.query<{
      address_id: string; zone_name: string; base_fee_xof: string; per_kg_fee_xof: string;
      free_threshold_xof: string | null; item_count: string; subtotal_xof: string; weight_g: string;
      unavailable: boolean;
    }>(
      `SELECT a.id AS address_id, z.name AS zone_name, z.base_fee_xof, z.per_kg_fee_xof,
              z.free_threshold_xof, count(ci.id)::int AS item_count,
              COALESCE(sum(v.price_xof * ci.quantity), 0)::text AS subtotal_xof,
              COALESCE(sum(COALESCE(v.weight_g, 0) * ci.quantity), 0)::int AS weight_g,
              COALESCE(bool_or(p.status <> 'PUBLISHED' OR p.deleted_at IS NOT NULL OR s.status <> 'ACTIVE'
                OR NOT v.is_active OR COALESCE(stock.available, 0) < ci.quantity), false) AS unavailable
         FROM addresses a
         JOIN delivery_zones z ON z.id = a.zone_id
         LEFT JOIN carts cart ON cart.user_id = a.user_id AND cart.status = 'ACTIVE'
         LEFT JOIN cart_items ci ON ci.cart_id = cart.id
         LEFT JOIN product_variants v ON v.id = ci.variant_id
         LEFT JOIN products p ON p.id = v.product_id
         LEFT JOIN shops s ON s.id = v.shop_id
         LEFT JOIN LATERAL (
           SELECT sum(i.quantity_available)::int AS available
             FROM inventory i JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = v.shop_id
            WHERE i.variant_id = v.id
         ) stock ON true
        WHERE a.id = $1 AND a.user_id = $2
        GROUP BY a.id, z.name, z.base_fee_xof, z.per_kg_fee_xof, z.free_threshold_xof`,
      [addressId, userId],
    );
    if (!result.rowCount) throw new NotFoundException('Address not found');
    const row = result.rows[0];
    if (Number(row.item_count) < 1) throw new BadRequestException('Your cart is empty');
    if (row.unavailable) throw new BadRequestException('Remove unavailable items before checkout');

    const subtotal = BigInt(row.subtotal_xof);
    const isFree = row.free_threshold_xof !== null && subtotal >= BigInt(row.free_threshold_xof);
    const weightKg = Math.ceil(Number(row.weight_g) / 1000);
    const deliveryFee = isFree ? 0n : BigInt(row.base_fee_xof) + BigInt(row.per_kg_fee_xof) * BigInt(weightKg);
    return {
      addressId: row.address_id,
      deliveryZone: row.zone_name,
      itemCount: Number(row.item_count),
      weightG: Number(row.weight_g),
      subtotalXof: subtotal.toString(),
      deliveryFeeXof: deliveryFee.toString(),
      totalXof: (subtotal + deliveryFee).toString(),
      freeDelivery: isFree,
      isEstimate: true,
    };
  }
}
