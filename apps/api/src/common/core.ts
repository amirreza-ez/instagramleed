import {
  BadRequestException, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException,
  Global, Injectable, Module, OnModuleDestroy, OnModuleInit, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role } from '@prisma/client';
import crypto from 'node:crypto';
import { z, ZodType } from 'zod';

// ---------- Prisma ----------
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

// ---------- Crypto ----------
export function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((res, rej) =>
    crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) => (e ? rej(e) : res(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`))));
}
export function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return Promise.resolve(false);
  return new Promise((res) =>
    crypto.scrypt(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 }, (e, key) =>
      res(!e && crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex')))));
}
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function encKey() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 32) throw new Error('ENCRYPTION_KEY missing or too short');
  return crypto.createHash('sha256').update(k).digest();
}
/** AES-256-GCM; output: iv.tag.ciphertext (base64url) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(enc: string): string {
  const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// ---------- Validation ----------
export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException({
      message: 'اطلاعات ارسالی معتبر نیست',
      errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

// ---------- Normalisation (used for duplicate detection) ----------
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function toLatinDigits(s: string) {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}
export function normPhone(v?: string | null): string | null {
  if (!v) return null;
  let d = toLatinDigits(String(v)).replace(/\D/g, '');
  if (d.startsWith('0098')) d = d.slice(4);
  else if (d.startsWith('98') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.length >= 7 ? d : null;
}
export function normUsername(v?: string | null): string | null {
  if (!v) return null;
  let u = String(v).trim().toLowerCase();
  const m = u.match(/instagram\.com\/([^/?#]+)/);
  if (m) u = m[1];
  u = u.replace(/^@/, '').replace(/\/$/, '');
  return /^[a-z0-9._]{1,30}$/.test(u) ? u : null;
}
export function normEmail(v?: string | null): string | null {
  if (!v) return null;
  const e = String(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// ---------- Auth context, guards, decorators ----------
export interface AuthCtx { userId: string; orgId: string; role: Role; isSuperAdmin: boolean }
export const ROLE_RANK: Record<Role, number> = { VIEWER: 1, AGENT: 2, MANAGER: 3, ADMIN: 4, OWNER: 5 };

export const IS_PUBLIC = 'isPublic';
export const MIN_ROLE = 'minRole';
export const SUPER_ADMIN = 'superAdmin';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const MinRole = (r: Role) => SetMetadata(MIN_ROLE, r);
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);
export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): AuthCtx => ec.switchToHttp().getRequest().auth);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ec: ExecutionContext) {
    const targets = [ec.getHandler(), ec.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ec.switchToHttp().getRequest();
    const h: string = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new UnauthorizedException('ابتدا وارد شوید');
    let p: any;
    try { p = await this.jwt.verifyAsync(h.slice(7)); } catch { throw new UnauthorizedException('نشست منقضی شده است'); }
    // Re-check membership each request so role changes / removals take effect immediately.
    const m = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: p.sub, organizationId: p.org } },
      include: { user: true, organization: true },
    });
    if (!m || !m.user.active) throw new UnauthorizedException('دسترسی شما غیرفعال است');
    if (m.organization.suspended && !m.user.isSuperAdmin) throw new ForbiddenException('حساب سازمان تعلیق شده است');
    const auth: AuthCtx = { userId: p.sub, orgId: p.org, role: m.role, isSuperAdmin: m.user.isSuperAdmin };
    req.auth = auth;
    if (this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN, targets) && !auth.isSuperAdmin) throw new ForbiddenException('فقط مدیر سامانه');
    const min = this.reflector.getAllAndOverride<Role>(MIN_ROLE, targets);
    if (min && ROLE_RANK[auth.role] < ROLE_RANK[min]) throw new ForbiddenException('شما مجوز این عملیات را ندارید');
    return true;
  }
}

// ---------- Audit ----------
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  log(ctx: Partial<AuthCtx> | null, action: string, entity?: string, entityId?: string, meta?: any, ip?: string) {
    return this.prisma.auditLog
      .create({ data: { organizationId: ctx?.orgId, userId: ctx?.userId, action, entity, entityId, meta, ip } })
      .catch(() => undefined);
  }
}

@Global()
@Module({ providers: [PrismaService, AuditService], exports: [PrismaService, AuditService] })
export class CoreModule {}

/** Pagination helper */
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(25) });

/** Rate-limit helper: production limits, relaxed only for the automated test suite. */
export const rl = (limit: number, ttl = 60_000) => ({ default: { limit: process.env.NODE_ENV === 'test' ? limit * 100 : limit, ttl } });
