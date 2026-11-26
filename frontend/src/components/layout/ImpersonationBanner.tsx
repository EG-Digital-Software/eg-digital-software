import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, FlaskConical, LogOut, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';

/**
 * Fixed bar shown while an admin is viewing a client's portal (read-only or in
 * Edit mode) or a team member's portal. Exiting
 * restores the admin session instantly (from the stashed snapshot) and returns
 * to that customer's detail page.
 */
export function ImpersonationBanner() {
  const impersonation = useAuth((s) => s.impersonation);
  const stop = useAuth((s) => s.stopImpersonation);
  const parents = useAuth((s) => s.parents);
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

  if (impersonation.kind === 'demo') {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-center gap-3 bg-violet-600 px-4 text-sm font-medium text-white shadow">
        <span className="flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4" />
          <strong className="font-semibold">Demo portal</strong>
          <span className="hidden sm:inline">— sample data only, nothing here touches your live portal</span>
        </span>
        <button
          type="button"
          onClick={exit}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/25"
        >
          <LogOut className="h-3.5 w-3.5" /> Exit demo
        </button>
      </div>
    );
  }

  const label = impersonation.label || 'this account';
  const editing = impersonation.kind === 'client' && impersonation.mode === 'edit';
  const inDemo = parents.some((p) => p.impersonation.kind === 'demo');
  const mode =
    impersonation.kind === 'client'
      ? editing
        ? '— edit mode (changes are saved)'
        : '— read-only'
      : '— as this team member';

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-center gap-3 px-4 text-sm font-medium shadow',
        inDemo ? 'bg-violet-600 text-white' : editing ? 'bg-red-600 text-white' : 'bg-amber-500 text-amber-950'
      )}
    >
      <span className="flex items-center gap-1.5">
        {inDemo ? <FlaskConical className="h-4 w-4" /> : editing ? <SquarePen className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {inDemo && <strong className="font-semibold">Demo ·</strong>}
        Viewing <strong className="font-semibold">{label}</strong>’s portal {mode}
      </span>
      <button
        type="button"
        onClick={exit}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition',
          inDemo || editing ? 'bg-white/15 hover:bg-white/25' : 'bg-amber-950/10 hover:bg-amber-950/20'
        )}
      >
        <LogOut className="h-3.5 w-3.5" /> Exit
      </button>
    </div>
  );
}
