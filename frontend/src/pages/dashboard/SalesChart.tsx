import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardApi } from '@/api/resources';
import { Skeleton } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';

const METRICS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'sales', label: 'Sales' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'customers', label: 'Customers' },
];
const RANGES = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
];

// Design palette: brand green line, navy/blue accents.
const BRAND = '#2DB98A';
const AXIS = '#6B7A90';

export function SalesChart() {
  const [metric, setMetric] = useState('revenue');
  const [range, setRange] = useState('30d');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'series', metric, range],
    queryFn: () => dashboardApi.series(metric, range),
  });

  const isMoney = metric === 'revenue' || metric === 'sales';
  const fmt = (v: number) => (isMoney ? formatCurrency(v) : String(v));

  return (
    <section className="glass up" style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '18px 22px',
          borderBottom: '1px solid rgba(var(--w),.06)',
        }}
      >
        <div>
          <div className="eyebrow">Sales analytics</div>
          <h2 className="disp" style={{ margin: '6px 0 0', fontSize: 18 }}>
            {METRICS.find((m) => m.key === metric)?.label} over time
          </h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div className="segs" role="group" aria-label="Metric">
            {METRICS.map((m) => (
              <button key={m.key} type="button" onClick={() => setMetric(m.key)} className={`seg${metric === m.key ? ' on' : ''}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="segs" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button key={r.key} type="button" onClick={() => setRange(r.key)} className={`seg${range === r.key ? ' on' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '18px 22px 20px' }}>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--w),.08)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: AXIS }}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={isMoney ? 64 : 40}
                tick={{ fontSize: 12, fill: AXIS }}
                tickFormatter={(v) => (isMoney ? `$${Number(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` : v)}
              />
              <Tooltip
                cursor={{ stroke: '#5B7FC7', strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #E3E8EF',
                  background: '#FFFFFF',
                  color: '#0F2340',
                  boxShadow: '0 20px 40px -16px rgba(15,35,64,.45)',
                  fontSize: 13,
                }}
                formatter={(v: number) => [fmt(v), METRICS.find((m) => m.key === metric)?.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={BRAND}
                strokeWidth={2.5}
                fill="url(#fill)"
                dot={false}
                activeDot={{ r: 4, fill: '#0F2340', stroke: BRAND, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
