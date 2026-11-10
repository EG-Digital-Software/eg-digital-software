import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, RefreshCw } from 'lucide-react';
import { customerApi, type HistoryEvent, type HistoryKind, type HistorySummary } from '@/api/resources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/shared/states';
import { cn, formatDate } from '@/lib/utils';

/** How each kind of event looks in the timeline. */
const KINDS: Record<HistoryKind, { label: string; icon: typeof History; tone: string }> = {
  account: { label: 'Trial & Renewals', icon: RefreshCw, tone: 'bg-primary/10 text-primary' },
};

const STATUS: Record<HistorySummary['status'], { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  ACTIVE_TRIAL: { label: 'Trial', variant: 'warning' },
  DORMANT: { label: 'Dormant', variant: 'muted' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

/**
 * Account History — where the account stands today (trial or active, until
 * when), then a timeline of the account's trial and renewals:
 * when a trial started and how long it ran, and each renewal's length and dates.
 */
export function AccountHistoryTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customer', clientId, 'history'],
    queryFn: () => customerApi.history(clientId),
  });

  if (isLoading) return <LoadingBlock label="Loading account history…" />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const { summary, events } = data;
  const status = STATUS[summary.status];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Current status">
          <Badge variant={status.variant}>{status.label}</Badge>
        </Stat>
        {summary.trialSince ? (
          <Stat label="On trial since">
            {formatDate(summary.trialSince)}{' '}
            <span className="font-normal text-muted-foreground">({summary.trialDays} days so far)</span>
          </Stat>
        ) : (
          <Stat label="Active until">
            {summary.activeUntil ? formatDate(summary.activeUntil) : <span className="font-normal text-muted-foreground">Not renewed yet</span>}
          </Stat>
        )}
        <Stat label="Days left on renewal">
          {summary.daysLeft != null ? (
            <span className={cn(summary.daysLeft <= 7 && 'text-destructive')}>{summary.daysLeft} days</span>
          ) : (
            <span className="font-normal text-muted-foreground">—</span>
          )}
        </Stat>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-[18px] w-[18px] text-primary" /> Account History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!events.length ? (
            <EmptyState
              icon={<History />}
              title="Nothing here yet"
              description="Trials and renewals will appear here."
            />
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-6">
              {events.map((e: HistoryEvent) => {
                const k = KINDS[e.kind];
                const Icon = k.icon;
                return (
                  <li key={e.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[37px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card',
                        k.tone
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {e.link ? (
                          <Link to={e.link} className="hover:text-primary hover:underline">
                            {e.title}
                          </Link>
                        ) : (
                          e.title
                        )}
                      </p>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatDate(e.at)}</span>
                    </div>
                    {e.detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{e.detail}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
