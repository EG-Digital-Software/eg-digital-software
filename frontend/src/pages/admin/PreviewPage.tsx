import { Eye } from 'lucide-react';

export default function PreviewPage() {
  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Admin</div>
        <h1 className="disp ec-h1">Preview</h1>
      </div>

      <section className="glass up" style={{ padding: '56px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--w),.06)' }}>
          <Eye className="h-7 w-7" style={{ color: 'var(--mu)' }} />
        </div>
        <h2 className="disp" style={{ margin: 0, fontSize: 20 }}>
          Coming soon
        </h2>
        <p className="muted" style={{ margin: 0, maxWidth: 420 }}>
          This section is on the way.
        </p>
        <span className="chip c-warn">Coming soon</span>
      </section>
    </div>
  );
}
