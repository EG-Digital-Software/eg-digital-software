import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Vault as VaultIcon,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import {
  setVaultKey,
  vaultApi,
  type VaultAccess,
  type VaultEntry,
  type VaultInput,
  type VaultLogRow,
  type VaultSecurityCheck,
} from '@/api/vault';
import { SecurityCheckDialog } from './SecurityCheckDialog';
import { useAuth } from '@/store/auth';

export type VaultPortal = 'admin' | 'team' | 'client';

const IDLE_MS = 10 * 60_000;
/** Refresh the server key at most this often while the user is active. */
const TOUCH_EVERY_MS = 2 * 60_000;
const ALL = '__all__';
const COMPANY = '__company__';

const ACCOUNT_PATH: Record<VaultPortal, string> = {
  admin: '/admin/profile',
  team: '/employee/account',
  client: '/client/account',
};

const errMsg = (e: unknown, fallback = 'Something went wrong') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? `Today ${time}` : `${fmtDate(iso)} ${time}`;
};
const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase();
};

/** Badge label: reuse outranks the stored score. */
const strengthLabel = (e: VaultEntry) => (e.reused ? 'Reused' : e.strength[0] + e.strength.slice(1).toLowerCase());
const isGood = (e: VaultEntry) => e.strength === 'STRONG' && !e.reused;
const badgeClass = (e: VaultEntry) => (isGood(e) ? 'chip c-ok' : e.strength === 'FAIR' && !e.reused ? 'chip c-warn' : 'chip c-red');

const ACTION_TEXT: Record<string, string> = {
  UNLOCKED: 'Unlocked the vault',
  PIN_FAILED: 'Wrong PIN entered',
  REVEALED: 'Password revealed',
  COPIED: 'Password copied',
  ADDED: 'Login added',
  EDITED: 'Login edited',
  ROTATED: 'Password changed',
  DELETED: 'Login deleted',
  SECURITY_CHECK: 'Security check run',
};

const ACCESS_TEXT: Record<VaultAccess, string> = {
  ADMINS: 'Admins only',
  TEAM: 'Whole team',
  PICK: 'Picked people',
};

function generatePassword(len = 20) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const out = sets.map((s) => s[rnd(s.length)]);
  while (out.length < len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

const MASK = '••••••••••';

export function VaultPage({ portal }: { portal: VaultPortal }) {
  const user = useAuth((s) => s.user);
  const myName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : '';
  const impersonating = useAuth((s) => !!s.adminBackup);
  const qc = useQueryClient();

  const [unlocked, setUnlocked] = useState(false);
  const lastTouch = useRef(0);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const lock = useCallback(
    (msg?: string) => {
      setVaultKey(null);
      setUnlocked(false);
      setRevealed({});
      qc.removeQueries({ queryKey: ['vault'] });
      if (msg) toast.message(msg);
    },
    [qc]
  );

  // Re-lock when leaving the page.
  useEffect(() => () => setVaultKey(null), []);

  // Auto-lock after 10 minutes idle; keep the server key fresh while active.
  useEffect(() => {
    if (!unlocked) return;
    let timer = window.setTimeout(() => lock('Vault locked after 10 minutes idle'), IDLE_MS);
    const onActivity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock('Vault locked after 10 minutes idle'), IDLE_MS);
      if (Date.now() - lastTouch.current > TOUCH_EVERY_MS) {
        lastTouch.current = Date.now();
        vaultApi
          .touch()
          .then((r) => setVaultKey(r.key))
          .catch((e) => statusOf(e) === 423 && lock('Vault locked'));
      }
    };
    const evs = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
    evs.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      evs.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [unlocked, lock]);

  const eyebrow =
    portal === 'admin' ? 'EG ELOMA · ADMIN' : portal === 'team' ? 'EG ELOMA · TEAM' : 'YOUR COMPANY';
  const description =
    portal === 'client'
      ? 'Logins for the tools your business runs on, shared securely with your Eloma Group team. Passwords stay hidden until you reveal or copy them, and every reveal is logged.'
      : portal === 'team'
        ? 'Team logins shared with you and the logins of the clients you work on. Passwords stay hidden until you reveal or copy them, and every reveal is logged.'
        : 'Shared team logins for the tools Eloma Group runs on, and every client’s logins. Passwords stay hidden until you reveal or copy them, and every reveal is logged.';

  if (impersonating) {
    return (
      <div className="ec-page">
        <PageHeader eyebrow={eyebrow} title="Password vault" description={description} />
        <section className="glass up" style={{ padding: 24 }}>
          <p className="muted" style={{ margin: 0 }}>
            The vault is not available while viewing a portal as an admin. Use the Vault in your admin portal — it holds
            this client’s logins too.
          </p>
        </section>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="ec-page">
        <PageHeader eyebrow={eyebrow} title="Password vault" description={description} />
        <UnlockCard
          accountPath={ACCOUNT_PATH[portal]}
          onUnlocked={(key) => {
            setVaultKey(key);
            lastTouch.current = Date.now();
            setUnlocked(true);
          }}
        />
      </div>
    );
  }

  return (
    <UnlockedVault
      portal={portal}
      eyebrow={eyebrow}
      description={description}
      myName={myName}
      revealed={revealed}
      setRevealed={setRevealed}
      onLock={() => lock()}
      onLocked={() => lock('Vault locked — enter your PIN again')}
    />
  );
}

/* ─── locked ─────────────────────────────────────────────── */

function UnlockCard({ accountPath, onUnlocked }: { accountPath: string; onUnlocked: (key: string) => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await vaultApi.unlock(pin.trim());
      onUnlocked(r.key);
    } catch (err) {
      setError(errMsg(err, 'Could not unlock the vault'));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="glass up"
      style={{ padding: 28, maxWidth: 520, width: '100%', alignSelf: 'center', boxShadow: 'inset 4px 0 0 var(--brand)' }}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--btn)',
              color: 'var(--btnT)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Lock size={20} />
          </span>
          <div>
            <span className="eyebrow">VAULT LOCKED</span>
            <div style={{ fontSize: 17, fontWeight: 500 }}>Enter your Access Point PIN to open it</div>
          </div>
        </div>
        <label className="muted" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          PIN
          <input
            className="inp mono"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\s/g, ''))}
            placeholder="6-digit PIN"
            style={{ letterSpacing: '0.3em' }}
          />
        </label>
        {error && (
          <p style={{ margin: 0, color: 'var(--rT)', fontSize: 13 }} role="alert">
            {error}
          </p>
        )}
        <button className="btn bp" type="submit" disabled={busy || !pin.trim()}>
          <KeyRound /> {busy ? 'Unlocking…' : 'Unlock vault'}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Your PIN is shown in{' '}
          <Link to={accountPath} style={{ color: 'var(--gT)' }}>
            My Account
          </Link>
          . The vault locks itself after 10 minutes idle, and every unlock is logged.
        </p>
      </form>
    </section>
  );
}

/* ─── unlocked ───────────────────────────────────────────── */

interface UnlockedProps {
  portal: VaultPortal;
  eyebrow: string;
  description: string;
  myName: string;
  revealed: Record<string, string>;
  setRevealed: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onLock: () => void;
  onLocked: () => void;
}

function UnlockedVault({ portal, eyebrow, description, myName, revealed, setRevealed, onLock, onLocked }: UnlockedProps) {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ['vault', 'entries'], queryFn: vaultApi.list, retry: false });
  const metaQ = useQuery({ queryKey: ['vault', 'meta'], queryFn: vaultApi.meta, retry: false });

  useEffect(() => {
    if (statusOf(listQ.error) === 423 || statusOf(metaQ.error) === 423) onLocked();
  }, [listQ.error, metaQ.error, onLocked]);

  const [folder, setFolder] = useState('All');
  const [scope, setScope] = useState(ALL);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<VaultEntry | 'new' | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [check, setCheck] = useState<VaultSecurityCheck | null>(null);
  /** entryId → times the saved password was seen in leaks (from the last check). */
  const pwned = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of check?.passwords ?? []) if (p.pwnedCount) m.set(p.entryId, p.pwnedCount);
    return m;
  }, [check]);

  const items = useMemo(() => listQ.data?.items ?? [], [listQ.data]);
  const perms = listQ.data?.permissions;
  const canAdd = !!perms && (perms.companyEdit || perms.editableCustomers === null || perms.editableCustomers.length > 0);
  const folders = ['All', ...(metaQ.data?.folders ?? [])];

  // Scope picker: Eloma Group's own logins vs each client present in the list.
  const scopeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of items) if (e.customer) m.set(e.customer.id, e.customer.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const hasCompany = items.some((e) => !e.customerId);

  const inScope = useMemo(
    () =>
      items.filter((e) => (scope === ALL ? true : scope === COMPANY ? !e.customerId : e.customerId === scope)),
    [items, scope]
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter(
      (e) =>
        (folder === 'All' || e.folder === folder) &&
        (!q || `${e.name} ${e.username ?? ''} ${e.url ?? ''} ${e.customer?.name ?? ''}`.toLowerCase().includes(q))
    );
  }, [inScope, folder, query]);

  const selected = rows.find((e) => e.id === sel) ?? rows[0] ?? null;

  const stats = useMemo(() => {
    const total = inScope.length;
    const weak = inScope.filter((e) => !isGood(e)).length;
    return {
      total,
      folders: new Set(inScope.map((e) => e.folder)).size,
      strong: total - weak,
      weak,
      rotation: inScope.filter((e) => e.rotationDue).length,
      twofa: inScope.filter((e) => e.twoFactor !== 'Off').length,
    };
  }, [inScope]);

  const onErr = (e: unknown) => (statusOf(e) === 423 ? onLocked() : toast.error(errMsg(e)));

  const toggleReveal = async (e: VaultEntry) => {
    if (revealed[e.id] !== undefined) {
      setRevealed((r) => {
        const n = { ...r };
        delete n[e.id];
        return n;
      });
      return;
    }
    try {
      const r = await vaultApi.reveal(e.id, 'REVEALED');
      setRevealed((p) => ({ ...p, [e.id]: r.password }));
      qc.invalidateQueries({ queryKey: ['vault', 'logs'] });
    } catch (err) {
      onErr(err);
    }
  };

  const copyPassword = async (e: VaultEntry) => {
    try {
      const r = await vaultApi.reveal(e.id, 'COPIED');
      await navigator.clipboard.writeText(r.password);
      setCopied(e.id);
      window.setTimeout(() => setCopied((c) => (c === e.id ? null : c)), 1500);
      qc.invalidateQueries({ queryKey: ['vault', 'logs'] });
    } catch (err) {
      onErr(err);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const health = stats.total
    ? `${stats.strong} of ${stats.total} login${stats.total === 1 ? ' is' : 's are'} strong`
    : 'No logins stored yet';

  return (
    <div className="ec-page">
      <PageHeader
        eyebrow={eyebrow}
        title="Password vault"
        description={description}
        actions={
          <>
            <button className="btn bg" type="button" onClick={() => setShowLog(true)}>
              <History /> Access log
            </button>
            <button className="btn bg" type="button" onClick={onLock}>
              <Lock /> Lock
            </button>
            {canAdd && (
              <button className="btn bp" type="button" onClick={() => setEditing('new')}>
                <Plus /> Add login
              </button>
            )}
          </>
        }
      />

      <div className="crumbs up" style={{ margin: 0 }}>
        <span>
          Vault auto-locks after <b style={{ color: 'var(--fg)' }}>10 min</b> idle · Unlocked by{' '}
          <b style={{ color: 'var(--fg)' }}>{myName}</b>
        </span>
        <span>Encrypted at rest · every reveal and copy is logged</span>
      </div>

      {/* Vault health */}
      <section
        className="glass up"
        style={{
          padding: '20px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: 'inset 4px 0 0 var(--brand)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--btn)',
              color: 'var(--btnT)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <ShieldCheck size={20} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="eyebrow">VAULT HEALTH</span>
            <span style={{ fontSize: 16 }}>
              <span style={{ color: 'var(--okT)', fontWeight: 500 }}>{health}</span>
              {stats.total > 0 && (
                <>
                  ,{' '}
                  <span style={{ color: stats.weak ? 'var(--wT)' : 'var(--mu)', fontWeight: 500 }}>
                    {stats.weak} {stats.weak === 1 ? 'is' : 'are'} weak or reused
                  </span>{' '}
                  and {stats.rotation} {stats.rotation === 1 ? 'is' : 'are'} due for a 90-day rotation.
                </>
              )}
            </span>
          </div>
        </div>
        <button
          className="btn bg"
          type="button"
          onClick={() => setShowCheck(true)}
        >
          <RefreshCw /> Run security check
        </button>
      </section>

      {/* Stats */}
      <div className="up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <Stat label="STORED LOGINS" value={String(stats.total)} sub={`Across ${stats.folders} folder${stats.folders === 1 ? '' : 's'}`} />
        <Stat
          label="WEAK OR REUSED"
          value={String(stats.weak)}
          tone={stats.weak ? 'var(--wT)' : undefined}
          sub={stats.weak ? 'Change these first' : 'Nothing to fix'}
        />
        <Stat label="ROTATION DUE" value={String(stats.rotation)} sub="Older than 90 days" />
        <Stat
          label="2FA ENABLED"
          value={`${stats.twofa} / ${stats.total}`}
          tone={stats.total && stats.twofa === stats.total ? 'var(--okT)' : undefined}
          sub={stats.total - stats.twofa ? `${stats.total - stats.twofa} without 2FA` : 'All covered'}
        />
      </div>

      {/* List + detail */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section
          className="glass up"
          style={{ flex: '999 1 600px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="eyebrow">{portal === 'client' ? 'COMPANY LOGINS' : 'LOGINS'}</span>
              <span style={{ fontSize: 18, fontWeight: 500 }}>
                {rows.length} login{rows.length === 1 ? '' : 's'}
                {folder !== 'All' && ` in ${folder}`}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: '0 1 520px' }}>
              {portal !== 'client' && (scopeOptions.length > 0 || hasCompany) && (
                <select
                  className="inp"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  aria-label="Whose logins"
                  style={{ flex: '1 1 180px' }}
                >
                  <option value={ALL}>All logins</option>
                  {hasCompany && <option value={COMPANY}>Eloma Group</option>}
                  {scopeOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              <label
                className="inp"
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px', cursor: 'text' }}
              >
                <Search size={16} className="muted" />
                <span className="sr-only">Search logins</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search service or username"
                  style={{ border: 0, background: 'transparent', outline: 'none', color: 'inherit', width: '100%', font: 'inherit' }}
                />
              </label>
            </div>
          </div>

          <div className="segs" style={{ alignSelf: 'flex-start' }}>
            {folders.map((f) => (
              <button key={f} type="button" className={`seg${folder === f ? ' on' : ''}`} onClick={() => setFolder(f)}>
                {f}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 680, display: 'flex', flexDirection: 'column' }}>
              <div
                className="muted"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1.7fr 0.9fr 1fr',
                  gap: 12,
                  padding: '10px 12px',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  borderBottom: '1px solid rgba(var(--w), 0.1)',
                }}
              >
                <span>SERVICE</span>
                <span>USERNAME</span>
                <span>PASSWORD</span>
                <span>STRENGTH</span>
                <span>CHANGED</span>
              </div>
              {listQ.isLoading ? (
                <div className="skel" style={{ height: 160, marginTop: 10 }} />
              ) : listQ.isError && statusOf(listQ.error) !== 423 ? (
                <div className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
                  {errMsg(listQ.error, 'Could not load the vault')}{' '}
                  <button type="button" className="linkbtn" onClick={() => listQ.refetch()}>
                    Try again
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="muted" style={{ padding: '32px 12px', textAlign: 'center', fontSize: 14 }}>
                  {items.length === 0
                    ? canAdd
                      ? 'No logins yet. Use “Add login” to store the first one.'
                      : 'No logins have been shared with you yet.'
                    : 'No logins match. Try another folder or search.'}
                </div>
              ) : (
                rows.map((e) => {
                  const on = selected?.id === e.id;
                  const pwd = revealed[e.id];
                  return (
                    <div
                      key={e.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 2fr 1.7fr 0.9fr 1fr',
                        gap: 12,
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderBottom: '1px solid rgba(var(--w), 0.06)',
                        borderRadius: 10,
                        background: on ? 'var(--onBg)' : 'transparent',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSel(e.id)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          minHeight: 44,
                          minWidth: 0,
                        }}
                      >
                        <Monogram text={initialsOf(e.name)} />
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.name}
                          </span>
                          <span className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {portal !== 'client' ? `${e.customer?.name ?? 'Eloma Group'} · ${e.folder}` : e.folder}
                          </span>
                        </span>
                      </button>
                      <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.username || <span className="muted">—</span>}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                        <span
                          className="mono"
                          style={{ fontSize: 13, minWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {pwd ?? MASK}
                        </span>
                        <IconBtn label={pwd !== undefined ? 'Hide password' : 'Show password'} onClick={() => toggleReveal(e)}>
                          {pwd !== undefined ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconBtn>
                        <IconBtn label="Copy password" onClick={() => copyPassword(e)}>
                          <Copy size={16} />
                        </IconBtn>
                        {copied === e.id && <span style={{ fontSize: 12, color: 'var(--okT)' }}>Copied</span>}
                      </span>
                      <span>
                        <span className={badgeClass(e)}>{strengthLabel(e)}</span>
                        {pwned.has(e.id) && (
                          <span
                            className="chip c-red"
                            title={`Seen ${pwned.get(e.id)!.toLocaleString()} times in data leaks`}
                            style={{ marginTop: 4, display: 'inline-flex' }}
                          >
                            Breached
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 13 }}>
                        {fmtDate(e.passwordChangedAt)}
                        {e.rotationDue && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--wT)' }}>Rotation due</span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside
          className="glass up"
          style={{ flex: '1 1 340px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          {selected ? (
            <Detail
              key={selected.id}
              entry={selected}
              portal={portal}
              meta={metaQ.data}
              password={revealed[selected.id]}
              copied={copied === selected.id}
              onToggle={() => toggleReveal(selected)}
              onCopy={() => copyPassword(selected)}
              onCopyText={copyText}
              onEdit={() => setEditing(selected)}
              onLocked={onLocked}
              onDeleted={() => {
                setSel(null);
                qc.invalidateQueries({ queryKey: ['vault'] });
              }}
            />
          ) : (
            <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <VaultIcon size={28} style={{ margin: '0 auto 10px', display: 'block' }} />
              Select a login to see its details.
            </div>
          )}
        </aside>
      </div>

      {editing && (
        <EntryDrawer
          portal={portal}
          entry={editing === 'new' ? null : editing}
          meta={metaQ.data}
          permissions={perms}
          defaultCustomer={scope !== ALL && scope !== COMPANY ? scope : null}
          onClose={() => setEditing(null)}
          onLocked={onLocked}
          onSaved={(id) => {
            setEditing(null);
            setSel(id);
            setRevealed((r) => {
              const n = { ...r };
              delete n[id];
              return n;
            });
            qc.invalidateQueries({ queryKey: ['vault'] });
          }}
        />
      )}
      {showCheck && (
        <SecurityCheckDialog
          defaultEmail={check?.email ?? ''}
          result={check}
          onResult={(r) => {
            setCheck(r);
            listQ.refetch();
            qc.invalidateQueries({ queryKey: ['vault', 'logs'] });
          }}
          onClose={() => setShowCheck(false)}
          onLocked={onLocked}
        />
      )}
      {showLog && <LogDrawer onClose={() => setShowLog(false)} onLocked={onLocked} />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="glass" style={{ padding: 22 }}>
      <div className="eyebrow">{label}</div>
      <div className="disp" style={{ fontSize: 32, fontWeight: 500, marginTop: 10, color: tone }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function Monogram({ text, big }: { text: string; big?: boolean }) {
  const s = big ? 48 : 36;
  return (
    <span
      style={{
        width: s,
        height: s,
        borderRadius: big ? 12 : 10,
        background: 'rgba(var(--w), 0.07)',
        color: big ? 'var(--gT)' : 'var(--fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: 13,
        flex: 'none',
      }}
    >
      {text}
    </span>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        border: 0,
        borderRadius: 8,
        background: 'transparent',
        color: 'var(--mu)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flex: 'none',
      }}
    >
      {children}
    </button>
  );
}

/* ─── detail panel ───────────────────────────────────────── */

function Detail({
  entry,
  portal,
  meta,
  password,
  copied,
  onToggle,
  onCopy,
  onCopyText,
  onEdit,
  onLocked,
  onDeleted,
}: {
  entry: VaultEntry;
  portal: VaultPortal;
  meta?: { employees: { id: string; name: string }[]; roles: { id: string; name: string }[] };
  password?: string;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onCopyText: (t: string) => void;
  onEdit: () => void;
  onLocked: () => void;
  onDeleted: () => void;
}) {
  const logsQ = useQuery({
    queryKey: ['vault', 'logs', entry.id],
    queryFn: () => vaultApi.logs(entry.id),
    retry: false,
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const good = isGood(entry);
  const href = entry.url ? (/^https?:\/\//i.test(entry.url) ? entry.url : `https://${entry.url}`) : null;

  const who: string[] = entry.customerId
    ? [portal === 'client' ? 'You' : (entry.customer?.name ?? 'Client'), 'Eloma Group admins', 'Assigned team']
    : entry.access === 'PICK'
      ? [
          'Admins',
          ...entry.accessRoleIds.map((id) => meta?.roles.find((r) => r.id === id)?.name).filter((x): x is string => !!x),
          ...entry.accessEmployeeIds
            .map((id) => meta?.employees.find((p) => p.id === id)?.name)
            .filter((x): x is string => !!x),
        ]
      : entry.access === 'TEAM'
        ? ['Admins', 'Whole team']
        : ['Admins only'];

  const remove = async () => {
    setBusy(true);
    try {
      await vaultApi.remove(entry.id);
      toast.success('Login deleted');
      onDeleted();
    } catch (e) {
      if (statusOf(e) === 423) onLocked();
      else toast.error(errMsg(e));
    } finally {
      setBusy(false);
      setConfirmDel(false);
    }
  };

  const box: React.CSSProperties = {
    background: 'rgba(var(--w), 0.03)',
    border: '1px solid rgba(var(--w), 0.1)',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Monogram text={initialsOf(entry.name)} big />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 500, overflowWrap: 'anywhere' }}>{entry.name}</span>
          {href && (
            <a href={href} target="_blank" rel="noreferrer noopener" style={{ fontSize: 13, color: 'var(--gT)', overflowWrap: 'anywhere' }}>
              {entry.url}
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={box}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Username
            </span>
            <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{entry.username || '—'}</span>
          </div>
          {entry.username && (
            <button className="btn bg sm" type="button" onClick={() => onCopyText(entry.username!)}>
              Copy
            </button>
          )}
        </div>
        <div style={box}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Password
            </span>
            <span className="mono" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
              {password ?? MASK}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            <button className="btn bg sm" type="button" onClick={onToggle}>
              {password !== undefined ? 'Hide' : 'Reveal'}
            </button>
            <button className="btn bg sm" type="button" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>Strength</span>
            <span>{strengthLabel(entry)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--w), 0.1)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: good ? '92%' : entry.strength === 'FAIR' && !entry.reused ? '58%' : '28%',
                background: good ? 'var(--brand)' : entry.strength === 'FAIR' && !entry.reused ? 'var(--wT)' : 'var(--rT)',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, fontSize: 13 }}>
        <KV k="Folder" v={entry.folder} />
        <KV k="Two-factor" v={entry.twoFactor} />
        <KV k="Last changed" v={fmtDate(entry.passwordChangedAt)} />
        <KV k="Owner" v={entry.ownerName} />
        {portal !== 'client' && <KV k="Belongs to" v={entry.customer?.name ?? 'Eloma Group'} />}
        {!entry.customerId && portal === 'admin' && <KV k="Access" v={ACCESS_TEXT[entry.access]} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="eyebrow">WHO CAN ACCESS</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {who.map((p) => (
            <span key={p} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, background: 'rgba(var(--w), 0.06)' }}>
              {p}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eyebrow">RECENT ACTIVITY</span>
        {logsQ.isLoading ? (
          <div className="skel" style={{ height: 60 }} />
        ) : (logsQ.data ?? []).length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>
            No activity yet.
          </span>
        ) : (
          (logsQ.data ?? []).slice(0, 5).map((l) => <LogLine key={l.id} l={l} />)
        )}
      </div>

      {(entry.canEdit || entry.canDelete) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {entry.canDelete &&
            (confirmDel ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 100%' }}>
                <span style={{ fontSize: 13, flex: 1 }}>Delete this login?</span>
                <button className="btn bg sm" type="button" onClick={() => setConfirmDel(false)} disabled={busy}>
                  Cancel
                </button>
                <button
                  className="btn sm"
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  style={{ background: 'var(--rT)', color: '#fff' }}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </span>
            ) : (
              <button className="btn bg" type="button" onClick={() => setConfirmDel(true)} aria-label="Delete login" title="Delete login">
                <Trash2 />
              </button>
            ))}
          {entry.canEdit && (
            <>
              <button className="btn bg" type="button" style={{ flex: 1 }} onClick={onEdit}>
                Edit
              </button>
              <button className="btn bp" type="button" style={{ flex: 1 }} onClick={onEdit}>
                Rotate password
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="muted">{k}</span>
      <span style={{ overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  );
}

function LogLine({ l, withEntry }: { l: VaultLogRow; withEntry?: boolean }) {
  const what = ACTION_TEXT[l.action] ?? l.action;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: 13,
        padding: '8px 0',
        borderBottom: '1px solid rgba(var(--w), 0.06)',
      }}
    >
      <span style={{ minWidth: 0 }}>
        {what} by {l.userName}
        {withEntry && l.entryName && <span className="muted"> · {l.entryName}</span>}
      </span>
      <span className="muted" style={{ whiteSpace: 'nowrap' }}>
        {fmtWhen(l.createdAt)}
      </span>
    </div>
  );
}

/* ─── drawers ────────────────────────────────────────────── */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 13, 25, 0.5)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 90,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100%',
          overflowY: 'auto',
          background: 'var(--surf)',
          color: 'var(--fg)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '-20px 0 60px -20px rgba(15, 35, 64, 0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 className="disp" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>
            {title}
          </h2>
          <button className="btn bg" type="button" aria-label="Close" onClick={onClose} style={{ width: 44, padding: 0 }}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 };

function EntryDrawer({
  portal,
  entry,
  meta,
  permissions,
  defaultCustomer,
  onClose,
  onSaved,
  onLocked,
}: {
  portal: VaultPortal;
  entry: VaultEntry | null;
  meta?: {
    folders: string[];
    twoFactor: string[];
    customers: { id: string; clientId: string; name: string }[];
    employees: { id: string; name: string }[];
    roles: { id: string; name: string }[];
  };
  permissions?: { companyEdit: boolean; editableCustomers: string[] | null };
  defaultCustomer: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onLocked: () => void;
}) {
  const isNew = !entry;
  const customers = meta?.customers ?? [];
  const firstOwner = permissions?.companyEdit ? '' : (defaultCustomer ?? customers[0]?.id ?? '');
  const [owner, setOwner] = useState<string>(entry ? (entry.customerId ?? '') : (defaultCustomer ?? firstOwner));
  const [name, setName] = useState(entry?.name ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [folder, setFolder] = useState(entry?.folder ?? meta?.folders[0] ?? 'Software');
  const [twoFactor, setTwoFactor] = useState(entry?.twoFactor ?? 'Off');
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(isNew);
  const [access, setAccess] = useState<VaultAccess>(entry?.access ?? 'ADMINS');
  const [people, setPeople] = useState<string[]>(entry?.accessEmployeeIds ?? []);
  const [roles, setRoles] = useState<string[]>(entry?.accessRoleIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notes are encrypted; load them for editing.
  const entryId = entry?.id;
  useEffect(() => {
    if (!entryId) return;
    let alive = true;
    vaultApi
      .reveal(entryId, 'REVEALED')
      .then((r) => {
        if (!alive) return;
        setNotes(r.notes ?? '');
        setNotesLoaded(true);
      })
      .catch((e) => {
        if (statusOf(e) === 423) onLocked();
        else setNotesLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [entryId, onLocked]);

  const isCompany = portal === 'admin' && owner === '';
  const showOwner = portal !== 'client' && isNew;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Service name is required');
    if (isNew && !password) return setError('Password is required');
    if (portal === 'team' && isNew && !owner) return setError('Choose the client this login belongs to');
    const body: VaultInput = {
      name: name.trim(),
      url: url.trim() || null,
      username: username.trim() || null,
      folder,
      twoFactor,
      ...(notesLoaded ? { notes: notes.trim() || null } : {}),
      ...(password ? { password } : {}),
    };
    if (isNew && portal !== 'client') body.customerId = owner || null;
    if (isCompany) {
      body.access = access;
      body.accessEmployeeIds = access === 'PICK' ? people : [];
      body.accessRoleIds = access === 'PICK' ? roles : [];
    }
    setBusy(true);
    try {
      const r = isNew ? await vaultApi.create(body) : await vaultApi.update(entry!.id, body);
      toast.success(isNew ? 'Login saved' : password ? 'Password changed' : 'Login updated');
      onSaved(r.id);
    } catch (err) {
      if (statusOf(err) === 423) onLocked();
      else setError(errMsg(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Sheet title={isNew ? 'Add a login' : `Edit ${entry!.name}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {showOwner && (
          <label style={fieldLabel}>
            <span className="muted">Belongs to</span>
            <select className="inp" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {permissions?.companyEdit && <option value="">Eloma Group (team login)</option>}
              {portal === 'team' && !owner && <option value="">Choose a client…</option>}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.clientId})
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={fieldLabel}>
          <span className="muted">Service name</span>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Xero" maxLength={120} />
        </label>
        <label style={fieldLabel}>
          <span className="muted">Website</span>
          <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" maxLength={500} />
        </label>
        <label style={fieldLabel}>
          <span className="muted">Username or email</span>
          <input
            className="inp"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            maxLength={200}
          />
        </label>
        <label style={fieldLabel}>
          <span className="muted">{isNew ? 'Password' : 'New password (leave blank to keep the current one)'}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <input
              className="inp mono"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={500}
            />
            <button
              className="btn bg"
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((s) => !s)}
              style={{ width: 44, padding: 0 }}
            >
              {showPw ? <EyeOff /> : <Eye />}
            </button>
            <button
              className="btn bg"
              type="button"
              onClick={() => {
                setPassword(generatePassword());
                setShowPw(true);
              }}
            >
              Generate
            </button>
          </span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <label style={fieldLabel}>
            <span className="muted">Folder</span>
            <select className="inp" value={folder} onChange={(e) => setFolder(e.target.value)}>
              {[...(meta?.folders ?? []), ...(meta?.folders.includes(folder) ? [] : [folder])].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            <span className="muted">Two-factor</span>
            <select className="inp" value={twoFactor} onChange={(e) => setTwoFactor(e.target.value)}>
              {(meta?.twoFactor ?? [twoFactor]).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
        {isCompany && (
          <label style={fieldLabel}>
            <span className="muted">Who can access</span>
            <select className="inp" value={access} onChange={(e) => setAccess(e.target.value as VaultAccess)}>
              <option value="ADMINS">Admins only</option>
              <option value="TEAM">Admins + whole team</option>
              <option value="PICK">Admins + pick roles or people…</option>
            </select>
          </label>
        )}
        {isCompany && access === 'PICK' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(meta?.roles.length ?? 0) > 0 && (
              <Picker label="Team roles" options={meta!.roles} picked={roles} onToggle={(id) => toggle(roles, setRoles, id)} />
            )}
            <Picker
              label="People"
              options={meta?.employees ?? []}
              picked={people}
              onToggle={(id) => toggle(people, setPeople, id)}
            />
          </div>
        )}
        {!isCompany && portal !== 'client' && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Client logins are visible to that client, Eloma Group admins and the team working on the client.
          </p>
        )}
        {portal === 'client' && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Shared with your Eloma Group admins and the team working on your account.
          </p>
        )}
        <label style={fieldLabel}>
          <span className="muted">Notes</span>
          <textarea
            className="inp"
            rows={3}
            value={notes}
            disabled={!notesLoaded}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={notesLoaded ? 'Recovery steps, who to call, renewal date' : 'Loading…'}
            maxLength={4000}
            style={{ padding: '10px 14px', resize: 'vertical', minHeight: 80 }}
          />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Encrypted before it’s saved. Only people with access can reveal it, and every reveal or copy is logged.
        </p>
        {error && (
          <p style={{ margin: 0, color: 'var(--rT)', fontSize: 13 }} role="alert">
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <button className="btn bg" type="button" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn bp" type="submit" style={{ flex: 1 }} disabled={busy}>
            {busy ? 'Saving…' : 'Save login'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function Picker({
  label,
  options,
  picked,
  onToggle,
}: {
  label: string;
  options: { id: string; name: string }[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
      {options.length === 0 ? (
        <span className="muted" style={{ fontSize: 12 }}>
          None yet.
        </span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map((o) => {
            const on = picked.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onToggle(o.id)}
                aria-pressed={on}
                style={{
                  minHeight: 36,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: `1px solid ${on ? 'var(--brand)' : 'rgba(var(--w), 0.15)'}`,
                  background: on ? 'var(--onBg)' : 'transparent',
                  color: 'var(--fg)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LogDrawer({ onClose, onLocked }: { onClose: () => void; onLocked: () => void }) {
  const q = useQuery({ queryKey: ['vault', 'logs', 'all'], queryFn: () => vaultApi.logs(), retry: false });
  useEffect(() => {
    if (statusOf(q.error) === 423) onLocked();
  }, [q.error, onLocked]);
  return (
    <Sheet title="Access log" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Every unlock, reveal, copy and change in the vault — newest first.
      </p>
      {q.isLoading ? (
        <div className="skel" style={{ height: 200 }} />
      ) : (q.data ?? []).length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <div>
          {(q.data ?? []).map((l) => (
            <LogLine key={l.id} l={l} withEntry />
          ))}
        </div>
      )}
    </Sheet>
  );
}
