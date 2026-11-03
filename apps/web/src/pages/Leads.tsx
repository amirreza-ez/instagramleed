import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, Bookmark, Download, Filter, Phone, Plus, Trash2, X } from 'lucide-react';
import { Instagram } from '../components/brand';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, Confirm, Empty, ErrorState, Input, JalaliDateInput, Modal, PageHeader, Pagination, Select, Skeleton, cx } from '../components/ui';
import { api, del, download, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faAgo, faDigits, faNum, PRIORITY, SOURCE, STATUS } from '../lib/fa';
import { useCampaigns, useCategories, useCities, useMembers } from '../lib/hooks';
import { LeadForm } from './LeadForm';

const FILTER_KEYS = ['q', 'status', 'source', 'priority', 'categoryId', 'campaignId', 'assigneeId', 'city', 'tag', 'from', 'to', 'duplicates'] as const;
const LABELS: Record<string, string> = { q: 'جستجو', status: 'وضعیت', source: 'منبع', priority: 'اولویت', categoryId: 'دسته', campaignId: 'کمپین', assigneeId: 'کارشناس', city: 'شهر', tag: 'برچسب', from: 'از تاریخ', to: 'تا تاریخ', duplicates: 'تکراری' };

export default function Leads() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | 'delete' | 'update'>(null);
  const [saveSeg, setSaveSeg] = useState(false);
  const [segName, setSegName] = useState('');
  const [search, setSearch] = useState(sp.get('q') ?? '');

  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? '']).filter(([, v]) => v)), [sp]);
  const page = Number(sp.get('page') ?? 1);
  const sort = sp.get('sort') ?? 'createdAt';
  const dir = sp.get('dir') ?? 'desc';
  const setF = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete('page'); setSp(n, { replace: true }); };

  useEffect(() => { setSearch(sp.get('q') ?? ''); }, [sp]);
  useEffect(() => { const t = setTimeout(() => { if (search !== (sp.get('q') ?? '')) setF('q', search); }, 350); return () => clearTimeout(t); }, [search]); // eslint-disable-line

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['leads', filters, page, sort, dir],
    queryFn: () => api(`/leads${qs({ ...filters, page, pageSize: 25, sort, dir })}`),
    placeholderData: keepPreviousData,
  });
  const { data: segments } = useQuery({ queryKey: ['segments'], queryFn: () => api<any[]>('/segments') });
  const { data: cats } = useCategories();
  const { data: camps } = useCampaigns();
  const { data: members } = useMembers();
  const { data: cities } = useCities();
  const memberName = (id?: string) => members?.find((m) => m.userId === id)?.name;

  const refresh = () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['segments'] }); setSelected(new Set()); };
  const bulkM = useMutation({
    mutationFn: (body: any) => post('/leads/bulk', { ids: [...selected], ...body }),
    onSuccess: (r: any) => { toast.success(`${faNum(r.count)} سرنخ به‌روزرسانی شد`); setBulk(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const segM = useMutation({
    mutationFn: () => post('/segments', { name: segName, filters }),
    onSuccess: () => { toast.success('فیلتر ذخیره شد'); setSaveSeg(false); setSegName(''); qc.invalidateQueries({ queryKey: ['segments'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delSeg = useMutation({ mutationFn: (id: string) => del(`/segments/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['segments'] }) });

  const items: any[] = data?.items ?? [];
  const allSel = items.length > 0 && items.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(items.map((l) => l.id)));
  const toggle = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const sortBy = (k: string) => { const n = new URLSearchParams(sp); n.set('sort', k); n.set('dir', sort === k && dir === 'desc' ? 'asc' : 'desc'); setSp(n, { replace: true }); };
  const activeCount = Object.keys(filters).filter((k) => k !== 'q').length;

  const chipValue = (k: string, v: string) => ({
    status: STATUS[v]?.label, source: SOURCE[v], priority: PRIORITY[v]?.label, categoryId: cats?.find((c) => c.id === v)?.name,
    campaignId: camps?.find((c) => c.id === v)?.name, assigneeId: v === 'me' ? 'من' : v === 'none' ? 'بدون کارشناس' : memberName(v),
    duplicates: v === 'only' ? 'فقط تکراری‌ها' : 'بدون تکراری', from: new Date(v).toLocaleDateString('fa-IR'), to: new Date(v).toLocaleDateString('fa-IR'),
  } as Record<string, string | undefined>)[k] ?? v;

  return (
    <div className="animate-in">
      <PageHeader title="سرنخ‌ها و مشتریان" subtitle="همه مشتریان بالقوه و فعال از تمام منابع، در یک فهرست"
        actions={<>
          {can('AGENT') && <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download(`/exports/leads${qs({ ...filters, format: 'xlsx' })}`, 'leads.xlsx').catch((e) => toast.error(e.message))}>خروجی اکسل</Button>}
          {can('AGENT') && <Button variant="secondary" onClick={() => download(`/exports/leads${qs({ ...filters, format: 'csv' })}`, 'leads.csv').catch((e) => toast.error(e.message))}>CSV</Button>}
          {can('AGENT') && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>سرنخ جدید</Button>}
        </>} />

      {!!segments?.length && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-navy-400">بخش‌های ذخیره‌شده:</span>
          {segments.map((s) => (
            <span key={s.id} className="group inline-flex items-center gap-1 rounded-full bg-white py-1 pl-1.5 pr-3 text-xs ring-1 ring-navy-200 hover:ring-brand-500">
              <button onClick={() => setSp(new URLSearchParams(Object.entries(s.filters).flatMap(([k, v]) => Array.isArray(v) ? v.map((x) => [k, String(x)]) : [[k, String(v)]])))}>{s.name} <b className="text-brand-600">{faNum(s.count)}</b></button>
              {can('AGENT') && <button aria-label="حذف بخش" onClick={() => delSeg.mutate(s.id)} className="rounded-full p-0.5 text-navy-300 hover:bg-rose-50 hover:text-rose-600"><X className="size-3" /></button>}
            </span>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 p-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در نام، کسب‌وکار، شماره، اینستاگرام، شهر…" className="max-w-xs" aria-label="جستجو" />
          <Select value={filters.status ?? ''} onChange={(e) => setF('status', e.target.value)} className="w-40" aria-label="وضعیت">
            <option value="">همه وضعیت‌ها</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={filters.categoryId ?? ''} onChange={(e) => setF('categoryId', e.target.value)} className="w-44" aria-label="دسته">
            <option value="">همه دسته‌ها</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant={showFilters || activeCount ? 'primary' : 'secondary'} icon={<Filter className="size-4" />} onClick={() => setShowFilters(!showFilters)}>
            فیلتر پیشرفته{activeCount ? ` (${faNum(activeCount)})` : ''}
          </Button>
          {Object.keys(filters).length > 0 && can('AGENT') && <Button variant="ghost" icon={<Bookmark className="size-4" />} onClick={() => setSaveSeg(true)}>ذخیره به‌عنوان بخش</Button>}
          {isFetching && !isLoading && <span className="text-xs text-navy-400">به‌روزرسانی…</span>}
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-navy-100 bg-navy-50/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={filters.source ?? ''} onChange={(e) => setF('source', e.target.value)} aria-label="منبع"><option value="">همه منابع</option>{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select value={filters.campaignId ?? ''} onChange={(e) => setF('campaignId', e.target.value)} aria-label="کمپین"><option value="">همه کمپین‌ها</option><option value="none">بدون کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select value={filters.assigneeId ?? ''} onChange={(e) => setF('assigneeId', e.target.value)} aria-label="کارشناس"><option value="">همه کارشناسان</option><option value="me">سرنخ‌های من</option><option value="none">بدون کارشناس</option>{members?.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select>
            <Select value={filters.city ?? ''} onChange={(e) => setF('city', e.target.value)} aria-label="شهر"><option value="">همه شهرها</option>{cities?.map((c) => <option key={c.city} value={c.city}>{c.city} ({faNum(c.count)})</option>)}</Select>
            <Select value={filters.priority ?? ''} onChange={(e) => setF('priority', e.target.value)} aria-label="اولویت"><option value="">همه اولویت‌ها</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            <Select value={filters.duplicates ?? ''} onChange={(e) => setF('duplicates', e.target.value)} aria-label="تکراری"><option value="">تکراری و غیرتکراری</option><option value="only">فقط تکراری‌ها</option><option value="exclude">بدون تکراری‌ها</option></Select>
            <Input value={filters.tag ?? ''} onChange={(e) => setF('tag', e.target.value)} placeholder="برچسب" aria-label="برچسب" />
            <div />
            <div className="sm:col-span-2"><p className="mb-1 text-xs text-navy-500">از تاریخ ایجاد</p><JalaliDateInput value={filters.from || null} onChange={(v) => setF('from', v)} /></div>
            <div className="sm:col-span-2"><p className="mb-1 text-xs text-navy-500">تا تاریخ</p><JalaliDateInput value={filters.to || null} onChange={(v) => setF('to', v ? new Date(new Date(v).getTime() + 864e5 - 1).toISOString() : null)} /></div>
          </div>
        )}

        {Object.keys(filters).length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-navy-100 px-4 py-2.5">
            {Object.entries(filters).map(([k, v]) => (
              <button key={k} onClick={() => setF(k, null)} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-100">
                {LABELS[k]}: {chipValue(k, v as string)} <X className="size-3" />
              </button>
            ))}
            <button onClick={() => setSp(new URLSearchParams(), { replace: true })} className="text-xs text-navy-400 hover:text-rose-600">پاک کردن همه</button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 bg-brand-50/60 px-4 py-2.5 text-sm">
            <b className="text-brand-700">{faNum(selected.size)} مورد انتخاب شد</b>
            <Button size="sm" variant="secondary" onClick={() => setBulk('update')}>تغییر گروهی</Button>
            {can('MANAGER') && <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setBulk('delete')}>حذف</Button>}
            <button className="text-xs text-navy-500" onClick={() => setSelected(new Set())}>لغو انتخاب</button>
          </div>
        )}

        {error ? <ErrorState error={error} retry={refetch} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-navy-100 text-right text-xs text-navy-400">
                  <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="انتخاب همه" checked={allSel} onChange={toggleAll} className="size-4 accent-brand-600" /></th>
                  {[['fullName', 'مشتری'], ['', 'تماس'], ['status', 'وضعیت'], ['', 'دسته / منبع'], ['city', 'شهر'], ['', 'کارشناس'], ['score', 'امتیاز'], ['createdAt', 'ثبت']].map(([k, l]) => (
                    <th key={l} className="px-3 py-3 font-medium">{k ? <button onClick={() => sortBy(k)} className={cx('inline-flex items-center gap-1 hover:text-navy-700', sort === k && 'text-brand-600')}>{l}<ArrowDownUp className="size-3" /></button> : l}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {isLoading && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={9} className="px-4 py-3"><Skeleton className="h-8" /></td></tr>)}
                {items.map((l) => (
                  <tr key={l.id} className={cx('cursor-pointer transition hover:bg-navy-50/70', selected.has(l.id) && 'bg-brand-50/40')} onClick={() => nav(`/leads/${l.id}`)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="انتخاب" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="size-4 accent-brand-600" /></td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-navy-900">{l.businessName || l.fullName || (l.instagramUsername ? `@${l.instagramUsername}` : '—')}</p>
                      <p className="text-xs text-navy-400">{l.businessName && l.fullName ? l.fullName : ''}{l.isDuplicate && <Badge tone="bg-rose-50 text-rose-600 ring-rose-100" className="mr-1">تکراری</Badge>}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {l.phone && <p className="flex items-center gap-1 text-navy-700"><Phone className="size-3 text-navy-300" /><span className="ltr">{faDigits(l.phone)}</span></p>}
                      {l.instagramUsername && <p className="ltr mt-0.5 flex items-center justify-end gap-1 text-navy-500">@{l.instagramUsername}<Instagram className="size-3 text-pink-500" /></p>}
                    </td>
                    <td className="px-3 py-3"><Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>{l.priority === 'HIGH' && <Badge tone={PRIORITY.HIGH.tone} className="mr-1">فوری</Badge>}</td>
                    <td className="px-3 py-3 text-xs">
                      {l.category ? <span className="inline-flex items-center gap-1.5 text-navy-700"><span className="size-2 rounded-full" style={{ background: l.category.color }} />{l.category.name}</span> : <span className="text-navy-300">—</span>}
                      <p className="mt-0.5 text-navy-400">{SOURCE[l.source]}</p>
                    </td>
                    <td className="px-3 py-3 text-navy-600">{l.city ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-navy-600">{memberName(l.assigneeId) ?? <span className="text-navy-300">—</span>}</td>
                    <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-12 rounded-full bg-navy-100"><div className="h-full rounded-full bg-gold-400" style={{ width: `${l.score}%` }} /></div><span className="num text-xs text-navy-500">{faNum(l.score)}</span></div></td>
                    <td className="px-3 py-3 text-xs text-navy-400">{faAgo(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && !items.length && (
              <Empty title={Object.keys(filters).length ? 'نتیجه‌ای با این فیلترها پیدا نشد' : 'هنوز سرنخی ثبت نکرده‌اید'}
                text={Object.keys(filters).length ? 'فیلترها را تغییر دهید یا پاک کنید.' : 'سرنخ‌ها را دستی ثبت کنید، فایل اکسل وارد کنید یا اینستاگرام را متصل کنید.'}
                action={!Object.keys(filters).length && can('AGENT') && <div className="flex gap-2"><Button onClick={() => setCreating(true)}>ثبت اولین سرنخ</Button><Button variant="secondary" onClick={() => nav('/imports')}>ورود فایل</Button></div>} />
            )}
          </div>
        )}
        {data && data.total > 0 && <Pagination page={page} pageSize={25} total={data.total} onPage={(p) => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n); }} />}
      </Card>

      <LeadForm open={creating} onClose={() => { setCreating(false); if (sp.get('new')) setF('new', null); }} />
      <Confirm open={bulk === 'delete'} onClose={() => setBulk(null)} loading={bulkM.isPending} onConfirm={() => bulkM.mutate({ action: 'delete' })}
        title="حذف گروهی" text={`${faNum(selected.size)} سرنخ و تمام سوابق آن‌ها برای همیشه حذف می‌شود. ادامه می‌دهید؟`} />
      <BulkUpdate open={bulk === 'update'} onClose={() => setBulk(null)} loading={bulkM.isPending} onSubmit={(b) => bulkM.mutate(b)} count={selected.size} />
      <Modal open={saveSeg} onClose={() => setSaveSeg(false)} title="ذخیره فیلتر به‌عنوان بخش مخاطبان"
        footer={<><Button loading={segM.isPending} disabled={!segName.trim()} onClick={() => segM.mutate()}>ذخیره</Button><Button variant="secondary" onClick={() => setSaveSeg(false)}>انصراف</Button></>}>
        <Input autoFocus value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="مثلاً: فروشگاه‌های موبایل تهران" aria-label="نام بخش" />
        <p className="mt-2 text-xs text-navy-400">تعداد اعضای بخش همیشه به‌روز محاسبه می‌شود.</p>
      </Modal>
    </div>
  );
}

function BulkUpdate({ open, onClose, onSubmit, loading, count }: { open: boolean; onClose: () => void; onSubmit: (b: any) => void; loading: boolean; count: number }) {
  const [f, setF] = useState({ status: '', assigneeId: '', categoryId: '', campaignId: '', tag: '' });
  const { data: cats } = useCategories(); const { data: camps } = useCampaigns(); const { data: members } = useMembers();
  useEffect(() => { if (open) setF({ status: '', assigneeId: '', categoryId: '', campaignId: '', tag: '' }); }, [open]);
  const submit = () => {
    if (f.tag) return onSubmit({ action: 'addTag', tag: f.tag });
    const b: any = { action: 'update' };
    for (const k of ['status', 'assigneeId', 'categoryId', 'campaignId'] as const) if (f[k]) b[k] = f[k] === '__none' ? null : f[k];
    onSubmit(b);
  };
  return (
    <Modal open={open} onClose={onClose} title={`تغییر گروهی ${faNum(count)} سرنخ`} footer={<><Button loading={loading} onClick={submit}>اعمال</Button><Button variant="secondary" onClick={onClose}>انصراف</Button></>}>
      <div className="grid gap-3">
        <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="وضعیت"><option value="">وضعیت: بدون تغییر</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })} aria-label="کارشناس"><option value="">کارشناس: بدون تغییر</option><option value="__none">حذف کارشناس</option>{members?.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select>
        <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} aria-label="دسته"><option value="">دسته: بدون تغییر</option><option value="__none">حذف دسته</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })} aria-label="کمپین"><option value="">کمپین: بدون تغییر</option><option value="__none">حذف کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="یا افزودن برچسب (به‌تنهایی اعمال می‌شود)" aria-label="برچسب" />
      </div>
    </Modal>
  );
}
