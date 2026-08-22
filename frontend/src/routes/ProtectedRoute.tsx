import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/types';
import { useAuth } from '@/store/auth';
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
  // Admin / Client / Supplier / Employee options), never a stale protected page.
  // This also means pressing Back after logout keeps returning to the portal.
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
