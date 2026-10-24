import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { InjectDb, type Database } from '../db/db.module.js';
import { sessions, users, type UserRole } from '../db/schema.js';
import { AuthUser, IS_PUBLIC, ROLES } from './auth.decorators.js';

export interface AccessPayload {
  sub: string;
  sid: string;
}

/**
 * Varsayılan olarak tüm uç noktaları korur; `@Public()` ile işaretlenenler hariç.
 * Erişim belirteci `Authorization: Bearer <token>` başlığıyla gelir.
 *
 * Belirteç doğrulandıktan sonra kullanıcı ve oturum veritabanından okunur:
 * böylece rol değişikliği (onay), askıya alma ve çıkış anında etkili olur.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectDb() private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown>; user?: AuthUser }>();
    const header = req.headers['authorization'];
    const token =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : null;
    if (!token) throw new UnauthorizedException('Oturum açmanız gerekiyor');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException('Oturumun süresi doldu veya geçersiz');
    }

    const [row] = await this.db
      .select({ role: users.role, status: users.status })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, payload.sid),
          eq(sessions.userId, payload.sub),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) throw new UnauthorizedException('Oturum sonlandırılmış');
    if (row.status === 'suspended') {
      throw new ForbiddenException('Hesabınız askıya alınmış');
    }
    req.user = { id: payload.sub, role: row.role, sessionId: payload.sid };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.role || !roles.includes(user.role)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    return true;
  }
}
