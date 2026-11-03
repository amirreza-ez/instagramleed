import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarClock, CalendarDays, Copy, Megaphone, Plus, Target, TrendingUp, Trophy, Upload, UserPlus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, CardHeader, Empty, ErrorState, PageHeader, StatCard } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ACTIVITY, faAgo, faDay, faNum, faPct, SOURCE, STATUS } from '../lib/fa';

export const CHART_COLORS = ['#2952e8', '#0b1b3f', '#e2a032', '#0f766e', '#7c3aed', '#e11d48', '#0369a1', '#94a6cc', '#15803d'];
const STATUS_COLORS: Record<string, string> = { NEW: '#3b6cff', CONTACTED: '#0284c7', QUALIFIED: '#7c3aed', NEGOTIATION: '#e2a032', WON: '#059669', LOST: '#e11d48' };

export function ChartTip({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div dir="rtl" className="rounded-xl bg-navy-900 px-3 py-2 text-xs text-white shadow-xl">
      {label != null && <p className="mb-1 text-navy-300">{labelFmt ? labelFmt(label) : label}</p>}
      {payload.map((p: any) => <p key={p.dataKey ?? p.name} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />{p.name}: <b>{faNum(p.value)}</b></p>)}
    </div>
  );
}

export function useDashboard(days = 30) {
  return useQuery({ queryKey: ['dashboard', days], queryFn: () => api(`/dashboard?days=${days}`), refetchInterval: 60_000 });
}

export default function Dashboard() {
  const { me, can } = useAuth();
  const nav = useNavigate();
  const { data, isLoading, error, refetch } = useDashboard(30);
  const k = data?.kpis;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : 'عصر بخیر';

  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <div className="animate-in space-y-6">
      <PageHeader title={`${greet}، ${me?.user.name.split(' ')[0] ?? ''}`} subtitle="خلاصه وضعیت جذب و فروش شما در یک نگاه"
        actions={can('AGENT') && <>
          <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => nav('/imports')}>ورود اکسل</Button>
          <Button icon={<Plus className="size-4" />} onClick={() => nav('/leads?new=1')}>سرنخ جدید</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard loading={isLoading} label="کل سرنخ‌ها" value={faNum(k?.total)} icon={<Users className="size-5" />} tone="navy" hint={`${faNum(k?.month)} سرنخ در ۳۰ روز اخیر`} />
        <StatCard loading={isLoading} label="سرنخ‌های امروز" value={faNum(k?.today)} icon={<UserPlus className="size-5" />} tone="brand" hint={`${faNum(k?.week)} سرنخ در ۷ روز اخیر`} />
        <StatCard loading={isLoading} label="واجد شرایط" value={faNum(k?.qualified)} icon={<Target className="size-5" />} tone="violet" hint={`${faPct(k?.qualifiedRate ?? 0)} از کل`} />
        <StatCard loading={isLoading} label="مشتری شده" value={faNum(k?.won)} icon={<Trophy className="size-5" />} tone="emerald" hint={`نرخ تبدیل ${faPct(k?.conversionRate ?? 0)}`} />
        <StatCard loading={isLoading} label="سرنخ هفتگی" value={faNum(k?.week)} icon={<CalendarDays className="size-5" />} tone="brand" />
        <StatCard loading={isLoading} label="کمپین‌های فعال" value={faNum(k?.activeCampaigns)} icon={<Megaphone className="size-5" />} tone="gold" />
        <StatCard loading={isLoading} label="پیگیری‌های باز" value={faNum(k?.openTasks)} icon={<CalendarClock className="size-5" />} tone="violet" hint={k?.overdueTasks ? <span className="text-rose-600">{faNum(k.overdueTasks)} مورد عقب‌افتاده</span> : 'همه پیگیری‌ها به‌موقع'} />
        <StatCard loading={isLoading} label="رکوردهای تکراری" value={faNum(k?.duplicates)} icon={<Copy className="size-5" />} tone="rose" hint={k?.duplicates ? <Link to="/leads?duplicates=only" className="text-brand-600">بررسی و ادغام ←</Link> : 'پایگاه داده تمیز است'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="روند جذب سرنخ" subtitle="۳۰ روز اخیر — سرنخ جدید و مشتری شده" icon={<TrendingUp className="size-4" />} />
          <div className="h-72 p-3" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={data?.daily ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2952e8" stopOpacity={0.35} /><stop offset="100%" stopColor="#2952e8" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#059669" stopOpacity={0.3} /><stop offset="100%" stopColor="#059669" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#e3e9f5" vertical={false} />
                <XAxis dataKey="day" tickFormatter={faDay} tick={{ fontSize: 11, fill: '#6378a8', fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} minTickGap={24} reversed />
                <YAxis allowDecimals={false} tickFormatter={faNum} tick={{ fontSize: 11, fill: '#6378a8', fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} orientation="right" />
                <Tooltip content={<ChartTip labelFmt={faDay} />} />
                <Area type="monotone" dataKey="count" name="سرنخ جدید" stroke="#2952e8" strokeWidth={2.5} fill="url(#gl)" />
                <Area type="monotone" dataKey="won" name="مشتری شده" stroke="#059669" strokeWidth={2} fill="url(#gw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="منابع جذب" subtitle="سهم هر کانال از سرنخ‌ها" />
          {data?.bySource?.length ? (
            <div className="p-4">
              <div className="h-44" dir="ltr">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.bySource.map((s: any) => ({ ...s, name: SOURCE[s.source] }))} dataKey="count" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                      {data.bySource.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.bySource.map((s: any, i: number) => (
                  <li key={s.source} className="flex items-center justify-between"><span className="flex items-center gap-2 text-navy-600"><span className="size-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{SOURCE[s.source]}</span><b className="num">{faNum(s.count)}</b></li>
                ))}
              </ul>
            </div>
          ) : <Empty title="هنوز سرنخی ندارید" />}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="قیف فروش" subtitle="تعداد سرنخ در هر مرحله" />
          <div className="h-64 p-3" dir="ltr">
            <ResponsiveContainer>
              <BarChart layout="vertical" data={Object.keys(STATUS).map((s) => ({ status: STATUS[s].label, key: s, count: data?.byStatus?.find((x: any) => x.status === s)?.count ?? 0 }))} margin={{ left: 10, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="status" orientation="right" width={92} tick={{ fontSize: 12, fill: '#2b3d6b', fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f2f5fb' }} />
                <Bar dataKey="count" name="تعداد" radius={[8, 8, 8, 8]} barSize={18}>
                  {Object.keys(STATUS).map((s) => <Cell key={s} fill={STATUS_COLORS[s]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="دسته‌بندی مشتریان" />
          <div className="space-y-3 p-5">
            {(data?.byCategory ?? []).sort((a: any, b: any) => b.count - a.count).map((c: any) => (
              <div key={c.name}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-navy-700">{c.name}</span><span className="num text-navy-500">{faNum(c.count)}</span></div>
                <div className="h-2 rounded-full bg-navy-50"><div className="h-full rounded-full" style={{ width: `${(c.count / Math.max(1, k?.total ?? 1)) * 100}%`, background: c.color }} /></div>
              </div>
            ))}
            {!data?.byCategory?.length && <Empty title="داده‌ای نیست" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="فعالیت‌های اخیر" icon={<Activity className="size-4" />} />
          <ul className="divide-y divide-navy-50">
            {(data?.recent ?? []).map((a: any) => (
              <li key={a.id}>
                <button onClick={() => a.lead && nav(`/leads/${a.lead.id}`)} className="flex w-full items-start gap-3 px-5 py-3 text-right hover:bg-navy-50/60">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-navy-800">{a.lead ? <b className="font-semibold">{a.lead.businessName || a.lead.fullName}</b> : null} {a.lead && '— '}{a.content}</span>
                    <span className="text-[11px] text-navy-400">{ACTIVITY[a.type] ?? a.type} · {faAgo(a.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
            {!data?.recent?.length && <Empty title="فعالیتی ثبت نشده" />}
          </ul>
        </Card>
      </div>
    </div>
  );
}
