import { Navigate, Outlet } from 'react-router-dom';
import { LoadingBlock } from '@/components/shared/states';
import { useStaffAccess, type StaffTab } from '@/lib/staffAccess';

/**
 * Gate for an admin section. The admin always passes; a team member passes only
 * when one of their roles grants `tab`. With no `tab` the section is admin-only
 * (Team, Approvals, Settings). Anyone else is sent back to their team portal.
 */
export function RequireTab({ tab }: { tab?: StaffTab }) {
  const { isAdmin, loading, can } = useStaffAccess();
  if (isAdmin) return <Outlet />;
  if (loading) return <LoadingBlock label="Checking access…" />;
  if (tab && can(tab)) return <Outlet />;
  return <Navigate to="/employee/tasks" replace />;
}

/** /admin index: the admin's dashboard, or a team member's first granted tab. */
export function AdminHome() {
  const { isAdmin, loading, tabs } = useStaffAccess();
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (loading) return <LoadingBlock label="Checking access…" />;
  const first = ['dashboard', 'customers', 'tasks', 'billing', 'products', 'payments', 'reports', 'preview'].find((t) => tabs.has(t));
  return <Navigate to={first ? `/admin/${first}` : '/employee/tasks'} replace />;
}
