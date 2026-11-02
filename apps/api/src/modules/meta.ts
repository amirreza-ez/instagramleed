/**
 * Official Meta integrations only:
 *  - Instagram API with Instagram Login (graph.instagram.com): own profile, own media comments, DMs sent to the business.
 *  - Facebook Login (graph.facebook.com): Pages, Lead Ads (leadgen), Instagram Business Discovery (public business profiles).
 * No scraping, no credential collection, no unsolicited messaging.
 */
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Injectable, Logger, Module, NotFoundException,
  OnModuleDestroy, OnModuleInit, Param, Post, Query, Req, Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Integration, IntegrationProvider } from '@prisma/client';
import crypto from 'node:crypto';
import { z } from 'zod';
import { AuditService, AuthCtx, Ctx, decrypt, encrypt, MinRole, parse, PrismaService, Public, randomToken, rl, sha256 } from '../common/core';
import { BillingService } from './billing';
import { JobRunner } from './imports';
import { ImportsModule } from './imports';
import { leadInput, LeadsModule, LeadsService } from './leads';

const V = () => process.env.META_GRAPH_VERSION || 'v24.0';
export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages'];
export const FB_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'leads_retrieval', 'instagram_basic', 'business_management'];

export class GraphError extends Error { constructor(msg: string, public code?: number, public status?: number) { super(msg); } }

export async function graph(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new GraphError(j?.error?.message || j?.error_message || `HTTP ${r.status}`, j?.error?.code, r.status);
  return j;
}
const qs = (o: Record<string, any>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();

/** Verifies X-Hub-Signature-256 against any configured app secret (FB app and/or IG app). */
export function verifyMetaSignature(raw: Buffer | undefined, header: string | undefined, secrets: (string | undefined)[]) {
  if (!raw || !header?.startsWith('sha256=')) return false;
  const sig = Buffer.from(header.slice(7), 'hex');
  return secrets.filter(Boolean).some((s) => {
    const mac = crypto.createHmac('sha256', s!).update(raw).digest();
    return mac.length === sig.length && crypto.timingSafeEqual(mac, sig);
  });
}

@Injectable()
export class MetaService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Meta');
  private timer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService, private leads: LeadsService, private runner: JobRunner, private audit: AuditService, private billing: BillingService) {}

  onModuleInit() { this.timer = setInterval(() => this.maintainTokens().catch((e) => this.log.warn(e.message)), 6 * 3600_000); }
  onModuleDestroy() { clearInterval(this.timer); }

  config() {
    return {
      graphVersion: V(),
      instagramConfigured: !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
      facebookConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
      webhookUrl: `${process.env.API_URL}/api/webhooks/meta`,
      verifyTokenSet: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
      redirectUris: { INSTAGRAM: this.redirect('INSTAGRAM'), FACEBOOK: this.redirect('FACEBOOK') },
    };
  }
  private redirect(p: IntegrationProvider) { return `${process.env.API_URL}/api/meta/callback/${p.toLowerCase()}`; }

  logEvent(orgId: string | null, integrationId: string | null, level: 'info' | 'warn' | 'error', event: string, message: string, payload?: any) {
    return this.prisma.integrationLog.create({ data: { organizationId: orgId, integrationId, level, event, message: message.slice(0, 1000), payload } }).catch(() => undefined);
  }

  async connectUrl(ctx: AuthCtx, provider: IntegrationProvider) {
    const cfg = this.config();
    if (provider === 'INSTAGRAM' && !cfg.instagramConfigured) throw new BadRequestException('INSTAGRAM_APP_ID و INSTAGRAM_APP_SECRET در تنظیمات سرور تعریف نشده‌اند');
    if (provider === 'FACEBOOK' && !cfg.facebookConfigured) throw new BadRequestException('META_APP_ID و META_APP_SECRET در تنظیمات سرور تعریف نشده‌اند');
    await this.billing.assert(ctx.orgId, 'integrations');
    const state = randomToken(24);
    await this.prisma.oAuthState.create({ data: { state, organizationId: ctx.orgId, userId: ctx.userId, provider, expiresAt: new Date(Date.now() + 15 * 60_000) } });
    if (provider === 'INSTAGRAM')
      return { url: `https://www.instagram.com/oauth/authorize?${qs({ client_id: process.env.INSTAGRAM_APP_ID, redirect_uri: this.redirect(provider), response_type: 'code', scope: IG_SCOPES.join(','), state })}` };
    return { url: `https://www.facebook.com/${V()}/dialog/oauth?${qs({ client_id: process.env.META_APP_ID, redirect_uri: this.redirect(provider), state, scope: FB_SCOPES.join(','), response_type: 'code' })}` };
  }

  async callback(provider: IntegrationProvider, code: string, state: string) {
    const st = await this.prisma.oAuthState.findUnique({ where: { state } });
    if (!st || st.provider !== provider || st.expiresAt < new Date()) throw new BadRequestException('درخواست اتصال نامعتبر یا منقضی است');
    await this.prisma.oAuthState.delete({ where: { id: st.id } });
    const ctx = { orgId: st.organizationId, userId: st.userId };
    let integ: Integration;
    if (provider === 'INSTAGRAM') {
      const body = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, client_secret: process.env.INSTAGRAM_APP_SECRET!, grant_type: 'authorization_code', redirect_uri: this.redirect(provider), code });
      const short = await graph('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
      const long = await graph(`https://graph.instagram.com/access_token?${qs({ grant_type: 'ig_exchange_token', client_secret: process.env.INSTAGRAM_APP_SECRET, access_token: short.access_token })}`);
      const me = await graph(`https://graph.instagram.com/${V()}/me?${qs({ fields: 'user_id,username,name,account_type,followers_count', access_token: long.access_token })}`);
      const scopes = Array.isArray(short.permissions) ? short.permissions : String(short.permissions ?? IG_SCOPES.join(',')).split(',');
      integ = await this.prisma.integration.upsert({
        where: { organizationId_provider_externalId: { organizationId: ctx.orgId, provider, externalId: String(me.user_id ?? me.id) } },
        create: { organizationId: ctx.orgId, provider, externalId: String(me.user_id ?? me.id), igUserId: String(me.user_id ?? me.id), name: `@${me.username}`, accessTokenEnc: encrypt(long.access_token), tokenExpiresAt: new Date(Date.now() + (long.expires_in ?? 5184000) * 1000), scopes },
        update: { name: `@${me.username}`, accessTokenEnc: encrypt(long.access_token), tokenExpiresAt: new Date(Date.now() + (long.expires_in ?? 5184000) * 1000), scopes, status: 'CONNECTED', lastError: null },
      });
    } else {
      const short = await graph(`https://graph.facebook.com/${V()}/oauth/access_token?${qs({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: this.redirect(provider), code })}`);
      const long = await graph(`https://graph.facebook.com/${V()}/oauth/access_token?${qs({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token })}`);
      const me = await graph(`https://graph.facebook.com/${V()}/me?${qs({ fields: 'id,name', access_token: long.access_token })}`);
      const perms = await graph(`https://graph.facebook.com/${V()}/me/permissions?${qs({ access_token: long.access_token })}`);
      const accounts = await graph(`https://graph.facebook.com/${V()}/me/accounts?${qs({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token, limit: 100 })}`);
      const pages = (accounts.data ?? []).map((p: any) => ({ id: p.id, name: p.name, tokenEnc: encrypt(p.access_token), igUserId: p.instagram_business_account?.id ?? null, igUsername: p.instagram_business_account?.username ?? null, leadgenSubscribed: false }));
      for (const p of pages) {
        try { await graph(`https://graph.facebook.com/${V()}/${p.id}/subscribed_apps`, { method: 'POST', body: new URLSearchParams({ subscribed_fields: 'leadgen', access_token: decrypt(p.tokenEnc) }) }); p.leadgenSubscribed = true; }
        catch (e: any) { await this.logEvent(ctx.orgId, null, 'warn', 'leadgen.subscribe', `اشتراک وب‌هوک Lead Ads برای صفحه ${p.name} ناموفق: ${e.message}`); }
      }
      integ = await this.prisma.integration.upsert({
        where: { organizationId_provider_externalId: { organizationId: ctx.orgId, provider, externalId: me.id } },
        create: { organizationId: ctx.orgId, provider, externalId: me.id, name: me.name, igUserId: pages.find((p: any) => p.igUserId)?.igUserId ?? null, accessTokenEnc: encrypt(long.access_token), tokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null, scopes: (perms.data ?? []).filter((x: any) => x.status === 'granted').map((x: any) => x.permission), pages },
        update: { name: me.name, igUserId: pages.find((p: any) => p.igUserId)?.igUserId ?? null, accessTokenEnc: encrypt(long.access_token), tokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null, pages, status: 'CONNECTED', lastError: null },
      });
    }
    await this.logEvent(ctx.orgId, integ.id, 'info', 'oauth.connected', `اتصال ${integ.name} برقرار شد`);
    await this.audit.log(ctx, 'integration.connect', 'integration', integ.id, { provider });
    return integ;
  }

  async list(orgId: string) {
    const items = await this.prisma.integration.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' } });
    return items.map(({ accessTokenEnc, pages, ...i }) => ({
      ...i, pages: ((pages as any[]) ?? []).map(({ tokenEnc, ...p }) => p),
      daysToExpiry: i.tokenExpiresAt ? Math.floor((i.tokenExpiresAt.getTime() - Date.now()) / 864e5) : null,
    }));
  }

  private async getInteg(orgId: string, id: string) {
    const i = await this.prisma.integration.findFirst({ where: { id, organizationId: orgId } });
    if (!i) throw new NotFoundException('اتصال یافت نشد');
    if (i.status === 'DISCONNECTED') throw new BadRequestException('این اتصال قطع شده است');
    return i;
  }

  async refreshToken(i: Integration) {
    if (i.provider !== 'INSTAGRAM') throw new BadRequestException('توکن فیسبوک با اتصال مجدد تمدید می‌شود');
    try {
      const r = await graph(`https://graph.instagram.com/refresh_access_token?${qs({ grant_type: 'ig_refresh_token', access_token: decrypt(i.accessTokenEnc) })}`);
      await this.prisma.integration.update({ where: { id: i.id }, data: { accessTokenEnc: encrypt(r.access_token), tokenExpiresAt: new Date(Date.now() + r.expires_in * 1000), status: 'CONNECTED', lastError: null } });
      await this.logEvent(i.organizationId, i.id, 'info', 'token.refreshed', 'توکن تمدید شد');
    } catch (e: any) {
      await this.prisma.integration.update({ where: { id: i.id }, data: { status: 'ERROR', lastError: e.message } });
      await this.logEvent(i.organizationId, i.id, 'error', 'token.refresh_failed', e.message);
      throw new BadRequestException(`تمدید توکن ناموفق بود: ${e.message}`);
    }
  }

  /** Periodic: refresh IG tokens expiring within 10 days; flag expired ones. */
  async maintainTokens() {
    const now = new Date();
    await this.prisma.integration.updateMany({ where: { status: 'CONNECTED', tokenExpiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
    const soon = await this.prisma.integration.findMany({ where: { provider: 'INSTAGRAM', status: 'CONNECTED', tokenExpiresAt: { lt: new Date(Date.now() + 10 * 864e5) } } });
    for (const i of soon) await this.refreshToken(i).catch(() => undefined);
  }

  // ---------- Lead creation helpers ----------
  private async leadFromInstagramUser(orgId: string, u: { id?: string; username?: string; name?: string }, source: 'INSTAGRAM_COMMENT' | 'INSTAGRAM_DM' | 'INSTAGRAM_MENTION', extra: { text?: string; meta?: any; tag: string }) {
    if (!u.username && !u.id) return null;
    const r = await this.leads.upsertLead(orgId, null, {
      instagramUsername: u.username ?? null, fullName: u.name ?? (u.username ? null : `کاربر اینستاگرام ${u.id}`), tags: [extra.tag],
    }, { source, strategy: 'merge' });
    if (r.lead) {
      const cf = { ...((r.lead.customFields as any) ?? {}), igsid: u.id ?? (r.lead.customFields as any)?.igsid, ...extra.meta };
      await this.prisma.lead.update({ where: { id: r.lead.id }, data: { customFields: cf } });
      if (extra.text) await this.prisma.activity.create({ data: { organizationId: orgId, leadId: r.lead.id, type: source === 'INSTAGRAM_DM' ? 'MESSAGE' : 'COMMENT', content: extra.text.slice(0, 2000), meta: extra.meta } });
    }
    return r;
  }

  private async fetchLeadAd(orgId: string, leadgenId: string, pageToken: string, meta: any) {
    const l = await graph(`https://graph.facebook.com/${V()}/${leadgenId}?${qs({ fields: 'id,created_time,field_data,ad_id,ad_name,form_id,campaign_id,campaign_name', access_token: pageToken })}`);
    const f: Record<string, string> = {};
    for (const x of l.field_data ?? []) f[String(x.name).toLowerCase()] = (x.values ?? []).join(', ');
    const pick = (...keys: string[]) => keys.map((k) => f[k]).find(Boolean) ?? null;
    let campaignId: string | null = null;
    if (l.campaign_id) campaignId = (await this.prisma.campaign.findFirst({ where: { organizationId: orgId, metaCampaignId: String(l.campaign_id) } }))?.id ?? null;
    const r = await this.leads.upsertLead(orgId, null, {
      fullName: pick('full_name', 'name', 'first_name') ?? undefined, phone: pick('phone_number', 'phone'), email: pick('email'),
      city: pick('city'), businessName: pick('company_name', 'company'), campaignId, consent: true, consentSource: `Meta Lead Ads form ${l.form_id}`, tags: ['Lead Ads'],
    }, { source: 'META_LEAD_ADS', strategy: 'merge', externalId: `fbl:${l.id}` });
    if (r.lead && r.action !== 'skipped') await this.prisma.lead.update({ where: { id: r.lead.id }, data: { customFields: { ...((r.lead.customFields as any) ?? {}), leadAds: { ...meta, ad: l.ad_name, campaign: l.campaign_name, fields: f } } } });
    return r;
  }

  // ---------- Sync job ----------
  async startSync(ctx: AuthCtx, id: string) {
    const i = await this.getInteg(ctx.orgId, id);
    const job = await this.prisma.job.create({ data: { organizationId: ctx.orgId, createdById: ctx.userId, type: 'SYNC', title: `همگام‌سازی ${i.name}` } });
    this.runner.run(job, async () => {
      const c = { processed: 0, created: 0, merged: 0, duplicates: 0, failed: 0 };
      const errors: any[] = [];
      const tally = (r: any) => { c.processed++; if (!r) return; if (r.action === 'created' || r.action === 'duplicate') c.created++; else if (r.action === 'merged') c.merged++; else c.duplicates++; };
      try {
        if (i.provider === 'INSTAGRAM') {
          const token = decrypt(i.accessTokenEnc);
          const media = await graph(`https://graph.instagram.com/${V()}/me/media?${qs({ fields: 'id,caption,timestamp,permalink,comments_count', limit: 25, access_token: token })}`);
          for (const m of media.data ?? []) {
            if (!m.comments_count) continue;
            const cm = await graph(`https://graph.instagram.com/${V()}/${m.id}/comments?${qs({ fields: 'id,text,timestamp,username,from', limit: 50, access_token: token })}`);
            for (const k of cm.data ?? []) {
              try { tally(await this.leadFromInstagramUser(ctx.orgId, { id: k.from?.id, username: k.username ?? k.from?.username }, 'INSTAGRAM_COMMENT', { text: k.text, tag: 'کامنت اینستاگرام', meta: { lastCommentId: k.id, mediaId: m.id, permalink: m.permalink } })); }
              catch (e: any) { c.failed++; errors.push({ row: c.processed, message: e.message }); }
            }
            await this.prisma.job.update({ where: { id: job.id }, data: c });
          }
          try {
            const conv = await graph(`https://graph.instagram.com/${V()}/me/conversations?${qs({ platform: 'instagram', fields: 'participants,updated_time', limit: 50, access_token: token })}`);
            for (const cv of conv.data ?? []) {
              const other = (cv.participants?.data ?? []).find((p: any) => String(p.id) !== String(i.igUserId));
              if (other) { try { tally(await this.leadFromInstagramUser(ctx.orgId, { id: other.id, username: other.username }, 'INSTAGRAM_DM', { tag: 'دایرکت اینستاگرام' })); } catch (e: any) { c.failed++; errors.push({ row: c.processed, message: e.message }); } }
            }
          } catch (e: any) { errors.push({ row: 0, message: `دریافت گفتگوها: ${e.message}` }); }
        } else {
          for (const p of (i.pages as any[]) ?? []) {
            const token = decrypt(p.tokenEnc);
            const forms = await graph(`https://graph.facebook.com/${V()}/${p.id}/leadgen_forms?${qs({ fields: 'id,name,status', limit: 50, access_token: token })}`).catch((e) => { errors.push({ row: 0, message: `${p.name}: ${e.message}` }); return { data: [] }; });
            for (const f of forms.data ?? []) {
              const leads = await graph(`https://graph.facebook.com/${V()}/${f.id}/leads?${qs({ fields: 'id', limit: 100, access_token: token })}`).catch(() => ({ data: [] }));
              for (const l of leads.data ?? []) {
                try { tally(await this.fetchLeadAd(ctx.orgId, l.id, token, { pageId: p.id, formId: f.id, formName: f.name })); }
                catch (e: any) { c.failed++; errors.push({ row: c.processed, message: e.message }); }
              }
              await this.prisma.job.update({ where: { id: job.id }, data: c });
            }
          }
        }
        await this.prisma.integration.update({ where: { id: i.id }, data: { lastSyncAt: new Date(), status: 'CONNECTED', lastError: null } });
        await this.logEvent(ctx.orgId, i.id, 'info', 'sync.completed', `همگام‌سازی: ${c.created} جدید، ${c.merged} به‌روزرسانی، ${c.failed} خطا`);
      } catch (e: any) {
        const expired = e instanceof GraphError && (e.code === 190 || e.status === 401);
        await this.prisma.integration.update({ where: { id: i.id }, data: { status: expired ? 'EXPIRED' : 'ERROR', lastError: e.message } });
        await this.logEvent(ctx.orgId, i.id, 'error', 'sync.failed', e.message);
        throw e;
      } finally {
        await this.prisma.job.update({ where: { id: job.id }, data: { ...c, total: c.processed, errors: errors.slice(0, 200) } });
      }
    });
    return job;
  }

  // ---------- Business Discovery job (legitimate replacement for the reference app's "extraction") ----------
  async startDiscovery(ctx: AuthCtx, body: unknown) {
    const d = parse(z.object({
      integrationId: z.string(), usernames: z.array(z.string()).min(1, 'حداقل یک نام کاربری وارد کنید').max(500),
      categoryId: z.string().optional().nullable(), campaignId: z.string().optional().nullable(), tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    }), body);
    const i = await this.getInteg(ctx.orgId, d.integrationId);
    if (i.provider !== 'FACEBOOK' || !i.igUserId) throw new BadRequestException('برای کشف کسب‌وکار، یک اتصال فیسبوک با حساب اینستاگرام تجاری لازم است');
    const usernames = Array.from(new Set(d.usernames.map((u) => u.trim().toLowerCase().replace(/^@/, '').replace(/.*instagram\.com\//, '').replace(/[/?#].*$/, '')).filter((u) => /^[a-z0-9._]{1,30}$/.test(u))));
    if (!usernames.length) throw new BadRequestException('نام کاربری معتبری یافت نشد');
    await this.billing.assert(ctx.orgId, 'imports');
    const job = await this.prisma.job.create({ data: { organizationId: ctx.orgId, createdById: ctx.userId, type: 'DISCOVERY', title: `کشف ${usernames.length} کسب‌وکار`, total: usernames.length, options: { usernames } } });
    await this.audit.log(ctx, 'discovery.start', 'job', job.id, { count: usernames.length });
    const token = decrypt(i.accessTokenEnc);
    const pageToken = ((i.pages as any[]) ?? []).find((p) => p.igUserId === i.igUserId)?.tokenEnc;
    const accessToken = pageToken ? decrypt(pageToken) : token;
    this.runner.run(job, async () => {
      const c = { processed: 0, created: 0, merged: 0, duplicates: 0, failed: 0 };
      const errors: any[] = [];
      for (const u of usernames) {
        if (await this.runner.isCancelled(job.id)) return;
        try {
          const fields = `business_discovery.username(${u}){username,name,biography,website,followers_count,media_count,profile_picture_url}`;
          const r = await graph(`https://graph.facebook.com/${V()}/${i.igUserId}?${qs({ fields, access_token: accessToken })}`);
          const b = r.business_discovery;
          const res = await this.leads.upsertLead(ctx.orgId, ctx.userId, {
            instagramUsername: b.username, businessName: b.name ?? null, bio: b.biography ?? null, website: b.website ?? null, followersCount: b.followers_count ?? null,
            categoryId: d.categoryId ?? null, campaignId: d.campaignId ?? null, tags: ['کشف کسب‌وکار', ...(d.tags ?? [])],
          }, { source: 'BUSINESS_DISCOVERY', strategy: 'merge' });
          if (res.action === 'created' || res.action === 'duplicate') c.created++; else if (res.action === 'merged') c.merged++; else c.duplicates++;
        } catch (e: any) {
          c.failed++;
          errors.push({ row: c.processed + 1, message: `${u}: ${e instanceof GraphError ? 'حساب تجاری/سازنده عمومی یافت نشد یا محدودیت API (' + e.message + ')' : e.message}` });
        }
        c.processed++;
        await this.prisma.job.update({ where: { id: job.id }, data: { ...c, errors: errors.slice(0, 500) } });
        await new Promise((r) => setTimeout(r, 1500)); // stay well under Graph API rate limits
      }
      await this.logEvent(ctx.orgId, i.id, 'info', 'discovery.completed', `کشف کسب‌وکار: ${c.created} جدید، ${c.failed} ناموفق`);
    });
    return job;
  }

  /** Reply to a lead who contacted us (DM within the 24h window, or private reply to their comment). */
  async reply(ctx: AuthCtx, leadId: string, body: unknown) {
    const d = parse(z.object({ text: z.string().trim().min(1, 'متن پیام را وارد کنید').max(1000), mode: z.enum(['dm', 'private_reply']) }), body);
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, organizationId: ctx.orgId } });
    if (!lead) throw new NotFoundException('سرنخ یافت نشد');
    const cf = (lead.customFields as any) ?? {};
    const i = await this.prisma.integration.findFirst({ where: { organizationId: ctx.orgId, provider: 'INSTAGRAM', status: 'CONNECTED' } });
    if (!i) throw new BadRequestException('اتصال فعال اینستاگرام وجود ندارد');
    const recipient = d.mode === 'dm' ? (cf.igsid ? { id: cf.igsid } : null) : (cf.lastCommentId ? { comment_id: cf.lastCommentId } : null);
    if (!recipient) throw new BadRequestException(d.mode === 'dm' ? 'این سرنخ از طریق دایرکت با شما در تماس نبوده است' : 'کامنتی از این سرنخ ثبت نشده است');
    try {
      await graph(`https://graph.instagram.com/${V()}/me/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${decrypt(i.accessTokenEnc)}` },
        body: JSON.stringify({ recipient, message: { text: d.text } }),
      });
    } catch (e: any) {
      await this.logEvent(ctx.orgId, i.id, 'error', 'message.failed', e.message);
      throw new BadRequestException(`ارسال پیام ناموفق بود (پنجره ۲۴ ساعته یا مجوزها را بررسی کنید): ${e.message}`);
    }
    await this.prisma.activity.create({ data: { organizationId: ctx.orgId, leadId, userId: ctx.userId, type: 'MESSAGE', content: `پاسخ ارسال شد: ${d.text}`, meta: { mode: d.mode } } });
    return { ok: true };
  }

  // ---------- Webhook processing ----------
  async handleWebhook(payload: any) {
    const key = sha256(JSON.stringify(payload));
    const exists = await this.prisma.webhookEvent.findUnique({ where: { dedupeKey: key } });
    if (exists) return;
    const ev = await this.prisma.webhookEvent.create({ data: { provider: String(payload.object ?? 'unknown'), dedupeKey: key, payload } });
    try {
      for (const entry of payload.entry ?? []) {
        if (payload.object === 'page') {
          for (const ch of entry.changes ?? []) {
            if (ch.field !== 'leadgen') continue;
            const v = ch.value ?? {};
            const integs = await this.prisma.integration.findMany({ where: { provider: 'FACEBOOK', status: { not: 'DISCONNECTED' } } });
            for (const i of integs) {
              const page = ((i.pages as any[]) ?? []).find((p) => String(p.id) === String(v.page_id ?? entry.id));
              if (!page) continue;
              await this.fetchLeadAd(i.organizationId, String(v.leadgen_id), decrypt(page.tokenEnc), { pageId: page.id, formId: v.form_id, adId: v.ad_id })
                .then(() => this.logEvent(i.organizationId, i.id, 'info', 'webhook.leadgen', `سرنخ جدید از Lead Ads (${v.leadgen_id})`))
                .catch((e) => this.logEvent(i.organizationId, i.id, 'error', 'webhook.leadgen_failed', e.message, v));
            }
          }
        }
        if (payload.object === 'instagram') {
          const integs = await this.prisma.integration.findMany({ where: { igUserId: String(entry.id), status: { not: 'DISCONNECTED' } } });
          for (const i of integs) {
            for (const ch of entry.changes ?? []) {
              const v = ch.value ?? {};
              if (ch.field === 'comments' || ch.field === 'live_comments')
                await this.leadFromInstagramUser(i.organizationId, { id: v.from?.id, username: v.from?.username }, 'INSTAGRAM_COMMENT', { text: v.text, tag: 'کامنت اینستاگرام', meta: { lastCommentId: v.id, mediaId: v.media?.id } });
              else if (ch.field === 'mentions')
                await this.logEvent(i.organizationId, i.id, 'info', 'webhook.mention', 'منشن جدید دریافت شد', v);
            }
            for (const m of entry.messaging ?? []) {
              if (!m.message || m.message.is_echo || String(m.sender?.id) === String(i.igUserId)) continue;
              let profile: any = {};
              try { profile = await graph(`https://graph.instagram.com/${V()}/${m.sender.id}?${qs({ fields: 'name,username', access_token: decrypt(i.accessTokenEnc) })}`); } catch { /* profile access may be restricted */ }
              await this.leadFromInstagramUser(i.organizationId, { id: m.sender.id, username: profile.username, name: profile.name }, 'INSTAGRAM_DM', { text: m.message.text ?? '[پیوست]', tag: 'دایرکت اینستاگرام', meta: { lastMessageAt: m.timestamp } });
            }
            await this.logEvent(i.organizationId, i.id, 'info', 'webhook.instagram', 'رویداد اینستاگرام پردازش شد');
          }
        }
      }
      await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date() } });
    } catch (e: any) {
      await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { error: String(e.message).slice(0, 500) } });
      this.log.error(`webhook failed: ${e.message}`);
    }
  }
}

@ApiTags('meta')
@Controller()
export class MetaController {
  constructor(private meta: MetaService, private prisma: PrismaService, private audit: AuditService, private leads: LeadsService) {}

  @Get('meta/status')
  async status(@Ctx() ctx: AuthCtx) { return { config: this.meta.config(), integrations: await this.meta.list(ctx.orgId) }; }

  @MinRole('ADMIN') @Post('meta/connect/:provider')
  connect(@Ctx() ctx: AuthCtx, @Param('provider') p: string) {
    const provider = p.toUpperCase() as IntegrationProvider;
    if (!['INSTAGRAM', 'FACEBOOK'].includes(provider)) throw new BadRequestException('ارائه‌دهنده نامعتبر');
    return this.meta.connectUrl(ctx, provider);
  }

  @Public() @Get('meta/callback/:provider')
  async callback(@Param('provider') p: string, @Query() q: any, @Res() res: Response) {
    const app = process.env.APP_URL ?? '';
    if (q.error || !q.code || !q.state) return res.redirect(`${app}/#/integrations?error=${encodeURIComponent(q.error_description ?? q.error ?? 'cancelled')}`);
    try {
      await this.meta.callback(p.toUpperCase() as IntegrationProvider, String(q.code), String(q.state));
      return res.redirect(`${app}/#/integrations?connected=1`);
    } catch (e: any) {
      return res.redirect(`${app}/#/integrations?error=${encodeURIComponent(e.message ?? 'error')}`);
    }
  }

  @MinRole('MANAGER') @Post('meta/integrations/:id/sync')
  sync(@Ctx() ctx: AuthCtx, @Param('id') id: string) { return this.meta.startSync(ctx, id); }

  @MinRole('ADMIN') @Post('meta/integrations/:id/refresh-token')
  async refresh(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const i = await this.prisma.integration.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!i) throw new NotFoundException('اتصال یافت نشد');
    await this.meta.refreshToken(i);
    return { ok: true };
  }

  @MinRole('ADMIN') @Delete('meta/integrations/:id')
  async disconnect(@Ctx() ctx: AuthCtx, @Param('id') id: string) {
    const r = await this.prisma.integration.updateMany({ where: { id, organizationId: ctx.orgId }, data: { status: 'DISCONNECTED', accessTokenEnc: '', pages: [] } });
    if (!r.count) throw new NotFoundException('اتصال یافت نشد');
    await this.meta.logEvent(ctx.orgId, id, 'info', 'disconnected', 'اتصال قطع و توکن‌ها حذف شدند');
    await this.audit.log(ctx, 'integration.disconnect', 'integration', id);
    return { ok: true };
  }

  @Get('meta/logs')
  logs(@Ctx() ctx: AuthCtx, @Query('integrationId') integrationId?: string) {
    return this.prisma.integrationLog.findMany({ where: { organizationId: ctx.orgId, ...(integrationId && { integrationId }) }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @MinRole('AGENT') @Post('meta/discovery')
  discovery(@Ctx() ctx: AuthCtx, @Body() b: unknown) { return this.meta.startDiscovery(ctx, b); }

  @MinRole('AGENT') @Post('meta/leads/:id/reply')
  reply(@Ctx() ctx: AuthCtx, @Param('id') id: string, @Body() b: unknown) { return this.meta.reply(ctx, id, b); }

  // ---- Meta webhooks ----
  @Public() @Get('webhooks/meta')
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response) {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected) return res.status(200).type('text/plain').send(challenge);
    return res.status(403).send('forbidden');
  }

  @Public() @Throttle(rl(600)) @HttpCode(200) @Post('webhooks/meta')
  async receive(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-hub-signature-256') sig: string) {
    if (!verifyMetaSignature(req.rawBody, sig, [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET])) {
      await this.meta.logEvent(null, null, 'warn', 'webhook.bad_signature', 'امضای وب‌هوک نامعتبر بود');
      throw new ForbiddenException('invalid signature');
    }
    // Acknowledge fast; process asynchronously (Meta retries on slow/failed responses).
    setImmediate(() => this.meta.handleWebhook(req.body));
    return 'EVENT_RECEIVED';
  }

  // ---- Generic lead intake (website forms, Zapier/Make, other tools) ----
  @Public() @Throttle(rl(60)) @Post('public/leads/:key')
  async intake(@Param('key') key: string, @Body() b: unknown) {
    const org = key.length >= 20 ? await this.prisma.organization.findUnique({ where: { webhookKey: key } }) : null;
    if (!org || org.suspended) throw new NotFoundException('not found');
    const d = parse(leadInput.pick({ fullName: true, businessName: true, instagramUsername: true, phone: true, email: true, city: true, website: true, notes: true, tags: true, consent: true, consentSource: true }), b);
    const r = await this.leads.upsertLead(org.id, null, { ...d, tags: [...(d.tags ?? []), 'وب‌هوک'] }, { source: 'WEBHOOK', strategy: 'merge' });
    return { ok: true, id: r.lead?.id, action: r.action };
  }
}

@Module({ imports: [LeadsModule, ImportsModule], controllers: [MetaController], providers: [MetaService] })
export class MetaModule {}
