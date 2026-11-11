import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool, PoolClient } from 'pg';
import { compare, hash } from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { DATABASE_POOL } from '../database/database.module';
import { LoginDto, RegisterDto } from './auth.dto';
import { AccessTokenPayload, AuthRole } from './auth.types';

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  roles: AuthRole[];
}

interface RefreshPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly accessSecret = this.requiredSecret('JWT_ACCESS_SECRET');
  private readonly refreshSecret = this.requiredSecret('JWT_REFRESH_SECRET');

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, 12);
    const client = await this.pool.connect();
    let user: Pick<UserRecord, 'id' | 'email' | 'full_name'>;

    try {
      await client.query('BEGIN');
      const result = await client.query<Pick<UserRecord, 'id' | 'email' | 'full_name'>>(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, full_name`,
        [email, passwordHash, input.fullName.trim()],
      );
      user = result.rows[0];
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'CUSTOMER'`,
        [user.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException('Email already registered');
      throw error;
    } finally {
      client.release();
    }

    return this.issueTokens(user, ['CUSTOMER']);
  }

  async login(input: LoginDto) {
    const result = await this.pool.query<UserRecord>(
      `SELECT u.id, u.email, u.full_name, u.password_hash,
              COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE lower(u.email) = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [input.email.trim().toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !(await compare(input.password, user.password_hash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user, user.roles);
  }

  async refresh(refreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
      if (payload.typ !== 'refresh' || !payload.jti || !payload.sub) throw new Error();
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query<{ user_id: string }>(
        `UPDATE auth_refresh_tokens
         SET revoked_at = now()
         WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
         RETURNING user_id`,
        [tokenHash(refreshToken), payload.sub],
      );
      if (!revoked.rowCount) throw new UnauthorizedException('Refresh token already used or revoked');

      const userResult = await client.query<UserRecord>(
        `SELECT u.id, u.email, u.full_name, u.password_hash,
                COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
         GROUP BY u.id`,
        [payload.sub],
      );
      const user = userResult.rows[0];
      if (!user) throw new UnauthorizedException('User is unavailable');

      const tokens = await this.createTokens(user, client);
      await client.query('COMMIT');
      return tokens;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
      if (payload.typ !== 'refresh' || !payload.sub) throw new Error();
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    await this.pool.query(
      `UPDATE auth_refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [tokenHash(refreshToken), payload.sub],
    );
    return { success: true };
  }

  accessPayload(payload: AccessTokenPayload) {
    return { id: payload.sub, email: payload.email, roles: payload.roles };
  }

  private async issueTokens(user: Pick<UserRecord, 'id' | 'email' | 'full_name'>, roles: AuthRole[]) {
    return this.createTokens({ id: user.id, email: user.email, roles }, this.pool);
  }

  private async createTokens(
    user: Pick<UserRecord, 'id' | 'email' | 'roles'>,
    db: Pool | PoolClient,
  ) {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      typ: 'access',
    };
    const refreshId = randomUUID();
    const refreshPayload: RefreshPayload = { sub: user.id, jti: refreshId, typ: 'refresh' };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, { secret: this.accessSecret, expiresIn: '15m' }),
      this.jwt.signAsync(refreshPayload, { secret: this.refreshSecret, expiresIn: '7d' }),
    ]);
    await db.query(
      `INSERT INTO auth_refresh_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '7 days')`,
      [tokenHash(refreshToken), user.id],
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 };
  }

  private requiredSecret(name: string): string {
    const value = process.env[name];
    if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
    return value;
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
