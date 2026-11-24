import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { vaultApi, type VaultSecurityCheck } from '@/api/vault';

/**
 * "Run security check" popup — Have I Been Pwned style: the email's known data
 * breaches, plus every saved password checked against leaked-password lists.
 */

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;
const fmtNum = (n: number) => n.toLocaleString('en-AU');
const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase();
};
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const breachDate = (b: { date: string | null; added: string | null }) => {
  if (b.date && /^\d{4}$/.test(b.date)) return b.date;
  const d = b.date ?? b.added;
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
};

export function SecurityCheckDialog({
  defaultEmail,
  result,
  onResult,
  onClose,
  onLocked,
}: {
  defaultEmail: string;
  result: VaultSecurityCheck | null;
  onResult: (r: VaultSecurityCheck) => void;
  onClose: () => void;
  onLocked: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<VaultSecurityCheck | null>(result);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setError('Enter a valid email address');
    setBusy(true);
    setError(null);
    try {
      const r = await vaultApi.securityCheck(v);
      setRes(r);
      onResult(r);
    } catch (err) {
      if (statusOf(err) === 423) onLocked();
      else setError(errMsg(err, 'Could not run the check'));
    } finally {
      setBusy(false);
    }
  };

  const leaked = (res?.passwords ?? []).filter((p) => (p.pwnedCount ?? 0) > 0);
  const unchecked = (res?.passwords ?? []).filter((p) => p.pwnedCount === null).length;
  const checkedCount = (res?.passwords.length ?? 0) - unchecked;
  const pwnedEmail = (res?.breaches.length ?? 0) > 0 || (res?.pastes ?? 0) > 0;
  const tone = pwnedEmail ? 'var(--rT)' : 'var(--okT)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Security check"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 13, 25, 0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 90,
        padding: '6vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          background: 'var(--surf)',
          color: 'var(--fg)',
          borderRadius: 16,
          border: '1px solid rgba(var(--w), 0.1)',
          boxShadow: '0 30px 80px -20px rgba(15, 35, 64, 0.55)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <span className="eyebrow">SECURITY CHECK</span>
            <h2 className="disp" style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 500 }}>
              Has this email been pwned?
            </h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
              Checks the email against known data breaches, and every saved password against leaked-password lists.
            </p>
          </div>
          <button className="btn bg" type="button" aria-label="Close" onClick={onClose} style={{ width: 44, padding: 0 }}>
            <X />
          </button>
        </div>

        <form onSubmit={run} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="inp"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email address"
            aria-label="Email address"
            style={{ flex: '1 1 260px' }}
          />
          <button className="btn bp" type="submit" disabled={busy} style={{ flex: '0 0 auto' }}>
            <ShieldCheck /> {busy ? 'Checking…' : 'Check'}
          </button>
        </form>
        {error && (
          <p style={{ margin: 0, color: 'var(--rT)', fontSize: 13 }} role="alert">
            {error}
          </p>
        )}

        {busy && <div className="skel" style={{ height: 120 }} />}

        {res && !busy && (
          <>
            {/* Verdict */}
            <div
              style={{
                borderRadius: 14,
                padding: '20px 22px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                background: pwnedEmail ? 'rgba(200, 38, 74, 0.12)' : 'rgba(45, 185, 138, 0.12)',
                border: `1px solid ${pwnedEmail ? 'rgba(200, 38, 74, 0.35)' : 'rgba(45, 185, 138, 0.35)'}`,
              }}
            >
              <span style={{ color: tone, flex: 'none' }}>
                {pwnedEmail ? <ShieldAlert size={34} /> : <ShieldCheck size={34} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="disp" style={{ fontSize: 22, fontWeight: 600, color: tone }}>
                  {pwnedEmail ? 'Oh no — pwned!' : 'Good news — no pwnage found!'}
                </div>
                <div style={{ fontSize: 14, marginTop: 2, overflowWrap: 'anywhere' }}>
                  {pwnedEmail ? (
                    <>
                      <b>{res.email}</b> was found in <b>{fmtNum(res.breaches.length)}</b> data breach
                      {res.breaches.length === 1 ? '' : 'es'}
                      {res.pastes > 0 && (
                        <>
                          {' '}
                          and <b>{fmtNum(res.pastes)}</b> paste{res.pastes === 1 ? '' : 's'}
                        </>
                      )}
                      .{res.risk && <span className="muted"> Risk: {res.risk.label}.</span>}
                    </>
                  ) : (
                    <>
                      No breached accounts and no pastes found for <b>{res.email}</b>.
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Saved passwords */}
            <section
              style={{
                borderRadius: 12,
                border: '1px solid rgba(var(--w), 0.1)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span className="eyebrow">SAVED PASSWORDS</span>
              {res.passwords.length === 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  No saved passwords to check.
                </span>
              ) : leaked.length === 0 ? (
                checkedCount > 0 && (
                  <span style={{ fontSize: 14, color: 'var(--okT)' }}>
                    None of your {fmtNum(checkedCount)} saved password{checkedCount === 1 ? ' was' : 's were'} found in
                    known data leaks.
                  </span>
                )
              ) : (
                <>
                  <span style={{ fontSize: 14 }}>
                    <b style={{ color: 'var(--rT)' }}>
                      {leaked.length} of {res.passwords.length}
                    </b>{' '}
                    saved password{res.passwords.length === 1 ? '' : 's'} appear in known data leaks — change them now:
                  </span>
                  {leaked.map((p) => (
                    <div
                      key={p.entryId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 13,
                        padding: '6px 0',
                        borderTop: '1px solid rgba(var(--w), 0.06)',
                      }}
                    >
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</span>
                      <span style={{ color: 'var(--rT)', whiteSpace: 'nowrap' }}>Seen {fmtNum(p.pwnedCount!)} times</span>
                    </div>
                  ))}
                </>
              )}
              {unchecked > 0 && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {unchecked} password{unchecked === 1 ? '' : 's'} could not be checked right now.
                </span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                Passwords never leave the server — only the first 5 characters of each one’s hash are compared.
              </span>
            </section>

            {/* Breaches */}
            {res.breaches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="eyebrow">BREACHES YOU WERE PWNED IN</span>
                {res.breaches.map((b, i) => (
                  <article
                    key={`${b.name}-${i}`}
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: '1px solid rgba(var(--w), 0.1)',
                      background: 'rgba(var(--w), 0.02)',
                    }}
                  >
                    <BreachLogo src={b.logo} name={b.name} />
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px' }}>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{b.name}</span>
                        {b.domain && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {b.domain}
                          </span>
                        )}
                        {b.verified && <span className="chip c-info">Verified</span>}
                      </div>
                      {b.description && (
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, overflowWrap: 'anywhere' }}>{b.description}</p>
                      )}
                      <div className="muted" style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
                        {breachDate(b) && <span>Breach date: {breachDate(b)}</span>}
                        {b.records ? <span>Accounts: {fmtNum(b.records)}</span> : null}
                        {b.industry && <span>Industry: {b.industry}</span>}
                      </div>
                      {b.dataClasses.length > 0 && (
                        <div style={{ fontSize: 13 }}>
                          <b>Compromised data:</b> {b.dataClasses.join(', ')}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            <p className="muted" style={{ margin: 0, fontSize: 11 }}>
              Breach data from XposedOrNot · leaked-password data from Have I Been Pwned (Pwned Passwords) · checked{' '}
              {fmtWhen(res.checkedAt)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function BreachLogo({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = {
    width: 52,
    height: 52,
    borderRadius: 10,
    flex: 'none',
    background: '#fff',
    border: '1px solid rgba(var(--w), 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };
  if (!src || broken || !/^https:\/\//i.test(src)) {
    return (
      <span style={{ ...box, background: 'rgba(var(--w), 0.07)', fontWeight: 600, fontSize: 14 }}>{initialsOf(name)}</span>
    );
  }
  return (
    <span style={box}>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }}
      />
    </span>
  );
}
