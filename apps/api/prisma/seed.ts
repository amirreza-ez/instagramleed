// Idempotent seed: plans, platform admin, and the «موبایل اعزازی» organisation with sample data.
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../src/common/core';
import { bootstrapOrganization } from '../src/modules/auth';
import { DEFAULT_PLANS } from '../src/modules/billing';

const envFile = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) process.loadEnvFile(envFile);
const prisma = new PrismaClient();

const SAMPLE = [
  ['رضا محمدی', 'موبایل رضا', 'mobile_reza', '09121234567', 'تهران', 'فروشگاه موبایل', 'QUALIFIED'],
  ['سارا احمدی', 'گالری لوازم جانبی سارا', 'sara_accessory', '09131112233', 'اصفهان', 'فروشگاه لوازم جانبی', 'CONTACTED'],
  ['حسین کریمی', 'پخش موبایل کریمی', 'karimi_mobile_pakhsh', '09151239876', 'مشهد', 'عمده‌فروش موبایل', 'NEGOTIATION'],
  ['مریم رضایی', 'دیجی‌کالای محله', 'digimahale', '09351234321', 'شیراز', 'فروشگاه موبایل', 'NEW'],
  ['علی نوری', 'تک‌موبایل', 'takmobile.ir', '09191110000', 'تبریز', 'همکار تجاری', 'WON'],
  ['زهرا موسوی', null, 'zahra.mousavi', '09901231234', 'تهران', 'مشتری بالقوه', 'NEW'],
  ['محمد جعفری', 'آوا موبایل', 'avamobile', '09127778899', 'کرج', 'مشتری فعال', 'WON'],
  ['نگار صادقی', 'لوازم جانبی نگار', 'negar_case', '09381234567', 'اصفهان', 'فروشگاه لوازم جانبی', 'LOST'],
] as const;

async function main() {
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: p, update: {} });
  }
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@eazazi.ir').toLowerCase();
  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await prisma.user.create({ data: { email, name: 'مدیر موبایل اعزازی', isSuperAdmin: true, passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD || 'Eazazi@12345') } });
    console.log(`[seed] admin created: ${email}`);
  }
  if (await prisma.organization.findUnique({ where: { slug: 'mobile-eazazi' } })) { console.log('[seed] already seeded'); return; }
  const org = await prisma.$transaction((tx) => bootstrapOrganization(tx, { name: 'موبایل اعزازی', businessType: 'عمده‌فروشی موبایل و لوازم جانبی (Mobile Phones & Accessories Wholesale)', ownerId: admin!.id, slug: 'mobile-eazazi' }));
  await prisma.organization.update({ where: { id: org.id }, data: { city: 'تهران', instagram: 'mobile_eazazi' } });
  // Owner org gets the enterprise plan.
  const ent = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
  await prisma.subscription.update({ where: { organizationId: org.id }, data: { planId: ent.id, status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 365 * 864e5) } });
  const cats = new Map((await prisma.category.findMany({ where: { organizationId: org.id } })).map((c) => [c.name, c.id]));
  const camp = await prisma.campaign.create({ data: { organizationId: org.id, name: 'کمپین جذب همکار پاییز', channel: 'INSTAGRAM_ADS', status: 'ACTIVE', budget: 50_000_000n, startDate: new Date(Date.now() - 20 * 864e5) } });
  for (const [i, [fullName, businessName, ig, phone, city, cat, status]] of SAMPLE.entries()) {
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id, fullName, businessName, instagramUsername: ig, normUsername: ig, phone, normPhone: phone.slice(1), city,
        categoryId: cats.get(cat), status: status as any, source: (['MANUAL', 'CSV', 'META_LEAD_ADS', 'INSTAGRAM_COMMENT'] as const)[i % 4],
        campaignId: i % 2 ? camp.id : null, assigneeId: admin.id, score: 40 + i * 5, tags: i % 3 ? ['عمده'] : ['VIP'],
        createdAt: new Date(Date.now() - (i * 3 + 1) * 864e5), convertedAt: status === 'WON' ? new Date() : null,
      },
    });
    await prisma.activity.create({ data: { organizationId: org.id, leadId: lead.id, type: 'CREATED', content: 'سرنخ ایجاد شد (داده نمونه)' } });
  }
  const first = await prisma.lead.findFirst({ where: { organizationId: org.id } });
  await prisma.task.create({ data: { organizationId: org.id, leadId: first!.id, assigneeId: admin.id, title: 'تماس برای ارسال لیست قیمت عمده', dueAt: new Date(Date.now() + 2 * 3600_000), priority: 'HIGH' } });
  console.log('[seed] organisation «موبایل اعزازی» created with sample data');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
