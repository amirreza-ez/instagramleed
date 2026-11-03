import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, CardHeader, Confirm, Field, Input, Loading, Modal, Pagination, Select, Tabs } from '../components/ui';
import { api, apiBase, del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { faAgo, faDateTime, faNum, ROLE, ROLE_RANK } from '../lib/fa';
import { useCategories, useMembers } from '../lib/hooks';

type Tab = 'org' | 'categories' | 'members' | 'api' | 'audit' | 'profile';

function OrgProfile() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['org'], queryFn: () => api('/org') });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const m = useMutation({ mutationFn: () => patch('/org', { name: f.name, businessType: f.businessType, phone: f.phone, city: f.city, website: f.website, instagram: f.instagram }), onSuccess: () => { toast.success('ذخیره شد'); qc.invalidateQueries({ queryKey: ['org'] }); }, onError: (e: Error) => toast.error(e.message) });
  if (!f) return <Loading />;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Card>
      <CardHeader title="پروفایل سازمان" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="نام کسب‌وکار"><Input value={f.name ?? ''} onChange={set('name')} disabled={!can('ADMIN')} /></Field>
        <Field label="نوع فعالیت"><Input value={f.businessType ?? ''} onChange={set('businessType')} disabled={!can('ADMIN')} /></Field>
        <Field label="تلفن"><Input className="ltr" value={f.phone ?? ''} onChange={set('phone')} disabled={!can('ADMIN')} /></Field>
        <Field label="شهر"><Input value={f.city ?? ''} onChange={set('city')} disabled={!can('ADMIN')} /></Field>
        <Field label="وب‌سایت"><Input className="ltr" value={f.website ?? ''} onChange={set('website')} disabled={!can('ADMIN')} /></Field>
        <Field label="اینستاگرام"><Input className="ltr" value={f.instagram ?? ''} onChange={set('instagram')} disabled={!can('ADMIN')} /></Field>
      </div>
      {can('ADMIN') && <div className="border-t border-navy-100 px-5 py-3"><Button loading={m.isPending} onClick={() => m.mutate()}>ذخیره</Button></div>}
    </Card>
  );
}

function Categories() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data } = useCategories();
  const [name, setName] = useState(''); const [color, setColor] = useState('#2952e8');
  const inv = () => qc.invalidateQueries({ queryKey: ['categories'] });
  const add = useMutation({ mutationFn: () => post('/org/categories', { name, color }), onSuccess: () => { setName(''); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const upd = useMutation({ mutationFn: (x: any) => patch(`/org/categories/${x.id}`, x.body), onSuccess: inv, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: (id: string) => del(`/org/categories/${id}`), onSuccess: () => { toast.success('حذف شد'); inv(); } });
  return (
    <Card>
      <CardHeader title="دسته‌بندی مشتریان" subtitle="دسته‌ها قابل ویرایش هستند و در فیلترها، گزارش‌ها و ورود فایل استفاده می‌شوند" />
      <ul className="divide-y divide-navy-50">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
            <input type="color" aria-label="رنگ" value={c.color} disabled={!can('MANAGER')} onChange={(e) => upd.mutate({ id: c.id, body: { color: e.target.value } })} className="size-7 cursor-pointer rounded border-0 bg-transparent" />
            <Input defaultValue={c.name} disabled={!can('MANAGER')} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && upd.mutate({ id: c.id, body: { name: e.target.value.trim() } })} className="max-w-xs" aria-label="نام دسته" />
            <span className="text-xs text-navy-400">{faNum(c.leadCount)} سرنخ</span>
            {can('MANAGER') && <Button size="sm" variant="ghost" className="mr-auto text-rose-600" aria-label="حذف" icon={<Trash2 className="size-3.5" />} onClick={() => rm.mutate(c.id)} />}
          </li>
        ))}
      </ul>
      {can('MANAGER') && (
        <form className="flex items-center gap-2 border-t border-navy-100 px-5 py-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
          <input type="color" aria-label="رنگ" value={color} onChange={(e) => setColor(e.target.value)} className="size-8 rounded border-0 bg-transparent" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام دسته جدید" className="max-w-xs" />
          <Button type="submit" loading={add.isPending} icon={<Plus className="size-4" />}>افزودن</Button>
        </form>
      )}
    </Card>
  );
}

function Members() {
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const { data } = useMembers();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'AGENT' });
  const [rmId, setRmId] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['members'] });
  const add = useMutation({ mutationFn: () => post('/org/members', { ...f, password: f.password || undefined }), onSuccess: (r: any) => { inv(); setOpen(false); if (r.tempPassword) setTemp(r.tempPassword); else toast.success('کاربر اضافه شد'); setF({ name: '', email: '', password: '', role: 'AGENT' }); }, onError: (e: Error) => toast.error(e.message) });
  const role = useMutation({ mutationFn: (x: any) => patch(`/org/members/${x.userId}`, { role: x.role }), onSuccess: () => { toast.success('نقش تغییر کرد'); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: () => del(`/org/members/${rmId}`), onSuccess: () => { toast.success('کاربر حذف شد'); setRmId(null); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const roles = Object.keys(ROLE).filter((r) => r !== 'OWNER' || me?.role === 'OWNER');
  return (
    <Card>
      <CardHeader title="کاربران و دسترسی‌ها" subtitle="مالک و مدیر: همه‌چیز · مدیر فروش: کمپین و حذف · کارشناس: ثبت و پیگیری · فقط مشاهده"
        action={can('ADMIN') && <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>افزودن کاربر</Button>} />
      <ul className="divide-y divide-navy-50">
        {data?.map((u) => (
          <li key={u.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Avatar name={u.name} />
            <div className="min-w-0 flex-1"><p className="font-medium text-navy-800">{u.name} {u.userId === me?.user.id && <Badge>شما</Badge>}</p><p className="ltr text-right text-xs text-navy-400">{u.email}</p></div>
            <span className="text-xs text-navy-400">آخرین ورود: {u.lastLoginAt ? faAgo(u.lastLoginAt) : 'هرگز'}</span>
            {can('ADMIN') && u.userId !== me?.user.id && (u.role !== 'OWNER' || me?.role === 'OWNER') ? (
              <Select aria-label="نقش" value={u.role} onChange={(e) => role.mutate({ userId: u.userId, role: e.target.value })} className="w-36">{roles.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</Select>
            ) : <Badge>{ROLE[u.role]}</Badge>}
            {can('ADMIN') && u.userId !== me?.user.id && <Button size="sm" variant="ghost" className="text-rose-600" aria-label="حذف کاربر" icon={<Trash2 className="size-3.5" />} onClick={() => setRmId(u.userId)} />}
          </li>
        ))}
      </ul>
      <Modal open={open} onClose={() => setOpen(false)} title="افزودن کاربر" footer={<><Button loading={add.isPending} onClick={() => add.mutate()}>افزودن</Button><Button variant="secondary" onClick={() => setOpen(false)}>انصراف</Button></>}>
        <div className="space-y-3">
          <Field label="نام"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="ایمیل"><Input className="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="رمز عبور اولیه" hint="خالی بگذارید تا رمز موقت امن ساخته شود"><Input className="ltr" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="نقش"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</Select></Field>
        </div>
      </Modal>
      <Modal open={!!temp} onClose={() => setTemp(null)} title="رمز موقت کاربر جدید">
        <p className="text-sm text-navy-600">این رمز فقط یک‌بار نمایش داده می‌شود؛ آن را به کاربر بدهید تا پس از ورود تغییرش دهد.</p>
        <div className="mt-3 flex items-center gap-2"><code className="ltr flex-1 rounded-lg bg-navy-50 px-3 py-2 font-mono">{temp}</code><Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard.writeText(temp!)}>کپی</Button></div>
      </Modal>
      <Confirm open={!!rmId} onClose={() => setRmId(null)} loading={rm.isPending} onConfirm={() => rm.mutate()} title="حذف کاربر" text="دسترسی این کاربر به سازمان قطع و سرنخ‌های او بدون کارشناس می‌شوند." />
    </Card>
  );
}

function ApiTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['org'], queryFn: () => api('/org') });
  const rotate = useMutation({ mutationFn: () => post('/org/webhook-key/rotate'), onSuccess: () => { toast.success('کلید جدید ساخته شد'); qc.invalidateQueries({ queryKey: ['org'] }); } });
  const url = `${apiBase() || location.origin}/api/public/leads/${data?.webhookKey ?? '…'}`;
  const sample = `curl -X POST "${url}" -H "Content-Type: application/json" \\\n  -d '{"fullName":"علی رضایی","phone":"09121234567","city":"تهران","consent":true}'`;
  return (
    <Card>
      <CardHeader title="وب‌هوک دریافت سرنخ" subtitle="فرم‌های سایت، Zapier/Make یا هر سامانه دیگری می‌تواند سرنخ را مستقیم ثبت کند" />
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2"><code className="ltr flex-1 truncate rounded-lg bg-navy-50 px-3 py-2 text-xs">{url}</code><Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('کپی شد'))}>کپی</Button></div>
        <pre className="ltr overflow-x-auto rounded-xl bg-navy-950 p-4 text-xs leading-6 text-navy-100">{sample}</pre>
        <p className="text-xs leading-6 text-navy-500">فیلدهای مجاز: fullName، businessName، instagramUsername، phone، email، city، website، notes، tags، consent، consentSource. سرنخ‌های تکراری خودکار ادغام می‌شوند. سقف: ۶۰ درخواست در دقیقه.</p>
        <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={rotate.isPending} onClick={() => rotate.mutate()}>ساخت کلید جدید (کلید قبلی باطل می‌شود)</Button>
      </div>
    </Card>
  );
}

function Audit() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['audit', page], queryFn: () => api(`/org/audit?page=${page}&pageSize=30`) });
  if (!data) return <Loading />;
  return (
    <Card>
      <CardHeader title="گزارش رویدادهای امنیتی و تغییرات" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400">{['زمان', 'کاربر', 'رویداد', 'IP'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-50">
            {data.items.map((a: any) => <tr key={a.id}><td className="px-5 py-2.5 text-xs text-navy-500">{faDateTime(a.createdAt)}</td><td className="px-5 py-2.5">{a.userName ?? '—'}</td><td className="ltr px-5 py-2.5 text-right font-mono text-xs">{a.action}</td><td className="ltr px-5 py-2.5 text-right text-xs text-navy-400">{a.ip ?? ''}</td></tr>)}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={30} total={data.total} onPage={setPage} />
    </Card>
  );
}

function Profile() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const { logout } = useAuth();
  const m = useMutation({ mutationFn: () => post('/auth/change-password', f), onSuccess: () => { toast.success('رمز عبور تغییر کرد؛ دوباره وارد شوید'); setTimeout(logout, 1200); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Card className="max-w-lg">
      <CardHeader title="تغییر رمز عبور" subtitle="پس از تغییر، همه نشست‌های فعال شما خارج می‌شوند" />
      <div className="space-y-3 p-5">
        <Field label="رمز فعلی"><Input className="ltr" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label="رمز جدید" hint="حداقل ۸ کاراکتر"><Input className="ltr" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <Button loading={m.isPending} onClick={() => m.mutate()}>تغییر رمز</Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const isAdmin = ROLE_RANK[me?.role ?? 'VIEWER'] >= ROLE_RANK.ADMIN;
  const items: { value: Tab; label: string }[] = [
    { value: 'org', label: 'سازمان' }, { value: 'categories', label: 'دسته‌بندی‌ها' }, { value: 'members', label: 'کاربران' },
    ...(isAdmin ? [{ value: 'api' as Tab, label: 'وب‌هوک و API' }, { value: 'audit' as Tab, label: 'گزارش رویدادها' }] : []), { value: 'profile', label: 'حساب من' },
  ];
  const tab = (sp.get('tab') as Tab) || 'org';
  return (
    <div className="animate-in space-y-5">
      <h1 className="text-2xl font-extrabold text-navy-900">تنظیمات</h1>
      <div className="overflow-x-auto"><Tabs value={tab} onChange={(v) => setSp({ tab: v })} items={items} /></div>
      {tab === 'org' && <OrgProfile />}
      {tab === 'categories' && <Categories />}
      {tab === 'members' && <Members />}
      {tab === 'api' && isAdmin && <ApiTab />}
      {tab === 'audit' && isAdmin && <Audit />}
      {tab === 'profile' && <Profile />}
    </div>
  );
}
