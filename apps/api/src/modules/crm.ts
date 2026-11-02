import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CampaignChannel, CampaignStatus, Priority, Role, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { AuditService, AuthCtx, Ctx, hashPassword, MinRole, pageSchema, parse, PrismaService, randomToken, ROLE_RANK } from '../common/core';
import { BillingService } from './billing';
import { filterSchema, LeadsModule, LeadsService } from './leads';

const s = (max: number) => z.string().trim().max(max);
const optDate = z.coerce.date().optional().nullable();

// =================== Organisation, members, categories, audit ===================
@ApiTags('organization')
@Controller('org')
export class OrgController {
  constructor(private prisma: PrismaService, private audit: AuditService, private billing: BillingService) {}

  @Get()
  async get(@Ctx() ctx: AuthCtx) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
    return { ...org, webhookKey: ROLE_RANK[ctx.role] >= ROLE_RANK.ADMIN ? org.webhookKey : undefined };
  }

  @MinRole('ADMIN') @Patch()
  async update(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(z.object({ name: s(120).min(2).optional(), businessType: s(120).optional().nullable(), phone: s(40).optional().nullable(), city: s(80).optional().nullable(), website: s(200).optional().nullable(), instagram: s(100).optional().nullable() }), b);
    const org = await this.prisma.organization.update({ where: { id: ctx.orgId }, data: d });
    await this.audit.log(ctx, 'org.update', 'organization', ctx.orgId, d);
    return org;
  }

  @MinRole('ADMIN') @Post('webhook-key/rotate')
  async rotate(@Ctx() ctx: AuthCtx) {
    const org = await this.prisma.organization.update({ where: { id: ctx.orgId }, data: { webhookKey: randomToken(24) } });
    await this.audit.log(ctx, 'org.webhook_key_rotated', 'organization', ctx.orgId);
    return { webhookKey: org.webhookKey };
  }

  @Get('members')
  async members(@Ctx() ctx: AuthCtx) {
    const ms = await this.prisma.membership.findMany({ where: { organizationId: ctx.orgId }, include: { user: true }, orderBy: { createdAt: 'asc' } });
    return ms.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, active: m.user.active, lastLoginAt: m.user.lastLoginAt, joinedAt: m.createdAt }));
  }

  @MinRole('ADMIN') @Post('members')
  async addMember(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(z.object({ name: s(100).min(2, 'نام را وارد کنید'), email: z.string().trim().toLowerCase().email('ایمیل معتبر نیست'), password: z.string().min(8, 'رمز عبور حداقل ۸ کاراکتر').max(128).optional(), role: z.nativeEnum(Role) }), b);
    if (d.role === 'OWNER' && ctx.role !== 'OWNER') throw new ForbiddenException('فقط مالک می‌تواند مالک جدید تعیین کند');
    await this.billing.assert(ctx.orgId, 'users');
    let user = await this.prisma.user.findUnique({ where: { email: d.email } });
    let tempPassword: string | undefined;
    if (!user) {
      tempPassword = d.password ?? randomToken(9);
      user = await this.prisma.user.create({ data: { email: d.email, name: d.name, passwordHash: await hashPassword(tempPassword) } });
    }
    if (await this.prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: ctx.orgId } } })) throw new ConflictException('این کاربر قبلاً عضو سازمان است');
    await this.prisma.membership.create({ data: { userId: user.id, organizationId: ctx.orgId, role: d.role } });
    await this.audit.log(ctx, 'member.add', 'user', user.id, { role: d.role });
    return { userId: user.id, tempPassword: d.password ? undefined : tempPassword };
  }

  @MinRole('ADMIN') @Patch('members/:userId')
  async updateMember(@Ctx() ctx: AuthCtx, @Param('userId') userId: string, @Body() b: unknown) {
    const d = parse(z.object({ role: z.nativeEnum(Role) }), b);
    const m = await this.prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: ctx.orgId } } });
    if (!m) throw new NotFoundException('کاربر یافت نشد');
    if ((m.role === 'OWNER' || d.role === 'OWNER') && ctx.role !== 'OWNER') throw new ForbiddenException('فقط مالک می‌تواند نقش مالک را تغییر دهد');
    if (m.role === 'OWNER' && d.role !== 'OWNER' && (await this.prisma.membership.count({ where: { organizationId: ctx.orgId, role: 'OWNER' } })) < 2) throw new BadRequestException('سازمان باید حداقل یک مالک داشته باشد');
    await this.prisma.membership.update({ where: { id: m.id }, data: { role: d.role } });
    await this.audit.log(ctx, 'member.role', 'user', userId, { from: m.role, to: d.role });
    return { ok: true };
  }

  @MinRole('ADMIN') @Delete('members/:userId')
  async removeMember(@Ctx() ctx: AuthCtx, @Param('userId') userId: string) {
    if (userId === ctx.userId) throw new BadRequestException('نمی‌توانید خودتان را حذف کنید');
    const m = await this.prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: ctx.orgId } } });
    if (!m) throw new NotFoundException('کاربر یافت نشد');
    if (m.role === 'OWNER' && ctx.role !== 'OWNER') throw new ForbiddenException('فقط مالک می‌تواند مالک دیگر را حذف کند');
    await this.prisma.$transaction([
      this.prisma.membership.delete({ where: { id: m.id } }),
      this.prisma.refreshToken.updateMany({ where: { userId, organizationId: ctx.orgId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.lead.updateMany({ where: { organizationId: ctx.orgId, assigneeId: userId }, data: { assigneeId: null } }),
    ]);
    await this.audit.log(ctx, 'member.remove', 'user', userId);
    return { ok: true };
  }

  @Get('categories')
  async categories(@Ctx() ctx: AuthCtx) {
    const cats = await this.prisma.category.findMany({ where: { organizationId: ctx.orgId }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { leads: true } } } });
    return cats.map(({ _count, ...c }) => ({ ...c, leadCount: _count.leads }));
  }

  @MinRole('MANAGER') @Post('categories')
  async addCategory(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(z.object({ name: s(60).min(1, 'نام دسته را وارد کنید'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }), b);
    const count = await this.prisma.category.count({ where: { organizationId: ctx.orgId } });
    try { return await this.prisma.category.create({ data: { ...d, organizationId: ctx.orgId, sortOrder: count } }); }
    catch { throw new ConflictException('این دسته‌بندی وجود دارد'); }
  }

  @MinRole('MANAGER') @Patch('categories/:id')
  async updateCategory(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const d = parse(z.object({ name: s(60).min(1).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), sortOrder: z.number().int().optional() }), b);
    const r = await this.prisma.category.updateMany({ where: { id, organizationId: ctx.orgId }, data: d });
    if (!r.count) throw new NotFoundException('دسته‌بندی یافت نشد');
    return { ok: true };
  }

  @MinRole('MANAGER') @Delete('categories/:id')
  async deleteCategory(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.category.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (!r.count) throw new NotFoundException('دسته‌بندی یافت نشد');
    return { ok: true };
  }

  @MinRole('ADMIN') @Get('audit')
  async auditLogs(@Ctx() ctx: AuthCtx, @Query() q: any) {
    const { page, pageSize } = parse(pageSchema, q);
    const where = { organizationId: ctx.orgId, ...(q.action && { action: { startsWith: String(q.action) } }) };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    return { items: items.map((i) => ({ ...i, userName: i.userId ? name.get(i.userId) : null })), total, page, pageSize };
  }
}

// =================== Campaigns ===================
const campaignInput = z.object({
  name: s(120).min(2, 'نام کمپین را وارد کنید'), description: s(2000).optional().nullable(),
  channel: z.nativeEnum(CampaignChannel).optional(), status: z.nativeEnum(CampaignStatus).optional(),
  budget: z.coerce.number().int().min(0).optional().nullable(), startDate: optDate, endDate: optDate,
  utmCampaign: s(100).optional().nullable(), metaCampaignId: s(64).optional().nullable(),
});

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async stats(orgId: string, ids: string[]) {
    const rows = await this.prisma.lead.groupBy({ by: ['campaignId', 'status'], where: { organizationId: orgId, campaignId: { in: ids } }, _count: true });
    const m = new Map<string, { leads: number; qualified: number; won: number; lost: number }>();
    for (const r of rows) {
      const x = m.get(r.campaignId!) ?? { leads: 0, qualified: 0, won: 0, lost: 0 };
      x.leads += r._count;
      if (['QUALIFIED', 'NEGOTIATION', 'WON'].includes(r.status)) x.qualified += r._count;
      if (r.status === 'WON') x.won += r._count;
      if (r.status === 'LOST') x.lost += r._count;
      m.set(r.campaignId!, x);
    }
    return m;
  }
  private present(c: any, st?: { leads: number; qualified: number; won: number; lost: number }) {
    const x = st ?? { leads: 0, qualified: 0, won: 0, lost: 0 };
    const budget = c.budget != null ? Number(c.budget) : null;
    return { ...c, budget, ...x, conversionRate: x.leads ? +(x.won / x.leads * 100).toFixed(1) : 0, costPerLead: budget && x.leads ? Math.round(budget / x.leads) : null };
  }

  @Get()
  async list(@Ctx() ctx: AuthCtx) {
    const cs = await this.prisma.campaign.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' } });
    const st = await this.stats(ctx.orgId, cs.map((c) => c.id));
    return cs.map((c) => this.present(c, st.get(c.id)));
  }

  @Get(':id')
  async get(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const c = await this.prisma.campaign.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!c) throw new NotFoundException('کمپین یافت نشد');
    const st = await this.stats(ctx.orgId, [id]);
    const daily: { day: Date; count: bigint }[] = await this.prisma.$queryRaw`select date_trunc('day', "createdAt") as day, count(*) as count from "Lead" where "organizationId"=${ctx.orgId} and "campaignId"=${id} group by 1 order by 1`;
    const sources = await this.prisma.lead.groupBy({ by: ['source'], where: { organizationId: ctx.orgId, campaignId: id }, _count: true });
    return { ...this.present(c, st.get(id)), daily: daily.map((d) => ({ day: d.day, count: Number(d.count) })), sources: sources.map((s) => ({ source: s.source, count: s._count })) };
  }

  @MinRole('MANAGER') @Post()
  async create(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(campaignInput, b);
    const c = await this.prisma.campaign.create({ data: { ...d, budget: d.budget != null ? BigInt(d.budget) : null, organizationId: ctx.orgId } });
    await this.audit.log(ctx, 'campaign.create', 'campaign', c.id);
    return this.present(c);
  }

  @MinRole('MANAGER') @Patch(':id')
  async update(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const d = parse(campaignInput.partial(), b);
    const r = await this.prisma.campaign.updateMany({ where: { id, organizationId: ctx.orgId }, data: { ...d, budget: d.budget === undefined ? undefined : d.budget === null ? null : BigInt(d.budget) } });
    if (!r.count) throw new NotFoundException('کمپین یافت نشد');
    await this.audit.log(ctx, 'campaign.update', 'campaign', id);
    return this.get(ctx, id);
  }

  @MinRole('MANAGER') @Delete(':id')
  async remove(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.campaign.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (!r.count) throw new NotFoundException('کمپین یافت نشد');
    await this.audit.log(ctx, 'campaign.delete', 'campaign', id);
    return { ok: true };
  }
}

// =================== Tasks / follow-ups ===================
const taskInput = z.object({
  title: s(200).min(2, 'عنوان را وارد کنید'), description: s(3000).optional().nullable(), dueAt: optDate,
  priority: z.nativeEnum(Priority).optional(), status: z.nativeEnum(TaskStatus).optional(),
  leadId: z.string().optional().nullable(), assigneeId: z.string().optional().nullable(),
});

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async refs(orgId: string, d: { leadId?: string | null; assigneeId?: string | null }) {
    if (d.leadId && !(await this.prisma.lead.findFirst({ where: { id: d.leadId, organizationId: orgId } }))) throw new BadRequestException('سرنخ نامعتبر است');
    if (d.assigneeId && !(await this.prisma.membership.findFirst({ where: { userId: d.assigneeId, organizationId: orgId } }))) throw new BadRequestException('کارشناس نامعتبر است');
  }

  @Get()
  list(@Ctx() ctx: AuthCtx, @Query() q: any) {
    const now = new Date();
    const where: any = { organizationId: ctx.orgId };
    if (q.status) where.status = q.status;
    if (q.assigneeId) where.assigneeId = q.assigneeId === 'me' ? ctx.userId : q.assigneeId;
    if (q.leadId) where.leadId = q.leadId;
    if (q.view === 'overdue') Object.assign(where, { status: 'OPEN', dueAt: { lt: now } });
    if (q.view === 'today') { const e = new Date(now); e.setHours(23, 59, 59, 999); Object.assign(where, { status: 'OPEN', dueAt: { lte: e } }); }
    return this.prisma.task.findMany({
      where, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 500,
      include: { lead: { select: { id: true, fullName: true, businessName: true, instagramUsername: true, phone: true } } },
    });
  }

  /** Open tasks due now or within `minutes` for the current user — polled by clients for reminders. */
  @Get('due')
  due(@Ctx() ctx: AuthCtx, @Query('minutes') minutes = '15') {
    const until = new Date(Date.now() + Math.min(Number(minutes) || 15, 1440) * 60_000);
    return this.prisma.task.findMany({ where: { organizationId: ctx.orgId, assigneeId: ctx.userId, status: 'OPEN', dueAt: { lte: until } }, orderBy: { dueAt: 'asc' }, take: 50, include: { lead: { select: { id: true, fullName: true, businessName: true } } } });
  }

  @MinRole('AGENT') @Post()
  async create(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(taskInput, b);
    await this.refs(ctx.orgId, d);
    const t = await this.prisma.task.create({ data: { ...d, assigneeId: d.assigneeId ?? ctx.userId, createdById: ctx.userId, organizationId: ctx.orgId } });
    if (t.leadId) await this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId: t.leadId, userId: ctx.userId, type: 'TASK', content: `پیگیری ثبت شد: ${t.title}` } });
    return t;
  }

  @MinRole('AGENT') @Patch(':id')
  async update(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const d = parse(taskInput.partial(), b);
    await this.refs(ctx.orgId, d);
    const cur = await this.prisma.task.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!cur) throw new NotFoundException('پیگیری یافت نشد');
    const t = await this.prisma.task.update({ where: { id }, data: { ...d, completedAt: d.status === 'DONE' ? new Date() : d.status ? null : undefined } });
    if (d.status === 'DONE' && cur.status !== 'DONE' && t.leadId) await this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId: t.leadId, userId: ctx.userId, type: 'TASK', content: `پیگیری انجام شد: ${t.title}` } });
    return t;
  }

  @MinRole('AGENT') @Delete(':id')
  async remove(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.task.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (!r.count) throw new NotFoundException('پیگیری یافت نشد');
    return { ok: true };
  }
}

// =================== Saved filters / segments ===================
@ApiTags('segments')
@Controller('segments')
export class SegmentsController {
  constructor(private prisma: PrismaService, private leads: LeadsService) {}

  @Get()
  async list(@Ctx() ctx: AuthCtx) {
    const segs = await this.prisma.segment.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(segs.map(async (sg) => {
      const f = filterSchema.safeParse(sg.filters);
      const count = f.success ? await this.prisma.lead.count({ where: this.leads.where(ctx.orgId, f.data, ctx.userId) }) : 0;
      return { ...sg, count };
    }));
  }

  @MinRole('AGENT') @Post()
  async create(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(z.object({ name: s(80).min(1, 'نام را وارد کنید'), filters: filterSchema }), b);
    return this.prisma.segment.create({ data: { name: d.name, filters: d.filters as any, organizationId: ctx.orgId, createdById: ctx.userId } });
  }

  @MinRole('AGENT') @Delete(':id')
  async remove(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.segment.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (!r.count) throw new NotFoundException('بخش یافت نشد');
    return { ok: true };
  }
}

// =================== Dashboard ===================
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async get(@Ctx() ctx: AuthCtx, @Query('days') daysQ = '30') {
    const org = ctx.orgId;
    const days = Math.min(Math.max(Number(daysQ) || 30, 7), 365);
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const ago = (d: number) => new Date(now.getTime() - d * 864e5);
    const c = (where: any) => this.prisma.lead.count({ where: { organizationId: org, ...where } });
    const [total, today, week, month, qualified, won, duplicates, activeCampaigns, openTasks, overdueTasks] = await Promise.all([
      c({}), c({ createdAt: { gte: startOfDay } }), c({ createdAt: { gte: ago(7) } }), c({ createdAt: { gte: ago(30) } }),
      c({ status: { in: ['QUALIFIED', 'NEGOTIATION', 'WON'] } }), c({ status: 'WON' }), c({ isDuplicate: true }),
      this.prisma.campaign.count({ where: { organizationId: org, status: 'ACTIVE' } }),
      this.prisma.task.count({ where: { organizationId: org, status: 'OPEN' } }),
      this.prisma.task.count({ where: { organizationId: org, status: 'OPEN', dueAt: { lt: now } } }),
    ]);
    const daily: { day: Date; count: bigint; won: bigint }[] = await this.prisma.$queryRaw`
      select d::date as day, count(l.id) as count, count(l.id) filter (where l.status = 'WON') as won
      from generate_series(${ago(days - 1)}::date, ${now}::date, interval '1 day') d
      left join "Lead" l on l."organizationId" = ${org} and l."createdAt"::date = d::date
      group by 1 order by 1`;
    const [bySource, byStatus, byCategory, byCity, recent] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['source'], where: { organizationId: org }, _count: true }),
      this.prisma.lead.groupBy({ by: ['status'], where: { organizationId: org }, _count: true }),
      this.prisma.lead.groupBy({ by: ['categoryId'], where: { organizationId: org }, _count: true }),
      this.prisma.lead.groupBy({ by: ['city'], where: { organizationId: org, city: { not: null } }, _count: true, orderBy: { _count: { city: 'desc' } }, take: 8 }),
      this.prisma.activity.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' }, take: 12, include: { lead: { select: { id: true, fullName: true, businessName: true } } } }),
    ]);
    const cats = await this.prisma.category.findMany({ where: { organizationId: org } });
    const catMap = new Map(cats.map((x) => [x.id, x]));
    return {
      kpis: { total, today, week, month, qualified, won, duplicates, activeCampaigns, openTasks, overdueTasks, conversionRate: total ? +(won / total * 100).toFixed(1) : 0, qualifiedRate: total ? +(qualified / total * 100).toFixed(1) : 0 },
      daily: daily.map((d) => ({ day: d.day, count: Number(d.count), won: Number(d.won) })),
      bySource: bySource.map((x) => ({ source: x.source, count: x._count })),
      byStatus: byStatus.map((x) => ({ status: x.status, count: x._count })),
      byCategory: byCategory.map((x) => ({ name: x.categoryId ? catMap.get(x.categoryId)?.name ?? '—' : 'بدون دسته', color: x.categoryId ? catMap.get(x.categoryId)?.color : '#94a3b8', count: x._count })),
      byCity: byCity.map((x) => ({ city: x.city, count: x._count })),
      recent,
    };
  }
}

@Module({ imports: [LeadsModule], controllers: [OrgController, CampaignsController, TasksController, SegmentsController, DashboardController] })
export class CrmModule {}
