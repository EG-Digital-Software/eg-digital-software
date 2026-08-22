import { LayoutDashboard, Users, KeyRound } from 'lucide-react';
import { PortalShell } from '@/components/layout/PortalShell';

export function EmployeeLayout() {
  return (
    <PortalShell
      badge="Employee Portal"
      badgeClass="bg-sky-500/10 text-sky-600"
      home="/employee/dashboard"
      accountPath="/employee/account"
      loginPath="/employee/login"
      nav={[
        { to: '/employee/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/employee/customers', label: 'Customers', icon: Users },
        { to: '/employee/licences', label: 'Licences', icon: KeyRound },
      ]}
    />
  );
}
