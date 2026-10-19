import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { TaskHourProduct, TaskTimeEntry } from '@/types';
import type { TaskApi } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';

const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} hrs`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Form = { customerProductId: string; workDate: string; hours: string; note: string };
const emptyForm = (productId = ''): Form => ({ customerProductId: productId, workDate: today(), hours: '', note: '' });

/**
 * Time Sheet tab: first the hours the customer has bought (with used and
 * remaining hours), then the time logged on this task. Admins and the team log
 * time and change their own entries (admins any entry); clients only view.
 */
export function TimeSheetPanel({ api, taskId, scopeKey }: { api: TaskApi; taskId: string; scopeKey: string }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const isAdmin = me?.role === 'SUPER_ADMIN';
  const canLog = isAdmin || me?.role === 'EMPLOYEE';

  const productsKey = ['task-hour-products', scopeKey, taskId];
  const entriesKey = ['task-time-entries', scopeKey, taskId];
  const productsQ = useQuery({ queryKey: productsKey, queryFn: () => api.hourProducts(taskId), staleTime: 30_000 });
  const entriesQ = useQuery({ queryKey: entriesKey, queryFn: () => api.timeEntries(taskId), staleTime: 30_000 });
  const products = productsQ.data ?? [];
  const entries = entriesQ.data ?? [];

  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: productsKey });
    qc.invalidateQueries({ queryKey: entriesKey });
  };
  const close = () => {
    setForm(null);
    setEditingId(null);
  };

  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { customerProductId: f.customerProductId, workDate: f.workDate, hours: Number(f.hours), note: f.note.trim() || null };
      return editingId ? api.updateTimeEntry(taskId, editingId, body) : api.addTimeEntry(taskId, body);
    },
    onSuccess: () => {
      toast.success(editingId ? 'Time entry updated' : 'Time logged');
      close();
      refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTimeEntry(taskId, id),
    onSuccess: () => {
      toast.success('Time entry deleted');
      refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const canChange = (e: TaskTimeEntry) => canLog && (isAdmin || (e.authorId === me?.id && e.authorType === me?.role));
  const startEdit = (e: TaskTimeEntry) => {
    setEditingId(e.id);
    setForm({
      customerProductId: e.customerProductId ?? '',
      workDate: String(e.workDate).slice(0, 10),
      hours: String(e.hours),
      note: e.note ?? '',
    });
  };
  const submit = () => {
    if (!form) return;
    if (!form.customerProductId) return toast.error('Pick the purchased hours to use');
    if (!form.workDate) return toast.error('Pick a date');
    if (!(Number(form.hours) > 0)) return toast.error('Enter the hours worked');
    save.mutate(form);
  };

  const taskTotal = entries.reduce((n, e) => n + e.hours, 0);

  return (
    <div className="mt-5 space-y-6">
      {/* Purchased hours */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Purchased Hours</h4>
        </div>
        {productsQ.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : productsQ.isError ? (
          <p className="py-8 text-center text-sm text-destructive">Could not load purchased hours.</p>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No hours have been purchased for this client yet.
          </div>
        ) : (
          <HourProductsTable rows={products} />
        )}
      </section>

      {/* Time logged on this task */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">
            Time Log{entries.length > 0 ? ` · ${hrs(taskTotal)} on this task` : ''}
          </h4>
          {canLog && !form && products.length > 0 && (
            <Button type="button" size="sm" onClick={() => setForm(emptyForm(products.length === 1 ? products[0].id : ''))}>
              <Plus className="h-4 w-4" /> Log time
            </Button>
          )}
        </div>

        {form && (
          <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
            <div className="grid gap-3 sm:grid-cols-[150px_1fr_110px]">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Date</span>
                <Input type="date" value={form.workDate} max={today()} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Purchased hours</span>
                <Select value={form.customerProductId} onChange={(e) => setForm({ ...form, customerProductId: e.target.value })}>
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product} — {hrs(p.balanceHours)} left
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Hours</span>
                <Input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.hours}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Note (optional)</span>
              <Input value={form.note} maxLength={1000} placeholder="What was worked on…" onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={close}>
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add entry'}
              </Button>
            </div>
          </div>
        )}

        {entriesQ.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : entriesQ.isError ? (
          <p className="py-6 text-center text-sm text-destructive">Could not load the time log.</p>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No time has been logged on this task yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Product</th>
                  <th className="px-3 py-2.5 text-right font-medium">Hours</th>
                  <th className="px-3 py-2.5 text-left font-medium">Note</th>
                  <th className="px-3 py-2.5 text-left font-medium">Logged by</th>
                  {canLog && <th className="w-20 px-3 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className={cn('border-t border-border', editingId === e.id && 'bg-primary/5')}>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDate(e.workDate)}</td>
                    <td className="px-3 py-2.5">{e.product ?? <span className="text-muted-foreground">Removed product</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{hrs(e.hours)}</td>
                    <td className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-2.5 text-muted-foreground">{e.note || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{e.authorName}</td>
                    {canLog && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        {canChange(e) && (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => startEdit(e)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              disabled={remove.isPending}
                              onClick={() => window.confirm(`Delete this ${hrs(e.hours)} entry?`) && remove.mutate(e.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Each hours product the customer bought, with used and remaining hours. */
function HourProductsTable({ rows }: { rows: TaskHourProduct[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Purchased Date</th>
            <th className="px-3 py-2.5 text-left font-medium">Product</th>
            <th className="px-3 py-2.5 text-right font-medium">Total Hours</th>
            <th className="px-3 py-2.5 text-right font-medium">Total Used</th>
            <th className="px-3 py-2.5 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2.5">{formatDate(r.purchasedAt)}</td>
              <td className="px-3 py-2.5 font-medium">{r.product}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{hrs(r.totalHours)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{hrs(r.usedHours)}</td>
              <td
                className={cn(
                  'whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums',
                  r.balanceHours <= 0 ? 'text-destructive' : 'text-emerald-600'
                )}
              >
                {hrs(r.balanceHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
