import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Link2Off, RefreshCw, XCircle } from 'lucide-react';
import { Facebook, Instagram } from '../components/brand';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Confirm, Empty, Loading, PageHeader } from '../components/ui';
import { api, del, isDesktop, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faDateTime, faNum } from '../lib/fa';

const STATUS_UI: Record<string, { label: string; tone: string }> = {
  CONNECTED: { label: 'متصل', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  EXPIRED: { label: 'توکن منقضی شده', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
  ERROR: { label: 'خطا', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  DISCONNECTED: { label: 'قطع شده', tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};
const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('کپی شد'));

export default function Integrations() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [disc, setDisc] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['meta-status'], queryFn: () => api('/meta/status') });
  const { data: logs } = useQuery({ queryKey: ['meta-logs'], queryFn: () => api<any[]>('/meta/logs') });
  const inv = () => { qc.invalidateQueries({ queryKey: ['meta-status'] }); qc.invalidateQueries({ queryKey: ['meta-logs'] }); };

  useEffect(() => {
    if (sp.get('connected')) { toast.success('اتصال با موفقیت برقرار شد'); setSp({}, { replace: true }); inv(); }
    if (sp.get('error')) { toast.error(`اتصال ناموفق: ${sp.get('error')}`); setSp({}, { replace: true }); }
  }, [sp]); // eslint-disable-line

  const connect = useMutation({
    mutationFn: (p: string) => post<{ url: string }>(`/meta/connect/${p}`),
    onSuccess: ({ url }) => { if (isDesktop) { window.desktop!.openExternal(url); toast.info('مراحل اتصال را در مرورگر کامل کنید، سپس این صفحه را به‌روز کنید.'); } else location.href = url; },
    onError: (e: Error) => toast.error(e.message),
  });
  const refresh = useMutation({ mutationFn: (id: string) => post(`/meta/integrations/${id}/refresh-token`), onSuccess: () => { toast.success('توکن تمدید شد'); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const sync = useMutation({ mutationFn: (id: string) => post(`/meta/integrations/${id}/sync`), onSuccess: () => { toast.success('همگام‌سازی در پس‌زمینه شروع شد'); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const disconnect = useMutation({ mutationFn: () => del(`/meta/integrations/${disc}`), onSuccess: () => { toast.success('اتصال قطع شد'); setDisc(null); inv(); } });

  if (isLoading) return <Loading />;
  const cfg = data.config;
  const list: any[] = data.integrations;

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="اتصال اینستاگرام و متا" subtitle="اتصال رسمی از طریق OAuth متا؛ رمز عبور اینستاگرام شما هرگز از شما خواسته نمی‌شود." />
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { p: 'instagram', icon: <Instagram className="size-6" />, color: 'from-pink-500 via-fuchsia-500 to-amber-400', title: 'Instagram Login', ok: cfg.instagramConfigured, items: ['دریافت کامنت‌های پست‌های شما', 'دریافت دایرکت‌ها و پاسخ در پنجره ۲۴ ساعته', 'پاسخ خصوصی به کامنت‌ها'], env: 'INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET' },
          { p: 'facebook', icon: <Facebook className="size-6" />, color: 'from-blue-600 to-blue-800', title: 'Facebook Login', ok: cfg.facebookConfigured, items: ['دریافت سرنخ‌های فرم Lead Ads', 'کشف پروفایل عمومی کسب‌وکارها (Business Discovery)', 'مدیریت صفحات متصل'], env: 'META_APP_ID / META_APP_SECRET' },
        ].map((x) => (
          <Card key={x.p} className="overflow-hidden">
            <div className={`flex items-center gap-3 bg-gradient-to-l ${x.color} px-5 py-4 text-white`}>{x.icon}<p className="font-bold">{x.title}</p></div>
            <div className="space-y-3 p-5">
              <ul className="space-y-1.5 text-sm text-navy-600">{x.items.map((i) => <li key={i} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" />{i}</li>)}</ul>
              {!x.ok && <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />اطلاعات اپلیکیشن متا روی سرور تنظیم نشده است ({x.env}). راهنما: docs/META_SETUP.md</p>}
              {can('ADMIN') && <Button disabled={!x.ok} loading={connect.isPending && connect.variables === x.p} onClick={() => connect.mutate(x.p)}>اتصال حساب</Button>}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="حساب‌های متصل" />
        {list.length ? (
          <ul className="divide-y divide-navy-50">
            {list.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="grid size-11 place-items-center rounded-xl bg-navy-50 text-navy-600">{i.provider === 'INSTAGRAM' ? <Instagram className="size-5" /> : <Facebook className="size-5" />}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-navy-900">{i.name} <Badge tone={STATUS_UI[i.status].tone}>{STATUS_UI[i.status].label}</Badge></p>
                  <p className="text-xs text-navy-400">آخرین همگام‌سازی: {i.lastSyncAt ? faDateTime(i.lastSyncAt) : 'هرگز'}{i.daysToExpiry != null && ` · انقضای توکن: ${faNum(i.daysToExpiry)} روز دیگر`}</p>
                  {i.lastError && <p className="text-xs text-rose-600">{i.lastError}</p>}
                  {i.pages?.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{i.pages.map((p: any) => <Badge key={p.id}>{p.name}{p.igUsername && ` · @${p.igUsername}`}{p.leadgenSubscribed ? ' ✓ Lead Ads' : ''}</Badge>)}</div>}
                  <div className="flex flex-wrap gap-1 pt-1">{i.scopes.map((s: string) => <span key={s} className="ltr rounded bg-navy-50 px-1.5 py-0.5 text-[10px] text-navy-500">{s}</span>)}</div>
                </div>
                {i.status !== 'DISCONNECTED' && (
                  <div className="flex flex-wrap gap-1">
                    {can('MANAGER') && <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={() => sync.mutate(i.id)}>همگام‌سازی</Button>}
                    {can('ADMIN') && i.provider === 'INSTAGRAM' && <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => refresh.mutate(i.id)}>تمدید توکن</Button>}
                    {can('ADMIN') && <Button size="sm" variant="ghost" className="text-rose-600" icon={<Link2Off className="size-3.5" />} onClick={() => setDisc(i.id)}>قطع</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <Empty title="هنوز حسابی متصل نشده" />}
      </Card>

      {can('ADMIN') && (
        <Card>
          <CardHeader title="تنظیمات وب‌هوک متا" subtitle="این مقادیر را در پنل developers.facebook.com وارد کنید" />
          <div className="space-y-3 p-5 text-sm">
            {[['Callback URL وب‌هوک', cfg.webhookUrl], ['Redirect URI (Instagram)', cfg.redirectUris.INSTAGRAM], ['Redirect URI (Facebook)', cfg.redirectUris.FACEBOOK]].map(([l, v]) => (
              <div key={l} className="flex flex-wrap items-center gap-2"><span className="w-48 text-navy-500">{l}</span><code className="ltr flex-1 rounded-lg bg-navy-50 px-3 py-1.5 text-xs">{v}</code><Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => copy(v)} aria-label="کپی" /></div>
            ))}
            <p className="flex items-center gap-2 text-xs text-navy-500">{cfg.verifyTokenSet ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-rose-500" />}Verify Token در متغیر META_WEBHOOK_VERIFY_TOKEN سرور {cfg.verifyTokenSet ? 'تنظیم شده است' : 'تنظیم نشده است'} · نسخه Graph API: <span className="ltr">{cfg.graphVersion}</span></p>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="لاگ اتصال‌ها" />
        <ul className="max-h-96 divide-y divide-navy-50 overflow-y-auto text-sm">
          {(logs ?? []).map((l) => (
            <li key={l.id} className="flex items-start gap-3 px-5 py-2.5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${l.level === 'error' ? 'bg-rose-500' : l.level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <div className="flex-1"><p className="text-navy-800">{l.message}</p><p className="text-[11px] text-navy-400"><span className="ltr">{l.event}</span> · {faDateTime(l.createdAt)}</p></div>
            </li>
          ))}
          {!logs?.length && <li className="px-5 py-6 text-center text-navy-400">لاگی ثبت نشده است.</li>}
        </ul>
      </Card>
      <Confirm open={!!disc} onClose={() => setDisc(null)} loading={disconnect.isPending} onConfirm={() => disconnect.mutate()} title="قطع اتصال" text="توکن‌های دسترسی حذف می‌شوند و دریافت سرنخ از این حساب متوقف می‌شود. سرنخ‌های قبلی باقی می‌مانند." />
    </div>
  );
}
