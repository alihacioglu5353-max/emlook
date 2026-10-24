import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '../db/schema.js';

/** JWT'den çözülen ve isteğe iliştirilen kullanıcı bilgisi. */
export interface AuthUser {
  id: string;
  /** Kayıt tamamlanmadıysa null */
  role: UserRole | null;
  sessionId: string;
}

export const IS_PUBLIC = 'isPublic';
/** Kimlik doğrulama gerektirmeyen uç noktaları işaretler. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Uç noktayı belirtilen rollerle sınırlar. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

/** İsteği yapan istemcinin IP ve tarayıcı bilgisi (rıza ve oturum kayıtları için). */
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export const Client = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ ip?: string; headers: Record<string, unknown> }>();
    const ua = req.headers['user-agent'];
    return {
      ip: req.ip ?? null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    };
  },
);
