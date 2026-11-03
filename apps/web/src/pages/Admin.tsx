import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Building2, CreditCard, Database, Users } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Input, Loading, PageHeader, Select, StatCard, Tabs } from '../components/ui';
import { api, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faDate, faDateTime, faMoney, faNum, SUB_STATUS } from '../lib/fa';

type Tab = 'overview' | 'orgs' | 'invoices' | 'plans';

export default function Admin() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  if (!me?.user.isSuperAdmin) return <Navigate to="/" replace />;
  return (
    <div className="animate-in space-y-5">
      <PageHeader title="مدیریت سامانه" subtitle="سازمان‌ها، اشتراک‌ها، فاکتورها و سلامت سیستم (فقط مدیر سامانه)" />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'overview', label: 'نمای کلی' }, { value: 'orgs', label: 'سازمان‌ها' }, { value: 'invoices', label: 'فاکتورها' }, { value: 'plans', label: 'طرح‌ها' }]} />
      {tab === 'overview' && <Overview />}
      {tab === 'orgs' && <Orgs />}
      {tab === 'invoices' && <Invoices />}
      {tab === 'plans' && <Plans />}
    </div>
  );
}

function Overview() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: () => api('/admin/overview'), refetchInterval: 30_000 });
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api('/health'), refetchInterval: 30_000 });
  if (!data) return <Loading />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="سازمان‌ها" value={faNum(data.orgs)} icon={<Building2 className="size-5" />} />
        <StatCard label="کاربران" value={faNum(data.users)} icon={<Users className="size-5" />} tone="brand" />
        <StatCard label="کل سرنخ‌ها" value={faNum(data.leads)} icon={<Activity className="size-5" />} tone="violet" hint={`${faNum(data.leads24)} در ۲۴ ساعت`} />
        <StatCard label="درآمد پرداخت‌شده" value={faMoney(data.revenue)} icon={<CreditCard className="size-5" />} tone="gold" hint={`${faNum(data.pendingInvoices)} فاکتور در انتظار`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="سلامت سیستم" icon={<Database className="size-4" />} />
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
            <div><dt className="text-xs text-navy-400">پایگاه داده</dt><dd>{health?.db === 'ok' ? <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-100">سالم · {faNum(health.dbLatencyMs)}ms</Badge> : 'نامشخص'}</dd></div>
            <div><dt className="text-xs text-navy-400">حجم پایگاه داده</dt><dd className="ltr text-right">{data.system.dbSize}</dd></div>
            <div><dt className="text-xs text-navy-400">زمان کار سرور</dt><dd>{faNum(Math.floor(data.system.uptimeSec / 3600))} ساعت</dd></div>
            <div><dt className="text-xs text-navy-400">حافظه</dt><dd>{faNum(data.system.rssMb)} MB</dd></div>
            <div><dt className="text-xs text-navy-400">نسخه Node</dt><dd className="ltr text-right">{data.system.node}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="هشدارها (۲۴ ساعت)" icon={<AlertTriangle className="size-4" />} />
          <ul className="space-y-3 p-5 text-sm">
            <li className="flex justify-between"><span>عملیات ناموفق</span><b className={data.jobsFailed24 ? 'text-rose-600' : ''}>{faNum(data.jobsFailed24)}</b></li>
            <li className="flex justify-between"><span>خطای پردازش وب‌هوک</span><b className={data.webhookErrors24 ? 'text-rose-600' : ''}>{faNum(data.webhookErrors24)}</b></li>
            {data.subscriptions.map((s: any) => <li key={s.status} className="flex justify-between"><span>اشتراک {SUB_STATUS[s.status]}</span><b>{faNum(s.count)}</b></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Orgs() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: ['admin-orgs', q], queryFn: () => api<any[]>(`/admin/organizations?q=${encodeURIComponent(q)}`) });
  const { data: plans } = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<any[]>('/admin/plans') });
  const m = useMutation({ mutationFn: (x: any) => patch(`/admin/organizations/${x.id}`, x.body), onSuccess: () => { toast.success('به‌روزرسانی شد'); qc.invalidateQueries({ queryKey: ['admin-orgs'] }); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Card>
      <div className="border-b border-navy-100 p-3"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی سازمان" className="max-w-xs" /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400">{['سازمان', 'طرح', 'وضعیت', 'سرنخ / کاربر', 'ایجاد', 'عملیات'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-50">
            {data?.map((o) => (
              <tr key={o.id} className={o.suspended ? 'bg-rose-50/40' : ''}>
                <td className="px-4 py-3 font-medium">{o.name}{o.suspended && <Badge tone="bg-rose-100 text-rose-700 ring-rose-200" className="mr-1">تعلیق</Badge>}</td>
                <td className="px-4 py-3"><Select aria-label="طرح" className="w-36" value={o.planCode ?? ''} onChange={(e) => m.mutate({ id: o.id, body: { planCode: e.target.value } })}>{plans?.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></td>
                <td className="px-4 py-3 text-xs">{SUB_STATUS[o.status] ?? '—'}<br /><span className="text-navy-400">{o.currentPeriodEnd ? `تا ${faDate(o.currentPeriodEnd)}` : o.trialEndsAt ? `آزمایشی تا ${faDate(o.trialEndsAt)}` : ''}</span></td>
                <td className="px-4 py-3">{faNum(o.counts.leads)} / {faNum(o.counts.members)}</td>
                <td className="px-4 py-3 text-xs text-navy-400">{faDate(o.createdAt)}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => m.mutate({ id: o.id, body: { extendDays: 30 } })}>+۳۰ روز</Button>
                  <Button size="sm" variant="ghost" className={o.suspended ? '' : 'text-rose-600'} onClick={() => m.mutate({ id: o.id, body: { suspended: !o.suspended } })}>{o.suspended ? 'رفع تعلیق' : 'تعلیق'}</Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Invoices() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-invoices'], queryFn: () => api<any[]>('/admin/invoices') });
  const m = useMutation({ mutationFn: (id: string) => post(`/admin/invoices/${id}/mark-paid`), onSuccess: () => { toast.success('پرداخت تأیید و اشتراک فعال شد'); qc.invalidateQueries({ queryKey: ['admin-invoices'] }); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400">{['شماره', 'سازمان', 'مبلغ', 'درگاه', 'وضعیت', 'تاریخ', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-50">
            {data?.map((i) => (
              <tr key={i.id}><td className="ltr px-4 py-3 text-right font-mono text-xs">{i.number}</td><td className="px-4 py-3">{i.organization.name}</td><td className="px-4 py-3">{faMoney(i.amount)}</td><td className="px-4 py-3 text-xs">{i.provider}</td><td className="px-4 py-3 text-xs">{i.status}</td><td className="px-4 py-3 text-xs text-navy-400">{faDateTime(i.createdAt)}</td>
                <td className="px-4 py-3">{i.status === 'PENDING' && <Button size="sm" loading={m.isPending && m.variables === i.id} onClick={() => m.mutate(i.id)}>تأیید پرداخت</Button>}</td></tr>
            ))}
            {!data?.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-navy-400">فاکتوری وجود ندارد.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Plans() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<any[]>('/admin/plans') });
  const m = useMutation({ mutationFn: (x: any) => patch(`/admin/plans/${x.id}`, x.body), onSuccess: () => { toast.success('ذخیره شد'); qc.invalidateQueries({ queryKey: ['admin-plans'] }); qc.invalidateQueries({ queryKey: ['plans'] }); }, onError: (e: Error) => toast.error(e.message) });
  const fields = [['priceMonthly', 'قیمت ماهانه (تومان)'], ['maxLeads', 'سقف سرنخ'], ['maxUsers', 'سقف کاربر'], ['maxIntegrations', 'سقف اتصال'], ['maxImportsMonthly', 'ورود فایل/ماه']] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data?.map((p) => (
        <Card key={p.id}>
          <CardHeader title={p.name} subtitle={<span className="ltr">{p.code}</span>} action={<Badge tone={p.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : undefined}>{p.active ? 'فعال' : 'غیرفعال'}</Badge>} />
          <div className="grid grid-cols-2 gap-3 p-5">
            {fields.map(([k, l]) => (
              <label key={k} className="text-xs text-navy-500">{l}<Input className="ltr mt-1" type="number" min={0} defaultValue={p[k]} onBlur={(e) => Number(e.target.value) !== p[k] && m.mutate({ id: p.id, body: { [k]: Number(e.target.value) } })} /></label>
            ))}
            <Button size="sm" variant="secondary" className="self-end" onClick={() => m.mutate({ id: p.id, body: { active: !p.active } })}>{p.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
