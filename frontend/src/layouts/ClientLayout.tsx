import { useQuery } from '@tanstack/react-query';
import { Box, Building2, FileSignature, Home, ListChecks, ReceiptText, User } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { cn } from '@/lib/utils';
import { CLIENT_TASK_SUMMARY_KEY, useClientTaskActivity } from '@/lib/taskSeen';
import { PortalShell } from '@/components/layout/PortalShell';
import { needsSignature } from '@/lib/agreements';

// Account status → label + dot shown in the account menu.
const ACCOUNT_STATUS: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-[#3CB98C]' },
  ACTIVE_TRIAL: { label: 'Active-Trial', dot: 'bg-sky-400' },
  DORMANT: { label: 'Dormant', dot: 'bg-amber-400' },
  SUSPENDED: { label: 'Suspended', dot: 'bg-rose-400' },
};

export function ClientLayout() {
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const acctStatus = profile?.accountStatusEffective ?? profile?.accountStatus;
  const status = (acctStatus && ACCOUNT_STATUS[acctStatus]) ?? undefined;
  // A suspended account loses access to Tasks — the nav item is locked and the
  // page itself refuses to render the board (see ClientTasksPage).
  const suspended = acctStatus === 'SUSPENDED';
  // Red dot on Tasks while any task has activity this user hasn't opened.
  const tasksDot = useClientTaskActivity(!!profile && !suspended);
  const { data: tasks } = useQuery({
    queryKey: CLIENT_TASK_SUMMARY_KEY,
    queryFn: clientApi.taskSummary,
    enabled: !!profile && !suspended,
  });
  const openTasks = tasks?.filter((t) => t.progress !== 'COMPLETED').length ?? 0;
  const toSign = profile?.documents?.filter(needsSignature).length ?? 0;
  const accountName = profile?.companyName?.trim() || profile?.contactPerson?.trim() || undefined;
  const country = profile?.registrationCountry
    ? (new Intl.DisplayNames(['en'], { type: 'region' }).of(profile.registrationCountry) ?? 'Australia')
    : 'Australia';

  return (
    <PortalShell
      portalName="Client Portal"
      home="/client/dashboard"
      assistant
      asidePath="/client/dashboard"
      searchLabel="Search tasks, invoices and agreements"
      menuItems={[{ label: 'My account', icon: User, to: '/client/account' }]}
      crumbRoot={accountName?.replace(/\s+(pty\.?\s+ltd\.?|ltd\.?|limited|inc\.?)$/i, '')}
      accountLine={
        accountName && (
          <>
            <span style={{ color: 'var(--fg)' }}>{accountName}</span>
            {profile?.clientId && (
              <>
                {' · '}
                <span className="mono">{profile.clientId}</span>
              </>
            )}
            {' · '}
            {country}
          </>
        )
      }
      nav={[
        { to: '/client/dashboard', label: 'Overview', icon: Home },
        { to: '/client/licences', label: 'Products', icon: Box },
        { to: '/client/invoices', label: 'Invoices', icon: ReceiptText },
        {
          to: '/client/tasks',
          label: 'Tasks',
          icon: ListChecks,
          count: openTasks,
          activity: tasksDot,
          lockedReason: suspended
            ? 'Tasks are locked while your account is suspended. Please contact your account manager.'
            : undefined,
        },
        { to: '/client/agreement', label: 'Agreements', icon: FileSignature, count: toSign, countTone: 'orange' },
        { to: '/client/details', label: 'Company', icon: Building2 },
      ]}
      menuStatus={
        status && (
          <p className="mt-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span className={cn('h-2 w-2 rounded-full', status.dot)} />
            Account {status.label}
          </p>
        )
      }
    />
  );
}
