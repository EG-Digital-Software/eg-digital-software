import { useQuery } from '@tanstack/react-query';
import { Building2, FileSignature, Home, ListChecks, Package, Receipt, User } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { cn } from '@/lib/utils';
import { CLIENT_TASK_SUMMARY_KEY, useClientTaskActivity } from '@/lib/taskSeen';
import { ElomaPortalShell } from '@/components/layout/ElomaPortalShell';
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

  return (
    <ElomaPortalShell
      portalName="Client Portal"
      home="/client/dashboard"
      crumbRoot={accountName?.replace(/\s+(pty\.?\s+ltd\.?|ltd\.?|limited|inc\.?)$/i, '')}
      contextRight={
        accountName && (
          <>
            <b>{accountName}</b>
            {profile?.clientId && <span className="el-mono"> · {profile.clientId}</span>}
          </>
        )
      }
      menuItems={[{ label: 'My account', icon: User, to: '/client/account' }]}
      nav={[
        { to: '/client/dashboard', label: 'Overview', icon: Home },
        { to: '/client/licences', label: 'Products', icon: Package },
        { to: '/client/invoices', label: 'Invoices', icon: Receipt },
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
        { to: '/client/agreement', label: 'Agreements', icon: FileSignature, count: toSign, countTone: 'warn' },
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
