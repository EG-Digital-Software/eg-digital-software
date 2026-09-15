import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/types';
import { useAuth } from '@/store/auth';
import { ROLE_HOME } from '@/lib/portal';
import { LoadingBlock } from '@/components/shared/states';

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, initialized } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Restoring session…" />
      </div>
    );
  }

  // Not signed in → always land on the portal chooser (the "main page" with the
  // Admin / Client / Employee options), never a stale protected page.
  // This also means pressing Back after logout keeps returning to the portal.
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // Wrong portal for this role. Rather than dead-end on /forbidden, send the user
  // to their own home — this keeps a valid admin from ever looking "locked out"
  // (e.g. when a read-only client view is active, or after exiting one).
  if (roles && !roles.includes(user.role)) {
    const home = ROLE_HOME[user.role];
    return <Navigate to={home ?? '/forbidden'} replace />;
  }

  return <Outlet />;
}
