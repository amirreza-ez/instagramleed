import { Body, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService, AuthCtx, Ctx, pageSchema, parse, PrismaService, Public, SuperAdminOnly } from '../common/core';
import { BillingService } from './billing';

const started = Date.now();

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public() @Get()
  async health() {
    const t = Date.now();
    await this.prisma.$queryRaw`select 1`;
    return { status: 'ok', db: 'ok', dbLatencyMs: Date.now() - t, uptimeSec: Math.round((Date.now() - started) / 1000), version: process.env.npm_package_version ?? '1.0.0' };
  }
}

@ApiTags('admin')
@SuperAdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService, private billing: BillingService, private audit: AuditService) {}

  @Get('overview')
  async overview() {
    const day = new Date(Date.now() - 864e5);
    const [orgs, users, leads, leads24, jobsFailed24, webhookErrors24, pendingInvoices, revenue] = await Promise.all([
      this.prisma.organization.count(), this.prisma.user.count(), this.prisma.lead.count(), this.prisma.lead.count({ where: { createdAt: { gte: day } } }),
      this.prisma.job.count({ where: { status: 'FAILED', createdAt: { gte: day } } }),
      this.prisma.webhookEvent.count({ where: { error: { not: null }, createdAt: { gte: day } } }),
      this.prisma.invoice.count({ where: { status: 'PENDING' } }),
      this.prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    ]);
    const [{ size }] = await this.prisma.$queryRaw<{ size: string }[]>`select pg_size_pretty(pg_database_size(current_database())) as size`;
    const subs = await this.prisma.subscription.groupBy({ by: ['status'], _count: true });
    const mem = process.memoryUsage();
    return {
      orgs, users, leads, leads24, jobsFailed24, webhookErrors24, pendingInvoices, revenue: revenue._sum.amount ?? 0,
      subscriptions: subs.map((s) => ({ status: s.status, count: s._count })),
      system: { dbSize: size, uptimeSec: Math.round((Date.now() - started) / 1000), rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), node: process.version },
    };
  }

  @Get('organizations')
  async orgs(@Query('q') q?: string) {
    const orgs = await this.prisma.organization.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {}, orderBy: { createdAt: 'desc' }, take: 200,
      include: { subscription: { include: { plan: true } }, _count: { select: { leads: true, members: true, integrations: true } } },
    });
    return orgs.map(({ webhookKey, subscription, _count, ...o }) => ({
      ...o, plan: subscription?.plan.name, planCode: subscription?.plan.code, status: subscription ? this.billing.effectiveStatus(subscription) : null,
      trialEndsAt: subscription?.trialEndsAt, currentPeriodEnd: subscription?.currentPeriodEnd, counts: _count,
    }));
  }

  @Patch('organizations/:id')
  async updateOrg(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const d = parse(z.object({ suspended: z.boolean().optional(), planCode: z.string().optional(), extendDays: z.number().int().min(1).max(3650).optional() }), b);
    const org = await this.prisma.organization.findUnique({ where: { id }, include: { subscription: true } });
    if (!org) throw new NotFoundException('سازمان یافت نشد');
    if (d.suspended !== undefined) await this.prisma.organization.update({ where: { id }, data: { suspended: d.suspended } });
    if (d.planCode || d.extendDays) {
      const plan = d.planCode ? await this.prisma.plan.findUnique({ where: { code: d.planCode } }) : null;
      if (d.planCode && !plan) throw new NotFoundException('طرح یافت نشد');
      const base = org.subscription?.currentPeriodEnd && org.subscription.currentPeriodEnd > new Date() ? org.subscription.currentPeriodEnd : new Date();
      await this.prisma.subscription.update({
        where: { organizationId: id },
        data: { ...(plan && { planId: plan.id }), ...(d.extendDays && { status: 'ACTIVE', currentPeriodEnd: new Date(base.getTime() + d.extendDays * 864e5), trialEndsAt: null }) },
      });
    }
    await this.audit.log({ ...ctx, orgId: id }, 'admin.org_update', 'organization', id, d);
    return { ok: true };
  }

  @Get('invoices')
  invoices(@Query('status') status?: string) {
    return this.prisma.invoice.findMany({ where: status ? { status: status as any } : {}, orderBy: { createdAt: 'desc' }, take: 200, include: { organization: { select: { name: true } } } });
  }

  @Post('invoices/:id/mark-paid')
  async markPaid(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const inv = await this.billing.markPaid(id, `manual:${ctx.userId}`);
    await this.audit.log({ ...ctx, orgId: inv.organizationId }, 'admin.invoice_paid', 'invoice', id);
    return inv;
  }

  @Get('plans')
  plans() { return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }); }

  @Patch('plans/:id')
  async updatePlan(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const n = z.number().int().min(0);
    const d = parse(z.object({ name: z.string().min(2).max(60).optional(), priceMonthly: n.optional(), maxLeads: n.optional(), maxUsers: n.optional(), maxIntegrations: n.optional(), maxImportsMonthly: n.optional(), active: z.boolean().optional(), features: z.array(z.string().max(80)).max(20).optional() }), b);
    const p = await this.prisma.plan.update({ where: { id }, data: d });
    await this.audit.log(ctx, 'admin.plan_update', 'plan', id, d);
    return p;
  }

  @Get('audit')
  async auditLogs(@Query() q: any) {
    const { page, pageSize } = parse(pageSchema, q);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count(),
    ]);
    return { items, total, page, pageSize };
  }

  @Get('webhooks')
  webhooks() { return this.prisma.webhookEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }); }
}

@Module({ controllers: [HealthController, AdminController] })
export class AdminModule {}
