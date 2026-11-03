import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Confirm, Loading, Modal, PageHeader, Progress, cx } from '../components/ui';
import { api, isDesktop, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faDate, faMoney, faNum, SUB_STATUS } from '../lib/fa';

const INV: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'در انتظار پرداخت', tone: 'bg-amber-50 text-amber-700 ring-amber-100' }, PAID: { label: 'پرداخت شده', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  FAILED: { label: 'ناموفق', tone: 'bg-rose-50 text-rose-700 ring-rose-100' }, VOID: { label: 'باطل', tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default function Billing() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [manual, setManual] = useState<any>(null);
  const [cancel, setCancel] = useState(false);
  const { data } = useQuery({ queryKey: ['subscription'], queryFn: () => api('/billing/subscription') });
  const { data: plans } = useQuery({ queryKey: ['plans'], queryFn: () => api<any[]>('/billing/plans') });
  const { data: invoices } = useQuery({ queryKey: ['invoices'], queryFn: () => api<any[]>('/billing/invoices') });
  useEffect(() => {
    const p = sp.get('payment');
    if (p) { p === 'success' ? toast.success('پرداخت موفق بود؛ اشتراک فعال شد') : toast.error('پرداخت ناموفق بود'); setSp({}, { replace: true }); qc.invalidateQueries({ queryKey: ['subscription'] }); }
  }, [sp]); // eslint-disable-line
  const checkout = useMutation({
    mutationFn: (planCode: string) => post('/billing/checkout', { planCode }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      if (r.redirectUrl) { if (isDesktop) window.desktop!.openExternal(r.redirectUrl); else location.href = r.redirectUrl; }
      else setManual(r.invoice);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelM = useMutation({ mutationFn: () => post('/billing/cancel'), onSuccess: () => { toast.success('اشتراک لغو شد'); setCancel(false); qc.invalidateQueries({ queryKey: ['subscription'] }); } });
  if (!data || !plans) return <Loading />;
  const s = data.subscription; const u = data.usage;
  const usage = [['سرنخ‌ها', u.leads, s.plan.maxLeads], ['کاربران', u.users, s.plan.maxUsers], ['اتصال‌های متا', u.integrations, s.plan.maxIntegrations], ['ورود فایل این ماه', u.imports, s.plan.maxImportsMonthly]] as const;

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="اشتراک و صورتحساب" subtitle="مدیریت طرح، میزان مصرف و فاکتورها" />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-navy-900 px-6 py-5 text-white">
          <div className="flex items-center gap-3"><Crown className="size-7 text-gold-400" /><div><p className="text-sm text-navy-300">طرح فعلی</p><p className="text-xl font-extrabold">{s.plan.name}</p></div></div>
          <div className="text-left">
            <Badge tone={s.effectiveStatus === 'EXPIRED' ? 'bg-rose-500/20 text-rose-100 ring-rose-300/30' : 'bg-emerald-500/20 text-emerald-100 ring-emerald-300/30'}>{SUB_STATUS[s.effectiveStatus]}</Badge>
            <p className="mt-1 text-xs text-navy-300">{s.trialEndsAt ? `پایان دوره آزمایشی: ${faDate(s.trialEndsAt)}` : s.currentPeriodEnd ? `اعتبار تا ${faDate(s.currentPeriodEnd)}` : ''}</p>
          </div>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {usage.map(([l, v, max]) => (
            <div key={l}><div className="mb-1.5 flex justify-between text-sm"><span className="text-navy-600">{l}</span><span className="num text-navy-500">{faNum(v)} / {faNum(max)}</span></div><Progress value={(v / max) * 100} /></div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const current = p.id === s.planId && s.effectiveStatus === 'ACTIVE';
          return (
            <Card key={p.id} className={cx('flex flex-col p-5', p.code === 'pro' && 'ring-2 ring-brand-500')}>
              {p.code === 'pro' && <Badge tone="bg-brand-600 text-white ring-brand-600" className="mb-2 self-start">پیشنهاد ما</Badge>}
              <h3 className="text-lg font-bold text-navy-900">{p.name}</h3>
              <p className="mt-2"><span className="num text-2xl font-extrabold">{p.priceMonthly ? faNum(p.priceMonthly) : 'رایگان'}</span>{p.priceMonthly > 0 && <span className="text-xs text-navy-400"> تومان / ماه</span>}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-navy-600">
                <li className="flex gap-2"><Check className="size-4 text-emerald-500" />{faNum(p.maxLeads)} سرنخ</li>
                <li className="flex gap-2"><Check className="size-4 text-emerald-500" />{faNum(p.maxUsers)} کاربر</li>
                <li className="flex gap-2"><Check className="size-4 text-emerald-500" />{faNum(p.maxIntegrations)} اتصال متا</li>
                {p.features.map((x: string) => <li key={x} className="flex gap-2"><Check className="size-4 text-emerald-500" />{x}</li>)}
              </ul>
              {p.priceMonthly > 0 && can('ADMIN') && <Button className="mt-5" variant={current ? 'secondary' : 'primary'} loading={checkout.isPending && checkout.variables === p.code} onClick={() => checkout.mutate(p.code)}>{current ? 'تمدید یک ماه' : 'انتخاب طرح'}</Button>}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="فاکتورها" action={can('ADMIN') && s.status === 'ACTIVE' && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setCancel(true)}>لغو اشتراک</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400">{['شماره', 'مبلغ', 'دوره', 'وضعیت', 'تاریخ'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-navy-50">
              {(invoices ?? []).map((i) => <tr key={i.id}><td className="ltr px-5 py-3 text-right font-mono text-xs">{i.number}</td><td className="px-5 py-3">{faMoney(i.amount)}</td><td className="px-5 py-3 text-xs">{faDate(i.periodStart)} تا {faDate(i.periodEnd)}</td><td className="px-5 py-3"><Badge tone={INV[i.status].tone}>{INV[i.status].label}</Badge></td><td className="px-5 py-3 text-xs text-navy-400">{faDate(i.createdAt)}</td></tr>)}
              {!invoices?.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-navy-400">فاکتوری صادر نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={!!manual} onClose={() => setManual(null)} title="فاکتور صادر شد">
        <p className="text-sm leading-7 text-navy-600">فاکتور <b className="ltr">{manual?.number}</b> به مبلغ <b>{faMoney(manual?.amount)}</b> صادر شد. درگاه آنلاین روی این سرور فعال نیست؛ پس از واریز، مدیر سامانه پرداخت را تأیید می‌کند و اشتراک فوراً فعال می‌شود.</p>
      </Modal>
      <Confirm open={cancel} onClose={() => setCancel(false)} loading={cancelM.isPending} onConfirm={() => cancelM.mutate()} title="لغو اشتراک" text="با لغو اشتراک، ثبت داده جدید متوقف می‌شود اما داده‌های شما حفظ می‌شوند." />
    </div>
  );
}
