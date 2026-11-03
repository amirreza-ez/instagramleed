import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Bell, Building2, CalendarCheck2, ChevronDown, CreditCard, FileSpreadsheet, LayoutDashboard, LogOut, Megaphone,
  Menu, Radar, Search, Settings, ShieldCheck, Users, X,
} from 'lucide-react';
import { Instagram } from './brand';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faAgo, faNum, ROLE, SUB_STATUS } from '../lib/fa';
import { Avatar, Badge, cx } from './ui';

const NAV: { to: string; label: string; icon: ReactNode; min?: string; superAdmin?: boolean }[] = [
  { to: '/', label: 'داشبورد', icon: <LayoutDashboard className="size-[18px]" /> },
  { to: '/leads', label: 'سرنخ‌ها و مشتریان', icon: <Users className="size-[18px]" /> },
  { to: '/discovery', label: 'جذب از اینستاگرام', icon: <Radar className="size-[18px]" /> },
  { to: '/imports', label: 'ورود و خروج داده', icon: <FileSpreadsheet className="size-[18px]" /> },
  { to: '/campaigns', label: 'کمپین‌ها', icon: <Megaphone className="size-[18px]" /> },
  { to: '/tasks', label: 'پیگیری‌ها', icon: <CalendarCheck2 className="size-[18px]" /> },
  { to: '/reports', label: 'گزارش‌ها', icon: <BarChart3 className="size-[18px]" /> },
  { to: '/integrations', label: 'اتصال اینستاگرام و متا', icon: <Instagram className="size-[18px]" /> },
  { to: '/settings', label: 'تنظیمات سازمان', icon: <Settings className="size-[18px]" /> },
  { to: '/billing', label: 'اشتراک و صورتحساب', icon: <CreditCard className="size-[18px]" /> },
  { to: '/admin', label: 'مدیریت سامانه', icon: <ShieldCheck className="size-[18px]" />, superAdmin: true },
];

function useDueReminders() {
  const { data } = useQuery({ queryKey: ['tasks-due'], queryFn: () => api<any[]>('/tasks/due?minutes=10'), refetchInterval: 60_000 });
  const seen = useRef<Set<string>>(new Set(JSON.parse(sessionStorage.getItem('notified') ?? '[]')));
  useEffect(() => {
    for (const t of data ?? []) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      const who = t.lead?.businessName || t.lead?.fullName || '';
      toast.info(`یادآوری پیگیری: ${t.title}`, { description: who });
      if (window.desktop) window.desktop.notify('یادآوری پیگیری', `${t.title}${who ? ` — ${who}` : ''}`);
      else if ('Notification' in window && Notification.permission === 'granted') new Notification('یادآوری پیگیری', { body: t.title, lang: 'fa', dir: 'rtl' });
    }
    sessionStorage.setItem('notified', JSON.stringify([...seen.current]));
  }, [data]);
  return data ?? [];
}

export default function Layout() {
  const { me, logout, switchOrg } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [q, setQ] = useState('');
  const due = useDueReminders();
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api('/billing/subscription'), staleTime: 300_000 });
  const org = me?.organizations.find((o) => o.id === me.organizationId);

  useEffect(() => { if ('Notification' in window && Notification.permission === 'default' && !window.desktop) Notification.requestPermission().catch(() => undefined); }, []);

  const status = sub?.subscription?.effectiveStatus;
  const trialDays = sub?.subscription?.trialEndsAt ? Math.ceil((new Date(sub.subscription.trialEndsAt).getTime() - Date.now()) / 864e5) : null;

  const sidebar = (
    <aside className="flex h-full w-[264px] flex-col bg-navy-900 text-navy-100">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <img src="./logo.svg" alt="" className="size-10" />
        <div className="leading-tight">
          <p className="text-[15px] font-extrabold tracking-wide text-white">EAZAZI LEAD</p>
          <p className="text-[11px] text-navy-300">مدیریت سرنخ اینستاگرام</p>
        </div>
      </div>
      <div className="mx-3 mb-3 rounded-xl bg-navy-800/70 p-3">
        <p className="text-[11px] text-navy-300">سازمان فعال</p>
        {me && me.organizations.length > 1 ? (
          <select aria-label="تغییر سازمان" value={me.organizationId} onChange={(e) => switchOrg(e.target.value)} className="mt-1 w-full rounded-lg bg-navy-700 px-2 py-1 text-sm text-white outline-none">
            {me.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold text-white"><Building2 className="size-3.5 text-gold-400" />{org?.name}</p>}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.filter((n) => !n.superAdmin || me?.user.isSuperAdmin).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition',
              isActive ? 'bg-brand-600 font-semibold text-white shadow-lg shadow-brand-900/40' : 'text-navy-200 hover:bg-navy-800 hover:text-white')}>
            {n.icon}{n.label}
          </NavLink>
        ))}
      </nav>
      {status && (
        <NavLink to="/billing" className="m-3 rounded-xl bg-gradient-to-l from-navy-800 to-navy-700 p-3 text-xs ring-1 ring-navy-600">
          <div className="flex items-center justify-between"><span className="text-navy-300">طرح {sub.subscription.plan.name}</span>
            <Badge tone={status === 'EXPIRED' ? 'bg-rose-500/20 text-rose-200 ring-rose-400/30' : 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30'}>{SUB_STATUS[status]}</Badge></div>
          {trialDays != null && status === 'TRIALING' && <p className="mt-1.5 text-navy-200">{faNum(Math.max(0, trialDays))} روز از دوره آزمایشی باقی است</p>}
          <div className="mt-2 h-1.5 rounded-full bg-navy-600"><div className="h-full rounded-full bg-gold-400" style={{ width: `${Math.min(100, (sub.usage.leads / sub.subscription.plan.maxLeads) * 100)}%` }} /></div>
          <p className="mt-1 text-[10.5px] text-navy-300">{faNum(sub.usage.leads)} از {faNum(sub.subscription.plan.maxLeads)} سرنخ</p>
        </NavLink>
      )}
    </aside>
  );

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full">{sidebar}</div>
          <button aria-label="بستن منو" className="flex-1 bg-navy-950/50" onClick={() => setOpen(false)}><X className="m-4 size-6 text-white" /></button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-navy-100 bg-white/85 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-navy-600 hover:bg-navy-50 lg:hidden" aria-label="منو" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); nav(`/leads?q=${encodeURIComponent(q)}`); }}>
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-navy-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام، کسب‌وکار، شماره یا آیدی اینستاگرام…" aria-label="جستجوی سرنخ"
              className="h-10 w-full rounded-xl bg-navy-50 pr-9 pl-3 text-sm outline-none ring-1 ring-transparent focus:bg-white focus:ring-brand-500" />
          </form>
          <div className="mr-auto flex items-center gap-1">
            <div className="relative">
              <button onClick={() => setBell(!bell)} aria-label="یادآوری‌ها" className="relative rounded-xl p-2.5 text-navy-600 hover:bg-navy-50">
                <Bell className="size-5" />
                {due.length > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{faNum(due.length)}</span>}
              </button>
              {bell && (
                <div className="animate-in absolute left-0 top-12 w-80 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-navy-100">
                  <p className="px-3 py-2 text-xs font-semibold text-navy-500">پیگیری‌های سررسید شده</p>
                  {due.length === 0 && <p className="px-3 pb-3 text-sm text-navy-400">موردی برای الان ندارید.</p>}
                  {due.map((t) => (
                    <button key={t.id} onClick={() => { setBell(false); nav(t.lead ? `/leads/${t.lead.id}` : '/tasks'); }} className="block w-full rounded-xl px-3 py-2 text-right hover:bg-navy-50">
                      <p className="text-sm font-medium text-navy-800">{t.title}</p>
                      <p className="text-xs text-navy-400">{t.lead?.businessName || t.lead?.fullName} · {faAgo(t.dueAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-xl py-1.5 pl-2 pr-1.5 hover:bg-navy-50" aria-label="حساب کاربری">
                <Avatar name={me?.user.name} className="size-8 text-xs" />
                <div className="hidden text-right leading-tight sm:block">
                  <p className="text-sm font-semibold text-navy-800">{me?.user.name}</p>
                  <p className="text-[11px] text-navy-400">{ROLE[me?.role ?? '']}</p>
                </div>
                <ChevronDown className="size-4 text-navy-400" />
              </button>
              {menu && (
                <div className="animate-in absolute left-0 top-12 w-56 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-navy-100" onMouseLeave={() => setMenu(false)}>
                  <p className="truncate px-3 py-2 text-xs text-navy-400 ltr text-right">{me?.user.email}</p>
                  <button onClick={() => { setMenu(false); nav('/settings?tab=profile'); }} className="w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-navy-50">حساب کاربری و رمز عبور</button>
                  <button onClick={() => logout()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-sm text-rose-600 hover:bg-rose-50"><LogOut className="size-4" />خروج</button>
                </div>
              )}
            </div>
          </div>
        </header>
        {status === 'EXPIRED' && (
          <div className="bg-rose-600 px-4 py-2 text-center text-sm text-white">اشتراک شما منقضی شده است؛ امکان ثبت داده جدید وجود ندارد. <NavLink to="/billing" className="font-bold underline">تمدید اشتراک</NavLink></div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8"><Outlet /></main>
      </div>
    </div>
  );
}
