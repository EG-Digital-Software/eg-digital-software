import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Lock } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { ErrorState } from '@/components/shared/states';
import { formatAbn, formatAcn } from '@/lib/customer';
import type { Address } from '@/types';
import { Linkify } from '@/lib/linkify';
import { ElCard, ElPageHead, ElPill, ElSkel, type PillTone } from '@/components/client/eloma';

/** Turn an enum like HOSPITALITY_AND_TOURISM into "Hospitality And Tourism". */
function prettify(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const STATUS: Record<string, { tone: PillTone; label: string }> = {
  ACTIVE: { tone: 'ok', label: 'Account active' },
  ACTIVE_TRIAL: { tone: 'info', label: 'Active · trial' },
  DORMANT: { tone: 'warn', label: 'Account dormant' },
  SUSPENDED: { tone: 'bad', label: 'Account suspended' },
};

function Value({ value, mono }: { value?: string | null; mono?: boolean }) {
  const v = value?.toString().trim();
  if (!v) return <span className="el-muted">—</span>;
  return <span className={mono ? 'el-mono' : undefined}><Linkify text={v} /></span>;
}

/** Address lines: street on the first line, locality on the second. */
function AddressLines({ a }: { a?: Address }) {
  if (!a) return <span className="el-muted">—</span>;
  const street = [a.line1, a.line2].filter((p) => p?.toString().trim()).join(', ');
  const locality = [a.suburb, a.city, a.state, a.postcode].filter((p) => p?.toString().trim()).join(' ');
  if (!street && !locality) return <span className="el-muted">—</span>;
  return (
    <span className="block">
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

export default function ClientDetailsPage() {
  const { data: c, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'profile'],
    queryFn: () => clientApi.profile(),
  });

  if (isLoading) {
    return (
      <>
        <ElSkel className="h-24" />
        <ElSkel className="h-64" />
      </>
    );
  }
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const principal = c.addresses?.find((a) => a.type === 'PRINCIPAL');
  const billing = c.addresses?.find((a) => a.type === 'BILLING');
  const identifiers = c.companyIdentifiers ?? {};
  const name = c.companyName?.trim() || c.contactPerson?.trim() || c.clientId;
  const status = STATUS[c.accountStatusEffective ?? c.accountStatus] ?? STATUS.ACTIVE;
  const manager = c.accountManager;
  const city = principal && [principal.city || principal.suburb, principal.state].filter(Boolean).join(', ');
  const heroSub = [c.tradingAs?.trim() && `Trading as ${c.tradingAs.trim()}`, c.businessType && prettify(c.businessType), city]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <ElPageHead eyebrow="Company" title="Account details" description="The details EG Eloma holds on record for your business." />

      <div className="el-lock">
        <Lock />
        <span>
          These details are managed by EG Eloma. To change anything, message{' '}
          {manager ? manager.firstName : 'your account manager'}. You can change your password from{' '}
          <Link to="/client/account">My account</Link>.
        </span>
      </div>

      <section className="el-card el-co-hero">
        <span className="el-monogram">{monogram(name)}</span>
        <div className="grow">
          <h2>{name}</h2>
          {heroSub && <p>{heroSub}</p>}
        </div>
        <ElPill tone={status.tone}>{status.label}</ElPill>
      </section>

      <div className="el-co-grid">
        <ElCard title="Registration">
          <dl className="el-kv">
            <dt>Customer ID</dt>
            <dd><Value value={c.clientId} mono /></dd>
            <dt>Legal name</dt>
            <dd><Value value={c.companyName} /></dd>
            <dt>Trading as</dt>
            <dd><Value value={c.tradingAs} /></dd>
            <dt>Business type</dt>
            <dd><Value value={c.businessType ? prettify(c.businessType) : null} /></dd>
            {Object.entries(identifiers).map(([key, val]) => {
              const k = key.toLowerCase();
              const display = k === 'abn' ? formatAbn(val) : k === 'acn' ? formatAcn(val) : val;
              const digits = String(val ?? '').replace(/\D/g, '');
              return [
                <dt key={`${key}-k`}>{key.toUpperCase()}</dt>,
                <dd key={`${key}-v`}>
                  <Value value={display} mono />
                  {k === 'abn' && digits.length === 11 && (
                    <a
                      href={`https://abr.business.gov.au/ABN/View?abn=${digits}`}
                      target="_blank"
                      rel="noreferrer"
                      className="el-link"
                    >
                      ABN Lookup <ExternalLink />
                    </a>
                  )}
                </dd>,
              ];
            })}
            <dt>Country</dt>
            <dd><Value value={c.registrationCountry} /></dd>
          </dl>
        </ElCard>

        <ElCard title="Primary contact">
          <dl className="el-kv">
            <dt>Name</dt>
            <dd><Value value={c.contactPerson} /></dd>
            <dt>Position</dt>
            <dd><Value value={c.contactPosition} /></dd>
            <dt>Email</dt>
            <dd><Value value={c.contactEmail} /></dd>
            <dt>Mobile</dt>
            <dd><Value value={c.contactMobile} mono /></dd>
          </dl>
        </ElCard>

        <ElCard title="Invoicing">
          <dl className="el-kv">
            <dt>Accounts contact</dt>
            <dd><Value value={c.billingContactPerson} /></dd>
            <dt>Accounts email</dt>
            <dd><Value value={c.billingEmail} /></dd>
            <dt>Accounts mobile</dt>
            <dd><Value value={c.billingContactNumber} mono /></dd>
            <dt>Payment terms</dt>
            <dd><Value value={c.invoicingTerm} /></dd>
          </dl>
        </ElCard>

        <ElCard title="Addresses">
          <dl className="el-kv">
            <dt>Principal</dt>
            <dd><AddressLines a={principal} /></dd>
            <dt>Billing</dt>
            <dd><AddressLines a={billing} /></dd>
          </dl>
        </ElCard>
      </div>

      {!!c.directors?.length && (
        <ElCard title="Directors">
          <div className="el-table-wrap">
            <table className="el-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                </tr>
              </thead>
              <tbody>
                {c.directors.map((d) => {
                  const full = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || 'Director';
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <span className="el-av">{`${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase() || 'D'}</span>
                          <span className="font-medium">{full}</span>
                        </span>
                      </td>
                      <td><Value value={d.email} /></td>
                      <td><Value value={d.contactNumber} mono /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ElCard>
      )}
    </>
  );
}
