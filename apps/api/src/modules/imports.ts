import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Module, NotFoundException, OnModuleInit, Param, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Job, LeadSource, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import { AuditService, AuthCtx, Ctx, MinRole, parse, PrismaService } from '../common/core';
import { BillingService } from './billing';
import { DedupeStrategy, filterSchema, LeadsModule, LeadsService } from './leads';

export const MAX_ROWS = 50_000;
export const LEAD_FIELDS = ['fullName', 'businessName', 'instagramUsername', 'phone', 'email', 'city', 'website', 'notes', 'tags', 'category', 'followersCount'] as const;
type Field = (typeof LEAD_FIELDS)[number];
export const FIELD_LABELS: Record<Field, string> = {
  fullName: 'نام و نام خانوادگی', businessName: 'نام کسب‌وکار', instagramUsername: 'اینستاگرام', phone: 'تلفن', email: 'ایمیل',
  city: 'شهر', website: 'وب‌سایت', notes: 'یادداشت', tags: 'برچسب‌ها', category: 'دسته‌بندی', followersCount: 'تعداد دنبال‌کننده',
};
const SYNONYMS: Record<Field, string[]> = {
  fullName: ['name', 'full name', 'fullname', 'نام', 'نام و نام خانوادگی', 'نام کامل', 'مشتری', 'contact'],
  businessName: ['business', 'company', 'shop', 'store', 'business name', 'کسب و کار', 'کسب‌وکار', 'نام کسب و کار', 'فروشگاه', 'شرکت', 'مغازه', 'نام فروشگاه'],
  instagramUsername: ['instagram', 'username', 'ig', 'insta', 'page', 'اینستاگرام', 'آیدی', 'پیج', 'نام کاربری', 'آیدی اینستاگرام'],
  phone: ['phone', 'mobile', 'tel', 'telephone', 'cell', 'تلفن', 'موبایل', 'شماره', 'شماره تماس', 'همراه', 'تلفن همراه'],
  email: ['email', 'e-mail', 'mail', 'ایمیل', 'پست الکترونیک'],
  city: ['city', 'شهر', 'استان', 'location'],
  website: ['website', 'site', 'url', 'وبسایت', 'وب سایت', 'سایت'],
  notes: ['notes', 'note', 'description', 'یادداشت', 'توضیحات'],
  tags: ['tags', 'tag', 'برچسب', 'برچسب‌ها', 'تگ'],
  category: ['category', 'type', 'segment', 'دسته', 'دسته‌بندی', 'دسته بندی', 'نوع'],
  followersCount: ['followers', 'followers count', 'فالوور', 'دنبال‌کننده', 'تعداد فالوور'],
};
export function suggestMapping(headers: string[]): Record<string, Field | ''> {
  const clean = (s: string) => s.toLowerCase().replace(/[‌_\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const used = new Set<Field>();
  const out: Record<string, Field | ''> = {};
  for (const h of headers) {
    const c = clean(h);
    const f = (Object.keys(SYNONYMS) as Field[]).find((k) => !used.has(k) && SYNONYMS[k].some((s) => clean(s) === c))
      ?? (Object.keys(SYNONYMS) as Field[]).find((k) => !used.has(k) && SYNONYMS[k].some((s) => clean(s).length > 2 && c.includes(clean(s))));
    out[h] = f ?? '';
    if (f) used.add(f);
  }
  return out;
}

function decodeText(buf: Buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  // Persian CSVs saved by old Excel versions are often Windows-1256.
  if (utf8.includes('�')) { try { return new TextDecoder('windows-1256').decode(buf); } catch { /* fallthrough */ } }
  return utf8.replace(/^﻿/, '');
}

export async function parseSpreadsheet(name: string, buf: Buffer): Promise<{ headers: string[]; rows: string[][]; source: LeadSource }> {
  const ext = name.toLowerCase().split('.').pop();
  let table: string[][];
  let source: LeadSource;
  if (ext === 'csv' || ext === 'txt') {
    const r = Papa.parse<string[]>(decodeText(buf), { skipEmptyLines: 'greedy' });
    table = r.data.map((row) => row.map((c) => String(c ?? '').trim()));
    source = 'CSV';
  } else if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('فایل اکسل هیچ برگه‌ای ندارد');
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let i = 1; i <= ws.columnCount; i++) vals.push(String(row.getCell(i).text ?? '').trim());
      table.push(vals);
    });
    source = 'XLSX';
  } else throw new BadRequestException('فقط فایل‌های CSV و XLSX پشتیبانی می‌شوند');
  const [head, ...rows] = table;
  if (!head?.length) throw new BadRequestException('فایل خالی است');
  const headers = head.map((h, i) => h || `ستون ${i + 1}`);
  const data = rows.filter((r) => r.some((c) => c));
  if (data.length > MAX_ROWS) throw new BadRequestException(`حداکثر ${MAX_ROWS.toLocaleString('fa-IR')} ردیف در هر فایل مجاز است`);
  return { headers, rows: data, source };
}

// ---------- Background job runner (in-process, state persisted in Job table) ----------
@Injectable()
export class JobRunner implements OnModuleInit {
  private log = new Logger('Jobs');
  constructor(private prisma: PrismaService) {}
  async onModuleInit() {
    // Jobs cannot survive a process restart in the in-process runner; mark them honestly.
    await this.prisma.job.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'FAILED', finishedAt: new Date(), errors: [{ row: 0, message: 'پردازش به دلیل راه‌اندازی مجدد سرور متوقف شد' }] } });
  }
  isCancelled = async (id: string) => (await this.prisma.job.findUnique({ where: { id }, select: { status: true } }))?.status === 'CANCELLED';
  run(job: Job, work: (job: Job) => Promise<void>) {
    setImmediate(async () => {
      try {
        await this.prisma.job.update({ where: { id: job.id }, data: { status: 'PROCESSING', startedAt: new Date() } });
        await work(job);
        await this.prisma.job.updateMany({ where: { id: job.id, status: 'PROCESSING' }, data: { status: 'COMPLETED', finishedAt: new Date() } });
      } catch (e: any) {
        this.log.error(`job ${job.id} failed: ${e?.message}`);
        await this.prisma.job.update({ where: { id: job.id }, data: { status: 'FAILED', finishedAt: new Date(), errors: [{ row: 0, message: String(e?.message ?? e).slice(0, 500) }] } });
      }
    });
  }
}

const startSchema = z.object({
  mapping: z.record(z.string(), z.enum([...LEAD_FIELDS, ''] as [string, ...string[]])),
  strategy: z.enum(['skip', 'merge', 'create']).default('merge'),
  categoryId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  consent: z.boolean().optional(),
});

@Injectable()
export class ImportsService {
  constructor(private prisma: PrismaService, private leads: LeadsService, private runner: JobRunner, private audit: AuditService, private billing: BillingService) {}

  async preview(ctx: AuthCtx, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('فایلی انتخاب نشده است');
    const { headers, rows, source } = await parseSpreadsheet(file.originalname, file.buffer);
    await this.billing.assert(ctx.orgId, 'imports');
    const job = await this.prisma.job.create({
      data: {
        organizationId: ctx.orgId, createdById: ctx.userId, type: 'IMPORT', status: 'PENDING', title: `ورود فایل ${file.originalname}`,
        fileName: file.originalname.slice(0, 200), total: rows.length, options: { headers, rows, source } as any,
      },
    });
    return { jobId: job.id, headers, sample: rows.slice(0, 10), total: rows.length, mapping: suggestMapping(headers), fields: FIELD_LABELS };
  }

  async start(ctx: AuthCtx, jobId: string, body: unknown) {
    const d = parse(startSchema, body);
    const job = await this.prisma.job.findFirst({ where: { id: jobId, organizationId: ctx.orgId, type: 'IMPORT' } });
    if (!job) throw new NotFoundException('عملیات یافت نشد');
    if (job.status !== 'PENDING') throw new BadRequestException('این فایل قبلاً پردازش شده است');
    const mapped = Object.values(d.mapping).filter(Boolean);
    if (!mapped.some((f) => ['fullName', 'businessName', 'instagramUsername', 'phone', 'email'].includes(f as string)))
      throw new BadRequestException('حداقل یکی از ستون‌های نام، کسب‌وکار، اینستاگرام، تلفن یا ایمیل را نگاشت کنید');
    for (const [id, model] of [[d.categoryId, 'category'], [d.campaignId, 'campaign']] as const)
      if (id && !(await (this.prisma as any)[model].findFirst({ where: { id, organizationId: ctx.orgId } }))) throw new BadRequestException('دسته‌بندی یا کمپین نامعتبر است');
    const { headers, rows, source } = job.options as any as { headers: string[]; rows: string[][]; source: LeadSource };
    const updated = await this.prisma.job.update({ where: { id: job.id }, data: { options: { mapping: d.mapping, strategy: d.strategy, source } as any } });
    await this.audit.log(ctx, 'import.start', 'job', job.id, { rows: rows.length, strategy: d.strategy });
    this.runner.run(updated, () => this.process(ctx, updated.id, headers, rows, source, d));
    return updated;
  }

  private async process(ctx: AuthCtx, jobId: string, headers: string[], rows: string[][], source: LeadSource, d: z.infer<typeof startSchema>) {
    const cats = await this.prisma.category.findMany({ where: { organizationId: ctx.orgId } });
    const catByName = new Map(cats.map((c) => [c.name.trim(), c.id]));
    const errors: { row: number; message: string }[] = [];
    const c = { processed: 0, created: 0, merged: 0, duplicates: 0, failed: 0 };
    const flush = () => this.prisma.job.update({ where: { id: jobId }, data: { ...c, errors: errors.slice(0, 500) } });
    let remaining = await this.billing.remaining(ctx.orgId, 'leads');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rec: any = {};
      headers.forEach((h, idx) => { const f = d.mapping[h]; if (f && row[idx]) rec[f] = row[idx]; });
      try {
        const input: any = { ...rec };
        if (rec.tags) input.tags = String(rec.tags).split(/[,،;|]/).map((t: string) => t.trim()).filter(Boolean).slice(0, 30);
        input.tags = Array.from(new Set([...(input.tags ?? []), ...(d.tags ?? [])]));
        if (rec.followersCount) input.followersCount = Number(String(rec.followersCount).replace(/[^\d]/g, '')) || null;
        delete input.category;
        input.categoryId = (rec.category && catByName.get(String(rec.category).trim())) || d.categoryId || null;
        input.campaignId = d.campaignId || null;
        if (d.consent) { input.consent = true; input.consentSource = `import:${jobId}`; }
        // While quota remains we skip the per-row limit query; once exhausted upsertLead enforces it (merges/skips still allowed).
        const r = await this.leads.upsertLead(ctx.orgId, ctx.userId, input, { source, strategy: d.strategy as DedupeStrategy, skipLimit: remaining > 0 });
        if (r.action === 'created') { c.created++; remaining--; }
        else if (r.action === 'duplicate') { c.created++; c.duplicates++; remaining--; }
        else if (r.action === 'merged') { c.merged++; c.duplicates++; }
        else c.duplicates++;
      } catch (e: any) {
        c.failed++;
        errors.push({ row: i + 2, message: e?.response?.message ?? e?.message ?? 'خطای نامشخص' });
      }
      c.processed++;
      if (c.processed % 50 === 0) { await flush(); if (await this.runner.isCancelled(jobId)) return; }
    }
    await flush();
    await this.prisma.activity.create({ data: { organizationId: ctx.orgId, userId: ctx.userId, type: 'IMPORT', content: `ورود فایل: ${c.created} جدید، ${c.merged} ادغام، ${c.failed} خطا` } });
  }
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService, private leads: LeadsService) {}
  async leadsFile(ctx: AuthCtx, query: any, format: 'csv' | 'xlsx') {
    const where = this.leads.where(ctx.orgId, parse(filterSchema, query), ctx.userId);
    const items = await this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100_000, include: { category: true, campaign: true } });
    const members = await this.prisma.membership.findMany({ where: { organizationId: ctx.orgId }, include: { user: true } });
    const userName = new Map(members.map((m) => [m.userId, m.user.name]));
    const fa = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'short', timeStyle: 'short' });
    const cols: [string, (l: (typeof items)[number]) => any][] = [
      ['نام و نام خانوادگی', (l) => l.fullName], ['نام کسب‌وکار', (l) => l.businessName], ['اینستاگرام', (l) => l.instagramUsername],
      ['تلفن', (l) => l.phone], ['ایمیل', (l) => l.email], ['شهر', (l) => l.city], ['دسته‌بندی', (l) => l.category?.name],
      ['وضعیت', (l) => l.status], ['اولویت', (l) => l.priority], ['منبع', (l) => l.source], ['کمپین', (l) => l.campaign?.name],
      ['کارشناس', (l) => (l.assigneeId ? userName.get(l.assigneeId) : '')], ['امتیاز', (l) => l.score], ['برچسب‌ها', (l) => l.tags.join('، ')],
      ['دنبال‌کننده', (l) => l.followersCount], ['وب‌سایت', (l) => l.website], ['رضایت', (l) => (l.consent ? 'بله' : 'خیر')],
      ['یادداشت', (l) => l.notes], ['تاریخ ایجاد', (l) => fa.format(l.createdAt)],
    ];
    if (format === 'csv') {
      const csv = Papa.unparse({ fields: cols.map((c) => c[0]), data: items.map((l) => cols.map(([, f]) => f(l) ?? '')) });
      return { buffer: Buffer.from('﻿' + csv, 'utf8'), count: items.length };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('سرنخ‌ها', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(([h]) => ({ header: h, width: 20 }));
    items.forEach((l) => ws.addRow(cols.map(([, f]) => f(l) ?? '')));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1B3F' } };
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), count: items.length };
  }
}

const upload = FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, /\.(csv|xlsx|txt)$/i.test(f.originalname)),
});

@ApiTags('imports')
@Controller()
export class ImportsController {
  constructor(private svc: ImportsService, private exp: ExportService, private prisma: PrismaService, private audit: AuditService) {}

  @MinRole('AGENT') @Post('imports/preview') @UseInterceptors(upload)
  preview(@Ctx() ctx: AuthCtx, @UploadedFile() file: Express.Multer.File) { return this.svc.preview(ctx, file); }

  @MinRole('AGENT') @Post('imports/:id/start')
  start(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) { return this.svc.start(ctx, id, b); }

  @Get('jobs')
  jobs(@Ctx() ctx: AuthCtx, @Query('type') type?: string) {
    return this.prisma.job.findMany({
      where: { organizationId: ctx.orgId, ...(type && { type: type as any }), NOT: { status: 'PENDING', type: 'IMPORT' } },
      orderBy: { createdAt: 'desc' }, take: 100, omit: { options: true },
    });
  }

  @Get('jobs/:id')
  async job(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const j = await this.prisma.job.findFirst({ where: { id, organizationId: ctx.orgId }, omit: { options: true } });
    if (!j) throw new NotFoundException('عملیات یافت نشد');
    return j;
  }

  @MinRole('AGENT') @Post('jobs/:id/cancel')
  async cancel(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.job.updateMany({ where: { id, organizationId: ctx.orgId, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'CANCELLED', finishedAt: new Date() } });
    if (!r.count) throw new BadRequestException('این عملیات قابل توقف نیست');
    return { ok: true };
  }

  @Get('jobs/:id/errors.csv')
  async errorsCsv(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Res() res: Response) {
    const j = await this.prisma.job.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!j) throw new NotFoundException('عملیات یافت نشد');
    const csv = Papa.unparse({ fields: ['ردیف', 'خطا'], data: ((j.errors as any[]) ?? []).map((e) => [e.row, e.message]) });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${id}.csv"`);
    res.send('﻿' + csv);
  }

  @Get('imports/template.xlsx')
  async template(@Res() res: Response) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('نمونه', { views: [{ rightToLeft: true }] });
    ws.columns = LEAD_FIELDS.map((f) => ({ header: FIELD_LABELS[f], width: 22 }));
    ws.addRow(['علی رضایی', 'موبایل رضا', 'mobile_reza', '09121234567', 'reza@example.com', 'تهران', 'https://example.com', 'مشتری عمده', 'عمده، تهران', 'فروشگاه موبایل', '1200']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="eazazi-import-template.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }

  @MinRole('AGENT') @Get('exports/leads')
  async exportLeads(@Ctx() ctx: AuthCtx, @Query() q: any, @Res() res: Response) {
    const format = q.format === 'csv' ? 'csv' : 'xlsx';
    const { buffer, count } = await this.exp.leadsFile(ctx, q, format);
    await this.audit.log(ctx, 'lead.export', 'lead', undefined, { count, format });
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${Date.now()}.${format}"`);
    res.send(buffer);
  }
}

@Module({ imports: [LeadsModule], controllers: [ImportsController], providers: [ImportsService, ExportService, JobRunner], exports: [JobRunner] })
export class ImportsModule {}
export type { Prisma };
