import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, type TimeSheetRequest } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { formatDate } from '@/lib/utils';
import { dayLabel, hoursLabel, monthLabel, rangeLabel } from '@/lib/timesheet';

type Status = 'ADMIN_PENDING' | 'ADMIN_REJECTED';

const TABS: Array<{ value: Status; label: string }> = [
  { value: 'ADMIN_PENDING', label: 'Pending' },
  { value: 'ADMIN_REJECTED', label: 'Rejected' },
];

/**
 * Approvals → Time Sheet: entries a team member logged over the month's
 * maximum. Approving counts the hours and sends the entry to the client;
 * rejecting needs a reason, which the team member is told.
 */
export function TimeSheetRequests() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status>('ADMIN_PENDING');
  const [rejecting, setRejecting] = useState<TimeSheetRequest | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'timesheet-requests', tab],
    queryFn: () => adminApi.timeSheetRequests(tab),
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      adminApi.decideTimeSheetRequest(v.id, { decision: v.decision, reason: v.reason }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['admin', 'timesheet-requests'] });
      qc.invalidateQueries({ queryKey: ['admin', 'pendingCount'] });
      // Any open Time Sheet picks the change up too.
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setRejecting(null);
      toast.success(v.decision === 'APPROVED' ? 'Approved — sent to the client for approval' : 'Request rejected');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <section className="glass up" style={{ overflow: 'hidden' }}>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center" style={{ borderBottom: '1px solid rgba(var(--w),.06)' }}>
        <div className="segs" role="group" aria-label="Request status">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`seg${tab === t.value ? ' on' : ''}`}
              aria-pressed={tab === t.value}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted text-sm">
          Time a team member logged over a pool's monthly maximum. Approve it to count the hours and send it to the client.
        </p>
      </div>

      {isError ? (
        <div className="p-6">
          <ErrorState onRetry={refetch} />
        </div>
      ) : isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="p-6">
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="Nothing here"
            description={
              tab === 'ADMIN_PENDING'
                ? 'Time Sheet requests over the monthly maximum will appear here for approval.'
                : 'No rejected Time Sheet requests.'
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Work</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>{tab === 'ADMIN_PENDING' ? 'Requested' : 'Rejected'}</TableHead>
                {tab === 'ADMIN_PENDING' && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => {
                const after = r.monthUsed + r.hours;
                const busy = decide.isPending && decide.variables?.id === r.id;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">{r.customerName}</p>
                      <p className="muted text-xs">
                        <span className="mono">{r.clientId}</span> · {r.poolName}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="mono text-xs">{r.requestId}</p>
                      <p className="muted whitespace-nowrap text-xs">{rangeLabel(r.date, r.endDate)}</p>
                      <p className="muted text-xs">{r.taskNumber}</p>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p>{r.description}</p>
                      <p className="muted text-xs">
                        {r.category} · {r.priority} · {r.staff} · by {r.authorName}
                      </p>
                      {r.rejectReason && (
                        <p className="mt-1 text-xs" style={{ color: 'var(--rT)' }}>
                          Reason: {r.rejectReason}
                          {r.decidedBy ? ` — ${r.decidedBy}` : ''}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <p className="font-medium">{monthLabel(r.month)}</p>
                      <p className="muted text-xs">
                        {hoursLabel(r.monthUsed)} used → {hoursLabel(after)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--rT)' }}>
                        {hoursLabel(Math.max(0, after - r.monthlyMax))} over the {r.monthlyMax} h maximum
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.hours.toFixed(2)}</TableCell>
                    <TableCell className="muted whitespace-nowrap text-sm">
                      {tab === 'ADMIN_PENDING' ? formatDate(r.createdAt) : r.decidedAt ? dayLabel(r.decidedAt) : '—'}
                    </TableCell>
                    {tab === 'ADMIN_PENDING' && (
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" disabled={busy} onClick={() => decide.mutate({ id: r.id, decision: 'APPROVED' })}>
                            {busy && decide.variables?.decision === 'APPROVED' ? <Spinner /> : <Check className="mr-1 h-3.5 w-3.5" />}
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(r)}>
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {rejecting && (
        <RejectRequestDialog
          request={rejecting}
          saving={decide.isPending}
          onClose={() => setRejecting(null)}
          onReject={(reason) => decide.mutate({ id: rejecting.id, decision: 'REJECTED', reason })}
        />
      )}
    </section>
  );
}

function RejectRequestDialog({
  request,
  saving,
  onReject,
  onClose,
}: {
  request: TimeSheetRequest;
  saving: boolean;
  onReject: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Reject Time Sheet request</DialogTitle>
          <DialogDescription>
            {request.requestId} — {hoursLabel(request.hours)} by {request.authorName}. The team member sees your reason; the client is not asked.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) onReject(reason.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ts-reject-reason">Why are you rejecting it?</Label>
            <Textarea id="ts-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!reason.trim() || saving}>
              {saving ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
