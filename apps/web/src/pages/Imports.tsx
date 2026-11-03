import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FileUp, RotateCcw, StopCircle, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Progress, Select, cx } from '../components/ui';
import { api, apiRaw, download, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faAgo, faNum, JOB_STATUS } from '../lib/fa';
import { useCampaigns, useCategories } from '../lib/hooks';

export function JobsTable({ type, title = 'تاریخچه عملیات' }: { type?: string; title?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['jobs', type], queryFn: () => api<any[]>(`/jobs${qs({ type })}`),
    refetchInterval: (q) => ((q.state.data as any[])?.some((j) => j.status === 'PROCESSING' || j.status === 'PENDING') ? 2000 : 15000),
  });
  const cancel = useMutation({ mutationFn: (id: string) => post(`/jobs/${id}/cancel`), onSuccess: () => { toast.success('عملیات متوقف شد'); qc.invalidateQueries({ queryKey: ['jobs'] }); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Card>
      <CardHeader title={title} />
      {data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400">{['عملیات', 'وضعیت', 'پیشرفت', 'جدید', 'ادغام/تکراری', 'خطا', 'زمان', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-navy-50">
              {data.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-3"><p className="font-medium text-navy-800">{j.title}</p></td>
                  <td className="px-4 py-3"><Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge></td>
                  <td className="w-40 px-4 py-3"><Progress value={j.total ? (j.processed / j.total) * 100 : j.status === 'COMPLETED' ? 100 : 0} /><p className="mt-1 text-[11px] text-navy-400">{faNum(j.processed)} از {faNum(j.total)}</p></td>
                  <td className="px-4 py-3 text-emerald-700">{faNum(j.created)}</td>
                  <td className="px-4 py-3 text-amber-700">{faNum(j.merged)} / {faNum(j.duplicates)}</td>
                  <td className="px-4 py-3 text-rose-600">{faNum(j.failed)}</td>
                  <td className="px-4 py-3 text-xs text-navy-400">{faAgo(j.createdAt)}</td>
                  <td className="px-4 py-3 text-left">
                    {(j.status === 'PROCESSING' || j.status === 'PENDING') && <Button size="sm" variant="ghost" className="text-rose-600" icon={<StopCircle className="size-3.5" />} onClick={() => cancel.mutate(j.id)}>توقف</Button>}
                    {(j.failed > 0 || j.status === 'FAILED') && <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => download(`/jobs/${j.id}/errors.csv`, 'errors.csv')}>گزارش خطا</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="هنوز عملیاتی انجام نشده" />}
    </Card>
  );
}

export default function Imports() {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [opts, setOpts] = useState({ strategy: 'merge', categoryId: '', campaignId: '', tags: '', consent: false });
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: cats } = useCategories();
  const { data: camps } = useCampaigns();

  const upload = useMutation({
    mutationFn: async (file: File) => { const fd = new FormData(); fd.append('file', file); return (await apiRaw('/imports/preview', { method: 'POST', body: fd })).json(); },
    onSuccess: (d) => { setPreview(d); setJobId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const start = useMutation({
    mutationFn: () => post(`/imports/${preview.jobId}/start`, {
      mapping: preview.mapping, strategy: opts.strategy, categoryId: opts.categoryId || null, campaignId: opts.campaignId || null,
      tags: opts.tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean), consent: opts.consent,
    }),
    onSuccess: (j: any) => { setJobId(j.id); qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const { data: job } = useQuery({
    queryKey: ['job', jobId], enabled: !!jobId, queryFn: () => api(`/jobs/${jobId}`),
    refetchInterval: (q) => (['COMPLETED', 'FAILED', 'CANCELLED'].includes((q.state.data as any)?.status) ? false : 800),
  });
  const done = job && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status);
  useEffect(() => {
    if (done) { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['jobs'] }); }
  }, [done, qc]);

  const onFile = (f?: File | null) => { if (f) upload.mutate(f); };
  const reset = () => { setPreview(null); setJobId(null); if (fileRef.current) fileRef.current.value = ''; };
  const mappedCount = preview ? Object.values(preview.mapping).filter(Boolean).length : 0;

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="ورود و خروج داده" subtitle="فایل CSV یا اکسل مشتریان را وارد کنید؛ ستون‌ها خودکار شناسایی و تکراری‌ها ادغام می‌شوند."
        actions={<>
          <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => download('/imports/template.xlsx', 'template.xlsx')}>دریافت فایل نمونه</Button>
          {can('AGENT') && <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download('/exports/leads?format=xlsx', 'leads.xlsx').catch((e) => toast.error(e.message))}>خروجی همه سرنخ‌ها</Button>}
        </>} />

      {can('AGENT') && !preview && (
        <Card>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
            className={cx('m-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition', drag ? 'border-brand-500 bg-brand-50' : 'border-navy-200')}>
            <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600"><FileUp className="size-8" /></div>
            <p className="text-lg font-bold text-navy-900">فایل را اینجا رها کنید</p>
            <p className="mt-1 text-sm text-navy-400">CSV یا XLSX — حداکثر ۱۰ مگابایت و ۵۰٬۰۰۰ ردیف. فایل‌های فارسی با کدگذاری UTF-8 و Windows-1256 پشتیبانی می‌شوند.</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <Button className="mt-5" loading={upload.isPending} icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>انتخاب فایل</Button>
          </div>
        </Card>
      )}

      {preview && !jobId && (
        <Card>
          <CardHeader title={`نگاشت ستون‌ها — ${faNum(preview.total)} ردیف`} subtitle="مشخص کنید هر ستون فایل مربوط به کدام فیلد است" action={<Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={reset}>فایل دیگر</Button>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400"><th className="px-4 py-3 font-medium">ستون فایل</th><th className="px-4 py-3 font-medium">فیلد مقصد</th><th className="px-4 py-3 font-medium">نمونه داده</th></tr></thead>
              <tbody className="divide-y divide-navy-50">
                {preview.headers.map((h: string, i: number) => (
                  <tr key={h}>
                    <td className="px-4 py-2.5 font-medium text-navy-800">{h}</td>
                    <td className="px-4 py-2.5">
                      <Select aria-label={`نگاشت ${h}`} value={preview.mapping[h]} onChange={(e) => setPreview({ ...preview, mapping: { ...preview.mapping, [h]: e.target.value } })} className={cx('w-48', preview.mapping[h] && 'ring-emerald-300 bg-emerald-50/40')}>
                        <option value="">— نادیده گرفته شود —</option>
                        {Object.entries(preview.fields).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
                      </Select>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-xs text-navy-500">{preview.sample.slice(0, 3).map((r: string[]) => r[i]).filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t border-navy-100 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="رفتار با رکوردهای تکراری" hint="بر اساس شماره، اینستاگرام یا ایمیل">
              <Select value={opts.strategy} onChange={(e) => setOpts({ ...opts, strategy: e.target.value })}>
                <option value="merge">ادغام (تکمیل اطلاعات رکورد قبلی)</option>
                <option value="skip">نادیده گرفتن تکراری‌ها</option>
                <option value="create">ثبت و علامت‌گذاری به‌عنوان تکراری</option>
              </Select>
            </Field>
            <Field label="دسته‌بندی پیش‌فرض"><Select value={opts.categoryId} onChange={(e) => setOpts({ ...opts, categoryId: e.target.value })}><option value="">بدون دسته</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="کمپین"><Select value={opts.campaignId} onChange={(e) => setOpts({ ...opts, campaignId: e.target.value })}><option value="">بدون کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="برچسب برای همه ردیف‌ها"><Input value={opts.tags} onChange={(e) => setOpts({ ...opts, tags: e.target.value })} placeholder="نمایشگاه ۱۴۰۵" /></Field>
            <label className="flex items-center gap-2 text-sm text-navy-600 md:col-span-2 xl:col-span-4">
              <input type="checkbox" className="size-4 accent-brand-600" checked={opts.consent} onChange={(e) => setOpts({ ...opts, consent: e.target.checked })} />
              افراد این فهرست با دریافت پیام تجاری از ما موافقت کرده‌اند (ثبت منبع رضایت)
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-navy-100 bg-navy-50/50 px-5 py-3">
            <span className="text-xs text-navy-500">{faNum(mappedCount)} ستون نگاشت شده</span>
            <Button loading={start.isPending} disabled={!mappedCount} onClick={() => start.mutate()}>شروع ورود {faNum(preview.total)} ردیف</Button>
          </div>
        </Card>
      )}

      {jobId && job && (
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className={cx('grid size-12 place-items-center rounded-2xl', job.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : job.status === 'FAILED' ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600')}>
              {job.status === 'COMPLETED' ? <CheckCircle2 className="size-6" /> : job.status === 'FAILED' ? <AlertCircle className="size-6" /> : <Upload className="size-6 animate-pulse" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-navy-900">{done ? (job.status === 'COMPLETED' ? 'ورود فایل کامل شد' : JOB_STATUS[job.status].label) : 'در حال پردازش…'}</p>
              <Progress className="mt-2" value={job.total ? (job.processed / job.total) * 100 : 0} />
              <p className="mt-1 text-xs text-navy-400">{faNum(job.processed)} از {faNum(job.total)} ردیف</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['سرنخ جدید', job.created, 'text-emerald-700'], ['ادغام‌شده', job.merged, 'text-brand-700'], ['تکراری', job.duplicates, 'text-amber-700'], ['خطا', job.failed, 'text-rose-600']].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl bg-navy-50 p-3 text-center"><p className="text-xs text-navy-500">{l}</p><p className={cx('num mt-1 text-2xl font-extrabold', c as string)}>{faNum(v as number)}</p></div>
            ))}
          </div>
          {done && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => nav('/leads')}>مشاهده سرنخ‌ها</Button>
              {job.failed > 0 && <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download(`/jobs/${job.id}/errors.csv`, 'errors.csv')}>دانلود گزارش خطاها</Button>}
              <Button variant="ghost" onClick={reset}>ورود فایل دیگر</Button>
            </div>
          )}
        </Card>
      )}

      <JobsTable type="IMPORT" title="تاریخچه ورود فایل" />
    </div>
  );
}
