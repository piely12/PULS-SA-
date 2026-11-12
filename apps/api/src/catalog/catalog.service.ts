import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

type ProductSort = 'newest' | 'price_asc' | 'price_desc';

interface ProductFilters {
  query?: string;
  category?: string;
  shop?: string;
  sort?: string;
  page: number;
  limit: number;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  base_price_xof: string;
  category: { id: string; name: string; slug: string };
  shop: { id: string; name: string; slug: string };
  brand: { id: string; name: string } | null;
  image: string | null;
  price_min_xof: string;
  price_max_xof: string;
  available: number;
  variants?: Array<{
    id: string;
    sku: string;
    size: string;
    color: string;
    priceXof: string;
    available: number;
  }>;
  created_at: Date;
}

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, p.base_price_xof,
         p.created_at,
         json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
         json_build_object('id', s.id, 'name', s.name, 'slug', s.slug) AS shop,
         CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('id', b.id, 'name', b.name) END AS brand,
         (SELECT pi.file_key FROM product_images pi
          WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.position, pi.id LIMIT 1) AS image,
         COALESCE((SELECT min(v.price_xof) FROM product_variants v
                   WHERE v.product_id = p.id AND v.is_active), p.base_price_xof) AS price_min_xof,
         COALESCE((SELECT max(v.price_xof) FROM product_variants v
                   WHERE v.product_id = p.id AND v.is_active), p.base_price_xof) AS price_max_xof,
         COALESCE((SELECT sum(i.quantity_available)::int
                   FROM product_variants v
                   JOIN inventory i ON i.variant_id = v.id
                   JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = p.shop_id
                   WHERE v.product_id = p.id AND v.is_active), 0)::int AS available
    FROM products p
    JOIN shops s ON s.id = p.shop_id
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.shop_id = p.shop_id`;

@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async categories() {
    const result = await this.pool.query(
      `SELECT id, name, slug, parent_id AS "parentId"
         FROM categories ORDER BY name`);
    return result.rows;
  }

  async products(filters: ProductFilters) {
    const page = Number.isFinite(filters.page) ? Math.max(1, filters.page) : 1;
    const limit = Number.isFinite(filters.limit) ? Math.min(50, Math.max(1, filters.limit)) : 20;
    const sort = (filters.sort ?? 'newest') as ProductSort;
    if (!['newest', 'price_asc', 'price_desc'].includes(sort)) {
      throw new BadRequestException('sort must be newest, price_asc or price_desc');
    }

    const values: unknown[] = [];
    const where = ["p.status = 'PUBLISHED'", 'p.deleted_at IS NULL', "s.status = 'ACTIVE'", 's.deleted_at IS NULL'];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filters.query?.trim()) {
      const token = add(`%${filters.query.trim().slice(0, 100)}%`);
      where.push(`(p.name ILIKE ${token} OR p.description ILIKE ${token} OR s.name ILIKE ${token})`);
    }
    if (filters.category?.trim()) where.push(`c.slug = ${add(filters.category.trim())}`);
    if (filters.shop?.trim()) where.push(`s.slug = ${add(filters.shop.trim())}`);

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM products p
       JOIN shops s ON s.id = p.shop_id
       JOIN categories c ON c.id = p.category_id ${whereSql}`,
      values,
    );
    const orderBy = sort === 'price_asc'
      ? 'price_min_xof ASC, p.created_at DESC'
      : sort === 'price_desc'
        ? 'price_min_xof DESC, p.created_at DESC'
        : 'p.created_at DESC, p.id';
    const pageValues = [...values, limit, (page - 1) * limit];
    const result = await this.pool.query<ProductRow>(
      `${PRODUCT_SELECT} ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return {
      items: result.rows.map((row) => this.serializeProduct(row)),
      pagination: { page, limit, total: Number(countResult.rows[0]?.total ?? 0),
        pages: Math.ceil(Number(countResult.rows[0]?.total ?? 0) / limit) },
    };
  }

  async product(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException('Invalid product id');
    }
    const result = await this.pool.query<ProductRow>(
      `${PRODUCT_SELECT}
       WHERE p.id = $1 AND p.status = 'PUBLISHED' AND p.deleted_at IS NULL
         AND s.status = 'ACTIVE' AND s.deleted_at IS NULL`, [id]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Product not found');

    const variants = await this.pool.query<NonNullable<ProductRow['variants']>[number] & { price_xof: string }>(
      `SELECT v.id, v.sku, v.size, v.color, v.price_xof,
              COALESCE(sum(i.quantity_available) FILTER (WHERE sl.id IS NOT NULL)::int, 0)::int AS available
         FROM product_variants v
         LEFT JOIN inventory i ON i.variant_id = v.id
         LEFT JOIN stock_locations sl ON sl.id = i.location_id AND sl.shop_id = v.shop_id
        WHERE v.product_id = $1 AND v.is_active
        GROUP BY v.id ORDER BY v.size, v.color`, [id]);
    row.variants = variants.rows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      priceXof: variant.price_xof,
      available: Number(variant.available),
    }));
    return this.serializeProduct(row);
  }

  private serializeProduct(row: ProductRow) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      basePriceXof: row.base_price_xof,
      priceMinXof: row.price_min_xof,
      priceMaxXof: row.price_max_xof,
      available: Number(row.available),
      image: row.image,
      category: row.category,
      shop: row.shop,
      brand: row.brand,
      ...(row.variants ? { variants: row.variants } : {}),
    };
  }
}
