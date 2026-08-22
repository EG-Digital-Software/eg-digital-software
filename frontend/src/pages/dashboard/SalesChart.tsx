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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sales Analytics</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {METRICS.find((m) => m.key === metric)?.label} over time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  metric === m.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  range === r.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(243 75% 59%)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(243 75% 59%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'hsl(215 16% 47%)' }}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={isMoney ? 64 : 40}
                tick={{ fontSize: 12, fill: 'hsl(215 16% 47%)' }}
                tickFormatter={(v) => (isMoney ? `$${Number(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` : v)}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(243 75% 59%)', strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid hsl(214 32% 91%)',
                  boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.08)',
                  fontSize: 13,
                }}
                formatter={(v: number) => [fmt(v), METRICS.find((m) => m.key === metric)?.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(243 75% 59%)"
                strokeWidth={2.5}
                fill="url(#fill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
