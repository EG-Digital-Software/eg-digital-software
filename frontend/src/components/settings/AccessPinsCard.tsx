import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, KeyRound, RefreshCw, Search } from 'lucide-react';
import { settingsApi, type PinHolder } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingBlock, ErrorState, Spinner } from '@/components/shared/states';
import { cn } from '@/lib/utils';

const TYPES: Record<PinHolder['userType'], { label: string; variant: 'default' | 'secondary' | 'success' }> = {
  SUPER_ADMIN: { label: 'Admin', variant: 'default' },
  EMPLOYEE: { label: 'Team', variant: 'secondary' },
  CLIENT: { label: 'Customer', variant: 'success' },
};
const FILTERS = ['all', 'SUPER_ADMIN', 'EMPLOYEE', 'CLIENT'] as const;
const rowKey = (p: PinHolder) => `${p.userType}:${p.userId}`;

/**
 * Every login's Access Point PIN — admins, team members and customer logins —
 * for the admin. PINs stay hidden until shown; a new PIN can be issued for
 * anyone (their old one stops working straight away).
 */
export function AccessPinsCard() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<(typeof FILTERS)[number]>('all');
  const [showAll, setShowAll] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'access-pins'], queryFn: settingsApi.accessPins });

  const regenerate = useMutation({
    mutationFn: (p: PinHolder) => settingsApi.regenerateAccessPin(p.userType, p.userId),
    onSuccess: (res, p) => {
      qc.setQueryData<PinHolder[]>(['admin', 'access-pins'], (rows) =>
        rows?.map((r) => (rowKey(r) === rowKey(p) ? { ...r, pin: res.pin } : r))
      );
      setShown((s) => new Set(s).add(rowKey(p)));
      toast.success(`New PIN issued for ${p.name}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((p) => type === 'all' || p.userType === type)
      .filter((p) => !q || [p.name, p.email, p.company ?? ''].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => FILTERS.indexOf(a.userType) - FILTERS.indexOf(b.userType) || a.name.localeCompare(b.name));
  }, [data, query, type]);

  const toggle = (k: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <section className="glass up" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid rgba(var(--w),.06)' }}>
        <span className="ico">
          <KeyRound className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>Access PINs</h2>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            Everyone's 6-digit PIN for opening a task's Access Point tab
          </div>
        </div>
      </div>
      <div className="space-y-4" style={{ padding: '20px 22px' }}>
        {isLoading ? (
          <LoadingBlock label="Loading PINs…" />
        ) : isError || !data ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, company…"
                  className="pl-9"
                />
              </div>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setType(f)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    type === f
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                  )}
                >
                  {f === 'all' ? 'All' : TYPES[f].label} ({f === 'all' ? data.length : data.filter((p) => p.userType === f).length})
                </button>
              ))}
              <button type="button" className="btn bg" onClick={() => setShowAll((v) => !v)}>
                {showAll ? <EyeOff /> : <Eye />} {showAll ? 'Hide all' : 'Show all'}
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No one matches.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">PIN</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const k = rowKey(p);
                      const visible = showAll || shown.has(k);
                      const busy = regenerate.isPending && !!regenerate.variables && rowKey(regenerate.variables) === k;
                      return (
                        <tr key={k} className="border-b border-border/60 align-middle last:border-0">
                          <td className="px-2 py-2.5">
                            <div className="font-medium">
                              {p.name}
                              {!p.active && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inactive)</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge variant={TYPES[p.userType].variant}>{TYPES[p.userType].label}</Badge>
                            {p.company && <div className="mt-0.5 text-xs text-muted-foreground">{p.company}</div>}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="font-mono text-base font-semibold tracking-[0.3em]">{visible ? p.pin : '••••••'}</span>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center justify-end gap-2 text-muted-foreground">
                              <button
                                type="button"
                                title={visible ? 'Hide PIN' : 'Show PIN'}
                                onClick={() => toggle(k)}
                                className="transition hover:text-primary"
                              >
                                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                              <button
                                type="button"
                                title="Copy PIN"
                                className="transition hover:text-primary"
                                onClick={() =>
                                  navigator.clipboard?.writeText(p.pin).then(
                                    () => toast.success('PIN copied'),
                                    () => toast.error('Could not copy the PIN')
                                  )
                                }
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title="Issue a new PIN"
                                disabled={regenerate.isPending}
                                className="transition hover:text-primary disabled:opacity-40"
                                onClick={() => {
                                  if (window.confirm(`Issue a new PIN for ${p.name}? Their current PIN will stop working straight away.`)) {
                                    regenerate.mutate(p);
                                  }
                                }}
                              >
                                {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
