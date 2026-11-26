import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Loader2, LogOut, Search, X } from 'lucide-react';
import { adminApi, customerApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import { customerName } from '@/lib/customer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import type { Customer } from '@/types';

type Mode = 'live' | 'demo';
const MIN_CHARS = 3;
const RETURN_TO = '/admin/start';

/** Debounce a fast-changing value (search box). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Clients whose company or trading name has a word starting with the typed
 * keyword ("him" → "The Himalayan"), so a few letters land on that client
 * instead of everything containing those letters. Falls back to any name
 * containing the keyword only when no word starts with it.
 */
function keywordMatches(list: Customer[], keyword: string): Customer[] {
  const k = keyword.toLowerCase();
  const names = (c: Customer) => [c.companyName, c.tradingAs].filter(Boolean).map((n) => n!.toLowerCase());
  const wordStart = list.filter((c) => names(c).some((n) => n.split(/[^a-z0-9]+/).some((w) => w.startsWith(k)) || n.startsWith(k)));
  return (wordStart.length ? wordStart : list).slice(0, 8);
}

/**
 * Admin landing after sign-in: search a client and choose Live or Demo.
 *  • Live, no client picked → the admin portal.
 *  • Live, client picked    → that client's portal in Edit mode.
 *  • Demo                   → the Demo portal (sample data on a separate database).
 */
export default function LauncherPage() {
  const impersonation = useAuth((s) => s.impersonation);
  const startImpersonation = useAuth((s) => s.startImpersonation);
  const logout = useLogout();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('live');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const term = useDebounced(query.trim(), 200);
  const searching = mode === 'live' && !selected && term.length >= MIN_CHARS;

  const { data: results, isFetching } = useQuery({
    queryKey: ['launcher-search', term],
    queryFn: () => customerApi.list({ search: term, nameOnly: 'true', pageSize: 50, status: 'ACTIVE' }),
    enabled: searching,
    staleTime: 15_000,
  });
  const matches = searching ? keywordMatches(results?.items ?? [], term) : [];

  const { data: demo } = useQuery({
    queryKey: ['demo-status'],
    queryFn: adminApi.demoStatus,
    enabled: mode === 'demo',
    staleTime: 60_000,
  });
  const demoBlocked = mode === 'demo' && demo && !demo.available;

  const openClient = useMutation({
    mutationFn: (c: Customer) => customerApi.impersonate(c.clientId, 'edit'),
    onSuccess: (session) => {
      startImpersonation({
        user: session.user,
        accessToken: session.accessToken,
        meta: {
          kind: 'client',
          mode: 'edit',
          label: session.company.companyName || session.company.clientId,
          returnTo: RETURN_TO,
        },
      });
      qc.clear();
      navigate('/client/dashboard');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const openDemo = useMutation({
    mutationFn: adminApi.demoSession,
    onSuccess: (session) => {
      startImpersonation({
        user: session.user,
        accessToken: session.accessToken,
        meta: { kind: 'demo', label: 'Demo portal', returnTo: RETURN_TO },
      });
      qc.clear();
      navigate('/admin/dashboard');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const busy = openClient.isPending || openDemo.isPending;

  // Already inside a view (Demo portal, a client's portal) → back into it.
  if (impersonation) return <Navigate to={impersonation.kind === 'client' ? '/client/dashboard' : '/admin/dashboard'} replace />;

  const choose = (c: Customer) => {
    setSelected(c);
    setQuery(customerName(c));
    setOpen(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery('');
    inputRef.current?.focus();
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (mode === 'demo') {
      if (demoBlocked) return toast.error(demo?.reason ?? 'The demo portal is not ready yet');
      openDemo.mutate();
      return;
    }
    if (selected) return openClient.mutate(selected);
    if (!query.trim()) return navigate('/admin/dashboard');
    if (matches.length === 1) return openClient.mutate(matches[0]);
    if (matches.length > 1) {
      setOpen(true);
      return toast.message('Pick a client from the list');
    }
    if (query.trim().length < MIN_CHARS) return toast.message(`Type at least ${MIN_CHARS} letters to search`);
    toast.error('No client matches that name');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const hint =
    mode === 'demo'
      ? demoBlocked
        ? demo?.reason
        : 'Demo · sample data only — safe to show new clients'
      : selected
        ? `Live · opens ${customerName(selected)}’s portal in edit mode`
        : `Live · type ${MIN_CHARS}+ letters to find a client, or press → for the admin portal`;

  const showList = open && searching && (matches.length > 0 || !isFetching);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-white text-slate-900"
      style={{
        backgroundImage: 'radial-gradient(rgba(15,23,42,0.13) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      {/* Halftone accent, bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 right-0 h-[380px] w-[560px] max-w-full"
        style={{
          backgroundImage: 'radial-gradient(#2BA97F 1.6px, transparent 1.8px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse at 45% 40%, rgba(0,0,0,0.9), transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 45% 40%, rgba(0,0,0,0.9), transparent 70%)',
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-4 py-5 sm:px-7">
        <Logo className="text-[22px]" />
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-[680px] flex-col items-center justify-center px-4 pb-24">
        <img src={brand.icon} alt="" className="h-28 w-auto object-contain sm:h-32" />
        <div aria-hidden className="mt-2 h-1.5 w-16 rounded-full bg-emerald-100 blur-[2px]" />

        <h1 className="mt-6 text-center text-4xl font-bold tracking-tight text-[#0F1D3A] sm:text-[44px]">Welcome back</h1>
        <p className="mt-2 text-center text-[15px] text-slate-500">Search, choose Live or Demo, and go.</p>

        <form onSubmit={submit} className="relative mt-8 w-full" role="search">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.25)] focus-within:border-emerald-300">
            <Search className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setOpen(true);
                setActive(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={onKeyDown}
              disabled={mode === 'demo'}
              placeholder={mode === 'demo' ? 'Demo portal with sample data' : 'Search clients by name'}
              aria-label="Search clients"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded={showList}
              role="combobox"
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
            />
            {selected && mode === 'live' && (
              <button type="button" onClick={clearSelection} aria-label="Clear client" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="flex shrink-0 items-center rounded-full bg-slate-100 p-1" role="radiogroup" aria-label="Portal">
              {(['live', 'demo'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    setMode(m);
                    setOpen(false);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition sm:px-3.5',
                    mode === m ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', m === 'live' ? 'bg-emerald-500' : 'bg-amber-500')} />
                  {m === 'live' ? 'Live' : 'Demo'}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={busy || !!demoBlocked}
              aria-label={mode === 'demo' ? 'Open demo portal' : selected ? 'Open client portal' : 'Open admin portal'}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#1F9D72] text-white shadow-md transition hover:bg-[#1a8862] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            </button>
          </div>

          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
            >
              {matches.length === 0 ? (
                <li className="px-4 py-3 text-sm text-slate-500">No client matches “{term}”</li>
              ) : (
                matches.map((c, i) => (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(c)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-2.5',
                      i === active ? 'bg-emerald-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{customerName(c)}</span>
                      {(c.tradingAs || c.contactPerson) && (
                        <span className="block truncate text-xs text-slate-500">
                          {[c.tradingAs !== c.companyName ? c.tradingAs : null, c.contactPerson].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-slate-400">{c.clientId}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </form>

        <p className={cn('mt-4 text-center text-[13px]', demoBlocked ? 'text-amber-600' : 'text-slate-500')}>
          {isFetching && searching ? 'Searching…' : hint}
        </p>
      </main>
    </div>
  );
}
