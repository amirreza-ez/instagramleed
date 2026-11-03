// Persian formatting, Jalali calendar, and label dictionaries.

const FA = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (v: string | number | null | undefined) => (v == null ? '' : String(v).replace(/\d/g, (d) => FA[+d]));
export const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const nf = new Intl.NumberFormat('fa-IR');
export const faNum = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const faMoney = (toman: number | null | undefined) => (toman == null ? '—' : `${nf.format(toman)} تومان`);
export const faPct = (n: number) => `${nf.format(n)}٪`;

const dFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });
const dShort = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' });
const dtFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });
const safe = (v?: string | Date | null) => (v ? new Date(v) : null);
export const faDate = (v?: string | Date | null) => { const d = safe(v); return d ? dFmt.format(d) : '—'; };
export const faDateShort = (v?: string | Date | null) => { const d = safe(v); return d ? dShort.format(d) : '—'; };
export const faDateTime = (v?: string | Date | null) => { const d = safe(v); return d ? dtFmt.format(d) : '—'; };
export const faDay = (v?: string | Date | null) => { const d = safe(v); return d ? dayFmt.format(d) : ''; };
export function faAgo(v?: string | Date | null) {
  const d = safe(v); if (!d) return '—';
  const s = (Date.now() - d.getTime()) / 1000;
  const fut = s < 0; const a = Math.abs(s);
  const t = a < 60 ? 'لحظاتی' : a < 3600 ? `${faNum(Math.floor(a / 60))} دقیقه` : a < 86400 ? `${faNum(Math.floor(a / 3600))} ساعت` : a < 2592000 ? `${faNum(Math.floor(a / 86400))} روز` : null;
  if (!t) return faDate(d);
  return fut ? `${t} دیگر` : `${t} پیش`;
}

// ---- Jalali <-> Gregorian (algorithm by Borkowski / jalaali-js, public domain) ----
function div(a: number, b: number) { return ~~(a / b); }
function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621; let leapJ = -14; let jp = breaks[0]; let jump = 0;
  for (let i = 1; i < breaks.length; i++) { const jm = breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(jump % 33, 4); jp = jm; }
  let n = jy - jp; leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4; if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752; return d;
}
function d2g(jdn: number) {
  let j = 4 * jdn + 139361631; j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(j % 1461, 4) * 5 + 308; const gd = div(i % 153, 5) + 1; const gm = (div(i, 153) % 12) + 1; const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy: number, jm: number, jd: number) { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; }
export function toGregorian(jy: number, jm: number, jd: number) { return d2g(j2d(jy, jm, jd)); }
export function toJalali(gy: number, gm: number, gd: number) {
  const jdn = g2d(gy, gm, gd); let jy = gy - 621; const r = jalCal(jy); const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f, jm: number, jd: number;
  if (k >= 0) { if (k <= 185) { jm = 1 + div(k, 31); jd = (k % 31) + 1; return { jy, jm, jd }; } k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  jm = 7 + div(k, 30); jd = (k % 30) + 1; return { jy, jm, jd };
}
export const monthLength = (jy: number, jm: number) => (jm <= 6 ? 31 : jm <= 11 ? 30 : jalCal(jy).leap === 0 ? 30 : 29);
export const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

// ---- Labels ----
export const STATUS: Record<string, { label: string; tone: string }> = {
  NEW: { label: 'جدید', tone: 'bg-brand-50 text-brand-700 ring-brand-100' },
  CONTACTED: { label: 'تماس گرفته شد', tone: 'bg-sky-50 text-sky-700 ring-sky-100' },
  QUALIFIED: { label: 'واجد شرایط', tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  NEGOTIATION: { label: 'در حال مذاکره', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  WON: { label: 'مشتری شد', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  LOST: { label: 'از دست رفت', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
};
export const SOURCE: Record<string, string> = {
  MANUAL: 'ثبت دستی', CSV: 'فایل CSV', XLSX: 'فایل اکسل', META_LEAD_ADS: 'Lead Ads متا', INSTAGRAM_COMMENT: 'کامنت اینستاگرام',
  INSTAGRAM_DM: 'دایرکت اینستاگرام', INSTAGRAM_MENTION: 'منشن اینستاگرام', BUSINESS_DISCOVERY: 'کشف کسب‌وکار', WEBHOOK: 'وب‌هوک / فرم سایت',
};
export const PRIORITY: Record<string, { label: string; tone: string }> = {
  LOW: { label: 'کم', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  MEDIUM: { label: 'متوسط', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  HIGH: { label: 'بالا', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
};
export const ROLE: Record<string, string> = { OWNER: 'مالک', ADMIN: 'مدیر', MANAGER: 'مدیر فروش', AGENT: 'کارشناس فروش', VIEWER: 'فقط مشاهده' };
export const ROLE_RANK: Record<string, number> = { VIEWER: 1, AGENT: 2, MANAGER: 3, ADMIN: 4, OWNER: 5 };
export const CHANNEL: Record<string, string> = {
  INSTAGRAM_ADS: 'تبلیغات اینستاگرام', INSTAGRAM_ORGANIC: 'محتوای ارگانیک اینستاگرام', LEAD_ADS: 'Lead Ads', WHATSAPP: 'واتساپ', SMS: 'پیامک', OFFLINE: 'حضوری / آفلاین', OTHER: 'سایر',
};
export const CAMPAIGN_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  ACTIVE: { label: 'فعال', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  PAUSED: { label: 'متوقف', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  COMPLETED: { label: 'پایان‌یافته', tone: 'bg-navy-100 text-navy-700 ring-navy-200' },
};
export const JOB_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'در انتظار', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  PROCESSING: { label: 'در حال پردازش', tone: 'bg-brand-50 text-brand-700 ring-brand-100' },
  COMPLETED: { label: 'تکمیل شد', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  FAILED: { label: 'ناموفق', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
  CANCELLED: { label: 'متوقف شد', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
};
export const SUB_STATUS: Record<string, string> = { TRIALING: 'دوره آزمایشی', ACTIVE: 'فعال', PAST_DUE: 'معوق', CANCELED: 'لغو شده', EXPIRED: 'منقضی' };
export const ACTIVITY: Record<string, string> = { CREATED: 'ایجاد', NOTE: 'یادداشت', CALL: 'تماس', MESSAGE: 'پیام', MEETING: 'جلسه', STATUS: 'تغییر وضعیت', ASSIGN: 'ارجاع', MERGED: 'ادغام', TASK: 'پیگیری', COMMENT: 'کامنت', IMPORT: 'ورود فایل' };
