import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Global, Injectable, Module, NotFoundException, Param, Post, Query, Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Invoice, Plan, Subscription } from '@prisma/client';
import { z } from 'zod';
import { AuditService, AuthCtx, Ctx, MinRole, parse, PrismaService, Public } from '../common/core';

export const DEFAULT_PLANS = [
  { code: 'trial', name: 'آزمایشی ۱۴ روزه', priceMonthly: 0, maxLeads: 1000, maxUsers: 3, maxIntegrations: 1, maxImportsMonthly: 10, sortOrder: 0, features: ['CRM کامل', 'ورود CSV/Excel', 'یک اتصال اینستاگرام'] },
  { code: 'starter', name: 'پایه', priceMonthly: 490_000, maxLeads: 5000, maxUsers: 3, maxIntegrations: 1, maxImportsMonthly: 30, sortOrder: 1, features: ['CRM کامل', 'کمپین‌ها و پیگیری‌ها', 'یک اتصال اینستاگرام'] },
  { code: 'pro', name: 'حرفه‌ای', priceMonthly: 1_290_000, maxLeads: 50000, maxUsers: 10, maxIntegrations: 3, maxImportsMonthly: 200, sortOrder: 2, features: ['همه امکانات پایه', 'Lead Ads متا', 'کشف کسب‌وکار', 'گزارش‌های پیشرفته'] },
  { code: 'enterprise', name: 'سازمانی', priceMonthly: 3_900_000, maxLeads: 500000, maxUsers: 100, maxIntegrations: 20, maxImportsMonthly: 5000, sortOrder: 3, features: ['همه امکانات', 'پشتیبانی اختصاصی', 'محدودیت‌های بالا'] },
];

export type LimitKey = 'leads' | 'users' | 'integrations' | 'imports';

// ---------- Payment provider abstraction ----------
export interface PaymentInit { redirectUrl?: string; providerRef?: string; manual?: boolean }
export interface PaymentProvider {
  name: string;
  create(invoice: Invoice, description: string, callbackUrl: string): Promise<PaymentInit>;
  verify(invoice: Invoice, params: Record<string, string>): Promise<{ ok: boolean; ref?: string; message?: string }>;
}

/** Manual / bank-transfer: invoice stays pending until a platform admin confirms payment. */
class ManualProvider implements PaymentProvider {
  name = 'manual';
  async create() { return { manual: true }; }
  async verify() { return { ok: false, message: 'پرداخت دستی باید توسط مدیر سامانه تأیید شود' }; }
}

/** Zarinpal REST v4 (amounts in IRR). Docs: https://www.zarinpal.com/docs/paymentGateway/ */
class ZarinpalProvider implements PaymentProvider {
  name = 'zarinpal';
  private get base() { return process.env.ZARINPAL_SANDBOX === 'false' ? 'https://payment.zarinpal.com' : 'https://sandbox.zarinpal.com'; }
  private get merchant() {
    const m = process.env.ZARINPAL_MERCHANT_ID;
    if (!m) throw new BadRequestException('درگاه زرین‌پال پیکربندی نشده است (ZARINPAL_MERCHANT_ID)');
    return m;
  }
  async create(inv: Invoice, description: string, callback_url: string) {
    const r = await fetch(`${this.base}/pg/v4/payment/request.json`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ merchant_id: this.merchant, amount: inv.amount * 10, description, callback_url, metadata: { order_id: inv.number } }),
    });
    const j: any = await r.json().catch(() => ({}));
    const authority = j?.data?.authority;
    if (!authority || j?.data?.code !== 100) throw new BadRequestException(`خطای درگاه پرداخت: ${JSON.stringify(j?.errors ?? j).slice(0, 200)}`);
    return { providerRef: authority, redirectUrl: `${this.base}/pg/StartPay/${authority}` };
  }
  async verify(inv: Invoice, p: Record<string, string>) {
    if (p.Status !== 'OK') return { ok: false, message: 'پرداخت لغو شد' };
    const r = await fetch(`${this.base}/pg/v4/payment/verify.json`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ merchant_id: this.merchant, amount: inv.amount * 10, authority: p.Authority }),
    });
    const j: any = await r.json().catch(() => ({}));
    const code = j?.data?.code;
    return code === 100 || code === 101 ? { ok: true, ref: String(j.data.ref_id) } : { ok: false, message: 'تأیید پرداخت ناموفق بود' };
  }
}

export function paymentProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === 'zarinpal' ? new ZarinpalProvider() : new ManualProvider();
}

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  effectiveStatus(s: Subscription) {
    const now = new Date();
    if (s.status === 'TRIALING' && s.trialEndsAt && s.trialEndsAt < now) return 'EXPIRED';
    if (s.status === 'ACTIVE' && s.currentPeriodEnd && s.currentPeriodEnd < now) return 'EXPIRED';
    return s.status;
  }

  async subscription(orgId: string) {
    const s = await this.prisma.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } });
    if (!s) throw new NotFoundException('اشتراکی یافت نشد');
    return { ...s, effectiveStatus: this.effectiveStatus(s) };
  }

  async usage(orgId: string) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [leads, users, integrations, imports] = await Promise.all([
      this.prisma.lead.count({ where: { organizationId: orgId } }),
      this.prisma.membership.count({ where: { organizationId: orgId } }),
      this.prisma.integration.count({ where: { organizationId: orgId, status: { not: 'DISCONNECTED' } } }),
      this.prisma.job.count({ where: { organizationId: orgId, type: { in: ['IMPORT', 'DISCOVERY'] }, createdAt: { gte: monthStart } } }),
    ]);
    return { leads, users, integrations, imports };
  }

  private limitOf(plan: Plan, key: LimitKey) {
    return { leads: plan.maxLeads, users: plan.maxUsers, integrations: plan.maxIntegrations, imports: plan.maxImportsMonthly }[key];
  }

  /** Throws if the subscription is expired or adding `adding` items would exceed the plan limit. */
  async assert(orgId: string, key: LimitKey, adding = 1) {
    const s = await this.subscription(orgId);
    if (s.effectiveStatus === 'EXPIRED' || s.effectiveStatus === 'CANCELED')
      throw new ForbiddenException('اشتراک شما منقضی شده است؛ لطفاً از بخش اشتراک، طرح خود را تمدید کنید');
    const u = await this.usage(orgId);
    const limit = this.limitOf(s.plan, key);
    if (u[key] + adding > limit) throw new ForbiddenException(`به سقف طرح «${s.plan.name}» رسیده‌اید (${key}: ${limit})`);
    return limit - u[key];
  }

  async remaining(orgId: string, key: LimitKey) {
    const s = await this.subscription(orgId);
    if (s.effectiveStatus === 'EXPIRED' || s.effectiveStatus === 'CANCELED') return 0;
    return Math.max(0, this.limitOf(s.plan, key) - (await this.usage(orgId))[key]);
  }

  async checkout(ctx: AuthCtx, planCode: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.active || plan.priceMonthly <= 0) throw new BadRequestException('طرح نامعتبر است');
    const u = await this.usage(ctx.orgId);
    if (u.leads > plan.maxLeads || u.users > plan.maxUsers || u.integrations > plan.maxIntegrations)
      throw new BadRequestException('مصرف فعلی شما بیشتر از سقف این طرح است؛ ابتدا داده‌ها یا کاربران را کاهش دهید');
    const sub = await this.subscription(ctx.orgId);
    const start = sub.effectiveStatus === 'ACTIVE' && sub.currentPeriodEnd && sub.planId === plan.id ? sub.currentPeriodEnd : new Date();
    const end = new Date(start.getTime() + 30 * 864e5);
    const count = await this.prisma.invoice.count();
    const provider = paymentProvider();
    let inv = await this.prisma.invoice.create({
      data: {
        organizationId: ctx.orgId, planId: plan.id, amount: plan.priceMonthly, provider: provider.name,
        number: `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`, periodStart: start, periodEnd: end,
      },
    });
    const init = await provider.create(inv, `اشتراک ${plan.name} - EAZAZI LEAD`, `${process.env.API_URL}/api/billing/callback/${inv.id}`);
    if (init.providerRef) inv = await this.prisma.invoice.update({ where: { id: inv.id }, data: { providerRef: init.providerRef } });
    await this.audit.log(ctx, 'billing.checkout', 'invoice', inv.id, { plan: plan.code });
    return { invoice: inv, ...init };
  }

  /** Marks an invoice paid and activates/extends the subscription. Idempotent. */
  async markPaid(invoiceId: string, ref?: string) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (inv.status === 'PAID') return inv;
      const paid = await tx.invoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: new Date(), providerRef: ref ?? inv.providerRef } });
      await tx.subscription.update({
        where: { organizationId: inv.organizationId },
        data: { planId: inv.planId, status: 'ACTIVE', currentPeriodEnd: inv.periodEnd, trialEndsAt: null },
      });
      return paid;
    });
  }
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService, private prisma: PrismaService, private audit: AuditService) {}

  @Public() @Get('plans')
  plans() { return this.prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }); }

  @Get('subscription')
  async sub(@Ctx() ctx: AuthCtx) {
    const [subscription, usage] = await Promise.all([this.billing.subscription(ctx.orgId), this.billing.usage(ctx.orgId)]);
    return { subscription, usage, provider: paymentProvider().name };
  }

  @Get('invoices')
  invoices(@Ctx() ctx: AuthCtx) {
    return this.prisma.invoice.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' } });
  }

  @MinRole('ADMIN') @Post('checkout')
  checkout(@Ctx() ctx: AuthCtx, @Body() body: unknown) {
    const d = parse(z.object({ planCode: z.string() }), body);
    return this.billing.checkout(ctx, d.planCode);
  }

  @MinRole('ADMIN') @Post('cancel')
  async cancel(@Ctx() ctx: AuthCtx) {
    await this.prisma.subscription.update({ where: { organizationId: ctx.orgId }, data: { status: 'CANCELED' } });
    await this.audit.log(ctx, 'billing.cancel', 'subscription');
    return { ok: true };
  }

  @Public() @Get('callback/:invoiceId')
  async callback(@Param('invoiceId') id: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    const app = process.env.APP_URL ?? '';
    if (!inv) return res.redirect(`${app}/#/billing?payment=failed`);
    const r = await paymentProvider().verify(inv, q).catch(() => ({ ok: false } as { ok: boolean; ref?: string }));
    if (r.ok) { await this.billing.markPaid(inv.id, r.ref); await this.audit.log({ orgId: inv.organizationId }, 'billing.paid', 'invoice', inv.id); }
    else await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED' } });
    return res.redirect(`${app}/#/billing?payment=${r.ok ? 'success' : 'failed'}`);
  }
}

@Global()
@Module({ controllers: [BillingController], providers: [BillingService], exports: [BillingService] })
export class BillingModule {}
