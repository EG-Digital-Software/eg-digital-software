import { useMemo } from 'react';
import { CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { TaskBucket } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PRIORITY_META, PRIORITY_ORDER, PROGRESS_META, PROGRESS_ORDER, dueState } from '@/lib/tasks';

const PROGRESS_COLORS: Record<string, string> = {
  NOT_STARTED: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#10b981',
};
const PRIORITY_COLORS: Record<string, string> = {
  URGENT: '#f43f5e',
  IMPORTANT: '#f59e0b',
  MEDIUM: '#0ea5e9',
  LOW: '#94a3b8',
};

export function ChartsView({ buckets }: { buckets: TaskBucket[] }) {
  const tasks = useMemo(() => buckets.flatMap((b) => b.tasks), [buckets]);

  const total = tasks.length;
  const completed = tasks.filter((t) => t.progress === 'COMPLETED').length;
  const inProgress = tasks.filter((t) => t.progress === 'IN_PROGRESS').length;
  const overdue = tasks.filter((t) => dueState(t) === 'overdue').length;

  const byProgress = PROGRESS_ORDER.map((p) => ({
    name: PROGRESS_META[p].label,
    key: p,
    value: tasks.filter((t) => t.progress === p).length,
  })).filter((d) => d.value > 0);

  const byPriority = PRIORITY_ORDER.map((p) => ({
    name: PRIORITY_META[p].label,
    key: p,
    value: tasks.filter((t) => t.priority === p).length,
  }));

  const byBucket = buckets.map((b) => ({ name: b.name, value: b.tasks.length }));

  const assigneeCounts = new Map<string, number>();
  for (const t of tasks) for (const a of t.assignees) assigneeCounts.set(a.name, (assigneeCounts.get(a.name) ?? 0) + 1);
  const byAssignee = [...assigneeCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  if (total === 0) {
    return <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">No tasks to chart yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Circle className="h-5 w-5 text-slate-400" />} label="Total tasks" value={total} />
        <Stat icon={<Clock className="h-5 w-5 text-blue-500" />} label="In progress" value={inProgress} />
        <Stat icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Completed" value={completed} sub={total ? `${Math.round((completed / total) * 100)}%` : undefined} />
        <Stat icon={<AlertTriangle className="h-5 w-5 text-rose-500" />} label="Overdue" value={overdue} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">By progress</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byProgress} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {byProgress.map((d) => (
                    <Cell key={d.key} fill={PROGRESS_COLORS[d.key]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <Legend items={byProgress.map((d) => ({ name: d.name, color: PROGRESS_COLORS[d.key], value: d.value }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By priority</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byPriority}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {byPriority.map((d) => (
                    <Cell key={d.key} fill={PRIORITY_COLORS[d.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By bucket</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byBucket}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By assignee</CardTitle></CardHeader>
          <CardContent>
            {byAssignee.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No assignments yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byAssignee} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-secondary p-2">{icon}</div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">{value}</span>
            {sub && <span className="text-xs font-medium text-muted-foreground">{sub}</span>}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ items }: { items: { name: string; color: string; value: number }[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} />
          {i.name} <span className="font-semibold text-foreground">{i.value}</span>
        </span>
      ))}
    </div>
  );
}
