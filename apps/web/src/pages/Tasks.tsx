import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Select, Tabs, cx } from '../components/ui';
import { api, del, patch, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faDateTime, PRIORITY } from '../lib/fa';
import { useMembers } from '../lib/hooks';
import { TaskModal } from './LeadDetail';

type View = 'today' | 'overdue' | 'open' | 'done';

export default function Tasks() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('today');
  const [assignee, setAssignee] = useState('me');
  const [modal, setModal] = useState<{ open: boolean; task?: any }>({ open: false });
  const { data: members } = useMembers();
  const params = { assigneeId: assignee || undefined, ...(view === 'today' || view === 'overdue' ? { view } : { status: view === 'open' ? 'OPEN' : 'DONE' }) };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['tasks', params], queryFn: () => api<any[]>(`/tasks${qs(params)}`) });
  const inv = () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['tasks-due'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const done = useMutation({ mutationFn: (t: any) => patch(`/tasks/${t.id}`, { status: t.status === 'DONE' ? 'OPEN' : 'DONE' }), onSuccess: inv, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (id: string) => del(`/tasks/${id}`), onSuccess: () => { toast.success('حذف شد'); inv(); } });

  return (
    <div className="animate-in">
      <PageHeader title="پیگیری‌های فروش" subtitle="یادآوری تماس‌ها و کارهای فروش؛ هنگام سررسید اعلان دریافت می‌کنید"
        actions={can('AGENT') && <Button icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>پیگیری جدید</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onChange={setView} items={[{ value: 'today', label: 'امروز و قبل' }, { value: 'overdue', label: 'عقب‌افتاده' }, { value: 'open', label: 'همه باز' }, { value: 'done', label: 'انجام‌شده' }]} />
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-48" aria-label="کارشناس">
          <option value="me">پیگیری‌های من</option><option value="">همه کارشناسان</option>{members?.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </Select>
      </div>
      <Card>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} retry={refetch} /> : !data?.length ? (
          <Empty icon={<CalendarCheck2 className="size-7" />} title="پیگیری‌ای در این بخش نیست" text="همه کارها انجام شده است 👌" />
        ) : (
          <ul className="divide-y divide-navy-50">
            {data.map((t) => {
              const overdue = t.status === 'OPEN' && t.dueAt && new Date(t.dueAt) < new Date();
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <button disabled={!can('AGENT')} onClick={() => done.mutate(t)} aria-label="تغییر وضعیت انجام"
                    className={cx('grid size-6 shrink-0 place-items-center rounded-full ring-1 transition', t.status === 'DONE' ? 'bg-emerald-500 text-white ring-emerald-500' : 'ring-navy-300 hover:bg-emerald-50')}>{t.status === 'DONE' && <Check className="size-3.5" />}</button>
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-medium text-navy-800', t.status === 'DONE' && 'text-navy-400 line-through')}>{t.title}</p>
                    <p className="text-xs text-navy-400">
                      {t.lead && <Link to={`/leads/${t.lead.id}`} className="text-brand-600 hover:underline">{t.lead.businessName || t.lead.fullName || t.lead.instagramUsername}</Link>}
                      {t.lead && ' · '}<span className={overdue ? 'font-semibold text-rose-600' : ''}>{t.dueAt ? faDateTime(t.dueAt) : 'بدون زمان'}</span>
                      {' · '}{members?.find((m) => m.userId === t.assigneeId)?.name}
                    </p>
                  </div>
                  <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                  {can('AGENT') && <><Button size="sm" variant="ghost" aria-label="ویرایش" icon={<Pencil className="size-3.5" />} onClick={() => setModal({ open: true, task: t })} /><Button size="sm" variant="ghost" aria-label="حذف" className="text-rose-600" icon={<Trash2 className="size-3.5" />} onClick={() => remove.mutate(t.id)} /></>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <TaskModal open={modal.open} task={modal.task} leadId={modal.task?.leadId} onClose={() => setModal({ open: false })} />
    </div>
  );
}
