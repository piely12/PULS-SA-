export type AuthRole = 'CUSTOMER' | 'SHOP_OWNER' | 'LOGISTICS_AGENT' | 'COURIER' | 'ADMIN';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: AuthRole[];
  typ: 'access';
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user: AccessTokenPayload;
}
