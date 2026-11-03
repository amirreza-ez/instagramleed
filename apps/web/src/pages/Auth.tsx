import { CheckCircle2, Server } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field, Input } from '../components/ui';
import { ApiError, apiBase, isDesktop } from '../lib/api';
import { useAuth } from '../lib/auth';

function ServerSetting() {
  const [url, setUrl] = useState(apiBase());
  const [saved, setSaved] = useState(false);
  if (!isDesktop) return null;
  return (
    <details className="mt-6 rounded-xl bg-navy-50 p-3 text-xs text-navy-500">
      <summary className="flex cursor-pointer items-center gap-2"><Server className="size-3.5" />آدرس سرور</summary>
      <div className="mt-3 flex gap-2">
        <Input className="ltr h-9 text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://lead.example.com" />
        <Button size="sm" variant="secondary" onClick={async () => { await window.desktop!.setServerUrl(url); setSaved(true); setTimeout(() => location.reload(), 400); }}>ذخیره</Button>
      </div>
      {saved && <p className="mt-2 text-emerald-600">ذخیره شد</p>}
    </details>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const [f, setF] = useState({ name: '', email: '', password: '', organizationName: '', businessType: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr({}); setMsg('');
    try {
      if (mode === 'login') await login(f.email, f.password);
      else await register(f);
    } catch (x) {
      const ae = x as ApiError;
      setMsg(ae.message);
      if (ae.errors) setErr(Object.fromEntries(ae.errors.map((e) => [e.path, e.message])));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="animate-in w-full max-w-sm space-y-4" noValidate>
          <div className="mb-8 flex items-center gap-3">
            <img src="./logo.svg" className="size-12" alt="" />
            <div><p className="text-lg font-extrabold text-navy-900">EAZAZI LEAD INSTAGRAM</p><p className="text-xs text-navy-400">مدیریت هوشمند سرنخ و مشتری</p></div>
          </div>
          <h1 className="text-2xl font-extrabold text-navy-900">{mode === 'login' ? 'ورود به حساب' : 'ساخت حساب کسب‌وکار'}</h1>
          <p className="text-sm text-navy-500">{mode === 'login' ? 'برای ادامه وارد شوید.' : '۱۴ روز رایگان، بدون نیاز به کارت بانکی.'}</p>
          {mode === 'register' && <>
            <Field label="نام و نام خانوادگی" error={err.name}><Input value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
            <Field label="نام کسب‌وکار" error={err.organizationName}><Input value={f.organizationName} onChange={set('organizationName')} placeholder="مثلاً موبایل اعزازی" required /></Field>
            <Field label="نوع فعالیت (اختیاری)"><Input value={f.businessType} onChange={set('businessType')} placeholder="عمده‌فروشی موبایل و لوازم جانبی" /></Field>
          </>}
          <Field label="ایمیل" error={err.email}><Input className="ltr" type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          <Field label="رمز عبور" error={err.password} hint={mode === 'register' ? 'حداقل ۸ کاراکتر' : undefined}>
            <Input className="ltr" type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </Field>
          {msg && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}
          <Button type="submit" loading={busy} className="w-full">{mode === 'login' ? 'ورود' : 'ساخت حساب و شروع'}</Button>
          <p className="text-center text-sm text-navy-500">
            {mode === 'login' ? <>حساب ندارید؟ <Link to="/register" className="font-semibold text-brand-600">ثبت‌نام رایگان</Link></> : <>حساب دارید؟ <Link to="/login" className="font-semibold text-brand-600">ورود</Link></>}
          </p>
          <ServerSetting />
        </form>
      </div>
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 right-0 size-[28rem] rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center gap-8 p-14 text-white">
          <p className="text-sm font-medium text-gold-400">برای فروشندگان حرفه‌ای اینستاگرام</p>
          <h2 className="text-4xl font-extrabold leading-[1.6]">مشتری‌های اینستاگرام را<br />از اولین پیام تا فروش<br />یک‌جا مدیریت کنید.</h2>
          <ul className="space-y-3 text-[15px] text-navy-100">
            {['جذب خودکار سرنخ از کامنت‌ها، دایرکت‌ها و Lead Ads متا', 'کشف کسب‌وکارهای همکار با API رسمی اینستاگرام', 'ورود اکسل با تشخیص تکراری‌ها و ادغام هوشمند', 'پیگیری فروش، کمپین‌ها و گزارش نرخ تبدیل'].map((t) => (
              <li key={t} className="flex items-center gap-3"><CheckCircle2 className="size-5 text-gold-400" />{t}</li>
            ))}
          </ul>
          <p className="text-xs text-navy-300">فقط از روش‌های رسمی و مجاز متا استفاده می‌شود؛ حساب اینستاگرام شما در امان است.</p>
        </div>
      </div>
    </div>
  );
}
