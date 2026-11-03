import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarPlus, Check, Download, ExternalLink, GitMerge, Globe, Mail, MapPin, MessageCircle, Pencil, Phone, ShieldOff, Trash2, Users } from 'lucide-react';
import { Instagram } from '../components/brand';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, CardHeader, Confirm, Empty, ErrorState, Field, Input, JalaliDateInput, Loading, Modal, Select, Textarea, cx } from '../components/ui';
import { api, del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ACTIVITY, faAgo, faDateTime, faDigits, faNum, PRIORITY, SOURCE, STATUS } from '../lib/fa';
import { useMembers } from '../lib/hooks';
import { LeadForm } from './LeadForm';

export function TaskModal({ open, onClose, leadId, task }: { open: boolean; onClose: () => void; leadId?: string; task?: any }) {
  const qc = useQueryClient();
  const { data: members } = useMembers();
  const [f, setF] = useState<any>({});
  const init = () => setF(task ? { ...task } : { title: '', description: '', dueAt: new Date(Date.now() + 864e5).toISOString(), priority: 'MEDIUM', assigneeId: '' });
  const m = useMutation({
    mutationFn: () => {
      const b = { title: f.title, description: f.description || null, dueAt: f.dueAt, priority: f.priority, assigneeId: f.assigneeId || undefined, leadId: leadId ?? f.leadId ?? null };
      return task ? patch(`/tasks/${task.id}`, b) : post('/tasks', b);
    },
    onSuccess: () => { toast.success('پیگیری ذخیره شد'); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['lead'] }); qc.invalidateQueries({ queryKey: ['tasks-due'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => { if (open) init(); }, [open, task]); // eslint-disable-line
  const close = () => onClose();
  return (
    <Modal open={open} onClose={close} title={task ? 'ویرایش پیگیری' : 'ثبت پیگیری / یادآوری'}
      footer={<><Button loading={m.isPending} disabled={!f.title?.trim()} onClick={() => m.mutate()}>ذخیره</Button><Button variant="secondary" onClick={close}>انصراف</Button></>}>
      <div className="space-y-4">
        <Field label="عنوان"><Input autoFocus value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: تماس برای ارسال لیست قیمت" /></Field>
        <Field label="زمان یادآوری"><JalaliDateInput withTime value={f.dueAt} onChange={(v) => setF({ ...f, dueAt: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="اولویت"><Select value={f.priority ?? 'MEDIUM'} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="مسئول"><Select value={f.assigneeId ?? ''} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}><option value="">خودم</option>{members?.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</Select></Field>
        </div>
        <Field label="توضیحات"><Textarea value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: l, isLoading, error, refetch } = useQuery({ queryKey: ['lead', id], queryFn: () => api(`/leads/${id}`) });
  const { data: members } = useMembers();
  const [edit, setEdit] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'erase' | 'merge'>(null);
  const [act, setAct] = useState({ type: 'NOTE', content: '' });
  const [reply, setReply] = useState<{ open: boolean; mode: 'dm' | 'private_reply'; text: string }>({ open: false, mode: 'dm', text: '' });

  const inv = () => { qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const upd = useMutation({ mutationFn: (b: any) => patch(`/leads/${id}`, b), onSuccess: () => { inv(); toast.success('به‌روزرسانی شد'); }, onError: (e: Error) => toast.error(e.message) });
  const addAct = useMutation({ mutationFn: () => post(`/leads/${id}/activities`, act), onSuccess: () => { setAct({ ...act, content: '' }); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const delM = useMutation({ mutationFn: () => del(`/leads/${id}`), onSuccess: () => { toast.success('سرنخ حذف شد'); inv(); nav('/leads'); }, onError: (e: Error) => toast.error(e.message) });
  const eraseM = useMutation({ mutationFn: () => post(`/leads/${id}/erase`), onSuccess: () => { toast.success('اطلاعات شخصی حذف شد'); setConfirm(null); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const mergeM = useMutation({ mutationFn: () => post(`/leads/${l.duplicateOfId}/merge/${id}`), onSuccess: () => { toast.success('در پرونده اصلی ادغام شد'); inv(); nav(`/leads/${l.duplicateOfId}`); }, onError: (e: Error) => toast.error(e.message) });
  const taskDone = useMutation({ mutationFn: (tid: string) => patch(`/tasks/${tid}`, { status: 'DONE' }), onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['tasks'] }); } });
  const replyM = useMutation({ mutationFn: () => post(`/meta/leads/${id}/reply`, { mode: reply.mode, text: reply.text }), onSuccess: () => { toast.success('پیام ارسال شد'); setReply({ ...reply, open: false, text: '' }); inv(); }, onError: (e: Error) => toast.error(e.message) });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const title = l.businessName || l.fullName || (l.instagramUsername ? `@${l.instagramUsername}` : 'بدون نام');
  const cf = l.customFields ?? {};

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(l, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `lead-${l.id}.json` }); a.click();
  };

  return (
    <div className="animate-in space-y-5">
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800"><ArrowRight className="size-4" />بازگشت به فهرست</Link>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-l from-navy-900 via-navy-800 to-brand-700 px-6 py-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={title} className="size-14 text-xl ring-4 ring-white/15" />
              <div>
                <h1 className="text-xl font-extrabold">{title}</h1>
                <p className="mt-1 text-sm text-navy-200">{l.businessName && l.fullName ? l.fullName + ' · ' : ''}{SOURCE[l.source]} · ثبت {faAgo(l.createdAt)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.category && <Badge tone="bg-white/10 text-white ring-white/20"><span className="size-2 rounded-full" style={{ background: l.category.color }} />{l.category.name}</Badge>}
                  {l.tags.map((t: string) => <Badge key={t} tone="bg-white/10 text-white ring-white/20">#{t}</Badge>)}
                  {l.consent && <Badge tone="bg-emerald-400/15 text-emerald-100 ring-emerald-300/30">رضایت ثبت‌شده</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5">
              <div className="text-center"><p className="text-[11px] text-navy-200">امتیاز سرنخ</p><p className="num text-2xl font-extrabold text-gold-400">{faNum(l.score)}</p></div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          {can('AGENT') && <>
            <Select aria-label="وضعیت" value={l.status} onChange={(e) => upd.mutate({ status: e.target.value })} className="w-44">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            <Select aria-label="کارشناس" value={l.assigneeId ?? ''} onChange={(e) => upd.mutate({ assigneeId: e.target.value || null })} className="w-44"><option value="">بدون کارشناس</option>{members?.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select>
            <Select aria-label="اولویت" value={l.priority} onChange={(e) => upd.mutate({ priority: e.target.value })} className="w-32">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>اولویت {v.label}</option>)}</Select>
            <div className="mr-auto flex flex-wrap gap-2">
              <Button variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={() => setTaskOpen(true)}>پیگیری</Button>
              {(cf.igsid || cf.lastCommentId) && <Button variant="secondary" icon={<MessageCircle className="size-4" />} onClick={() => setReply({ open: true, mode: cf.igsid ? 'dm' : 'private_reply', text: '' })}>پاسخ در اینستاگرام</Button>}
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>ویرایش</Button>
              {can('MANAGER') && <Button variant="ghost" className="text-rose-600" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('delete')}>حذف</Button>}
            </div>
          </>}
        </div>
      </Card>

      {l.isDuplicate && l.duplicateOf && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3 text-sm ring-1 ring-amber-200">
          <span className="text-amber-800">این سرنخ با <Link className="font-bold underline" to={`/leads/${l.duplicateOf.id}`}>{l.duplicateOf.businessName || l.duplicateOf.fullName}</Link> تکراری است (شماره، اینستاگرام یا ایمیل مشابه).</span>
          {can('MANAGER') && <Button size="sm" variant="gold" icon={<GitMerge className="size-4" />} onClick={() => setConfirm('merge')}>ادغام در پرونده اصلی</Button>}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="اطلاعات تماس" />
            <dl className="space-y-3.5 p-5 text-sm">
              {[
                [<Phone key="p" className="size-4" />, 'تلفن', l.phone && <a className="ltr text-brand-600" href={`tel:${l.phone}`}>{faDigits(l.phone)}</a>],
                [<Instagram key="i" className="size-4" />, 'اینستاگرام', l.instagramUsername && <a className="ltr inline-flex items-center gap-1 text-brand-600" target="_blank" rel="noreferrer" href={`https://instagram.com/${l.instagramUsername}`}>@{l.instagramUsername}<ExternalLink className="size-3" /></a>],
                [<Mail key="m" className="size-4" />, 'ایمیل', l.email && <a className="ltr text-brand-600" href={`mailto:${l.email}`}>{l.email}</a>],
                [<MapPin key="c" className="size-4" />, 'شهر', l.city],
                [<Globe key="w" className="size-4" />, 'وب‌سایت', l.website && <a className="ltr truncate text-brand-600" target="_blank" rel="noreferrer noopener" href={/^https?:/.test(l.website) ? l.website : `https://${l.website}`}>{l.website}</a>],
                [<Users key="f" className="size-4" />, 'دنبال‌کننده', l.followersCount != null && faNum(l.followersCount)],
              ].map(([icon, label, val], i) => (
                <div key={i} className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-navy-50 text-navy-400">{icon}</span><div className="min-w-0"><dt className="text-[11px] text-navy-400">{label as string}</dt><dd className="truncate text-navy-800">{val || <span className="text-navy-300">—</span>}</dd></div></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="جزئیات" />
            <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
              <div><dt className="text-[11px] text-navy-400">کمپین</dt><dd>{l.campaign?.name ?? '—'}</dd></div>
              <div><dt className="text-[11px] text-navy-400">منبع</dt><dd>{SOURCE[l.source]}</dd></div>
              <div><dt className="text-[11px] text-navy-400">ثبت</dt><dd>{faDateTime(l.createdAt)}</dd></div>
              <div><dt className="text-[11px] text-navy-400">تبدیل به مشتری</dt><dd>{l.convertedAt ? faDateTime(l.convertedAt) : '—'}</dd></div>
              {l.consentSource && <div className="col-span-2"><dt className="text-[11px] text-navy-400">منبع رضایت</dt><dd className="text-xs">{l.consentSource}</dd></div>}
              {l.bio && <div className="col-span-2"><dt className="text-[11px] text-navy-400">بیوگرافی</dt><dd className="whitespace-pre-line text-xs leading-6 text-navy-600">{l.bio}</dd></div>}
              {l.notes && <div className="col-span-2"><dt className="text-[11px] text-navy-400">یادداشت</dt><dd className="whitespace-pre-line text-xs leading-6 text-navy-600">{l.notes}</dd></div>}
            </dl>
          </Card>
          <Card>
            <CardHeader title="حریم خصوصی" subtitle="درخواست‌های دسترسی و حذف اطلاعات" />
            <div className="flex flex-wrap gap-2 p-4">
              <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={exportJson}>خروجی اطلاعات (JSON)</Button>
              {can('ADMIN') && <Button size="sm" variant="ghost" className="text-rose-600" icon={<ShieldOff className="size-3.5" />} onClick={() => setConfirm('erase')}>حذف اطلاعات شخصی</Button>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="پیگیری‌ها" action={can('AGENT') && <Button size="sm" variant="secondary" onClick={() => setTaskOpen(true)}>افزودن</Button>} />
            {l.tasks.length ? (
              <ul className="divide-y divide-navy-50">
                {l.tasks.map((t: any) => {
                  const overdue = t.status === 'OPEN' && t.dueAt && new Date(t.dueAt) < new Date();
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <button disabled={t.status !== 'OPEN' || !can('AGENT')} onClick={() => taskDone.mutate(t.id)} aria-label="انجام شد"
                        className={cx('grid size-6 shrink-0 place-items-center rounded-full ring-1', t.status === 'DONE' ? 'bg-emerald-500 text-white ring-emerald-500' : 'ring-navy-300 hover:bg-emerald-50')}>{t.status === 'DONE' && <Check className="size-3.5" />}</button>
                      <div className="min-w-0 flex-1"><p className={cx('text-sm', t.status === 'DONE' && 'text-navy-400 line-through')}>{t.title}</p>
                        <p className={cx('text-xs', overdue ? 'text-rose-600' : 'text-navy-400')}>{t.dueAt ? faDateTime(t.dueAt) : 'بدون زمان'}{overdue && ' · عقب‌افتاده'}</p></div>
                      <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-5 py-6 text-center text-sm text-navy-400">پیگیری فعالی ندارد.</p>}
          </Card>

          <Card>
            <CardHeader title="تاریخچه و فعالیت‌ها" />
            {can('AGENT') && (
              <div className="border-b border-navy-100 p-4">
                <div className="mb-2 flex gap-1">
                  {['NOTE', 'CALL', 'MESSAGE', 'MEETING'].map((t) => (
                    <button key={t} onClick={() => setAct({ ...act, type: t })} className={cx('rounded-lg px-3 py-1 text-xs', act.type === t ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100')}>{ACTIVITY[t]}</button>
                  ))}
                </div>
                <Textarea value={act.content} onChange={(e) => setAct({ ...act, content: e.target.value })} placeholder="نتیجه تماس، خلاصه گفتگو یا یادداشت…" aria-label="متن فعالیت" />
                <div className="mt-2 flex justify-end"><Button size="sm" loading={addAct.isPending} disabled={!act.content.trim()} onClick={() => addAct.mutate()}>ثبت</Button></div>
              </div>
            )}
            {l.activities.length ? (
              <ol className="relative space-y-0 p-5">
                {l.activities.map((a: any) => (
                  <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                    <span className="absolute right-[7px] top-5 h-full w-px bg-navy-100" />
                    <span className={cx('relative mt-1 size-4 shrink-0 rounded-full ring-4 ring-white', a.type === 'STATUS' ? 'bg-violet-500' : a.type === 'CALL' ? 'bg-emerald-500' : a.type === 'MESSAGE' || a.type === 'COMMENT' ? 'bg-pink-500' : 'bg-brand-500')} />
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line text-sm leading-6 text-navy-800">{a.content}</p>
                      <p className="mt-0.5 text-[11px] text-navy-400">{ACTIVITY[a.type] ?? a.type} · {members?.find((m) => m.userId === a.userId)?.name ?? 'سیستم'} · {faDateTime(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <Empty title="فعالیتی ثبت نشده" />}
          </Card>
        </div>
      </div>

      <LeadForm open={edit} onClose={() => setEdit(false)} lead={l} />
      <TaskModal open={taskOpen} onClose={() => setTaskOpen(false)} leadId={l.id} />
      <Confirm open={confirm === 'delete'} onClose={() => setConfirm(null)} loading={delM.isPending} onConfirm={() => delM.mutate()} title="حذف سرنخ" text="این سرنخ و تمام تاریخچه آن برای همیشه حذف می‌شود." />
      <Confirm open={confirm === 'erase'} onClose={() => setConfirm(null)} loading={eraseM.isPending} onConfirm={() => eraseM.mutate()} title="حذف اطلاعات شخصی" text="نام، شماره، ایمیل، اینستاگرام، یادداشت‌ها و تاریخچه این شخص حذف و رکورد ناشناس می‌شود (برای آمار نگه داشته می‌شود). این کار برگشت‌پذیر نیست." />
      <Confirm open={confirm === 'merge'} danger={false} onClose={() => setConfirm(null)} loading={mergeM.isPending} onConfirm={() => mergeM.mutate()} title="ادغام سرنخ تکراری" text="اطلاعات خالی پرونده اصلی با این سرنخ تکمیل، تاریخچه و پیگیری‌ها منتقل و سپس این رکورد حذف می‌شود." />
      <Modal open={reply.open} onClose={() => setReply({ ...reply, open: false })} title="پاسخ در اینستاگرام"
        footer={<><Button loading={replyM.isPending} disabled={!reply.text.trim()} onClick={() => replyM.mutate()}>ارسال</Button><Button variant="secondary" onClick={() => setReply({ ...reply, open: false })}>انصراف</Button></>}>
        <div className="space-y-3">
          <Select value={reply.mode} onChange={(e) => setReply({ ...reply, mode: e.target.value as any })} aria-label="نوع پاسخ">
            {cf.igsid && <option value="dm">پاسخ در دایرکت (تا ۲۴ ساعت پس از آخرین پیام مشتری)</option>}
            {cf.lastCommentId && <option value="private_reply">پاسخ خصوصی به کامنت (تا ۷ روز، یک‌بار برای هر کامنت)</option>}
          </Select>
          <Textarea rows={4} value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} placeholder="متن پیام…" aria-label="متن پیام" />
          <p className="text-xs leading-6 text-navy-400">طبق قوانین متا، فقط به افرادی می‌توان پیام داد که خودشان با پیج شما در تماس بوده‌اند.</p>
        </div>
      </Modal>
    </div>
  );
}
