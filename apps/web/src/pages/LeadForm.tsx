import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Field, Input, Modal, Select, Textarea } from '../components/ui';
import { ApiError, patch, post } from '../lib/api';
import { PRIORITY, STATUS } from '../lib/fa';
import { useCampaigns, useCategories, useMembers } from '../lib/hooks';

const EMPTY = { fullName: '', businessName: '', instagramUsername: '', phone: '', email: '', city: '', website: '', categoryId: '', campaignId: '', assigneeId: '', status: 'NEW', priority: 'MEDIUM', notes: '', tags: '', consent: false };

export function LeadForm({ open, onClose, lead }: { open: boolean; onClose: () => void; lead?: any }) {
  const [f, setF] = useState<any>(EMPTY);
  const [err, setErr] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: cats } = useCategories();
  const { data: camps } = useCampaigns();
  const { data: members } = useMembers();

  useEffect(() => {
    if (open) { setErr({}); setF(lead ? { ...EMPTY, ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v ?? ''])), tags: (lead.tags ?? []).join('، ') } : EMPTY); }
  }, [open, lead]);

  const m = useMutation({
    mutationFn: () => {
      const body: any = { ...f, tags: String(f.tags).split(/[,،]/).map((t: string) => t.trim()).filter(Boolean) };
      for (const k of ['categoryId', 'campaignId', 'assigneeId']) if (!body[k]) body[k] = null;
      const allowed = ['fullName', 'businessName', 'instagramUsername', 'phone', 'email', 'city', 'website', 'categoryId', 'campaignId', 'assigneeId', 'status', 'priority', 'notes', 'tags', 'consent'];
      const clean = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
      return lead ? patch(`/leads/${lead.id}`, clean) : post('/leads', clean);
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['lead'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (!lead && r.action === 'duplicate') toast.warning('سرنخ ثبت شد اما با یک رکورد قبلی تکراری است', { action: { label: 'مشاهده', onClick: () => nav(`/leads/${r.lead.id}`) } });
      else toast.success(lead ? 'تغییرات ذخیره شد' : 'سرنخ جدید ثبت شد');
      onClose();
    },
    onError: (e: ApiError) => { toast.error(e.message); if (e.errors) setErr(Object.fromEntries(e.errors.map((x) => [x.path, x.message]))); },
  });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <Modal open={open} onClose={onClose} title={lead ? 'ویرایش سرنخ' : 'ثبت سرنخ جدید'} wide
      footer={<><Button loading={m.isPending} onClick={() => m.mutate()}>{lead ? 'ذخیره تغییرات' : 'ثبت سرنخ'}</Button><Button variant="secondary" onClick={onClose}>انصراف</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="نام و نام خانوادگی" error={err.fullName}><Input value={f.fullName} onChange={set('fullName')} autoFocus /></Field>
        <Field label="نام کسب‌وکار" error={err.businessName}><Input value={f.businessName} onChange={set('businessName')} /></Field>
        <Field label="آیدی اینستاگرام" error={err.instagramUsername} hint="بدون @ یا لینک پیج"><Input className="ltr" value={f.instagramUsername} onChange={set('instagramUsername')} placeholder="mobile_shop" /></Field>
        <Field label="شماره تماس" error={err.phone}><Input className="ltr" value={f.phone} onChange={set('phone')} placeholder="0912…" inputMode="tel" /></Field>
        <Field label="ایمیل" error={err.email}><Input className="ltr" value={f.email} onChange={set('email')} type="email" /></Field>
        <Field label="شهر"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="دسته‌بندی">
          <Select value={f.categoryId} onChange={set('categoryId')}><option value="">بدون دسته</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="کمپین">
          <Select value={f.campaignId} onChange={set('campaignId')}><option value="">بدون کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="وضعیت فروش"><Select value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="اولویت"><Select value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="کارشناس مسئول">
          <Select value={f.assigneeId} onChange={set('assigneeId')}><option value="">تعیین نشده</option>{members?.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</Select>
        </Field>
        <Field label="برچسب‌ها" hint="با کاما جدا کنید"><Input value={f.tags} onChange={set('tags')} placeholder="عمده، VIP" /></Field>
        <Field label="وب‌سایت" className="sm:col-span-2"><Input className="ltr" value={f.website} onChange={set('website')} /></Field>
        <Field label="یادداشت" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        <label className="flex items-center gap-2 text-sm text-navy-600 sm:col-span-2">
          <input type="checkbox" checked={!!f.consent} onChange={set('consent')} className="size-4 accent-brand-600" />
          این شخص با دریافت پیام/تماس تجاری موافقت کرده است
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
