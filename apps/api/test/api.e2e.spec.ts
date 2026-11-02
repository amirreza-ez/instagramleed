import { INestApplication } from '@nestjs/common';
import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PrismaService, encrypt, normPhone, normUsername } from '../src/common/core';
import { DEFAULT_PLANS } from '../src/modules/billing';
import { suggestMapping } from '../src/modules/imports';
import { verifyMetaSignature } from '../src/modules/meta';

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const pw = 'Str0ngPass!';

async function register(name: string) {
  const r = await request(http).post('/api/auth/register').send({ name, email: `${name}@test.ir`, password: pw, organizationName: `سازمان ${name}` }).expect(201);
  return { token: r.body.accessToken as string, refresh: r.body.refreshToken as string, orgId: r.body.organization.id as string, userId: r.body.user.id as string };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  app = await createApp();
  await app.init();
  http = app.getHttpServer();
  prisma = app.get(PrismaService);
  for (const p of DEFAULT_PLANS) await prisma.plan.upsert({ where: { code: p.code }, create: p, update: p });
});
afterAll(async () => { await app?.close(); });

describe('unit helpers', () => {
  it('normalises Iranian phone numbers including Persian digits', () => {
    expect(normPhone('۰۹۱۲ ۱۲۳ ۴۵۶۷')).toBe('9121234567');
    expect(normPhone('+98 912 123 4567')).toBe('9121234567');
    expect(normPhone('00989121234567')).toBe('9121234567');
    expect(normPhone('12')).toBeNull();
  });
  it('normalises instagram usernames and urls', () => {
    expect(normUsername('@Mobile_Reza')).toBe('mobile_reza');
    expect(normUsername('https://www.instagram.com/mobile.reza/?hl=fa')).toBe('mobile.reza');
    expect(normUsername('bad name!')).toBeNull();
  });
  it('suggests column mapping for Persian and English headers', () => {
    expect(suggestMapping(['نام', 'شماره تماس', 'آیدی اینستاگرام', 'City'])).toEqual({ 'نام': 'fullName', 'شماره تماس': 'phone', 'آیدی اینستاگرام': 'instagramUsername', City: 'city' });
  });
  it('verifies Meta webhook signatures', () => {
    const raw = Buffer.from('{"a":1}');
    const sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(verifyMetaSignature(raw, sig, ['secret'])).toBe(true);
    expect(verifyMetaSignature(raw, sig, ['other'])).toBe(false);
    expect(verifyMetaSignature(raw, undefined, ['secret'])).toBe(false);
  });
});

describe('auth', () => {
  it('registers, logs in, and rejects bad password', async () => {
    await register('alice');
    await request(http).post('/api/auth/login').send({ email: 'alice@test.ir', password: 'wrong' }).expect(401);
    const r = await request(http).post('/api/auth/login').send({ email: 'ALICE@test.ir', password: pw }).expect(201);
    expect(r.body.role).toBe('OWNER');
    await request(http).get('/api/auth/me').set(auth(r.body.accessToken)).expect(200);
  });
  it('rotates refresh tokens and revokes family on reuse', async () => {
    const a = await register('bob');
    const r1 = await request(http).post('/api/auth/refresh').send({ refreshToken: a.refresh }).expect(201);
    await request(http).post('/api/auth/refresh').send({ refreshToken: a.refresh }).expect(401); // reuse detected
    await request(http).post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401); // family revoked
  });
  it('requires authentication', async () => {
    await request(http).get('/api/leads').expect(401);
    await request(http).get('/api/leads').set(auth('garbage')).expect(401);
  });
});

describe('leads, tenancy and RBAC', () => {
  let A: Awaited<ReturnType<typeof register>>, B: Awaited<ReturnType<typeof register>>, leadId: string;
  beforeAll(async () => { A = await register('orga'); B = await register('orgb'); });

  it('creates a lead and detects duplicates by normalised phone/username', async () => {
    const r = await request(http).post('/api/leads').set(auth(A.token)).send({ fullName: 'رضا', phone: '۰۹۱۲۱۲۳۴۵۶۷', instagramUsername: '@Reza.Shop' }).expect(201);
    expect(r.body.action).toBe('created');
    leadId = r.body.lead.id;
    const d = await request(http).post('/api/leads').set(auth(A.token)).send({ fullName: 'رضا ۲', phone: '+989121234567' }).expect(201);
    expect(d.body.action).toBe('duplicate');
    expect(d.body.lead.duplicateOfId).toBe(leadId);
    const list = await request(http).get('/api/leads?duplicates=only').set(auth(A.token)).expect(200);
    expect(list.body.total).toBe(1);
    const merged = await request(http).post(`/api/leads/${leadId}/merge/${d.body.lead.id}`).set(auth(A.token)).expect(201);
    expect(merged.body.activities.some((x: any) => x.type === 'MERGED')).toBe(true);
  });

  it('searches with Persian digits', async () => {
    const r = await request(http).get('/api/leads').query({ q: '۰۹۱۲۱۲' }).set(auth(A.token)).expect(200);
    expect(r.body.total).toBe(1);
  });

  it('isolates organisations', async () => {
    await request(http).get(`/api/leads/${leadId}`).set(auth(B.token)).expect(404);
    await request(http).patch(`/api/leads/${leadId}`).set(auth(B.token)).send({ status: 'WON' }).expect(404);
    await request(http).delete(`/api/leads/${leadId}`).set(auth(B.token)).expect(404);
    expect((await request(http).get('/api/leads').set(auth(B.token))).body.total).toBe(0);
    // cannot reference another org's category
    const catA = (await request(http).get('/api/org/categories').set(auth(A.token))).body[0].id;
    await request(http).post('/api/leads').set(auth(B.token)).send({ fullName: 'x', categoryId: catA }).expect(400);
  });

  it('logs status changes and enforces roles', async () => {
    await request(http).patch(`/api/leads/${leadId}`).set(auth(A.token)).send({ status: 'WON' }).expect(200);
    const l = await request(http).get(`/api/leads/${leadId}`).set(auth(A.token)).expect(200);
    expect(l.body.convertedAt).toBeTruthy();
    expect(l.body.activities.some((x: any) => x.type === 'STATUS')).toBe(true);
    const m = await request(http).post('/api/org/members').set(auth(A.token)).send({ name: 'ناظر', email: 'viewer@test.ir', password: pw, role: 'VIEWER' }).expect(201);
    expect(m.body.userId).toBeTruthy();
    const v = await request(http).post('/api/auth/login').send({ email: 'viewer@test.ir', password: pw }).expect(201);
    await request(http).get('/api/leads').set(auth(v.body.accessToken)).expect(200);
    await request(http).post('/api/leads').set(auth(v.body.accessToken)).send({ fullName: 'x' }).expect(403);
    await request(http).delete(`/api/leads/${leadId}`).set(auth(v.body.accessToken)).expect(403);
    await request(http).get('/api/admin/overview').set(auth(A.token)).expect(403);
  });

  it('dashboard, campaigns, tasks and segments work', async () => {
    const c = await request(http).post('/api/campaigns').set(auth(A.token)).send({ name: 'کمپین تست', budget: 1000000, status: 'ACTIVE' }).expect(201);
    await request(http).patch(`/api/leads/${leadId}`).set(auth(A.token)).send({ campaignId: c.body.id }).expect(200);
    const cs = await request(http).get(`/api/campaigns/${c.body.id}`).set(auth(A.token)).expect(200);
    expect(cs.body.leads).toBe(1); expect(cs.body.won).toBe(1); expect(cs.body.costPerLead).toBe(1000000);
    const t = await request(http).post('/api/tasks').set(auth(A.token)).send({ title: 'تماس', leadId, dueAt: new Date(Date.now() - 60_000).toISOString() }).expect(201);
    expect((await request(http).get('/api/tasks/due').set(auth(A.token))).body.map((x: any) => x.id)).toContain(t.body.id);
    expect((await request(http).get('/api/tasks?view=overdue').set(auth(A.token))).body.length).toBe(1);
    await request(http).post('/api/segments').set(auth(A.token)).send({ name: 'برنده‌ها', filters: { status: 'WON' } }).expect(201);
    expect((await request(http).get('/api/segments').set(auth(A.token))).body[0].count).toBe(1);
    const d = await request(http).get('/api/dashboard').set(auth(A.token)).expect(200);
    expect(d.body.kpis.total).toBe(1); expect(d.body.kpis.won).toBe(1); expect(d.body.kpis.activeCampaigns).toBe(1);
  });

  it('imports UTF-8 CSV with mapping, merge and error report, then exports', async () => {
    const csv = 'نام,موبایل,اینستاگرام,شهر\nعلی,09351112222,ali_shop,تهران\nتکراری,09121234567,,اصفهان\nبد,,bad name!,\n';
    const pv = await request(http).post('/api/imports/preview').set(auth(A.token)).attach('file', Buffer.from(csv, 'utf8'), 'leads.csv').expect(201);
    expect(pv.body.total).toBe(3);
    expect(pv.body.mapping['موبایل']).toBe('phone');
    await request(http).post(`/api/imports/${pv.body.jobId}/start`).set(auth(A.token)).send({ mapping: pv.body.mapping, strategy: 'merge', tags: ['ورودی'] }).expect(201);
    let job: any;
    for (let i = 0; i < 50; i++) { job = (await request(http).get(`/api/jobs/${pv.body.jobId}`).set(auth(A.token))).body; if (job.status !== 'PROCESSING' && job.status !== 'PENDING') break; await new Promise((r) => setTimeout(r, 200)); }
    expect(job.status).toBe('COMPLETED');
    expect([job.created, job.merged, job.failed]).toEqual([1, 1, 1]);
    const errs = await request(http).get(`/api/jobs/${pv.body.jobId}/errors.csv`).set(auth(A.token)).expect(200);
    expect(errs.text).toContain('اینستاگرام');
    const x = await request(http).get('/api/exports/leads?format=xlsx').set(auth(A.token)).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (c: Buffer) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const c = await request(http).get('/api/exports/leads?format=csv&city=تهران').set(auth(A.token)).expect(200);
    expect(c.text).toContain('ali_shop');
    await request(http).post('/api/imports/preview').set(auth(A.token)).attach('file', Buffer.from('x'), 'evil.exe').expect(400);
  });
});

describe('integrations and intake', () => {
  it('public lead webhook creates leads only with a valid key', async () => {
    const a = await register('hook');
    const org = await request(http).get('/api/org').set(auth(a.token)).expect(200);
    await request(http).post(`/api/public/leads/${'x'.repeat(30)}`).send({ fullName: 'x' }).expect(404);
    const r = await request(http).post(`/api/public/leads/${org.body.webhookKey}`).send({ fullName: 'فرم سایت', phone: '09124445566', consent: true }).expect(201);
    expect(r.body.action).toBe('created');
    const l = await request(http).get(`/api/leads/${r.body.id}`).set(auth(a.token)).expect(200);
    expect(l.body.source).toBe('WEBHOOK');
  });

  it('Meta webhook: verify handshake, reject bad signature, ingest Instagram comment into the right org', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'vtok'; process.env.META_APP_SECRET = 'appsecret';
    await request(http).get('/api/webhooks/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'vtok', 'hub.challenge': '123' }).expect(200, '123');
    await request(http).get('/api/webhooks/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '123' }).expect(403);
    const a = await register('igorg');
    await prisma.integration.create({ data: { organizationId: a.orgId, provider: 'INSTAGRAM', externalId: '1789', igUserId: '1789', name: '@igorg', accessTokenEnc: encrypt('t') } });
    const payload = { object: 'instagram', entry: [{ id: '1789', time: 1, changes: [{ field: 'comments', value: { id: 'c1', text: 'قیمت عمده؟', from: { id: '555', username: 'buyer_shop' }, media: { id: 'm1' } } }] }] };
    const raw = JSON.stringify(payload);
    await request(http).post('/api/webhooks/meta').set('content-type', 'application/json').set('x-hub-signature-256', 'sha256=' + '0'.repeat(64)).send(raw).expect(403);
    const sig = 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(raw).digest('hex');
    await request(http).post('/api/webhooks/meta').set('content-type', 'application/json').set('x-hub-signature-256', sig).send(raw).expect(200);
    let leads: any;
    for (let i = 0; i < 20; i++) { leads = (await request(http).get('/api/leads').set(auth(a.token))).body; if (leads.total) break; await new Promise((r) => setTimeout(r, 150)); }
    expect(leads.total).toBe(1);
    expect(leads.items[0]).toMatchObject({ instagramUsername: 'buyer_shop', source: 'INSTAGRAM_COMMENT' });
    // duplicate delivery is idempotent
    await request(http).post('/api/webhooks/meta').set('content-type', 'application/json').set('x-hub-signature-256', sig).send(raw).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect((await request(http).get('/api/leads').set(auth(a.token))).body.total).toBe(1);
    const status = await request(http).get('/api/meta/status').set(auth(a.token)).expect(200);
    expect(JSON.stringify(status.body)).not.toContain('accessTokenEnc');
  });

  it('enforces plan limits and expired subscriptions', async () => {
    const a = await register('limits');
    const trial = await prisma.plan.findUniqueOrThrow({ where: { code: 'trial' } });
    await prisma.plan.update({ where: { id: trial.id }, data: { maxLeads: 1 } });
    try {
      await request(http).post('/api/leads').set(auth(a.token)).send({ fullName: 'یک' }).expect(201);
      await request(http).post('/api/leads').set(auth(a.token)).send({ fullName: 'دو' }).expect(403);
      await prisma.subscription.update({ where: { organizationId: a.orgId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      const s = await request(http).get('/api/billing/subscription').set(auth(a.token)).expect(200);
      expect(s.body.subscription.effectiveStatus).toBe('EXPIRED');
    } finally {
      await prisma.plan.update({ where: { id: trial.id }, data: { maxLeads: DEFAULT_PLANS[0].maxLeads } });
    }
  });

  it('manual checkout creates a pending invoice that a super-admin can mark paid', async () => {
    const a = await register('payer');
    const co = await request(http).post('/api/billing/checkout').set(auth(a.token)).send({ planCode: 'pro' }).expect(201);
    expect(co.body.manual).toBe(true);
    await prisma.user.update({ where: { id: a.userId }, data: { isSuperAdmin: true } });
    await request(http).post(`/api/admin/invoices/${co.body.invoice.id}/mark-paid`).set(auth(a.token)).expect(201);
    const s = await request(http).get('/api/billing/subscription').set(auth(a.token)).expect(200);
    expect(s.body.subscription).toMatchObject({ status: 'ACTIVE', plan: { code: 'pro' } });
  });
});
