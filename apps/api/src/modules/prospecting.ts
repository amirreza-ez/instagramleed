/**
 * Prospecting: collect target Instagram pages (pasted lists, Google/hashtag research, bookmarklet) and run a
 * daily manual outreach queue. Messages are sent by a human from Instagram itself — no automation of
 * Instagram accounts — with a daily cap to keep the business account safe.
 */
import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService, AuthCtx, Ctx, MinRole, normUsername, parse, PrismaService } from '../common/core';
import { LeadsModule, LeadsService } from './leads';

const RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'developer', 'legal', 'privacy', 'web', 'tags', 'locations', 'instagram', 'www', 'com', 'http', 'https']);

/** Pulls Instagram usernames out of any pasted text: profile links, @mentions, or one username per line. */
export function extractUsernames(text: string): string[] {
  const out = new Set<string>();
  const add = (u?: string) => { const n = normUsername(u); if (n && !RESERVED.has(n) && !/^\d+$/.test(n) && !n.endsWith('.')) out.add(n); };
  for (const m of text.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) add(m[1]);
  const noLinks = text.replace(/https?:\/\/\S+/gi, ' ');
  for (const m of noLinks.matchAll(/@([A-Za-z0-9._]{1,30})/g)) add(m[1]);
  for (const line of noLinks.split(/[\n,،;]+/)) { const t = line.trim(); if (/^@?[A-Za-z0-9._]{3,30}$/.test(t)) add(t); }
  return [...out].slice(0, 500);
}

export const DEFAULT_TEMPLATES = [
  { title: 'معرفی و پیشنهاد همکاری عمده', body: 'سلام {نام} عزیز 🌹\nوقت بخیر، از {فروشگاه} پیام میدم. ما عمده‌فروش موبایل و لوازم جانبی هستیم و پیج شما رو دیدیم؛ فکر می‌کنیم همکاری خوبی می‌تونیم داشته باشیم.\nلیست قیمت عمده‌مون رو براتون بفرستم؟' },
  { title: 'ارسال لیست قیمت', body: 'سلام {نام} عزیز 🙏\nلیست قیمت و ثبت سفارش همکاری از این لینک:\n{لینک}\nهر سؤالی بود همین‌جا در خدمتم.' },
  { title: 'پیگیری دوم', body: 'سلام دوباره {نام} عزیز\nفرصت کردید قیمت‌ها رو ببینید؟ برای اولین سفارش همکاری، تخفیف ویژه و ارسال سریع داریم. 🚚' },
];

const DAILY_SAFE_LIMIT = 25;

@ApiTags('prospecting')
@Controller()
export class ProspectingController {
  constructor(private prisma: PrismaService, private leads: LeadsService, private audit: AuditService) {}

  @MinRole('AGENT') @Post('prospects/bulk')
  async bulk(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(z.object({
      text: z.string().max(200_000), categoryId: z.string().nullable().optional(), campaignId: z.string().nullable().optional(),
      city: z.string().trim().max(60).optional(), tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    }), b);
    const usernames = extractUsernames(d.text);
    if (!usernames.length) throw new BadRequestException('هیچ آیدی یا لینک پیج معتبری در متن پیدا نشد');
    for (const [id, model] of [[d.categoryId, 'category'], [d.campaignId, 'campaign']] as const)
      if (id && !(await (this.prisma as any)[model].findFirst({ where: { id, organizationId: ctx.orgId } }))) throw new BadRequestException('دسته‌بندی یا کمپین نامعتبر است');
    const r = { created: 0, existing: 0, failed: 0, usernames };
    for (const u of usernames) {
      try {
        const x = await this.leads.upsertLead(ctx.orgId, ctx.userId, {
          instagramUsername: u, city: d.city || null, categoryId: d.categoryId ?? null, campaignId: d.campaignId ?? null, tags: ['پیج‌یابی', ...(d.tags ?? [])],
        }, { source: 'PROSPECT', strategy: 'skip' });
        if (x.action === 'created') r.created++; else r.existing++;
      } catch { r.failed++; }
    }
    await this.audit.log(ctx, 'prospect.bulk', 'lead', undefined, { created: r.created, existing: r.existing });
    return r;
  }

  @Get('prospects/queue')
  async queue(@Ctx() ctx: AuthCtx, @Query('limit') limitQ = '20') {
    const limit = Math.min(Math.max(Number(limitQ) || 20, 1), 100);
    const where = { organizationId: ctx.orgId, status: 'NEW' as const, normUsername: { not: null }, isDuplicate: false, OR: [{ assigneeId: ctx.userId }, { assigneeId: null }] };
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [items, remaining, sentToday] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: [{ priority: 'desc' }, { score: 'desc' }, { createdAt: 'asc' }], take: limit, include: { category: { select: { name: true, color: true } } } }),
      this.prisma.lead.count({ where }),
      this.prisma.activity.count({ where: { organizationId: ctx.orgId, userId: ctx.userId, type: 'MESSAGE', createdAt: { gte: startOfDay }, meta: { path: ['outreach'], equals: true } } }),
    ]);
    return { items, remaining, sentToday, dailyLimit: DAILY_SAFE_LIMIT };
  }

  @MinRole('AGENT') @Post('prospects/:id/sent')
  async sent(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const d = parse(z.object({ channel: z.enum(['instagram', 'whatsapp']).default('instagram'), templateTitle: z.string().max(120).optional() }), b ?? {});
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!lead) throw new NotFoundException('سرنخ یافت نشد');
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data: { status: lead.status === 'NEW' ? 'CONTACTED' : lead.status, assigneeId: lead.assigneeId ?? ctx.userId } }),
      this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId: id, userId: ctx.userId, type: 'MESSAGE', content: `پیام معرفی در ${d.channel === 'whatsapp' ? 'واتساپ' : 'دایرکت اینستاگرام'} ارسال شد${d.templateTitle ? ` (قالب: ${d.templateTitle})` : ''}`, meta: { outreach: true, channel: d.channel } } }),
      this.prisma.task.create({ data: { organizationId: ctx.orgId, leadId: id, assigneeId: ctx.userId, createdById: ctx.userId, title: `پیگیری جواب ${lead.businessName || lead.fullName || '@' + lead.instagramUsername}`, dueAt: new Date(Date.now() + 2 * 864e5), priority: 'MEDIUM' } }),
    ]);
    return { ok: true };
  }

  @MinRole('AGENT') @Post('prospects/:id/skip')
  async skip(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!lead) throw new NotFoundException('سرنخ یافت نشد');
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data: { status: 'LOST', tags: Array.from(new Set([...lead.tags, 'نامناسب'])) } }),
      this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId: id, userId: ctx.userId, type: 'NOTE', content: 'در صف ارتباط «نامناسب» تشخیص داده شد' } }),
    ]);
    return { ok: true };
  }

  // ---- Message templates ----
  @Get('templates')
  async templates(@Ctx() ctx: AuthCtx) {
    const where = { organizationId: ctx.orgId };
    if (!(await this.prisma.messageTemplate.count({ where }))) await this.prisma.messageTemplate.createMany({ data: DEFAULT_TEMPLATES.map((t) => ({ ...t, organizationId: ctx.orgId })) });
    return this.prisma.messageTemplate.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  @MinRole('MANAGER') @Post('templates')
  create(@Ctx() ctx: AuthCtx, @Body() b: unknown) {
    const d = parse(z.object({ title: z.string().trim().min(2, 'عنوان را وارد کنید').max(120), body: z.string().trim().min(5, 'متن پیام را وارد کنید').max(2000) }), b);
    return this.prisma.messageTemplate.create({ data: { ...d, organizationId: ctx.orgId } });
  }

  @MinRole('MANAGER') @Patch('templates/:id')
  async update(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) {
    const d = parse(z.object({ title: z.string().trim().min(2).max(120).optional(), body: z.string().trim().min(5).max(2000).optional() }), b);
    const r = await this.prisma.messageTemplate.updateMany({ where: { id, organizationId: ctx.orgId }, data: d });
    if (!r.count) throw new NotFoundException('قالب یافت نشد');
    return { ok: true };
  }

  @MinRole('MANAGER') @Delete('templates/:id')
  async remove(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.messageTemplate.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (!r.count) throw new NotFoundException('قالب یافت نشد');
    return { ok: true };
  }
}

@Module({ imports: [LeadsModule], controllers: [ProspectingController] })
export class ProspectingModule {}
