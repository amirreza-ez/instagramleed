import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Info, Play, Plus, RefreshCw, Settings, ShieldCheck, StopCircle } from 'lucide-react';
import { Instagram } from '../components/brand';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select, StatCard, Textarea } from '../components/ui';
import { api, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faDateTime, faNum } from '../lib/fa';
import { useCampaigns, useCategories } from '../lib/hooks';
import { JobsTable } from './Imports';

const IG_SOURCES = ['BUSINESS_DISCOVERY', 'INSTAGRAM_COMMENT', 'INSTAGRAM_DM', 'INSTAGRAM_MENTION', 'META_LEAD_ADS'];

/** Legitimate counterpart of the reference app's "Instagram user extraction" screen. */
export default function Discovery() {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [f, setF] = useState({ integrationId: '', usernames: '', categoryId: '', campaignId: '', tags: '' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: status } = useQuery({ queryKey: ['meta-status'], queryFn: () => api('/meta/status') });
  const { data: todayCount } = useQuery({ queryKey: ['leads', 'ig-today'], queryFn: () => api(`/leads${qs({ source: IG_SOURCES, from: today.toISOString(), pageSize: 1 })}`), refetchInterval: 10_000 });
  const { data: totalCount } = useQuery({ queryKey: ['leads', 'ig-total'], queryFn: () => api(`/leads${qs({ source: IG_SOURCES, pageSize: 1 })}`), refetchInterval: 10_000 });
  const { data: jobs } = useQuery({ queryKey: ['jobs', 'DISCOVERY'], queryFn: () => api<any[]>('/jobs?type=DISCOVERY'), refetchInterval: 3000 });
  const { data: logs } = useQuery({ queryKey: ['meta-logs'], queryFn: () => api<any[]>('/meta/logs'), refetchInterval: 15_000 });
  const { data: cats } = useCategories();
  const { data: camps } = useCampaigns();

  const integrations: any[] = status?.integrations ?? [];
  const active = integrations.filter((i) => i.status === 'CONNECTED');
  const fbWithIg = active.filter((i) => i.provider === 'FACEBOOK' && i.igUserId);
  const running = jobs?.find((j) => j.status === 'PROCESSING' || j.status === 'PENDING');
  const usernames = f.usernames.split(/[\s,،\n]+/).map((u) => u.trim()).filter(Boolean);

  const start = useMutation({
    mutationFn: () => post('/meta/discovery', { integrationId: f.integrationId || fbWithIg[0]?.id, usernames, categoryId: f.categoryId || null, campaignId: f.campaignId || null, tags: f.tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean) }),
    onSuccess: () => { toast.success('کشف کسب‌وکارها شروع شد'); setOpen(false); qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const stop = useMutation({ mutationFn: () => post(`/jobs/${running.id}/cancel`), onSuccess: () => { toast.success('متوقف شد'); qc.invalidateQueries({ queryKey: ['jobs'] }); } });
  const sync = useMutation({ mutationFn: (id: string) => post(`/meta/integrations/${id}/sync`), onSuccess: () => { toast.success('همگام‌سازی شروع شد'); qc.invalidateQueries({ queryKey: ['jobs'] }); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="جذب مشتری از اینستاگرام" subtitle="جذب سرنخ از کامنت‌ها، دایرکت‌ها، Lead Ads و پروفایل عمومی کسب‌وکارها — فقط با API رسمی متا"
        actions={<>
          <Button variant="ghost" icon={<HelpCircle className="size-4" />} onClick={() => setHelp(true)}>آموزش</Button>
          <Button variant="secondary" icon={<Settings className="size-4" />} onClick={() => nav('/integrations')}>تنظیمات</Button>
          {running && <Button variant="danger" icon={<StopCircle className="size-4" />} loading={stop.isPending} onClick={() => stop.mutate()}>توقف</Button>}
          {can('ADMIN') && <Button variant="secondary" className="!bg-violet-600 !text-white !ring-0 hover:!bg-violet-700" icon={<Plus className="size-4" />} onClick={() => nav('/integrations')}>اکانت جدید</Button>}
          {can('AGENT') && <Button icon={<Play className="size-4" />} onClick={() => setOpen(true)} disabled={!!running}>شروع کشف</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="سرنخ‌های اینستاگرام امروز" value={faNum(todayCount?.total)} icon={<Instagram className="size-5" />} tone="brand" />
        <StatCard label="کل سرنخ‌های اینستاگرام و متا" value={faNum(totalCount?.total)} icon={<Instagram className="size-5" />} tone="navy" />
        <StatCard label="اکانت‌های متصل" value={faNum(integrations.filter((i) => i.status !== 'DISCONNECTED').length)} icon={<ShieldCheck className="size-5" />} tone="violet" />
        <StatCard label="اکانت‌های فعال" value={faNum(active.length)} icon={<ShieldCheck className="size-5" />} tone="emerald" hint={integrations.some((i) => i.status === 'EXPIRED') ? <span className="text-rose-600">اتصال منقضی وجود دارد</span> : undefined} />
      </div>

      {!active.length && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3"><Info className="mt-0.5 size-5 text-brand-600" /><div><p className="font-semibold text-navy-900">ابتدا حساب اینستاگرام تجاری یا صفحه فیسبوک خود را متصل کنید</p><p className="mt-1 text-sm text-navy-500">پس از اتصال، کامنت‌ها و دایرکت‌های پیج شما و فرم‌های Lead Ads به‌صورت خودکار به سرنخ تبدیل می‌شوند.</p></div></div>
          {can('ADMIN') && <Button onClick={() => nav('/integrations')}>اتصال حساب</Button>}
        </Card>
      )}

      {active.length > 0 && (
        <Card>
          <CardHeader title="حساب‌های متصل" subtitle="همگام‌سازی دستی؛ رویدادهای جدید از طریق وب‌هوک لحظه‌ای دریافت می‌شوند" />
          <ul className="divide-y divide-navy-50">
            {active.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div><p className="font-medium text-navy-800">{i.name} <Badge className="mr-1">{i.provider === 'INSTAGRAM' ? 'Instagram Login' : 'Facebook Login'}</Badge></p>
                  <p className="text-xs text-navy-400">آخرین همگام‌سازی: {i.lastSyncAt ? faDateTime(i.lastSyncAt) : 'هرگز'}</p></div>
                {can('MANAGER') && <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} loading={sync.isPending} onClick={() => sync.mutate(i.id)}>همگام‌سازی</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <JobsTable type="DISCOVERY" title="عملیات کشف کسب‌وکار" />
      <JobsTable type="SYNC" title="همگام‌سازی‌ها" />

      <Card>
        <CardHeader title="لاگ‌های پلتفرم اینستاگرام" />
        <div className="max-h-80 overflow-y-auto bg-navy-950 p-4 font-mono text-xs leading-6 text-navy-100 rounded-b-2xl" dir="rtl">
          {(logs ?? []).map((l) => (
            <p key={l.id}><span className="text-navy-400">[{faDateTime(l.createdAt)}]</span> <span className={l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}>{l.level.toUpperCase()}</span> {l.message}</p>
          ))}
          {!logs?.length && <p className="text-navy-400">هنوز رویدادی ثبت نشده است.</p>}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="کشف کسب‌وکارهای اینستاگرام" wide
        footer={<><Button loading={start.isPending} disabled={!usernames.length || !fbWithIg.length} onClick={() => start.mutate()}>شروع کشف {usernames.length ? faNum(usernames.length) + ' حساب' : ''}</Button><Button variant="secondary" onClick={() => setOpen(false)}>انصراف</Button></>}>
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50 p-3 text-xs leading-6 text-brand-800">
            آیدی حساب‌های <b>تجاری یا سازنده</b> (مثلاً فروشگاه‌های موبایل) را وارد کنید. اطلاعات عمومی پروفایل آن‌ها — نام، بیو، وب‌سایت و تعداد دنبال‌کننده — از طریق Business Discovery API رسمی متا دریافت و به سرنخ تبدیل می‌شود. دنبال‌کنندگان یا کامنت‌گذاران حساب‌های دیگر از طریق API رسمی در دسترس نیستند.
          </div>
          {!fbWithIg.length ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">برای این قابلیت، اتصال «Facebook Login» با صفحه‌ای که حساب اینستاگرام تجاری دارد لازم است. <button className="font-bold underline" onClick={() => nav('/integrations')}>اتصال</button></p>
          ) : fbWithIg.length > 1 && (
            <Field label="حساب واسط"><Select value={f.integrationId} onChange={(e) => setF({ ...f, integrationId: e.target.value })}>{fbWithIg.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
          )}
          <Field label="آیدی‌ها یا لینک پیج‌ها" hint="هر خط یک آیدی؛ حداکثر ۵۰۰ مورد در هر عملیات">
            <Textarea rows={7} className="ltr" value={f.usernames} onChange={(e) => setF({ ...f, usernames: e.target.value })} placeholder={'mobile_shop_tehran\nhttps://instagram.com/accessory.store'} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="دسته‌بندی"><Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">بدون دسته</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="کمپین"><Select value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })}><option value="">بدون کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="برچسب"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>

      <Modal open={help} onClose={() => setHelp(false)} title="راهنمای جذب مشتری از اینستاگرام">
        <ol className="list-decimal space-y-3 pr-5 text-sm leading-7 text-navy-700">
          <li>در «اتصال اینستاگرام و متا»، حساب اینستاگرام تجاری (برای کامنت و دایرکت) و/یا صفحه فیسبوک (برای Lead Ads و کشف کسب‌وکار) را متصل کنید.</li>
          <li>از این پس هر کامنت روی پست‌های شما و هر دایرکتی که مشتری می‌فرستد، خودکار سرنخ می‌شود و در پرونده مشتری ثبت می‌گردد.</li>
          <li>برای یافتن همکاران تجاری، فهرست آیدی پیج‌های تجاری را در «شروع کشف» وارد کنید.</li>
          <li>در صفحه هر سرنخ می‌توانید در دایرکت (تا ۲۴ ساعت) یا به‌صورت پاسخ خصوصی به کامنت جواب دهید.</li>
          <li>برای ارسال انبوه پیام به افراد ناشناس راهی در API رسمی وجود ندارد و این کار باعث مسدود شدن پیج می‌شود؛ به همین دلیل پشتیبانی نمی‌شود.</li>
        </ol>
      </Modal>
    </div>
  );
}
