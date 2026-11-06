import { useState } from 'react';
import { PaymentsTransactionsTab } from './PaymentsTransactionsTab';
import PaymentSettingsForm from './PaymentSettingsPage';

const TABS = [
  { value: 'transactions', label: 'Transactions' },
  { value: 'settings', label: 'Settings' },
] as const;

/**
 * Payments has two halves: the money that has come in (Transactions) and how it
 * is allowed to come in (Settings). Until now this route only showed the
 * settings, so there was nowhere to see payments across invoices at all.
 */
export default function PaymentsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('transactions');

  return (
    <div className="ec-page">
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Payments</div>
          <h1 className="disp ec-h1">Money received</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            Money received and how customers can pay you.
          </p>
        </div>
        <div className="segs" role="tablist" aria-label="Payments sections">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={`seg${tab === t.value ? ' on' : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="up" style={{ animationDelay: '.06s' }}>
        {tab === 'transactions' ? <PaymentsTransactionsTab /> : <PaymentSettingsForm />}
      </div>
    </div>
  );
}
