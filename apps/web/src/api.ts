const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api').replace(/\/$/, '');

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  roles: string[];
}

export interface Shop {
  id: string;
  name: string;
  slug: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  priceXof: string;
  weightG?: number | null;
  available: number;
}

export interface ProductImage {
  id: string;
  fileKey: string;
  isPrimary: boolean;
}

export interface SellerProduct {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'DISABLED';
  basePriceXof: string;
  categoryId: string;
  categoryName: string;
  createdAt: string;
  available: number;
  variantCount: number;
  variants: ProductVariant[];
  images: ProductImage[];
  image: string | null;
}

export interface PendingProduct {
  id: string;
  name: string;
  description: string | null;
  basePriceXof: string;
  createdAt: string;
  categoryName: string;
  shopName: string;
  image: string | null;
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error(`API inaccessible à ${API_BASE_URL}. Vérifiez que Docker et l’API sont démarrés.`);
  }
  const body = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new Error(message ?? `La requête a échoué (${response.status}).`);
  }
  return body as T;
}

export const webApi = {
  login: (email: string, password: string) => request<AuthSession>('/auth/login', undefined, {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  me: (token: string) => request<CurrentUser>('/auth/me', token),
  logout: (refreshToken: string) => request<{ success: true }>('/auth/logout', undefined, {
    method: 'POST', body: JSON.stringify({ refreshToken }),
  }),
  categories: () => request<Category[]>('/catalog/categories'),
  shops: (token: string) => request<Shop[]>('/seller/shops', token),
  products: (token: string, shopId: string) =>
    request<{ shop: Shop; products: SellerProduct[] }>(`/seller/shops/${shopId}/products`, token),
  createProduct: (token: string, shopId: string, product: unknown) =>
    request<{ id: string; status: SellerProduct['status'] }>(`/seller/shops/${shopId}/products`, token, {
      method: 'POST', body: JSON.stringify(product),
    }),
  updateProduct: (token: string, productId: string, product: unknown) =>
    request<{ id: string; status: SellerProduct['status'] }>(`/seller/products/${productId}`, token, {
      method: 'PATCH', body: JSON.stringify(product),
    }),
  updateStock: (token: string, productId: string, variantId: string, quantityAvailable: number) =>
    request<{ variantId: string; quantityAvailable: number }>(
      `/seller/products/${productId}/variants/${variantId}/stock`, token,
      { method: 'PATCH', body: JSON.stringify({ quantityAvailable }) },
    ),
  submitProduct: (token: string, productId: string) =>
    request<{ id: string; status: SellerProduct['status'] }>(`/seller/products/${productId}/submit`, token, { method: 'POST' }),
  uploadImage: (token: string, productId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; fileKey: string; isPrimary: boolean }>(
      `/seller/products/${productId}/images`, token, { method: 'POST', body: form },
    );
  },
  deleteImage: (token: string, productId: string, imageId: string) =>
    request<{ success: true }>(`/seller/products/${productId}/images/${imageId}`, token, { method: 'DELETE' }),
  pendingProducts: (token: string) => request<PendingProduct[]>('/admin/products', token),
  reviewProduct: (token: string, productId: string, approved: boolean) =>
    request<{ id: string; status: SellerProduct['status'] }>(`/admin/products/${productId}/review`, token, {
      method: 'POST', body: JSON.stringify({ approved }),
    }),
  mediaUrl: (key: string | null) => key ? `${API_BASE_URL}/media/${key}` : null,
};

export function formatXof(value: number | string) {
  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
}
