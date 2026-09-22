import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '@/store/auth';

/**
 * Fixed bar shown while an admin is viewing a client's portal read-only. Exiting
 * restores the admin session instantly (from the stashed snapshot) and returns
 * to that customer's detail page.
 */
export function ImpersonationBanner() {
  const impersonation = useAuth((s) => s.impersonation);
  const stop = useAuth((s) => s.stopImpersonation);
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!impersonation) return null;

  const exit = () => {
    const { returnTo } = impersonation;
    stop();
    // Drop any impersonated-scope data so the admin UI doesn't show stale queries.
    qc.clear();
    navigate(returnTo, { replace: true });
  };

  const label = impersonation.label || 'this account';
  const mode = impersonation.kind === 'client' ? '— read-only' : '— as this team member';

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-center gap-3 bg-amber-500 px-4 text-sm font-medium text-amber-950 shadow">
      <span className="flex items-center gap-1.5">
        <Eye className="h-4 w-4" />
        Viewing <strong className="font-semibold">{label}</strong>’s portal {mode}
      </span>
      <button
        type="button"
        onClick={exit}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/10 px-2.5 py-1 text-xs font-semibold transition hover:bg-amber-950/20"
      >
        <LogOut className="h-3.5 w-3.5" /> Exit
      </button>
    </div>
  );
}
