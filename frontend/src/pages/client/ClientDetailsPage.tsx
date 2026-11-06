import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { ErrorState } from '@/components/shared/states';
import { formatAbn, formatAcn } from '@/lib/customer';
import type { Address } from '@/types';
import { Linkify } from '@/lib/linkify';
import { useAuth } from '@/store/auth';
import { AVATAR_COLORS, initialsOf } from '@/components/client/portalContext';

/** Turn an enum like HOSPITALITY_AND_TOURISM into "Hospitality And Tourism". */
function prettify(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const STATUS: Record<string, { chip: string; label: string }> = {
  ACTIVE: { chip: 'chip c-ok', label: 'Account active' },
  ACTIVE_TRIAL: { chip: 'chip c-info', label: 'Active · trial' },
  DORMANT: { chip: 'chip c-warn', label: 'Account dormant' },
  SUSPENDED: { chip: 'chip c-red', label: 'Account suspended' },
};

function countryName(code?: string | null) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function Value({ value, mono }: { value?: string | null; mono?: boolean }) {
  const v = value?.toString().trim();
  if (!v) return <span className="muted">—</span>;
  return (
    <span className={mono ? 'mono' : undefined}>
      <Linkify text={v} />
    </span>
  );
}

/** Address lines: street on the first line, locality on the second. */
function AddressLines({ a }: { a?: Address }) {
  if (!a) return <span className="muted">—</span>;
  const street = [a.line1, a.line2].filter((p) => p?.toString().trim()).join(', ');
  const locality = [a.suburb, a.city, a.state, a.postcode].filter((p) => p?.toString().trim()).join(' ');
  if (!street && !locality) return <span className="muted">—</span>;
  return (
    <span>
      {street}
      {street && locality && <br />}
      {locality}
    </span>
  );
}

function monogram(name: string): string {
  const words = name.replace(/\b(pty|ltd|limited|inc)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function Section({ title, delay, children }: { title: string; delay: string; children: React.ReactNode }) {
  return (
    <section className="glass up" style={{ animationDelay: delay, overflow: 'hidden' }}>
      <h2 className="disp" style={{ margin: 0, padding: '18px 20px', fontSize: 17 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

interface Person {
  name: string;
  email?: string | null;
  role: string;
  you: boolean;
  signIn: boolean;
}

export default function ClientDetailsPage() {
  const me = useAuth((s) => s.user);
  const { data: c, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'profile'],
    queryFn: () => clientApi.profile(),
  });

  if (isLoading) {
    return (
      <div className="ec-page">
        <div className="skel" style={{ height: 110 }} />
        <div className="skel" style={{ height: 260 }} />
      </div>
    );
  }
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const principal = c.addresses?.find((a) => a.type === 'PRINCIPAL');
  const billing = c.addresses?.find((a) => a.type === 'BILLING');
  const identifiers = c.companyIdentifiers ?? {};
  const name = c.companyName?.trim() || c.contactPerson?.trim() || c.clientId;
  const status = STATUS[c.accountStatusEffective ?? c.accountStatus] ?? STATUS.ACTIVE;
  const manager = c.accountManager;
  const isAU = !c.registrationCountry || c.registrationCountry.toUpperCase() === 'AU';
  const country = countryName(c.registrationCountry) ?? (isAU ? 'Australia' : null);
  const city = principal && [principal.city || principal.suburb, principal.state].filter(Boolean).join(', ');
  const heroSub = [c.tradingAs?.trim() && `Trading as ${c.tradingAs.trim()}`, c.businessType && prettify(c.businessType), city]
    .filter(Boolean)
    .join(' · ');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ');
  const myEmail = me?.email?.toLowerCase();

  // People we hold on record for this account. Only the portal login can sign in.
  const people: Person[] = [];
  const add = (p: Omit<Person, 'you' | 'signIn'>, signIn = false) => {
    const email = p.email?.trim().toLowerCase();
    const dup = email && people.find((x) => x.email?.toLowerCase() === email);
    if (dup) {
      if (!dup.role.includes(p.role)) dup.role = `${dup.role} · ${p.role}`;
      dup.signIn ||= signIn;
      return;
    }
    people.push({ ...p, you: !!email && email === myEmail, signIn });
  };
  const loginEmail = c.credentialEmail || me?.email;
  if (loginEmail) {
    add(
      { name: [me?.firstName, me?.lastName].filter(Boolean).join(' ') || c.contactPerson || loginEmail, email: loginEmail, role: 'Portal login' },
      true
    );
  }
  if (c.contactPerson || c.contactEmail) add({ name: c.contactPerson || c.contactEmail!, email: c.contactEmail, role: 'Primary contact' });
  if (c.authorized && (c.authorizedPerson || c.authorizedEmail))
    add({ name: c.authorizedPerson || c.authorizedEmail!, email: c.authorizedEmail, role: 'Authorised person' });
  if (c.billingContactPerson || c.billingEmail)
    add({ name: c.billingContactPerson || c.billingEmail!, email: c.billingEmail, role: 'Accounts' });

  const mailManager = manager?.email ? `mailto:${manager.email}?subject=${encodeURIComponent(`Update account details - ${name}`)}` : null;

  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Company</div>
        <h1 className="disp ec-h1">Account details</h1>
        <p className="muted" style={{ margin: 0 }}>
          The details EG Eloma holds on record for your business.
        </p>
      </div>

      <div className="glass up" style={{ padding: '12px 16px', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          These details are managed by EG Eloma. To change anything,{' '}
          {mailManager ? <a href={mailManager}>message {manager!.firstName}</a> : 'contact your account manager'}. You can
          change your password from <Link to="/client/account">My account</Link>.
        </span>
      </div>

      <section className="glass card up" style={{ animationDelay: '.1s', padding: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
        <div
          className="disp"
          style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            background: '#0F2340',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {monogram(name)}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="disp" style={{ fontSize: 22, fontWeight: 700 }}>
            {name}
          </div>
          {heroSub && (
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {heroSub}
            </div>
          )}
        </div>
        <span className={status.chip}>
          <span className="dot" />
          {status.label}
        </span>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
        <Section title="Registration" delay=".16s">
          <Row label="Customer ID">
            <Value value={c.clientId} mono />
          </Row>
          <Row label="Legal name">
            <Value value={c.companyName} />
          </Row>
          <Row label="Trading as">
            <Value value={c.tradingAs} />
          </Row>
          <Row label="Business type">
            <Value value={c.businessType ? prettify(c.businessType) : null} />
          </Row>
          {Object.entries(identifiers).map(([key, val]) => {
            const k = key.toLowerCase();
            const display = k === 'abn' ? formatAbn(val) : k === 'acn' ? formatAcn(val) : val;
            const digits = String(val ?? '').replace(/\D/g, '');
            return (
              <Row key={key} label={key.toUpperCase()}>
                <Value value={display} mono />
                {k === 'abn' && digits.length === 11 && (
                  <>
                    {' · '}
                    <a href={`https://abr.business.gov.au/ABN/View?abn=${digits}`} target="_blank" rel="noreferrer">
                      ABN Lookup ↗
                    </a>
                  </>
                )}
              </Row>
            );
          })}
          <Row label="Country">
            <Value value={country} />
          </Row>
          {isAU && <Row label="Billing currency">AUD · GST</Row>}
        </Section>

        <Section title="Primary contact" delay=".22s">
          <Row label="Name">
            <Value value={c.contactPerson} />
          </Row>
          <Row label="Position">
            <Value value={c.contactPosition} />
          </Row>
          <Row label="Email">
            <Value value={c.contactEmail} />
          </Row>
          <Row label="Mobile">
            <Value value={c.contactMobile} mono />
          </Row>
        </Section>

        <Section title="Invoicing" delay=".28s">
          <Row label="Accounts contact">
            <Value value={c.billingContactPerson} />
          </Row>
          <Row label="Accounts email">
            <Value value={c.billingEmail} />
          </Row>
          <Row label="Accounts mobile">
            <Value value={c.billingContactNumber} mono />
          </Row>
          <Row label="Payment terms">
            <Value value={c.invoicingTerm} />
          </Row>
        </Section>

        <Section title="Addresses" delay=".34s">
          <Row label="Principal">
            <AddressLines a={principal} />
          </Row>
          <Row label="Billing">
            <AddressLines a={billing} />
          </Row>
        </Section>
      </div>

      {people.length > 0 && (
        <section className="glass up" style={{ animationDelay: '.32s', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '18px 20px' }}>
            <div>
              <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
                Team &amp; access
              </h2>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                People on record for your account. Only portal logins can sign in.
              </div>
            </div>
            <span className="chip c-ns">
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="stag">
            {people.map((p, i) => (
              <div key={`${p.email ?? p.name}-${i}`} className="tmrow">
                <span className="av" style={{ width: 36, height: 36, fontSize: 12, margin: 0, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {initialsOf(p.name)}
                </span>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {p.name}
                    {p.you && (
                      <>
                        {' '}
                        <span className="chip c-info" style={{ fontSize: 10, padding: '1px 7px' }}>
                          You
                        </span>
                      </>
                    )}
                  </div>
                  {p.email && (
                    <div className="muted" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.email}
                    </div>
                  )}
                </div>
                <span className="chip c-ns" style={{ minWidth: 86, justifyContent: 'center' }}>
                  {p.role}
                </span>
                <span className={p.signIn ? 'chip c-ok' : 'chip c-ns'} style={{ minWidth: 104, justifyContent: 'center' }}>
                  {p.signIn ? 'Active' : 'No sign-in'}
                </span>
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, padding: '12px 20px 18px', borderTop: '1px solid rgba(var(--w),.06)' }}>
            To give more staff their own sign-in, contact your account manager.
          </div>
        </section>
      )}

      <section className="glass up" style={{ animationDelay: '.38s', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '18px 20px' }}>
          <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
            Legal &amp; privacy
          </h2>
          {country && <span className="chip c-info">{country}</span>}
        </div>
        {isAU && <Row label="Privacy law">Privacy Act 1988</Row>}
        <Row label="Electronic signatures">
          {isAU ? 'Electronic Transactions Act 1999 · ' : ''}each signature records name, time and IP address
        </Row>
        {isAU && <Row label="Tax on invoices">GST 10%, shown on each invoice</Row>}
        <Row label="Time zone">{tz} · detected from your device</Row>
      </section>

      {!!c.directors?.length && (
        <Section title="Directors" delay=".44s">
          {c.directors.map((d, i) => {
            const full = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || 'Director';
            return (
              <div key={d.id} className="kv" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,.7fr)' }}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <span className="av" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {`${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase() || 'D'}
                  </span>
                  {full}
                </span>
                <span className="muted" style={{ overflowWrap: 'anywhere' }}>
                  <Value value={d.email} />
                </span>
                <span className="muted">
                  <Value value={d.contactNumber} mono />
                </span>
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );
}
