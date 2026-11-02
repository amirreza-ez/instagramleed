import { Body, Controller, Get, Module, Post, Req, Res, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import {
  AuditService, AuthCtx, Ctx, hashPassword, parse, PrismaService, Public, randomToken, rl, sha256, verifyPassword,
} from '../common/core';

export const DEFAULT_CATEGORIES = [
  ['عمده‌فروش موبایل', '#1e3a8a'], ['فروشگاه موبایل', '#0369a1'], ['فروشگاه لوازم جانبی', '#0f766e'],
  ['همکار تجاری', '#7c3aed'], ['مشتری بالقوه', '#b45309'], ['مشتری فعال', '#15803d'],
] as const;
export const TRIAL_DAYS = 14;

/** Creates an organisation with owner membership, default categories and a trial subscription. */
export async function bootstrapOrganization(
  tx: Prisma.TransactionClient, input: { name: string; businessType?: string; ownerId: string; slug?: string },
) {
  const slug = input.slug ?? `org-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const org = await tx.organization.create({
    data: { name: input.name, businessType: input.businessType, slug, webhookKey: randomToken(24) },
  });
  await tx.membership.create({ data: { userId: input.ownerId, organizationId: org.id, role: Role.OWNER } });
  await tx.category.createMany({ data: DEFAULT_CATEGORIES.map(([name, color], i) => ({ organizationId: org.id, name, color, sortOrder: i })) });
  const trial = await tx.plan.findUnique({ where: { code: 'trial' } });
  if (trial) {
    await tx.subscription.create({
      data: { organizationId: org.id, planId: trial.id, status: 'TRIALING', trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5) },
    });
  }
  return org;
}

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;
const COOKIE = 'eazazi_rt';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'نام را وارد کنید').max(100),
  email: z.string().trim().toLowerCase().email('ایمیل معتبر نیست'),
  password: z.string().min(8, 'رمز عبور حداقل ۸ کاراکتر باشد').max(128),
  organizationName: z.string().trim().min(2, 'نام کسب‌وکار را وارد کنید').max(120),
  businessType: z.string().trim().max(120).optional(),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('ایمیل معتبر نیست'),
  password: z.string().min(1, 'رمز عبور را وارد کنید'),
  organizationId: z.string().optional(),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  private async issue(userId: string, orgId: string, req: Request, res: Response, family = randomToken(12)) {
    const m = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId: orgId } }, include: { user: true, organization: true },
    });
    const accessToken = await this.jwt.signAsync({ sub: userId, org: orgId, role: m.role }, { expiresIn: ACCESS_TTL });
    const refreshToken = randomToken(32);
    await this.prisma.refreshToken.create({
      data: {
        userId, organizationId: orgId, family, tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
      },
    });
    res.cookie(COOKIE, refreshToken, {
      httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/auth', maxAge: REFRESH_DAYS * 864e5,
    });
    return {
      accessToken, refreshToken,
      user: { id: m.user.id, name: m.user.name, email: m.user.email, isSuperAdmin: m.user.isSuperAdmin },
      organization: { id: m.organization.id, name: m.organization.name },
      role: m.role,
    };
  }

  @Public() @Throttle(rl(5))
  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const d = parse(registerSchema, body);
    if (await this.prisma.user.findUnique({ where: { email: d.email } })) throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    const passwordHash = await hashPassword(d.password);
    const { user, org } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: d.email, name: d.name, passwordHash } });
      const org = await bootstrapOrganization(tx, { name: d.organizationName, businessType: d.businessType, ownerId: user.id });
      return { user, org };
    });
    await this.audit.log({ userId: user.id, orgId: org.id }, 'auth.register', 'organization', org.id, undefined, req.ip);
    return this.issue(user.id, org.id, req, res);
  }

  @Public() @Throttle(rl(10))
  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const d = parse(loginSchema, body);
    const user = await this.prisma.user.findUnique({ where: { email: d.email }, include: { memberships: { orderBy: { createdAt: 'asc' } } } });
    // Constant-ish work even if the user does not exist, to limit user enumeration via timing.
    const ok = user ? await verifyPassword(d.password, user.passwordHash) : await verifyPassword(d.password, 'scrypt$00$00').then(() => false);
    if (!user || !ok || !user.active) {
      await this.audit.log(user ? { userId: user.id } : null, 'auth.login_failed', 'user', user?.id, { email: d.email }, req.ip);
      throw new UnauthorizedException('ایمیل یا رمز عبور اشتباه است');
    }
    const m = user.memberships.find((x) => x.organizationId === d.organizationId) ?? user.memberships[0];
    if (!m) throw new UnauthorizedException('حساب شما به هیچ سازمانی متصل نیست');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ userId: user.id, orgId: m.organizationId }, 'auth.login', 'user', user.id, undefined, req.ip);
    return this.issue(user.id, m.organizationId, req, res);
  }

  @Public() @Throttle(rl(30))
  @Post('refresh')
  async refresh(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string | undefined = body?.refreshToken || req.cookies?.[COOKIE];
    if (!token) throw new UnauthorizedException('نشست یافت نشد');
    const rt = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!rt) throw new UnauthorizedException('نشست نامعتبر است');
    if (rt.revokedAt) {
      // Reuse of a rotated token => possible theft: revoke the whole family.
      await this.prisma.refreshToken.updateMany({ where: { family: rt.family, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ userId: rt.userId, orgId: rt.organizationId }, 'auth.refresh_reuse', 'user', rt.userId, undefined, req.ip);
      throw new UnauthorizedException('نشست نامعتبر است');
    }
    if (rt.expiresAt < new Date()) throw new UnauthorizedException('نشست منقضی شده است');
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revokedAt: new Date() } });
    const orgId = typeof body?.organizationId === 'string' ? body.organizationId : rt.organizationId;
    const member = await this.prisma.membership.findUnique({ where: { userId_organizationId: { userId: rt.userId, organizationId: orgId } } });
    if (!member) throw new UnauthorizedException('دسترسی به این سازمان ندارید');
    return this.issue(rt.userId, orgId, req, res, rt.family);
  }

  @Public()
  @Post('logout')
  async logout(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string | undefined = body?.refreshToken || req.cookies?.[COOKIE];
    if (token) {
      const rt = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (rt) await this.prisma.refreshToken.updateMany({ where: { family: rt.family }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  @Get('me')
  async me(@Ctx() ctx: AuthCtx) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      include: { memberships: { include: { organization: { select: { id: true, name: true } } } } },
    });
    return {
      user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
      role: ctx.role,
      organizationId: ctx.orgId,
      organizations: user.memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  @Post('change-password')
  async changePassword(@Ctx() ctx: AuthCtx, @Body() body: unknown) {
    const d = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(8, 'رمز عبور حداقل ۸ کاراکتر باشد').max(128) }), body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!(await verifyPassword(d.currentPassword, user.passwordHash))) throw new UnauthorizedException('رمز فعلی اشتباه است');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(d.newPassword) } });
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(ctx, 'auth.password_changed', 'user', user.id);
    return { ok: true };
  }
}

@Module({ controllers: [AuthController] })
export class AuthModule {}
