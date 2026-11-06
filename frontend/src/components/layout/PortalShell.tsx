import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Lock, LogOut, Moon, Search, Send, Sun, X } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { CLIENT_TASK_SUMMARY_KEY } from '@/lib/taskSeen';
import { needsSignature } from '@/lib/agreements';
import { discountedPrice } from '@/lib/proration';
import { formatCurrency, formatDate, initials, mediaUrl } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import { brand } from '@/config/brand';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { NewActivityDot } from '@/components/tasks/NewActivityDot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClientPortalContext, HOME_TZ, clockTime } from '@/components/client/portalContext';
import '@/components/layout/eloma.css';
import '@/components/client/portal.css';

type Theme = 'light' | 'dark';
const THEME_KEY = 'eg-portal-theme';

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked */
  }
  return 'light'; // the customer portal design is light-first
}

export interface ClientNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  countTone?: 'red' | 'orange';
  activity?: boolean;
  lockedReason?: string;
}

/* ---- Eloma Assistant: answers built from the account data already loaded. ---- */

interface ChatMsg {
  who: 'ai' | 'me';
  text: string;
}

function useAssistantAnswers() {
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const { data: tasks } = useQuery({ queryKey: CLIENT_TASK_SUMMARY_KEY, queryFn: clientApi.taskSummary });
  const { data: products } = useQuery({ queryKey: ['client', 'products'], queryFn: () => clientApi.products() });
  const { data: dash } = useQuery({ queryKey: ['client', 'dashboard'], queryFn: clientApi.dashboard });

  return useMemo(() => {
    const company = profile?.companyName?.trim() || 'your business';
    const toSign = (profile?.documents ?? []).filter(needsSignature);
    const open = (tasks ?? []).filter((t) => t.progress !== 'COMPLETED');
    const ongoing = open.filter((t) => t.progress === 'IN_PROGRESS' || t.progress === 'ONGOING');
    const approved = (products ?? []).filter((p) => !p.pending);
    const net = approved.reduce(
      (s, p) => s + discountedPrice(p) * (p.unitHoursEnabled ? Number(p.unitHours) || 0 : 1),
      0
    );
    const mgr = profile?.accountManager;
    const owed = dash?.outstanding.amount ?? 0;

    const attention = [
      ...toSign.map((d) => `• Sign ${d.fileName.replace(/\.pdf$/i, '')}`),
      ...(dash && dash.overdue.count > 0 ? [`• ${formatCurrency(dash.overdue.amount)} is overdue`] : []),
    ];
    const nextExpiry = approved
      .filter((p) => p.expiryDate && p.daysRemaining != null && p.daysRemaining >= 0)
      .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))[0];

    const answers: Record<string, string> = {
      'What needs my attention today?': attention.length
        ? `${attention.length === 1 ? 'One thing' : `${attention.length} things`}:\n${attention.join('\n')}\n${
            owed > 0 ? '' : 'Nothing is owed. '
          }Everything else is on track.`
        : `Nothing needs you right now. ${ongoing.length} task${ongoing.length === 1 ? ' is' : 's are'} in progress and ${
            owed > 0 ? `${formatCurrency(owed)} is outstanding` : 'nothing is owed'
          }.`,
      'Summarise my plan': approved.length
        ? `You have ${approved.length} active licence${approved.length === 1 ? '' : 's'} (${approved
            .map((p) => p.product)
            .join(', ')}), ${formatCurrency(net)} net.${
            nextExpiry ? ` The next renewal is ${nextExpiry.product} on ${formatDate(nextExpiry.expiryDate)}.` : ''
          }`
        : 'No active licences yet. Open Products → Request a product to send one for approval.',
      'What is in progress?': open.length
        ? `${open.length} open task${open.length === 1 ? '' : 's'}:\n${open
            .slice(0, 6)
            .map((t) => `• ${t.title} (${t.progress === 'NOT_STARTED' ? 'not started' : 'ongoing'})`)
            .join('\n')}`
        : 'There are no open tasks — you’re all caught up.',
      'When will my next invoice arrive?': dash?.invoices
        ? `${dash.invoices} invoice${dash.invoices === 1 ? ' has' : 's have'} been issued. ${
            owed > 0 ? `${formatCurrency(owed)} is outstanding.` : 'Nothing is outstanding.'
          } New invoices go to ${profile?.billingEmail || profile?.contactEmail || 'your accounts email'}${
            profile?.invoicingTerm ? ` with ${profile.invoicingTerm} payment terms` : ''
          }.`
        : `No invoices have been issued yet. When one is, it goes to ${
            profile?.billingEmail || profile?.contactEmail || 'your accounts email'
          }${profile?.invoicingTerm ? ` with ${profile.invoicingTerm} payment terms` : ''}.`,
      [`How can I grow ${company}?`]: `${
        mgr ? `${mgr.firstName} can` : 'Your account manager can'
      } talk you through add-ons like Ad Power, Rank Up or Near Me. Open Products → Request a product to send one for approval.`,
    };
    const fallback = mgr
      ? `I can answer questions about your plan, tasks, agreements and invoices. For anything else, ${mgr.firstName} (${mgr.email}) can help.`
      : 'I can answer questions about your plan, tasks, agreements and invoices. For anything else, contact connect@egeloma.com.au.';

    const keywords: [RegExp, string][] = [
      [/attention|today|sign|urgent|need/i, 'What needs my attention today?'],
      [/plan|licen|product|renew|price/i, 'Summarise my plan'],
      [/task|progress|work|website|who/i, 'What is in progress?'],
      [/invoice|bill|pay|owe|due/i, 'When will my next invoice arrive?'],
      [/grow|add|recommend|more/i, `How can I grow ${company}?`],
    ];
    const answer = (q: string) =>
      answers[q] ?? answers[keywords.find(([re]) => re.test(q))?.[1] ?? ''] ?? fallback;

    return { suggestions: Object.keys(answers), answer };
  }, [profile, tasks, products, dash]);
}

function Assistant({ open, onClose, askRef }: {
  open: boolean;
  onClose: () => void;
  /** Lets the shell ask a question on the page's behalf ("Ask a follow-up"). */
  askRef: React.MutableRefObject<((q: string) => void) | null>;
}) {
  const user = useAuth((s) => s.user);
  const { suggestions, answer } = useAssistantAnswers();
  const [chat, setChat] = useState<ChatMsg[]>(() => [
    {
      who: 'ai',
      text: `Hi${user?.firstName ? ` ${user.firstName}` : ''} — I’m your Eloma assistant. I can see your plan, tasks, agreements and invoices. What would you like to know?`,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const ask = useCallback(
    (q: string) => {
      const text = q.trim();
      if (!text) return;
      setChat((c) => [...c, { who: 'me', text }]);
      setThinking(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setChat((c) => [...c, { who: 'ai', text: answer(text) }]);
        setThinking(false);
      }, 700);
    },
    [answer]
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    askRef.current = ask;
  }, [ask, askRef]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, thinking]);

  if (!open) return null;
  const showSugg = chat.length <= 1 && !thinking;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
    setDraft('');
  };

  return (
    <div className="aib drawer" role="dialog" aria-label="Eloma Assistant">
      <div className="aib-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(var(--w),.07)' }}>
          <div className="orb" aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div className="disp" style={{ fontWeight: 700, fontSize: 16 }}>Eloma Assistant</div>
            <div style={{ fontSize: 11.5, color: 'var(--okT)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="dot" />
              Knows your plan, tasks and agreements
            </div>
          </div>
          <button type="button" className="btn bg" aria-label="Close Eloma Assistant" style={{ width: 40, minHeight: 40, padding: 0 }} onClick={onClose}>
            <X />
          </button>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chat.map((m, i) => (
            <div key={i} className={`msg ${m.who === 'me' ? 'm-me' : 'm-ai'}`}>
              {m.text}
            </div>
          ))}
          {thinking && (
            <div className="msg m-ai typing" aria-label="Eloma Assistant is typing">
              <i />
              <i />
              <i />
            </div>
          )}
          {showSugg && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {suggestions.map((q) => (
                <button key={q} type="button" className="sugg" onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(var(--w),.07)' }}>
          <label style={{ display: 'flex', flex: 1, minWidth: 0 }}>
            <span className="sr">Message Eloma Assistant</span>
            <input className="inp" placeholder="Ask anything about your account…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button type="submit" className="btn bp" aria-label="Send" style={{ width: 44, padding: 0 }}>
            <Send />
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---- Time strip in the breadcrumb bar ---- */

function TimeStrip() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="tstrip">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      Your time <b>{clockTime(undefined, now)}</b>
      {tz !== HOME_TZ && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          Melbourne <b>{clockTime(HOME_TZ, now)}</b>
        </>
      )}
    </div>
  );
}

/* ---- Shell ---- */

export interface PortalMenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
}

/** "Go to…" panel the search bar opens in portals without the assistant. */
function QuickJump({ open, onClose, items }: { open: boolean; onClose: () => void; items: PortalMenuItem[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  if (!open) return null;
  const hits = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const go = (to: string) => {
    navigate(to);
    setQ('');
    onClose();
  };
  return (
    <div className="aib drawer" role="dialog" aria-label="Go to">
      <div className="aib-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(var(--w),.07)' }}>
          <div className="orb" aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div className="disp" style={{ fontWeight: 700, fontSize: 16 }}>Go to</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Jump to any section of the portal</div>
          </div>
          <button type="button" className="btn bg" aria-label="Close" style={{ width: 40, minHeight: 40, padding: 0 }} onClick={onClose}>
            <X />
          </button>
        </div>
        <form
          style={{ padding: 12, borderBottom: '1px solid rgba(var(--w),.07)' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (hits[0]) go(hits[0].to);
          }}
        >
          <label style={{ display: 'flex' }}>
            <span className="sr">Search sections</span>
            <input className="inp" autoFocus placeholder="Type a section name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </form>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hits.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 13 }}>No matching section.</div>}
          {hits.map((i) => (
            <button key={i.to} type="button" className="sugg" style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => go(i.to)}>
              <i.icon className="h-4 w-4" />
              {i.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PortalShell({
  portalName,
  home,
  nav,
  menuItems,
  crumbRoot,
  accountLine,
  menuStatus,
  assistant = false,
  asidePath,
  searchLabel = 'Search sections',
}: {
  /** e.g. "Client Portal" — shown in the footer. */
  portalName: string;
  home: string;
  nav: ClientNavItem[];
  /** Account-menu links shown above Sign out. */
  menuItems: PortalMenuItem[];
  crumbRoot?: string;
  accountLine?: React.ReactNode;
  menuStatus?: React.ReactNode;
  /** Customer portal only: the search bar and centre button open the Eloma Assistant. */
  assistant?: boolean;
  /** Route whose page fills the right-hand column (customer Overview). */
  asidePath?: string;
  searchLabel?: string;
}) {
  const user = useAuth((s) => s.user);
  const impersonating = useAuth((s) => !!s.impersonation);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [aiOpen, setAiOpen] = useState(false);
  const askRef = useRef<((q: string) => void) | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [asideEl, setAsideEl] = useState<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const cl = document.documentElement.classList;
    cl.add('eg-eloma', 'eg-ecp');
    cl.toggle('eg-graphite', theme === 'dark');
    cl.toggle('eg-eloma-dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not persisted */
    }
  }, [theme]);
  useEffect(
    () => () => {
      document.documentElement.classList.remove('eg-eloma', 'eg-eloma-dark', 'eg-graphite', 'eg-ecp');
      clearTimeout(toastTimer.current);
    },
    []
  );
  // ⌘K / Ctrl+K opens the assistant, Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAiOpen(true);
      } else if (e.key === 'Escape') setAiOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ctx = useMemo(
    () => ({
      asideEl,
      openAssistant: (q?: string) => {
        setAiOpen(true);
        if (q) askRef.current?.(q);
      },
      toast: (m: string) => {
        setToastMsg(m);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
      },
    }),
    [asideEl]
  );

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const pageName =
    nav.find((n) => location.pathname.startsWith(n.to))?.label ??
    menuItems.find((m) => location.pathname.startsWith(m.to))?.label ??
    '';
  const hasAside = !!asidePath && location.pathname.startsWith(asidePath);
  const split = Math.floor(nav.length / 2);
  const centreLabel = assistant ? 'Eloma Assistant' : 'Go to';
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  const renderNav = (item: ClientNavItem) => {
    const Icon = item.icon;
    if (item.lockedReason) {
      return (
        <span key={item.to} className="nav locked" title={item.lockedReason} aria-disabled="true">
          <Lock />
          {item.label}
        </span>
      );
    }
    return (
      <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav${isActive ? ' on' : ''}`}>
        <Icon />
        {item.label}
        {!!item.count && <span className={`badge${item.countTone === 'orange' ? ' o' : ''}`}>{item.count}</span>}
        {item.activity && <NewActivityDot className="ping" />}
      </NavLink>
    );
  };

  return (
    <ClientPortalContext.Provider value={ctx}>
      <div className={`ecp${theme === 'light' ? ' light' : ''}${impersonating ? ' pt-10' : ''}`}>
        <ImpersonationBanner />
        <div className="gridbg" aria-hidden="true" />
        <div className="dotglow dg1" aria-hidden="true" />
        <div className="dotglow dg2" aria-hidden="true" />
        <div className="dotwave" aria-hidden="true" />

        {/* Top bar */}
        <header className="ec-head" style={impersonating ? { top: 40 } : undefined}>
          <div className="glass ec-head-in">
            <Link to={home} className="ec-brand" aria-label="Home">
              <img className="logo-d" src={brand.iconLight} alt="" />
              <img className="logo-l" src={brand.icon} alt="" />
              <div>
                <div className="disp nm">EG Eloma</div>
                <div className="by">BY ELOMA GROUP</div>
              </div>
            </Link>
            <button type="button" className="ec-search" onClick={() => setAiOpen((o) => !o)}>
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
              <span style={{ flex: 1 }}>{searchLabel}</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="ec-tools">
              <button
                type="button"
                className="btn bg ec-theme"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                aria-pressed={theme === 'light'}
                style={{ padding: '0 14px' }}
              >
                {theme === 'light' ? <Moon /> : <Sun />}
                <span className="lbl">{theme === 'light' ? 'Dark' : 'Light'}</span>
              </button>
              <div className="ec-bell">
                <NotificationBell />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="ec-avatar focus:outline-none" aria-label={`Account: ${fullName}`}>
                  {user?.avatarUrl ? <img src={mediaUrl(user.avatarUrl)} alt="" /> : initials(user?.firstName, user?.lastName)}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <p className="text-sm font-medium">{fullName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
                    {menuStatus}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {menuItems.map((m) => (
                    <DropdownMenuItem key={m.to} onClick={() => navigate(m.to)}>
                      <m.icon /> {m.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={handleLogout}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="ec-body">
          <main className="ec-main">
            <div className="crumbs">
              <div>
                {crumbRoot && (
                  <>
                    {crumbRoot} <span style={{ opacity: 0.5 }}>/</span>{' '}
                  </>
                )}
                <span style={{ color: 'var(--fg)' }}>{pageName}</span>
              </div>
              <TimeStrip />
              {accountLine && <div>{accountLine}</div>}
            </div>
            <div key={location.pathname} className="ec-view">
              <Outlet />
            </div>
          </main>
          <aside ref={setAsideEl} className={`ec-aside${hasAside ? '' : ' aside-off'}`} style={{ paddingTop: 38 }} />
        </div>

        {assistant ? (
          <Assistant open={aiOpen} onClose={() => setAiOpen(false)} askRef={askRef} />
        ) : (
          <QuickJump open={aiOpen} onClose={() => setAiOpen(false)} items={[...nav.filter((n) => !n.lockedReason), ...menuItems]} />
        )}

        {toastMsg && (
          <div className="toast" role="status">
            {toastMsg}
          </div>
        )}

        {/* Dock */}
        <nav className="dock" aria-label="Portal sections">
          <div className={`dock-in${nav.length > 6 ? ' many' : ''}`}>
            {nav.slice(0, split).map(renderNav)}
            <button
              type="button"
              className={`fab${aiOpen ? ' on' : ''}`}
              onClick={() => setAiOpen((o) => !o)}
              aria-pressed={aiOpen}
              aria-label={centreLabel}
              title={centreLabel}
            >
              <img src={brand.icon} alt="" />
            </button>
            {nav.slice(split).map(renderNav)}
          </div>
        </nav>

        <footer className="foot">
          <span>EG Eloma {portalName} · Eloma Group · Support 1800 054 555 (Australia) · Privacy Act 1988</span>
          <span>
            {user?.email && <>Signed in as {user.email} · </>}Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ')} time ·{' '}
            <button type="button" className="linkbtn" style={{ minHeight: 0 }} onClick={handleLogout}>
              Sign out
            </button>
          </span>
        </footer>
      </div>
    </ClientPortalContext.Provider>
  );
}
