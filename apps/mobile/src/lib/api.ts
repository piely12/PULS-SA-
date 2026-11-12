export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  fullName: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  basePriceXof: string;
  priceMinXof: string;
  priceMaxXof: string;
  available: number;
  image: string | null;
  category: { id: string; name: string; slug: string };
  shop: { id: string; name: string; slug: string };
  brand: { id: string; name: string } | null;
  variants?: {
    id: string;
    sku: string;
    size: string;
    color: string;
    priceXof: string;
    available: number;
  }[];
}

export interface CatalogPage {
  items: CatalogProduct[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api'
).replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(`Serveur inaccessible à ${API_BASE_URL}. Vérifiez l’adresse de l’API.`);
  }

  const body = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message ?? 'La requête a échoué.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const authApi = {
  register: (input: Registration) =>
    request<AuthSession>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  login: (input: Credentials) =>
    request<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  me: (accessToken: string) =>
    request<AuthUser>('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  refresh: (refreshToken: string) =>
    request<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken: string) =>
    request<{ success: true }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
};

export const catalogApi = {
  categories: () => request<CatalogCategory[]>('/catalog/categories'),
  products: (filters: { q?: string; category?: string; page?: number } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', '20');
    params.set('sort', 'newest');
    if (filters.q) params.set('q', filters.q);
    if (filters.category) params.set('category', filters.category);
    if (filters.page) params.set('page', String(filters.page));
    return request<CatalogPage>(`/catalog/products?${params.toString()}`);
  },
  product: (id: string) => request<CatalogProduct>(`/catalog/products/${id}`),
};
