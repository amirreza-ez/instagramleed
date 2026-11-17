// Core screen: find target Instagram pages and work through a daily outreach queue.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink, MessageCircle, Pencil, Plus, Search, Send, SkipForward, Target, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Instagram } from '../components/brand';
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Progress, Select, StatCard, Tabs, Textarea } from '../components/ui';
import { api, del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faNum } from '../lib/fa';
import { useCampaigns, useCategories } from '../lib/hooks';

type Tab = 'queue' | 'find' | 'templates';

export function fillTemplate(body: string, lead: any, org: any) {
  const name = lead.fullName || lead.businessName || (lead.instagramUsername ? `@${lead.instagramUsername}` : 'همکار');
  return body.replace(/\{نام\}/g, name).replace(/\{فروشگاه\}/g, org?.name ?? '').replace(/\{لینک\}/g, org ? `${location.origin}/f/${org.slug}?src=dm` : '');
}

export function waLink(phone: string, text: string) {
  let d = phone.replace(/[^\d]/g, '');
  if (d.startsWith('0')) d = '98' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export default function Prospecting() {
  const [tab, setTab] = useState<Tab>('queue');
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  useEffect(() => {
    const u = sp.get('add');
    if (!u) return;
    setSp({}, { replace: true });
    post('/prospects/bulk', { text: '@' + u }).then((r: any) => { toast.success(r.created ? `@${u} به صف ارتباط اضافه شد` : `@${u} از قبل در صف بود`); qc.invalidateQueries({ queryKey: ['prospect-queue'] }); }).catch((e) => toast.error(e.message));
  }, [sp]); // eslint-disable-line
  return (
    <div className="animate-in space-y-5">
      <PageHeader title="پیج‌یابی و ارتباط" subtitle="پیج‌های هدف را پیدا کنید، به صف ارتباط اضافه کنید و هر روز با پیام آماده به آن‌ها پیام بدهید" />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'queue', label: 'صف ارتباط امروز' }, { value: 'find', label: 'پیدا کردن پیج‌ها' }, { value: 'templates', label: 'پیام‌های آماده' }]} />
      {tab === 'queue' && <Queue onFind={() => setTab('find')} />}
      {tab === 'find' && <Find onDone={() => setTab('queue')} />}
      {tab === 'templates' && <Templates />}
    </div>
  );
}

function Queue({ onFind }: { onFind: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['prospect-queue'], queryFn: () => api('/prospects/queue?limit=20') });
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: () => api<any[]>('/templates') });
  const { data: org } = useQuery({ queryKey: ['org'], queryFn: () => api('/org') });
  const [tplId, setTplId] = useState('');
  useEffect(() => { if (templates?.length && !tplId) setTplId(templates[0].id); }, [templates, tplId]);
  const tpl = templates?.find((t) => t.id === tplId);
  const inv = () => { qc.invalidateQueries({ queryKey: ['prospect-queue'] }); qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const sent = useMutation({ mutationFn: (x: { id: string; channel: string }) => post(`/prospects/${x.id}/sent`, { channel: x.channel, templateTitle: tpl?.title }), onSuccess: () => { toast.success('ثبت شد؛ پیگیری ۲ روز بعد ساخته شد'); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const skip = useMutation({ mutationFn: (id: string) => post(`/prospects/${id}/skip`), onSuccess: inv });

  const open = async (lead: any) => {
    const text = tpl ? fillTemplate(tpl.body, lead, org) : '';
    if (text) await navigator.clipboard.writeText(text).catch(() => undefined);
    window.open(`https://ig.me/m/${lead.instagramUsername}`, '_blank', 'noopener');
    toast.info('متن پیام کپی شد؛ در دایرکت Paste و ارسال کنید، سپس «ارسال شد» را بزنید.');
  };

  const pct = data ? Math.min(100, (data.sentToday / data.dailyLimit) * 100) : 0;
  const over = data && data.sentToday >= data.dailyLimit;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="پیام‌های امروز" value={`${faNum(data?.sentToday ?? 0)} / ${faNum(data?.dailyLimit ?? 25)}`} icon={<Send className="size-5" />} tone="brand" loading={isLoading} hint={<Progress value={pct} className="mt-1 w-28" />} />
        <StatCard label="پیج‌های منتظر پیام" value={faNum(data?.remaining)} icon={<Target className="size-5" />} tone="violet" loading={isLoading} />
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-xs text-navy-400">پیام آماده</p>
          <Select className="mt-2" value={tplId} onChange={(e) => setTplId(e.target.value)} aria-label="قالب پیام">{templates?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>
        </Card>
      </div>
      {over && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">به سقف امن {faNum(data.dailyLimit)} پیام امروز رسیدید. ادامه دادن ممکن است اینستاگرام را به حساب شما مشکوک کند؛ بقیه را فردا بفرستید.</p>}
      <Card>
        <CardHeader title="صف ارتباط" subtitle="روی «باز کردن دایرکت» بزنید؛ متن پیام کپی می‌شود و دایرکت آن پیج باز می‌شود" />
        {!isLoading && !data?.items.length ? (
          <Empty icon={<Target className="size-7" />} title="صف خالی است" text="پیج‌های هدف را از تب «پیدا کردن پیج‌ها» اضافه کنید." action={<Button onClick={onFind}>پیدا کردن پیج‌ها</Button>} />
        ) : (
          <ul className="divide-y divide-navy-50">
            {data?.items.map((l: any) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-white"><Instagram className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <a href={`https://instagram.com/${l.instagramUsername}`} target="_blank" rel="noreferrer noopener" className="ltr inline-flex items-center gap-1 font-semibold text-navy-900 hover:text-brand-600">@{l.instagramUsername}<ExternalLink className="size-3" /></a>
                  <p className="text-xs text-navy-400">{[l.businessName, l.city, l.category?.name].filter(Boolean).join(' · ') || 'بدون اطلاعات بیشتر'}</p>
                </div>
                {can('AGENT') && <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" icon={<Instagram className="size-3.5" />} onClick={() => open(l)}>باز کردن دایرکت</Button>
                  {l.phone && tpl && <Button size="sm" variant="secondary" icon={<MessageCircle className="size-3.5" />} onClick={() => window.open(waLink(l.phone, fillTemplate(tpl.body, l, org)), '_blank')}>واتساپ</Button>}
                  <Button size="sm" variant="secondary" className="!text-emerald-700" icon={<CheckCircle2 className="size-3.5" />} loading={sent.isPending && sent.variables?.id === l.id} onClick={() => sent.mutate({ id: l.id, channel: 'instagram' })}>ارسال شد</Button>
                  <Button size="sm" variant="ghost" aria-label="نامناسب" icon={<SkipForward className="size-3.5" />} onClick={() => skip.mutate(l.id)}>نامناسب</Button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const IDEAS = ['موبایل فروشی', 'لوازم جانبی موبایل', 'قاب گوشی', 'گلس گوشی', 'تعمیرات موبایل', 'فروشگاه موبایل'];

function Find({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: cats } = useCategories();
  const { data: camps } = useCampaigns();
  const [kw, setKw] = useState('موبایل فروشی');
  const [city, setCity] = useState('تهران');
  const [f, setF] = useState({ text: '', categoryId: '', campaignId: '', tags: '' });
  const count = useMemo(() => new Set((f.text.match(/instagram\.com\/[A-Za-z0-9._]+|@[A-Za-z0-9._]+|^[A-Za-z0-9._]{3,30}$/gim) ?? []).map((x) => x.toLowerCase())).size, [f.text]);
  const add = useMutation({
    mutationFn: () => post('/prospects/bulk', { text: f.text, city: city || undefined, categoryId: f.categoryId || null, campaignId: f.campaignId || null, tags: f.tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean) }),
    onSuccess: (r: any) => { toast.success(`${faNum(r.created)} پیج جدید به صف اضافه شد${r.existing ? ` (${faNum(r.existing)} مورد از قبل بود)` : ''}`); setF({ ...f, text: '' }); qc.invalidateQueries({ queryKey: ['prospect-queue'] }); qc.invalidateQueries({ queryKey: ['leads'] }); if (r.created) onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const q = `${kw} ${city}`.trim();
  const searches = [
    ['گوگل: پیج‌های اینستاگرام', `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${kw}" ${city}`)}`],
    ['گوگل: صفحات بیشتر', `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q} عمده OR همکار`)}`],
    ['هشتگ اینستاگرام', `https://www.instagram.com/explore/tags/${encodeURIComponent(kw.replace(/\s+/g, ''))}/`],
    ['جستجوی اینستاگرام', `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`],
  ];
  const bookmarklet = `javascript:(()=>{const u=location.pathname.split('/')[1];if(!location.host.includes('instagram.com')||!u){alert('ابتدا وارد صفحه یک پیج اینستاگرام شوید');return}window.open('${location.origin}/#/prospecting?add='+encodeURIComponent(u),'_blank')})()`;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader title="۱. جستجوی پیج‌های هدف" icon={<Search className="size-4" />} subtitle="نتایج در تب جدید باز می‌شوند؛ لینک یا آیدی پیج‌های مناسب را کپی کنید" />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="کلمه کلیدی"><Input value={kw} onChange={(e) => setKw(e.target.value)} /></Field>
            <Field label="شهر"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-1.5">{IDEAS.map((i) => <button key={i} onClick={() => setKw(i)} className={`rounded-full px-2.5 py-1 text-xs ${kw === i ? 'bg-brand-600 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'}`}>{i}</button>)}</div>
          <div className="grid gap-2 sm:grid-cols-2">{searches.map(([l, u]) => <Button key={l} variant="secondary" icon={<ExternalLink className="size-4" />} onClick={() => window.open(u, '_blank', 'noopener')}>{l}</Button>)}</div>
          <div className="rounded-xl bg-navy-50 p-3 text-xs leading-6 text-navy-600">
            <p className="font-semibold text-navy-800">میان‌بر یک‌کلیکی (کامپیوتر)</p>
            این دکمه را با ماوس به نوار بوکمارک مرورگر بکشید؛ در اینستاگرام روی هر پیجی که بودید، آن را بزنید تا پیج مستقیم به صف اضافه شود:
            <a href={bookmarklet} onClick={(e) => { e.preventDefault(); toast.info('این دکمه را به نوار بوکمارک بکشید'); }} className="mr-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 font-bold text-white">+ افزودن به اعزازی لید</a>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="۲. افزودن به صف ارتباط" icon={<Plus className="size-4" />} subtitle="لینک‌ها، @آیدی‌ها یا هر متنی که آیدی پیج‌ها در آن است را Paste کنید" />
        <div className="space-y-4 p-5">
          <Textarea rows={8} className="ltr" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={'https://instagram.com/mobile_shop\n@accessory.store\ncase_world'} aria-label="لیست پیج‌ها" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="دسته‌بندی"><Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">بدون دسته</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="کمپین"><Select value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })}><option value="">بدون کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="برچسب"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          </div>
          <Button className="w-full" loading={add.isPending} disabled={!f.text.trim()} onClick={() => add.mutate()}>افزودن {count ? `حدود ${faNum(count)} پیج` : ''} به صف</Button>
          <p className="text-xs text-navy-400">شهر «{city || '—'}» برای همه ثبت می‌شود. پیج‌های تکراری خودکار حذف می‌شوند.</p>
        </div>
      </Card>
    </div>
  );
}

function Templates() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data } = useQuery({ queryKey: ['templates'], queryFn: () => api<any[]>('/templates') });
  const [edit, setEdit] = useState<any>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['templates'] });
  const save = useMutation({ mutationFn: () => (edit.id ? patch(`/templates/${edit.id}`, { title: edit.title, body: edit.body }) : post('/templates', { title: edit.title, body: edit.body })), onSuccess: () => { toast.success('ذخیره شد'); setEdit(null); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: (id: string) => del(`/templates/${id}`), onSuccess: inv });
  return (
    <Card>
      <CardHeader title="پیام‌های آماده" subtitle="در متن می‌توانید از {نام}، {فروشگاه} و {لینک} (لینک فرم شما) استفاده کنید" action={can('MANAGER') && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit({ title: '', body: '' })}>پیام جدید</Button>} />
      <ul className="divide-y divide-navy-50">
        {data?.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1"><p className="font-semibold text-navy-800">{t.title}</p><p className="mt-1 whitespace-pre-line text-sm leading-7 text-navy-500">{t.body}</p></div>
            <Button size="sm" variant="ghost" aria-label="کپی" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard.writeText(t.body).then(() => toast.success('کپی شد'))} />
            {can('MANAGER') && <><Button size="sm" variant="ghost" aria-label="ویرایش" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(t)} /><Button size="sm" variant="ghost" aria-label="حذف" className="text-rose-600" icon={<Trash2 className="size-3.5" />} onClick={() => rm.mutate(t.id)} /></>}
          </li>
        ))}
      </ul>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'ویرایش پیام' : 'پیام جدید'} footer={<><Button loading={save.isPending} onClick={() => save.mutate()}>ذخیره</Button><Button variant="secondary" onClick={() => setEdit(null)}>انصراف</Button></>}>
        <div className="space-y-3">
          <Field label="عنوان"><Input value={edit?.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="متن پیام" hint="{نام} {فروشگاه} {لینک}"><Textarea rows={6} value={edit?.body ?? ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
          <Badge>پیام کوتاه و شخصی‌سازی‌شده، جواب بیشتری می‌گیرد</Badge>
        </div>
      </Modal>
    </Card>
  );
}
