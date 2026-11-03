import clsx from 'clsx';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import {
  ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useState,
} from 'react';
import { faDigits, faNum, J_MONTHS, monthLength, toGregorian, toJalali } from '../lib/fa';

export const cx = clsx;

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
  secondary: 'bg-white text-navy-800 ring-1 ring-navy-200 hover:bg-navy-50',
  ghost: 'text-navy-600 hover:bg-navy-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  gold: 'bg-gold-400 text-navy-950 hover:bg-gold-500',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md'; icon?: ReactNode }>(
  ({ variant = 'primary', loading, size = 'md', icon, className, children, disabled, ...p }, ref) => (
    <button ref={ref} disabled={disabled || loading} {...p}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm', variants[variant], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  ));

const fieldCls = 'w-full rounded-xl border-0 bg-white px-3 text-sm text-navy-900 ring-1 ring-navy-200 placeholder:text-navy-300 focus:ring-2 focus:ring-brand-500 outline-none transition disabled:bg-navy-50';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(fieldCls, 'h-10', className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={3} {...p} className={cx(fieldCls, 'py-2 leading-7', className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} {...p} className={cx(fieldCls, 'h-10 pl-8', className)}>{children}</select>);

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="text-xs font-medium text-navy-600">{label}</span>
      {children}
      {error ? <span className="block text-xs text-rose-600">{error}</span> : hint ? <span className="block text-xs text-navy-400">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-2xl bg-white ring-1 ring-navy-100 shadow-card', className)}>{children}</div>;
}
export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-5 py-4">
      <div className="flex items-center gap-3">
        {icon && <div className="grid size-9 place-items-center rounded-xl bg-navy-50 text-navy-600">{icon}</div>}
        <div><h3 className="font-semibold text-navy-900">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-navy-400">{subtitle}</p>}</div>
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = 'bg-navy-100 text-navy-700 ring-navy-200', children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap', tone, className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) { return <Loader2 className={cx('size-5 animate-spin text-brand-500', className)} />; }
export function Loading({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-navy-400"><Spinner />{label}</div>;
}
export function Skeleton({ className }: { className?: string }) { return <div className={cx('animate-pulse rounded-lg bg-navy-100', className)} />; }
export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-navy-50 text-navy-300">{icon ?? <Inbox className="size-7" />}</div>
      <p className="font-semibold text-navy-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm leading-7 text-navy-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-500"><AlertTriangle className="size-6" /></div>
      <p className="text-sm text-navy-700">{(error as Error)?.message ?? 'خطایی رخ داد'}</p>
      {retry && <Button variant="secondary" size="sm" onClick={retry}>تلاش دوباره</Button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('animate-in w-full rounded-2xl bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
          <h2 className="font-bold text-navy-900">{title}</h2>
          <button onClick={onClose} aria-label="بستن" className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"><X className="size-5" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-start gap-2 border-t border-navy-100 bg-navy-50/50 px-5 py-3 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title, text, loading, danger = true }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; text: string; loading?: boolean; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>تأیید</Button><Button variant="secondary" onClick={onClose}>انصراف</Button></>}>
      <p className="text-sm leading-7 text-navy-600">{text}</p>
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-navy-100 px-4 py-3 text-xs text-navy-500">
      <span>{faNum(total)} مورد · صفحه {faNum(page)} از {faNum(pages)}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="صفحه قبل"><ChevronRight className="size-4" /></Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="صفحه بعد"><ChevronLeft className="size-4" /></Button>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, hint, tone = 'navy', loading }: { label: string; value: ReactNode; icon: ReactNode; hint?: ReactNode; tone?: 'navy' | 'brand' | 'gold' | 'emerald' | 'rose' | 'violet'; loading?: boolean }) {
  const tones = { navy: 'bg-navy-900 text-white', brand: 'bg-brand-50 text-brand-600', gold: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600' };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-navy-400">{label}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="num mt-1.5 text-[26px] font-extrabold leading-none text-navy-900">{value}</p>}
          {hint && <p className="mt-2 text-[11px] text-navy-400">{hint}</p>}
        </div>
        <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</div>
      </div>
    </Card>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-navy-100/70 p-1">
      {items.map((i) => (
        <button key={i.value} onClick={() => onChange(i.value)}
          className={cx('rounded-lg px-3 py-1.5 text-sm transition', value === i.value ? 'bg-white font-semibold text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-800')}>
          {i.label}{i.count != null && <span className="mr-1.5 text-xs text-navy-400">{faNum(i.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/** Jalali date (and optional time) picker producing an ISO string. */
export function JalaliDateInput({ value, onChange, withTime, placeholder = 'انتخاب تاریخ' }: { value?: string | null; onChange: (iso: string | null) => void; withTime?: boolean; placeholder?: string }) {
  const d = value ? new Date(value) : null;
  const j = d ? toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()) : null;
  const now = toJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const [time, setTime] = useState(d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '10:00');
  const emit = (jy: number, jm: number, jd: number, t = time) => {
    const g = toGregorian(jy, jm, Math.min(jd, monthLength(jy, jm)));
    const [h, m] = withTime ? t.split(':').map(Number) : [0, 0];
    onChange(new Date(g.gy, g.gm - 1, g.gd, h || 0, m || 0).toISOString());
  };
  const years = Array.from({ length: 8 }, (_, i) => now.jy - 4 + i);
  const cur = j ?? null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" dir="rtl">
      <Select aria-label="روز" className="w-[4.5rem]" value={cur?.jd ?? ''} onChange={(e) => e.target.value ? emit(cur?.jy ?? now.jy, cur?.jm ?? now.jm, +e.target.value) : onChange(null)}>
        <option value="">{cur ? '' : 'روز'}</option>
        {Array.from({ length: monthLength(cur?.jy ?? now.jy, cur?.jm ?? now.jm) }, (_, i) => <option key={i} value={i + 1}>{faDigits(i + 1)}</option>)}
      </Select>
      <Select aria-label="ماه" className="w-28" value={cur?.jm ?? ''} onChange={(e) => e.target.value && emit(cur?.jy ?? now.jy, +e.target.value, cur?.jd ?? 1)}>
        <option value="">{placeholder}</option>
        {J_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select aria-label="سال" className="w-24" value={cur?.jy ?? ''} onChange={(e) => e.target.value && emit(+e.target.value, cur?.jm ?? now.jm, cur?.jd ?? 1)}>
        <option value="">سال</option>
        {years.map((y) => <option key={y} value={y}>{faDigits(y)}</option>)}
      </Select>
      {withTime && <Input type="time" aria-label="ساعت" className="ltr w-28" value={time} onChange={(e) => { setTime(e.target.value); if (cur) emit(cur.jy, cur.jm, cur.jd, e.target.value); }} />}
      {value && <button type="button" onClick={() => onChange(null)} className="text-xs text-navy-400 hover:text-rose-600">پاک کردن</button>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return <div className={cx('h-2 overflow-hidden rounded-full bg-navy-100', className)}><div className="h-full rounded-full bg-gradient-to-l from-brand-500 to-brand-700 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  const n = (name ?? '?').trim();
  const hue = [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <div className={cx('grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white', className)} style={{ background: `hsl(${hue} 55% 42%)` }}>{n.charAt(0)}</div>;
}
