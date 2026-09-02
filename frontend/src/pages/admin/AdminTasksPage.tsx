import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, Building2, Check } from 'lucide-react';
import { customerApi } from '@/api/resources';
import { adminTaskApi } from '@/api/tasks';
import { customerName } from '@/lib/customer';
import { cn, initials } from '@/lib/utils';
import { PageHeader } from '@/components/shared/misc';
import { Input } from '@/components/ui/input';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/shared/states';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { TaskBoard } from '@/components/tasks/TaskBoard';

/**
 * Header-level Task workspace. Tasks live per-customer, so this page lets the
 * admin pick a customer and drives the same board used inside the customer
 * detail page.
 */
export default function AdminTasksPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', 'task-picker'],
    queryFn: () => customerApi.list({ pageSize: 200, sortBy: 'companyName', sortDir: 'asc' }),
  });

  const customers = data?.items ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  // Default to the first customer once the list arrives.
  useEffect(() => {
    if (!selected && customers.length) setSelected(customers[0].clientId);
  }, [customers, selected]);

  if (isLoading) return <LoadingBlock label="Loading customers…" />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (customers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tasks" description="Plan and track work for each customer." />
        <EmptyState title="No customers yet" description="Add a customer first, then plan their tasks here." />
      </div>
    );
  }

  const current = customers.find((c) => c.clientId === selected) ?? customers[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Plan and track work for each customer."
        actions={<CustomerPicker customers={customers} selected={current.clientId} onSelect={setSelected} />}
      />
      {current && <TaskBoard key={current.clientId} api={adminTaskApi(current.clientId)} scopeKey={current.clientId} />}
    </div>
  );
}

interface PickerCustomer {
  clientId: string;
  companyName?: string | null;
  contactPerson?: string | null;
}

function CustomerPicker({
  customers,
  selected,
  onSelect,
}: {
  customers: PickerCustomer[];
  selected: string;
  onSelect: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = customers.find((c) => c.clientId === selected);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter(
      (c) => customerName(c).toLowerCase().includes(s) || c.clientId.toLowerCase().includes(s)
    );
  }, [customers, q]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 min-w-[240px] items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-sm shadow-sm transition hover:border-ring"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left font-medium">{current ? customerName(current) : 'Select customer'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[320px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              placeholder="Search customers"
              className="h-9 pl-8"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</div>}
            {filtered.map((c) => {
              const active = c.clientId === selected;
              return (
                <button
                  key={c.clientId}
                  type="button"
                  onClick={() => { onSelect(c.clientId); setOpen(false); setQ(''); }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-secondary',
                    active && 'bg-secondary'
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px]">{initials(customerName(c))}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{customerName(c)}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.clientId}</div>
                  </div>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
