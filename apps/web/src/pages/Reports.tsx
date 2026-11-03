import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, ErrorState, Loading, PageHeader, StatCard, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { faDay, faMoney, faNum, faPct, SOURCE } from '../lib/fa';
import { Target, Trophy, Users, Wallet } from 'lucide-react';
import { ChartTip, useDashboard } from './Dashboard';

export default function Reports() {
  const [days, setDays] = useState<'7' | '30' | '90' | '365'>('30');
  const { data, isLoading, error, refetch } = useDashboard(Number(days));
  const { data: camps } = useQuery({ queryKey: ['campaigns'], queryFn: () => api<any[]>('/campaigns') });
  if (error) return <ErrorState error={error} retry={refetch} />;
  if (isLoading || !data) return <Loading />;
  const periodTotal = data.daily.reduce((a: number, d: any) => a + d.count, 0);
  const periodWon = data.daily.reduce((a: number, d: any) => a + d.won, 0);
  const totalBudget = (camps ?? []).reduce((a, c) => a + (c.budget ?? 0), 0);
  const totalCampLeads = (camps ?? []).reduce((a, c) => a + c.leads, 0);
  const axis = { fontSize: 11, fill: '#6378a8', fontFamily: 'Vazirmatn' };

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="گزارش‌ها و تحلیل" subtitle="عملکرد جذب و فروش در بازه انتخابی"
        actions={<Tabs value={days} onChange={setDays} items={[{ value: '7', label: '۷ روز' }, { value: '30', label: '۳۰ روز' }, { value: '90', label: '۹۰ روز' }, { value: '365', label: 'یک سال' }]} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="سرنخ در این بازه" value={faNum(periodTotal)} icon={<Users className="size-5" />} />
        <StatCard label="مشتری شده در این بازه" value={faNum(periodWon)} icon={<Trophy className="size-5" />} tone="emerald" hint={`نرخ تبدیل ${faPct(periodTotal ? +((periodWon / periodTotal) * 100).toFixed(1) : 0)}`} />
        <StatCard label="نرخ واجد شرایط (کل)" value={faPct(data.kpis.qualifiedRate)} icon={<Target className="size-5" />} tone="violet" />
        <StatCard label="میانگین هزینه هر سرنخ" value={totalCampLeads ? faMoney(Math.round(totalBudget / totalCampLeads)) : '—'} icon={<Wallet className="size-5" />} tone="gold" hint="بر اساس بودجه کمپین‌ها" />
      </div>
      <Card>
        <CardHeader title="روند روزانه" />
        <div className="h-80 p-3" dir="ltr">
          <ResponsiveContainer>
            <LineChart data={data.daily} margin={{ left: -20, right: 10, top: 10 }}>
              <CartesianGrid stroke="#e3e9f5" vertical={false} />
              <XAxis dataKey="day" tickFormatter={faDay} reversed tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis orientation="right" allowDecimals={false} tickFormatter={faNum} tick={axis} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip labelFmt={faDay} />} />
              <Legend formatter={(v) => <span style={{ fontFamily: 'Vazirmatn', fontSize: 12 }}>{v}</span>} />
              <Line dataKey="count" name="سرنخ" stroke="#2952e8" strokeWidth={2.5} dot={false} />
              <Line dataKey="won" name="مشتری شده" stroke="#059669" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="شهرهای برتر" />
          <div className="h-72 p-3" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={data.byCity} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="city" orientation="right" width={80} tick={axis} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f2f5fb' }} /><Bar dataKey="count" name="سرنخ" fill="#0b1b3f" radius={8} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="کیفیت منابع جذب" subtitle="تعداد سرنخ به تفکیک منبع" />
          <table className="w-full text-sm">
            <tbody className="divide-y divide-navy-50">
              {data.bySource.sort((a: any, b: any) => b.count - a.count).map((s: any) => (
                <tr key={s.source}><td className="px-5 py-3 text-navy-700">{SOURCE[s.source]}</td><td className="num px-5 py-3 text-left font-bold">{faNum(s.count)}</td><td className="w-1/3 px-5"><div className="h-2 rounded-full bg-navy-50"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.count / Math.max(1, data.kpis.total)) * 100}%` }} /></div></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card>
        <CardHeader title="مقایسه کمپین‌ها" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-navy-100 text-right text-xs text-navy-400">{['کمپین', 'سرنخ', 'واجد شرایط', 'مشتری', 'نرخ تبدیل', 'بودجه', 'هزینه هر سرنخ'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-navy-50">
              {(camps ?? []).map((c) => (
                <tr key={c.id}><td className="px-5 py-3 font-medium">{c.name}</td><td className="num px-5 py-3">{faNum(c.leads)}</td><td className="num px-5 py-3">{faNum(c.qualified)}</td><td className="num px-5 py-3 text-emerald-700">{faNum(c.won)}</td><td className="px-5 py-3">{faPct(c.conversionRate)}</td><td className="px-5 py-3">{faMoney(c.budget)}</td><td className="px-5 py-3">{faMoney(c.costPerLead)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
