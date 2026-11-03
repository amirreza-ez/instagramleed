import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Lead, LeadSource, LeadStatus, Prisma, Priority } from '@prisma/client';
import { z } from 'zod';
import {
  AuditService, AuthCtx, Ctx, MinRole, normEmail, normPhone, normUsername, pageSchema, parse, PrismaService, toLatinDigits,
} from '../common/core';
import { BillingService } from './billing';

const opt = (s: z.ZodString) => s.trim().optional().nullable().transform((v) => (v === '' ? null : v));
export const leadInput = z.object({
  fullName: opt(z.string().max(150)),
  businessName: opt(z.string().max(150)),
  instagramUsername: opt(z.string().max(100)),
  phone: opt(z.string().max(40)),
  email: opt(z.string().max(150)),
  city: opt(z.string().max(80)),
  website: opt(z.string().max(300)),
  bio: opt(z.string().max(2000)),
  followersCount: z.coerce.number().int().min(0).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  status: z.nativeEnum(LeadStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  notes: opt(z.string().max(5000)),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  consent: z.boolean().optional(),
  consentSource: opt(z.string().max(200)),
});
export type LeadInput = z.infer<typeof leadInput>;

export const filterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.union([z.nativeEnum(LeadStatus), z.array(z.nativeEnum(LeadStatus))]).optional(),
  source: z.union([z.nativeEnum(LeadSource), z.array(z.nativeEnum(LeadSource))]).optional(),
  priority: z.nativeEnum(Priority).optional(),
  categoryId: z.string().optional(),
  campaignId: z.string().optional(),
  assigneeId: z.string().optional(),
  city: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  duplicates: z.enum(['only', 'exclude']).optional(),
  hasPhone: z.coerce.boolean().optional(),
});
export type LeadFilters = z.infer<typeof filterSchema>;
const arr = <T>(v: T | T[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

export type DedupeStrategy = 'skip' | 'merge' | 'create';
const STATUS_FA: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', QUALIFIED: 'واجد شرایط', NEGOTIATION: 'در حال مذاکره', WON: 'مشتری شد', LOST: 'از دست رفت' };
const PII: (keyof Lead)[] = ['fullName', 'businessName', 'instagramUsername', 'phone', 'email', 'city', 'website', 'bio', 'notes'];

export function scoreLead(l: Partial<Lead>): number {
  let s = 0;
  if (l.phone) s += 25; if (l.email) s += 10; if (l.instagramUsername) s += 15; if (l.businessName) s += 10;
  if (l.city) s += 5; if (l.categoryId) s += 10; if (l.consent) s += 10;
  if (l.followersCount && l.followersCount > 1000) s += 5;
  s += ({ NEW: 0, CONTACTED: 5, QUALIFIED: 10, NEGOTIATION: 10, WON: 10, LOST: -20 } as Record<string, number>)[l.status ?? 'NEW'];
  return Math.max(0, Math.min(100, s));
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private billing: BillingService) {}

  where(orgId: string, f: LeadFilters, userId?: string): Prisma.LeadWhereInput {
    const w: Prisma.LeadWhereInput = { organizationId: orgId };
    const and: Prisma.LeadWhereInput[] = [];
    if (f.q) {
      const q = f.q; const digits = toLatinDigits(q).replace(/\D/g, '').replace(/^0+/, ''); const p = digits.length >= 3 ? digits : null;
      and.push({ OR: [
        { fullName: { contains: q, mode: 'insensitive' } }, { businessName: { contains: q, mode: 'insensitive' } },
        { instagramUsername: { contains: q.replace(/^@/, ''), mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } },
        ...(p ? [{ normPhone: { contains: p } }] : []),
      ] });
    }
    const st = arr(f.status); if (st) w.status = { in: st };
    const so = arr(f.source); if (so) w.source = { in: so };
    if (f.priority) w.priority = f.priority;
    if (f.categoryId) w.categoryId = f.categoryId === 'none' ? null : f.categoryId;
    if (f.campaignId) w.campaignId = f.campaignId === 'none' ? null : f.campaignId;
    if (f.assigneeId) w.assigneeId = f.assigneeId === 'none' ? null : f.assigneeId === 'me' ? userId : f.assigneeId;
    if (f.city) w.city = { equals: f.city, mode: 'insensitive' };
    if (f.tag) w.tags = { has: f.tag };
    if (f.from || f.to) w.createdAt = { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) };
    if (f.duplicates === 'only') w.isDuplicate = true;
    if (f.duplicates === 'exclude') w.isDuplicate = false;
    if (f.hasPhone) w.normPhone = { not: null };
    if (and.length) w.AND = and;
    return w;
  }

  async list(ctx: AuthCtx, query: any) {
    const f = parse(filterSchema, query);
    const { page, pageSize } = parse(pageSchema, query);
    const sortable = ['createdAt', 'updatedAt', 'score', 'fullName', 'businessName', 'status', 'city'];
    const sort = sortable.includes(query.sort) ? query.sort : 'createdAt';
    const dir = query.dir === 'asc' ? 'asc' : 'desc';
    const where = this.where(ctx.orgId, f, ctx.userId);
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize,
        include: { category: { select: { id: true, name: true, color: true } }, campaign: { select: { id: true, name: true } } },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(ctx: AuthCtx, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId: ctx.orgId },
      include: {
        category: true, campaign: { select: { id: true, name: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
        tasks: { orderBy: { dueAt: 'asc' } },
      },
    });
    if (!lead) throw new NotFoundException('سرنخ یافت نشد');
    const duplicateOf = lead.duplicateOfId
      ? await this.prisma.lead.findFirst({ where: { id: lead.duplicateOfId, organizationId: ctx.orgId }, select: { id: true, fullName: true, businessName: true } })
      : null;
    return { ...lead, duplicateOf };
  }

  /** Validates that referenced category/campaign/assignee belong to the same organisation. */
  private async checkRefs(orgId: string, d: Partial<LeadInput>) {
    if (d.categoryId && !(await this.prisma.category.findFirst({ where: { id: d.categoryId, organizationId: orgId } }))) throw new BadRequestException('دسته‌بندی نامعتبر است');
    if (d.campaignId && !(await this.prisma.campaign.findFirst({ where: { id: d.campaignId, organizationId: orgId } }))) throw new BadRequestException('کمپین نامعتبر است');
    if (d.assigneeId && !(await this.prisma.membership.findFirst({ where: { userId: d.assigneeId, organizationId: orgId } }))) throw new BadRequestException('کارشناس نامعتبر است');
  }

  private norm(d: Partial<LeadInput>) {
    const out: any = { ...d };
    if ('phone' in d) out.normPhone = normPhone(d.phone);
    if ('email' in d) { out.normEmail = normEmail(d.email); if (d.email && !out.normEmail) throw new BadRequestException(`ایمیل نامعتبر: ${d.email}`); }
    if ('instagramUsername' in d) {
      out.normUsername = normUsername(d.instagramUsername);
      if (d.instagramUsername && !out.normUsername) throw new BadRequestException(`نام کاربری اینستاگرام نامعتبر: ${d.instagramUsername}`);
      out.instagramUsername = out.normUsername;
    }
    return out;
  }

  findDuplicate(orgId: string, n: { normPhone?: string | null; normUsername?: string | null; normEmail?: string | null }, excludeId?: string) {
    const or: Prisma.LeadWhereInput[] = [];
    if (n.normPhone) or.push({ normPhone: n.normPhone });
    if (n.normUsername) or.push({ normUsername: n.normUsername });
    if (n.normEmail) or.push({ normEmail: n.normEmail });
    if (!or.length) return Promise.resolve(null);
    return this.prisma.lead.findFirst({
      where: { organizationId: orgId, isDuplicate: false, OR: or, ...(excludeId && { id: { not: excludeId } }) }, orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Single entry point for every lead source (manual, import, Meta, webhook).
   * strategy: create = always create (flag as duplicate), merge = fill empty fields of existing, skip = do nothing on duplicate.
   */
  async upsertLead(
    orgId: string, userId: string | null, input: Partial<LeadInput>, opts: { source: LeadSource; strategy: DedupeStrategy; externalId?: string; skipLimit?: boolean },
  ): Promise<{ lead: Lead | null; action: 'created' | 'merged' | 'skipped' | 'duplicate' }> {
    const d = this.norm(input);
    if (!d.fullName && !d.businessName && !d.normUsername && !d.normPhone && !d.normEmail)
      throw new BadRequestException('حداقل یکی از فیلدهای نام، کسب‌وکار، اینستاگرام، تلفن یا ایمیل الزامی است');
    if (opts.externalId) {
      const ex = await this.prisma.lead.findFirst({ where: { organizationId: orgId, externalId: opts.externalId } });
      if (ex) return { lead: ex, action: 'skipped' };
    }
    const dup = await this.findDuplicate(orgId, d);
    if (dup && opts.strategy === 'skip') return { lead: dup, action: 'skipped' };
    if (dup && opts.strategy === 'merge') {
      const patch: any = {};
      for (const k of [...PII, 'normPhone', 'normUsername', 'normEmail', 'followersCount', 'categoryId', 'campaignId'] as const)
        if ((dup as any)[k] == null && d[k] != null) patch[k] = d[k];
      if (d.tags?.length) patch.tags = Array.from(new Set([...dup.tags, ...d.tags]));
      if (d.consent && !dup.consent) { patch.consent = true; patch.consentSource = d.consentSource; }
      const lead = await this.prisma.lead.update({ where: { id: dup.id }, data: { ...patch, score: scoreLead({ ...dup, ...patch }) } });
      await this.prisma.activity.create({ data: { organizationId: orgId, leadId: dup.id, userId, type: 'MERGED', content: `اطلاعات از منبع ${opts.source} ادغام شد`, meta: { fields: Object.keys(patch) } } });
      return { lead, action: 'merged' };
    }
    if (!opts.skipLimit) await this.billing.assert(orgId, 'leads');
    const lead = await this.prisma.lead.create({
      data: {
        ...d, organizationId: orgId, source: opts.source, externalId: opts.externalId, tags: d.tags ?? [],
        isDuplicate: !!dup, duplicateOfId: dup?.id, score: scoreLead(d),
        convertedAt: d.status === 'WON' ? new Date() : undefined,
      },
    });
    await this.prisma.activity.create({ data: { organizationId: orgId, leadId: lead.id, userId, type: 'CREATED', content: 'سرنخ ایجاد شد', meta: { source: opts.source } } });
    return { lead, action: dup ? 'duplicate' : 'created' };
  }

  async create(ctx: AuthCtx, body: unknown) {
    const d = parse(leadInput, body);
    await this.checkRefs(ctx.orgId, d);
    const r = await this.upsertLead(ctx.orgId, ctx.userId, d, { source: 'MANUAL', strategy: 'create' });
    await this.audit.log(ctx, 'lead.create', 'lead', r.lead?.id);
    return r;
  }

  async update(ctx: AuthCtx, id: string, body: unknown) {
    const d = parse(leadInput.partial(), body);
    const cur = await this.prisma.lead.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!cur) throw new NotFoundException('سرنخ یافت نشد');
    await this.checkRefs(ctx.orgId, d);
    const data: any = this.norm(d);
    if (d.status === 'WON' && cur.status !== 'WON') data.convertedAt = new Date();
    if (d.status && d.status !== 'WON') data.convertedAt = null;
    data.score = scoreLead({ ...cur, ...data });
    const lead = await this.prisma.lead.update({ where: { id }, data });
    const acts: Prisma.ActivityCreateManyInput[] = [];
    if (d.status && d.status !== cur.status) acts.push({ organizationId: ctx.orgId, leadId: id, userId: ctx.userId, type: 'STATUS', content: `وضعیت از «${STATUS_FA[cur.status]}» به «${STATUS_FA[d.status]}» تغییر کرد`, meta: { from: cur.status, to: d.status } });
    if (d.assigneeId !== undefined && d.assigneeId !== cur.assigneeId) acts.push({ organizationId: ctx.orgId, leadId: id, userId: ctx.userId, type: 'ASSIGN', content: 'کارشناس مسئول تغییر کرد', meta: { to: d.assigneeId } });
    if (acts.length) await this.prisma.activity.createMany({ data: acts });
    await this.audit.log(ctx, 'lead.update', 'lead', id, { fields: Object.keys(d) });
    return lead;
  }

  async bulk(ctx: AuthCtx, body: unknown) {
    const d = parse(z.object({
      ids: z.array(z.string()).min(1).max(1000),
      action: z.enum(['update', 'delete', 'addTag']),
      status: z.nativeEnum(LeadStatus).optional(), assigneeId: z.string().nullable().optional(),
      categoryId: z.string().nullable().optional(), campaignId: z.string().nullable().optional(), tag: z.string().trim().min(1).max(40).optional(),
    }), body);
    const where = { id: { in: d.ids }, organizationId: ctx.orgId };
    if (d.action === 'delete') {
      if (ctx.role === 'AGENT' || ctx.role === 'VIEWER') throw new BadRequestException('حذف گروهی فقط برای مدیران مجاز است');
      const r = await this.prisma.lead.deleteMany({ where });
      await this.audit.log(ctx, 'lead.bulk_delete', 'lead', undefined, { count: r.count });
      return { count: r.count };
    }
    if (d.action === 'addTag') {
      if (!d.tag) throw new BadRequestException('برچسب را وارد کنید');
      const leads = await this.prisma.lead.findMany({ where, select: { id: true, tags: true } });
      await this.prisma.$transaction(leads.filter((l) => !l.tags.includes(d.tag!)).map((l) => this.prisma.lead.update({ where: { id: l.id }, data: { tags: [...l.tags, d.tag!] } })));
      return { count: leads.length };
    }
    await this.checkRefs(ctx.orgId, d);
    const data: any = {};
    for (const k of ['status', 'assigneeId', 'categoryId', 'campaignId'] as const) if (d[k] !== undefined) data[k] = d[k];
    if (d.status === 'WON') data.convertedAt = new Date();
    const r = await this.prisma.lead.updateMany({ where, data });
    await this.audit.log(ctx, 'lead.bulk_update', 'lead', undefined, { count: r.count, data });
    return { count: r.count };
  }

  async remove(ctx: AuthCtx, id: string) {
    const r = await this.prisma.lead.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (!r.count) throw new NotFoundException('سرنخ یافت نشد');
    await this.audit.log(ctx, 'lead.delete', 'lead', id);
    return { ok: true };
  }

  /** Merge `duplicateId` into `primaryId`: fill gaps, union tags, move history, delete duplicate. */
  async merge(ctx: AuthCtx, primaryId: string, duplicateId: string) {
    if (primaryId === duplicateId) throw new BadRequestException('دو سرنخ متفاوت انتخاب کنید');
    const [p, dup] = await Promise.all([
      this.prisma.lead.findFirst({ where: { id: primaryId, organizationId: ctx.orgId } }),
      this.prisma.lead.findFirst({ where: { id: duplicateId, organizationId: ctx.orgId } }),
    ]);
    if (!p || !dup) throw new NotFoundException('سرنخ یافت نشد');
    const patch: any = {};
    for (const k of [...PII, 'normPhone', 'normUsername', 'normEmail', 'followersCount', 'categoryId', 'campaignId', 'assigneeId'] as const)
      if ((p as any)[k] == null && (dup as any)[k] != null) patch[k] = (dup as any)[k];
    patch.tags = Array.from(new Set([...p.tags, ...dup.tags]));
    if (dup.notes && p.notes && dup.notes !== p.notes) patch.notes = `${p.notes}\n---\n${dup.notes}`;
    await this.prisma.$transaction([
      this.prisma.activity.updateMany({ where: { leadId: dup.id }, data: { leadId: p.id } }),
      this.prisma.task.updateMany({ where: { leadId: dup.id }, data: { leadId: p.id } }),
      this.prisma.lead.updateMany({ where: { duplicateOfId: dup.id, organizationId: ctx.orgId }, data: { duplicateOfId: p.id } }),
      this.prisma.lead.delete({ where: { id: dup.id } }),
      this.prisma.lead.update({ where: { id: p.id }, data: { ...patch, isDuplicate: false, duplicateOfId: null, score: scoreLead({ ...p, ...patch }) } }),
      this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId: p.id, userId: ctx.userId, type: 'MERGED', content: 'سرنخ تکراری در این پرونده ادغام شد' } }),
    ]);
    await this.audit.log(ctx, 'lead.merge', 'lead', p.id, { merged: dup.id });
    return this.get(ctx, p.id);
  }

  async addActivity(ctx: AuthCtx, id: string, body: unknown) {
    const d = parse(z.object({ type: z.enum(['NOTE', 'CALL', 'MESSAGE', 'MEETING']), content: z.string().trim().min(1, 'متن را وارد کنید').max(5000) }), body);
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!lead) throw new NotFoundException('سرنخ یافت نشد');
    const act = await this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId: id, userId: ctx.userId, ...d } });
    if (d.type !== 'NOTE' && lead.status === 'NEW') await this.update(ctx, id, { status: 'CONTACTED' });
    return act;
  }

  /** Privacy: anonymise personal data while keeping aggregate statistics. */
  async erase(ctx: AuthCtx, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!lead) throw new NotFoundException('سرنخ یافت نشد');
    const blank: any = Object.fromEntries(PII.map((k) => [k, null]));
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data: { ...blank, fullName: 'حذف‌شده', normPhone: null, normEmail: null, normUsername: null, customFields: Prisma.DbNull, tags: ['erased'], consent: false } }),
      this.prisma.activity.deleteMany({ where: { leadId: id } }),
    ]);
    await this.audit.log(ctx, 'lead.erase', 'lead', id);
    return { ok: true };
  }
}

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private leads: LeadsService, private prisma: PrismaService) {}
  @Get() list(@Ctx() ctx: AuthCtx, @Query() q: any) { return this.leads.list(ctx, q); }
  @Get('meta/cities')
  async cities(@Ctx() ctx: AuthCtx) {
    const r = await this.prisma.lead.groupBy({ by: ['city'], where: { organizationId: ctx.orgId, city: { not: null } }, _count: true, orderBy: { _count: { city: 'desc' } }, take: 100 });
    return r.map((x) => ({ city: x.city, count: x._count }));
  }
  @Get('meta/tags')
  async tags(@Ctx() ctx: AuthCtx) {
    const r: { tag: string; count: bigint }[] = await this.prisma.$queryRaw`select unnest(tags) as tag, count(*) as count from "Lead" where "organizationId" = ${ctx.orgId} group by 1 order by 2 desc limit 100`;
    return r.map((x) => ({ tag: x.tag, count: Number(x.count) }));
  }
  @Get(':id') get(@Ctx() ctx: AuthCtx, @Param('id') id: string) { return this.leads.get(ctx, id); }
  @Get(':id/export') async exportOne(@Ctx() ctx: AuthCtx, @Param('id') id: string) { return this.leads.get(ctx, id); }
  @MinRole('AGENT') @Post() create(@Ctx() ctx: AuthCtx, @Body() b: unknown) { return this.leads.create(ctx, b); }
  @MinRole('AGENT') @Post('bulk') bulk(@Ctx() ctx: AuthCtx, @Body() b: unknown) { return this.leads.bulk(ctx, b); }
  @MinRole('AGENT') @Patch(':id') update(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) { return this.leads.update(ctx, id, b); }
  @MinRole('MANAGER') @Delete(':id') remove(@Ctx() ctx: AuthCtx, @Param('id') id: string) { return this.leads.remove(ctx, id); }
  @MinRole('MANAGER') @Post(':id/merge/:dupId') merge(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Param('dupId') dupId: string) { return this.leads.merge(ctx, id, dupId); }
  @MinRole('AGENT') @Post(':id/activities') act(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) { return this.leads.addActivity(ctx, id, b); }
  @MinRole('ADMIN') @Post(':id/erase') erase(@Ctx() ctx: AuthCtx, @Param('id') id: string) { return this.leads.erase(ctx, id); }
}

@Module({ controllers: [LeadsController], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
