import { EmptyState } from '@/components/shared/states';

function Kpi({ title, value, tone }: { title: string; value: string; tone?: string }) {
  return (
    <div className="glass card" style={{ padding: 20 }}>
      <div className="eyebrow">{title}</div>
      <div className="disp stat" style={{ fontSize: 30, fontWeight: 600, marginTop: 10, color: tone }}>
        {value}
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Insights</div>
        <h1 className="disp ec-h1">Report</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Business reports across revenue, customers and payments.
        </p>
      </div>

      <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <Kpi title="Total revenue" value="—" tone="var(--brand)" />
        <Kpi title="Invoices" value="—" />
        <Kpi title="Customers" value="—" tone="var(--vT)" />
        <Kpi title="Growth" value="—" tone="var(--wT)" />
      </div>

      <section className="glass up" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(var(--w),.06)' }}>
          <h2 className="disp" style={{ margin: 0, fontSize: 18 }}>
            Reports
          </h2>
        </div>
        <div style={{ padding: 22 }}>
          <EmptyState
            title="No reports yet"
            description="Reporting charts and exports will appear here once wired to the dashboard API."
          />
        </div>
      </section>
    </div>
  );
}
