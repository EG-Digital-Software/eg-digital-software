import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { cn } from '@/lib/utils';
import { NewActivityDot } from '@/components/tasks/NewActivityDot';
import { useClientTaskActivity } from '@/lib/taskSeen';
import { GraphitePortalShell } from '@/components/layout/GraphitePortalShell';

// Account status → label + dot shown in the account menu.
const ACCOUNT_STATUS: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-[#7CE3A6]' },
  ACTIVE_TRIAL: { label: 'Active-Trial', dot: 'bg-[#E2E8F0]' },
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

  return (
    <GraphitePortalShell
      portalName="Customer Portal"
      home="/client/dashboard"
      nav={[
        { to: '/client/dashboard', label: 'Dashboard' },
        { to: '/client/licences', label: 'Products' },
        { to: '/client/invoices', label: 'Invoices' },
        {
          to: '/client/tasks',
          label: 'Tasks',
          extra: tasksDot && <NewActivityDot />,
          lockedReason: suspended
            ? 'Tasks are locked while your account is suspended. Please contact your account manager.'
            : undefined,
        },
        { to: '/client/details', label: 'Company' },
        { to: '/client/agreement', label: 'Agreement' },
      ]}
      menuItems={[{ label: 'My Account', icon: User, to: '/client/account' }]}
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
