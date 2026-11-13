import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { ProductVariantDto, CreateProductDto, UpdateProductDto } from './seller.dto';

interface ShopRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

@Injectable()
export class SellerService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async shops(ownerId: string) {
    const result = await this.pool.query<ShopRow>(
      `SELECT id, name, slug, status FROM shops
       WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY name`, [ownerId]);
    return result.rows;
  }

  async products(ownerId: string, shopId: string) {
    const shop = await this.ownedShop(this.pool, ownerId, shopId);
    const result = await this.pool.query(
      `SELECT p.id, p.name, p.description, p.status, p.base_price_xof AS "basePriceXof",
              p.category_id AS "categoryId", c.name AS "categoryName", p.created_at AS "createdAt",
              COALESCE((SELECT sum(i.quantity_available)::int
                        FROM product_variants v
                        JOIN inventory i ON i.variant_id = v.id
                        JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = p.shop_id
                        WHERE v.product_id = p.id AND v.is_active), 0)::int AS available,
              (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS "variantCount",
              COALESCE((SELECT json_agg(json_build_object(
                'id', v.id, 'sku', v.sku, 'size', v.size, 'color', v.color,
                'priceXof', v.price_xof, 'weightG', v.weight_g, 'available', COALESCE((
                  SELECT sum(i.quantity_available)::int FROM inventory i
                  JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = p.shop_id
                  WHERE i.variant_id = v.id), 0)
              ) ORDER BY v.size, v.color)
                FROM product_variants v WHERE v.product_id = p.id AND v.is_active), '[]'::json) AS variants,
              COALESCE((SELECT json_agg(json_build_object(
                'id', pi.id, 'fileKey', pi.file_key, 'isPrimary', pi.is_primary
              ) ORDER BY pi.position, pi.id)
                FROM product_images pi WHERE pi.product_id = p.id), '[]'::json) AS images,
              (SELECT pi.file_key FROM product_images pi WHERE pi.product_id = p.id
               ORDER BY pi.is_primary DESC, pi.position, pi.id LIMIT 1) AS image
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.shop_id = $1 AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC, p.id`, [shop.id]);
    return { shop, products: result.rows };
  }

  async pendingReview() {
    const result = await this.pool.query(
      `SELECT p.id, p.name, p.description, p.base_price_xof AS "basePriceXof",
              p.created_at AS "createdAt", c.name AS "categoryName", s.name AS "shopName",
              (SELECT pi.file_key FROM product_images pi WHERE pi.product_id = p.id
               ORDER BY pi.is_primary DESC, pi.position, pi.id LIMIT 1) AS image
         FROM products p JOIN shops s ON s.id = p.shop_id JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'PENDING' AND p.deleted_at IS NULL AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
        ORDER BY p.created_at, p.id`);
    return result.rows;
  }

  async createProduct(ownerId: string, shopId: string, input: CreateProductDto) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const shop = await this.ownedShop(client, ownerId, shopId, true);
      await this.ensureCategory(client, input.categoryId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO products (shop_id, category_id, name, description, base_price_xof, status)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT') RETURNING id`,
        [shop.id, input.categoryId, input.name.trim(), input.description?.trim() || null, input.basePriceXof]);
      const productId = created.rows[0].id;
      const locationId = await this.stockLocation(client, shop.id, shop.name);
      for (const variant of input.variants) {
        await this.createVariant(client, ownerId, shop.id, productId, locationId, variant);
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES ($1, 'PRODUCT_CREATED', 'product', $2)`, [ownerId, productId]);
      await client.query('COMMIT');
      return { id: productId, status: 'DRAFT' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException('SKU or variant already exists');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProduct(ownerId: string, productId: string, input: UpdateProductDto) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ shop_id: string; shop_name: string; status: string }>(
        `SELECT p.shop_id, s.name AS shop_name, p.status FROM products p
         JOIN shops s ON s.id = p.shop_id
         WHERE p.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL AND p.deleted_at IS NULL
         FOR UPDATE OF p`, [productId, ownerId]);
      const product = current.rows[0];
      if (!product) throw new NotFoundException('Product not found');
      if (!['DRAFT', 'DISABLED', 'PUBLISHED'].includes(product.status)) {
        throw new ConflictException('Products under review cannot be edited');
      }
      if (input.categoryId) await this.ensureCategory(client, input.categoryId);
      const result = await client.query(
        `UPDATE products SET
           name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4::text ELSE description END,
           category_id = COALESCE($5::uuid, category_id),
           base_price_xof = COALESCE($6::bigint, base_price_xof),
           status = CASE WHEN status IN ('DISABLED', 'PUBLISHED') THEN 'DRAFT'::product_status ELSE status END
         WHERE id = $1 RETURNING id, status`,
        [productId, input.name?.trim() ?? null,
          Object.prototype.hasOwnProperty.call(input, 'description'), input.description?.trim() || null,
          input.categoryId ?? null, input.basePriceXof ?? null],
      );
      if (input.variants?.length) {
        const locationId = await this.stockLocation(client, product.shop_id, product.shop_name);
        for (const variant of input.variants) {
          if (!variant.id) {
            await this.createVariant(client, ownerId, product.shop_id, productId, locationId, variant);
            continue;
          }
          const changed = await client.query(
            `UPDATE product_variants SET
               sku = COALESCE(NULLIF($4::text, ''), sku),
               size = COALESCE($5::text, size),
               color = COALESCE($6::text, color),
               price_xof = $7,
               weight_g = COALESCE($8::integer, weight_g)
             WHERE id = $1 AND product_id = $2 AND shop_id = $3 AND is_active RETURNING id`,
            [variant.id, productId, product.shop_id, variant.sku?.trim() ?? null,
              variant.size?.trim() ?? null, variant.color?.trim() ?? null,
              variant.priceXof, variant.weightG ?? null],
          );
          if (!changed.rowCount) throw new NotFoundException('Variant not found');
          if (variant.quantityAvailable !== undefined) {
            await this.setAvailableQuantity(client, ownerId, variant.id, locationId, variant.quantityAvailable);
          }
        }
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES ($1, 'PRODUCT_UPDATED', 'product', $2)`, [ownerId, productId]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException('SKU or size and color already exist');
      throw error;
    } finally {
      client.release();
    }
  }

  async uploadImage(ownerId: string, productId: string, file?: UploadedImage) {
    if (!file?.buffer?.length) throw new BadRequestException('Image file is required');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Image exceeds the 5 MB limit');
    const extension = imageExtension(file.buffer, file.mimetype);
    const filename = `${randomUUID()}.${extension}`;
    const relativeKey = `products/${filename}`;
    const uploadDirectory = join(process.cwd(), 'uploads', 'products');
    const filePath = join(uploadDirectory, filename);
    const client = await this.pool.connect();
    let written = false;
    try {
      await client.query('BEGIN');
      const product = await client.query<{ id: string; status: string }>(
        `SELECT p.id, p.status FROM products p JOIN shops s ON s.id = p.shop_id
         WHERE p.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL AND p.deleted_at IS NULL
         FOR UPDATE OF p`, [productId, ownerId]);
      if (!product.rowCount) throw new NotFoundException('Product not found');
      if (!['DRAFT', 'DISABLED'].includes(product.rows[0].status)) {
        throw new ConflictException('Only draft or returned products can be changed');
      }
      const count = await client.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM product_images WHERE product_id = $1', [productId]);
      if (count.rows[0].total >= 5) throw new ConflictException('A product can have up to five images');
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(filePath, file.buffer, { flag: 'wx' });
      written = true;
      const saved = await client.query(
        `INSERT INTO product_images (product_id, file_key, position, is_primary)
         VALUES ($1, $2, $3, $4) RETURNING id, file_key AS "fileKey", is_primary AS "isPrimary"`,
        [productId, relativeKey, count.rows[0].total, count.rows[0].total === 0]);
      await client.query('COMMIT');
      return saved.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if (written) await unlink(filePath).catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteImage(ownerId: string, productId: string, imageId: string) {
    await this.editableProduct(ownerId, productId);
    const client = await this.pool.connect();
    let key: string | undefined;
    let wasPrimary = false;
    try {
      await client.query('BEGIN');
      const product = await client.query(
        `SELECT p.id FROM products p JOIN shops s ON s.id = p.shop_id
         WHERE p.id = $1 AND s.owner_id = $2 AND p.status IN ('DRAFT', 'DISABLED')
         FOR UPDATE OF p`, [productId, ownerId]);
      if (!product.rowCount) throw new ConflictException('Product can no longer be edited');
      const deleted = await client.query<{ file_key: string; is_primary: boolean }>(
        `DELETE FROM product_images pi
          USING products p, shops s
         WHERE pi.id = $1 AND pi.product_id = $2 AND p.id = pi.product_id AND p.shop_id = s.id
           AND s.owner_id = $3 AND p.status IN ('DRAFT', 'DISABLED')
         RETURNING pi.file_key, pi.is_primary`, [imageId, productId, ownerId]);
      if (!deleted.rowCount) throw new NotFoundException('Product image not found');
      key = deleted.rows[0].file_key;
      wasPrimary = deleted.rows[0].is_primary;
      if (wasPrimary) {
        await client.query(
          `UPDATE product_images SET is_primary = true
           WHERE id = (SELECT id FROM product_images WHERE product_id = $1 ORDER BY position, id LIMIT 1)`, [productId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (key?.startsWith('products/') && basename(key) === key.slice('products/'.length)) {
      await unlink(join(process.cwd(), 'uploads', key)).catch(() => undefined);
    }
    return { success: true, removedPrimary: wasPrimary };
  }

  async updateStock(ownerId: string, productId: string, variantId: string, quantityAvailable: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const product = await client.query<{ shop_id: string; status: string; shop_name: string }>(
        `SELECT p.shop_id, p.status, s.name AS shop_name
           FROM products p JOIN shops s ON s.id = p.shop_id
          WHERE p.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL AND p.deleted_at IS NULL
          FOR UPDATE OF p`, [productId, ownerId]);
      const row = product.rows[0];
      if (!row) throw new NotFoundException('Product not found');
      if (row.status === 'PENDING') throw new ConflictException('A product under review cannot be changed');

      const variant = await client.query<{ id: string }>(
        `SELECT id FROM product_variants WHERE id = $1 AND product_id = $2 AND shop_id = $3 AND is_active FOR UPDATE`,
        [variantId, productId, row.shop_id]);
      if (!variant.rowCount) throw new NotFoundException('Variant not found');
      const locationId = await this.stockLocation(client, row.shop_id, row.shop_name);
      const previous = await client.query<{ quantity_available: number }>(
        `SELECT quantity_available FROM inventory WHERE variant_id = $1 AND location_id = $2 FOR UPDATE`,
        [variantId, locationId]);
      const oldQuantity = previous.rows[0]?.quantity_available ?? 0;
      const change = await this.setAvailableQuantity(client, ownerId, variantId, locationId, quantityAvailable, oldQuantity);
      await client.query('COMMIT');
      return { variantId, previous: oldQuantity, quantityAvailable, change };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async submit(ownerId: string, productId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE products p SET status = 'PENDING'
           FROM shops s
          WHERE p.id = $1 AND p.shop_id = s.id AND s.owner_id = $2 AND s.status = 'ACTIVE'
            AND s.deleted_at IS NULL AND p.status = 'DRAFT' AND p.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
            AND EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
         RETURNING p.id, p.status`, [productId, ownerId]);
      if (!result.rowCount) {
        const owned = await client.query(
          `SELECT 1 FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL AND p.deleted_at IS NULL`,
          [productId, ownerId]);
        if (!owned.rowCount) throw new NotFoundException('Product not found');
        throw new ConflictException('A draft with an active variant and at least one photo is required; the shop must be active');
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES ($1, 'PRODUCT_SUBMITTED', 'product', $2)`, [ownerId, productId]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async review(adminId: string, productId: string, approved: boolean) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE products p SET status = CASE WHEN $2::boolean THEN 'PUBLISHED'::product_status ELSE 'DRAFT'::product_status END
           FROM shops s
          WHERE p.id = $1 AND p.shop_id = s.id AND p.status = 'PENDING' AND p.deleted_at IS NULL
            AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
         RETURNING p.id, p.status`, [productId, approved]);
      if (!result.rowCount) throw new ConflictException('Only pending products from active shops can be reviewed');
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'product', $3)`, [adminId, approved ? 'PRODUCT_APPROVED' : 'PRODUCT_RETURNED_TO_DRAFT', productId]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createVariant(
    client: PoolClient,
    actorId: string,
    shopId: string,
    productId: string,
    locationId: string,
    variant: ProductVariantDto,
  ) {
    const sku = variant.sku?.trim() || `PULS-${randomUUID()}`;
    const result = await client.query<{ id: string }>(
      `INSERT INTO product_variants (product_id, shop_id, sku, size, color, price_xof, weight_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [productId, shopId, sku, variant.size?.trim() ?? '', variant.color?.trim() ?? '',
        variant.priceXof, variant.weightG ?? null]);
    const quantity = variant.quantityAvailable ?? 0;
    await client.query(
      `INSERT INTO inventory (variant_id, location_id, quantity_available) VALUES ($1, $2, $3)`,
      [result.rows[0].id, locationId, quantity]);
    if (quantity > 0) {
      await client.query(
        `INSERT INTO stock_movements (variant_id, location_id, movement_type, quantity, actor_id, reason)
         VALUES ($1, $2, 'RESTOCK', $3, $4, 'Stock initial produit')`,
        [result.rows[0].id, locationId, quantity, actorId]);
    }
  }

  private async setAvailableQuantity(
    client: PoolClient,
    actorId: string,
    variantId: string,
    locationId: string,
    quantityAvailable: number,
    knownOldQuantity?: number,
  ) {
    let oldQuantity = knownOldQuantity;
    if (oldQuantity === undefined) {
      const previous = await client.query<{ quantity_available: number }>(
        `SELECT quantity_available FROM inventory WHERE variant_id = $1 AND location_id = $2 FOR UPDATE`,
        [variantId, locationId]);
      oldQuantity = previous.rows[0]?.quantity_available ?? 0;
    }
    const change = quantityAvailable - oldQuantity;
    await client.query(
      `INSERT INTO inventory (variant_id, location_id, quantity_available)
       VALUES ($1, $2, $3)
       ON CONFLICT (variant_id, location_id) DO UPDATE SET quantity_available = EXCLUDED.quantity_available`,
      [variantId, locationId, quantityAvailable]);
    if (change !== 0) {
      await client.query(
        `INSERT INTO stock_movements (variant_id, location_id, movement_type, quantity, actor_id, reason)
         VALUES ($1, $2, $3::movement_type, $4, $5, 'Ajustement de stock par la boutique')`,
        [variantId, locationId, change > 0 ? 'RESTOCK' : 'ADJUSTMENT', change, actorId]);
    }
    return change;
  }

  private async ownedShop(db: Pool | PoolClient, ownerId: string, shopId: string, forUpdate = false) {
    const result = await db.query<ShopRow>(
      `SELECT id, name, slug, status FROM shops
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL ${forUpdate ? 'FOR UPDATE' : ''}`,
      [shopId, ownerId]);
    if (!result.rowCount) throw new NotFoundException('Shop not found');
    return result.rows[0];
  }

  private async ensureCategory(db: Pool | PoolClient, categoryId: string) {
    const result = await db.query('SELECT 1 FROM categories WHERE id = $1', [categoryId]);
    if (!result.rowCount) throw new BadRequestException('Unknown category');
  }

  private async stockLocation(db: PoolClient, shopId: string, shopName: string) {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [shopId]);
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE shop_id = $1 AND location_type = 'SHOP' ORDER BY id LIMIT 1`, [shopId]);
    if (existing.rowCount) return existing.rows[0].id;
    const created = await db.query<{ id: string }>(
      `INSERT INTO stock_locations (location_type, shop_id, name)
       VALUES ('SHOP', $1, $2) RETURNING id`, [shopId, `Stock ${shopName}`]);
    return created.rows[0].id;
  }

  private async assertOwnedProduct(ownerId: string, productId: string) {
    const result = await this.pool.query(
      `SELECT 1 FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [productId, ownerId]);
    if (!result.rowCount) throw new NotFoundException('Product not found');
  }

  private async editableProduct(ownerId: string, productId: string) {
    const result = await this.pool.query<{ id: string; status: string }>(
      `SELECT p.id, p.status FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [productId, ownerId]);
    if (!result.rowCount) throw new NotFoundException('Product not found');
    if (!['DRAFT', 'DISABLED'].includes(result.rows[0].status)) {
      throw new ConflictException('Only draft or returned products can be changed');
    }
    return result.rows[0];
  }
}

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

function imageExtension(buffer: Buffer, mimetype: string): string {
  const signatures: Array<[string, string, () => boolean]> = [
    ['image/jpeg', 'jpg', () => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff],
    ['image/png', 'png', () => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
    ['image/webp', 'webp', () => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'],
  ];
  const match = signatures.find(([type, , valid]) => type === mimetype && valid());
  if (!match) throw new BadRequestException('Only valid JPEG, PNG or WebP images are accepted');
  return match[1];
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
