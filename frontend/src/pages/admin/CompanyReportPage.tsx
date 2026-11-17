import reportHtml from '@/assets/reports/eg-eloma-report.html?raw';

/**
 * Marketing and Cloud admin tabs — EG Eloma's own report (eg-eloma-report.html,
 * one self-contained page with its own design, kept as supplied) runs in a frame.
 * `view` picks which part opens first: the Marketing report or Azure Performance.
 */
export default function CompanyReportPage({ view }: { view: 'mkt' | 'azure' }) {
  const html = reportHtml.replace('<body>', `<body data-view="${view}">`);
  return (
    <div className="ec-page">
      <iframe
        key={view}
        title={view === 'azure' ? 'Cloud report' : 'Marketing report'}
        srcDoc={html}
        className="w-full rounded-xl border border-border bg-white"
        style={{ height: 'calc(100dvh - 120px)', minHeight: 560 }}
      />
    </div>
  );
}
