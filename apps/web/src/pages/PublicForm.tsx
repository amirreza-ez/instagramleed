// Public lead-capture form for Instagram bio / story / DM links. No login required.
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Instagram } from '../components/brand';
import { Button, Field, Input, Loading, Select, Textarea } from '../components/ui';
import { api, ApiError, post } from '../lib/api';
import { faDigits, toLatin } from '../lib/fa';

export default function PublicForm() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const { data: org, isLoading, error } = useQuery({ queryKey: ['public-form', slug], queryFn: () => api(`/public/forms/${slug}`), retry: false });
  const [f, setF] = useState({ fullName: '', phone: '', businessName: '', city: '', categoryId: '', message: '', website: '', consent: true });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr({}); setMsg('');
    try {
      await post(`/public/forms/${slug}`, { ...f, phone: toLatin(f.phone), categoryId: f.categoryId || undefined, src: sp.get('src') || undefined });
      setDone(true);
    } catch (x) {
      const a = x as ApiError;
      setMsg(a.message);
      if (a.errors) setErr(Object.fromEntries(a.errors.map((i) => [i.path, i.message])));
    } finally { setBusy(false); }
  }

  if (isLoading) return <div className="grid min-h-full place-items-center"><Loading /></div>;
  if (error || !org) return <div className="grid min-h-full place-items-center p-6 text-center text-navy-500">این فرم وجود ندارد یا غیرفعال شده است.</div>;

  return (
    <div className="min-h-full bg-gradient-to-b from-navy-900 via-navy-800 to-navy-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 shadow-lg">
            <Instagram className="size-8" />
          </div>
          <h1 className="text-2xl font-extrabold">{org.name}</h1>
          {org.businessType && <p className="mt-1 text-sm text-navy-200">{org.businessType}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-navy-300">
            {org.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{org.city}</span>}
            {org.instagram && <span className="ltr">@{org.instagram}</span>}
          </div>
        </div>

        <div className="animate-in rounded-3xl bg-white p-6 shadow-2xl">
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto size-16 text-emerald-500" />
              <p className="mt-4 text-xl font-bold text-navy-900">درخواست شما ثبت شد</p>
              <p className="mt-2 text-sm leading-7 text-navy-500">کارشناسان {org.name} به‌زودی با شما تماس می‌گیرند.</p>
              {org.phone && <a href={`tel:${org.phone}`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy-50 px-4 py-2 text-sm text-navy-700"><Phone className="size-4" /><span className="ltr">{faDigits(org.phone)}</span></a>}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <p className="text-lg font-bold text-navy-900">دریافت لیست قیمت و مشاوره</p>
                <p className="mt-1 text-sm text-navy-500">اطلاعاتتان را وارد کنید؛ در کوتاه‌ترین زمان تماس می‌گیریم.</p>
              </div>
              <Field label="نام و نام خانوادگی *" error={err.fullName}><Input value={f.fullName} onChange={set('fullName')} autoComplete="name" /></Field>
              <Field label="شماره موبایل *" error={err.phone}><Input className="ltr" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="09…" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="نام فروشگاه"><Input value={f.businessName} onChange={set('businessName')} /></Field>
                <Field label="شهر"><Input value={f.city} onChange={set('city')} /></Field>
              </div>
              {org.categories?.length > 0 && (
                <Field label="نوع فعالیت شما">
                  <Select value={f.categoryId} onChange={set('categoryId')}><option value="">انتخاب کنید</option>{org.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                </Field>
              )}
              <Field label="چه محصولی نیاز دارید؟"><Textarea rows={2} value={f.message} onChange={set('message')} placeholder="مثلاً قاب و گلس آیفون، عمده" /></Field>
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set('website')} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              <label className="flex items-start gap-2 text-xs leading-6 text-navy-500">
                <input type="checkbox" checked={f.consent} onChange={set('consent')} className="mt-1 size-4 accent-brand-600" />
                با تماس و ارسال پیام از طرف {org.name} موافقم.
              </label>
              {err.consent && <p className="text-xs text-rose-600">{err.consent}</p>}
              {msg && !Object.keys(err).length && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}
              <Button type="submit" loading={busy} className="h-12 w-full text-base">ثبت درخواست</Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-navy-400"><ShieldCheck className="size-3.5" />اطلاعات شما محرمانه می‌ماند.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
