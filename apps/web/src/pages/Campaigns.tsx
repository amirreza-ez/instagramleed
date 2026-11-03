import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Badge, Button, Card, Confirm, Empty, ErrorState, Field, Input, JalaliDateInput, Loading, Modal, PageHeader, Select, Textarea } from '../components/ui';
import { api, del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CAMPAIGN_STATUS, CHANNEL, faDate, faDay, faMoney, faNum, faPct, SOURCE } from '../lib/fa';
import { ChartTip } from './Dashboard';

function CampaignForm({ open, onClose, c }: { open: boolean; onClose: () => void; c?: any }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (open) setF(c ? { ...c, budget: c.budget ?? '' } : { name: '', description: '', channel: 'INSTAGRAM_ADS', status: 'ACTIVE', budget: '', startDate: new Date().toISOString(), endDate: null, utmCampaign: '', metaCampaignId: '' }); }, [open, c]);
  const m = useMutation({
    mutationFn: () => {
      const b = { name: f.name, description: f.description || null, channel: f.channel, status: f.status, budget: f.budget === '' ? null : Number(String(f.budget).replace(/[^\d]/g, '')), startDate: f.startDate, endDate: f.endDate, utmCampaign: f.utmCampaign || null, metaCampaignId: f.metaCampaignId || null };
      return c ? patch(`/campaigns/${c.id}`, b) : post('/campaigns', b);
    },
    onSuccess: () => { toast.success('کمپین ذخیره شد'); qc.invalidateQueries({ queryKey: ['campaigns'] }); qc.invalidateQueries({ queryKey: ['campaign'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal open={open} onClose={onClose} title={c ? 'ویرایش کمپین' : 'کمپین جدید'} wide footer={<><Button loading={m.isPending} disabled={!f.name?.trim()} onClick={() => m.mutate()}>ذخیره</Button><Button variant="secondary" onClick={onClose}>انصراف</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام کمپین" className="sm:col-span-2"><Input autoFocus value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="کانال"><Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="وضعیت"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(CAMPAIGN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="بودجه (تومان)"><Input className="ltr" inputMode="numeric" value={f.budget ?? ''} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
        <Field label="شناسه کمپین در متا (اختیاری)" hint="برای انتساب خودکار سرنخ‌های Lead Ads"><Input className="ltr" value={f.metaCampaignId ?? ''} onChange={(e) => setF({ ...f, metaCampaignId: e.target.value })} /></Field>
        <Field label="تاریخ شروع"><JalaliDateInput value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} /></Field>
        <Field label="تاریخ پایان"><JalaliDateInput value={f.endDate} onChange={(v) => setF({ ...f, endDate: v })} /></Field>
        <Field label="توضیحات" className="sm:col-span-2"><Textarea value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function CampaignReport({ id, onClose }: { id: string | null; onClose: () => void }) {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['campaign', id], enabled: !!id, queryFn: () => api(`/campaigns/${id}`) });
  return (
    <Modal open={!!id} onClose={onClose} title={data?.name ?? 'گزارش کمپین'} wide>
      {isLoading || !data ? <Loading /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['سرنخ', faNum(data.leads)], ['واجد شرایط', faNum(data.qualified)], ['مشتری شده', faNum(data.won)], ['نرخ تبدیل', faPct(data.conversionRate)], ['بودجه', faMoney(data.budget)], ['هزینه هر سرنخ', faMoney(data.costPerLead)], ['از دست رفته', faNum(data.lost)], ['شروع', faDate(data.startDate)]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-navy-50 p-3"><p className="text-[11px] text-navy-500">{l}</p><p className="num mt-1 font-bold text-navy-900">{v}</p></div>
            ))}
          </div>
          {data.daily.length > 0 && (
            <div className="h-52" dir="ltr">
              <ResponsiveContainer><BarChart data={data.daily}><XAxis dataKey="day" tickFormatter={faDay} reversed tick={{ fontSize: 11, fontFamily: 'Vazirmatn' }} /><YAxis orientation="right" allowDecimals={false} tickFormatter={faNum} tick={{ fontSize: 11 }} /><Tooltip content={<ChartTip labelFmt={faDay} />} /><Bar dataKey="count" name="سرنخ" fill="#2952e8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-2">{data.sources.map((s: any) => <Badge key={s.source}>{SOURCE[s.source]}: {faNum(s.count)}</Badge>)}</div>
          <Button variant="secondary" onClick={() => nav(`/leads?campaignId=${data.id}`)}>مشاهده سرنخ‌های این کمپین</Button>
        </div>
      )}
    </Modal>
  );
}

export default function Campaigns() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['campaigns'], queryFn: () => api<any[]>('/campaigns') });
  const [form, setForm] = useState<{ open: boolean; c?: any }>({ open: false });
  const [report, setReport] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const delM = useMutation({ mutationFn: () => del(`/campaigns/${delId}`), onSuccess: () => { toast.success('کمپین حذف شد'); setDelId(null); qc.invalidateQueries({ queryKey: ['campaigns'] }); }, onError: (e: Error) => toast.error(e.message) });

  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <div className="animate-in">
      <PageHeader title="کمپین‌ها" subtitle="عملکرد هر کمپین: سرنخ، نرخ تبدیل و هزینه هر سرنخ"
        actions={can('MANAGER') && <Button icon={<Plus className="size-4" />} onClick={() => setForm({ open: true })}>کمپین جدید</Button>} />
      {isLoading ? <Loading /> : !data?.length ? (
        <Card><Empty icon={<Megaphone className="size-7" />} title="هنوز کمپینی نساخته‌اید" text="کمپین‌ها را بسازید تا بدانید هر تبلیغ یا فعالیت چند مشتری آورده است." action={can('MANAGER') && <Button onClick={() => setForm({ open: true })}>ساخت کمپین</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Card key={c.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="font-bold text-navy-900">{c.name}</h3><p className="mt-1 text-xs text-navy-400">{CHANNEL[c.channel]} · {faDate(c.startDate)}</p></div>
                <Badge tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-navy-50 py-2"><p className="text-[11px] text-navy-500">سرنخ</p><p className="num font-extrabold text-navy-900">{faNum(c.leads)}</p></div>
                <div className="rounded-xl bg-emerald-50 py-2"><p className="text-[11px] text-emerald-700">مشتری</p><p className="num font-extrabold text-emerald-700">{faNum(c.won)}</p></div>
                <div className="rounded-xl bg-brand-50 py-2"><p className="text-[11px] text-brand-700">تبدیل</p><p className="num font-extrabold text-brand-700">{faPct(c.conversionRate)}</p></div>
              </div>
              <p className="mt-3 text-xs text-navy-500">بودجه: {faMoney(c.budget)}{c.costPerLead != null && ` · هر سرنخ: ${faMoney(c.costPerLead)}`}</p>
              <div className="mt-4 flex gap-1 border-t border-navy-100 pt-3">
                <Button size="sm" variant="ghost" icon={<BarChart3 className="size-3.5" />} onClick={() => setReport(c.id)}>گزارش</Button>
                {can('MANAGER') && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setForm({ open: true, c })}>ویرایش</Button>}
                {can('MANAGER') && <Button size="sm" variant="ghost" className="mr-auto text-rose-600" icon={<Trash2 className="size-3.5" />} onClick={() => setDelId(c.id)} aria-label="حذف" />}
              </div>
            </Card>
          ))}
        </div>
      )}
      <CampaignForm open={form.open} c={form.c} onClose={() => setForm({ open: false })} />
      <CampaignReport id={report} onClose={() => setReport(null)} />
      <Confirm open={!!delId} onClose={() => setDelId(null)} loading={delM.isPending} onConfirm={() => delM.mutate()} title="حذف کمپین" text="کمپین حذف می‌شود؛ سرنخ‌ها باقی می‌مانند اما از کمپین جدا می‌شوند." />
    </div>
  );
}

