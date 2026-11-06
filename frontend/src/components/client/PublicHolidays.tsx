import { useState } from 'react';
import { formatDate } from '@/lib/utils';
import { HOME_TZ } from '@/components/client/portalContext';

const DAY = 86_400_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Victorian public holidays (Business Victoria). [date, name, substitute?, date TBC?]
const HOLIDAYS: [string, string, boolean?, boolean?][] = [
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2026-12-28', 'Boxing Day', true],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-01-26', 'Australia Day'],
  ['2027-03-08', 'Labour Day'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-27', 'Saturday before Easter Sunday'],
  ['2027-03-28', 'Easter Sunday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-04-25', 'ANZAC Day'],
  ['2027-06-14', 'King’s Birthday'],
  ['2027-09-24', 'Friday before the AFL Grand Final', false, true],
  ['2027-11-02', 'Melbourne Cup'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-26', 'Boxing Day'],
  ['2027-12-27', 'Christmas Day', true],
  ['2027-12-28', 'Boxing Day', true],
];

/** Calendar date (UTC midnight) of an ISO date string. */
const utcDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Today's date in Melbourne, as UTC midnight. */
export function melbourneToday(at: number) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: HOME_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'));
}

/** Upcoming Victorian public holidays from `todayUTC` (inclusive). */
export function upcomingHolidays(todayUTC: number) {
  return HOLIDAYS.map(([iso, name, sub, tbc]) => {
    const t = utcDay(iso);
    return {
      t,
      name,
      sub: !!sub,
      tbc: !!tbc,
      date: tbc ? 'Late Sep 2027 · date TBC' : `${WD[new Date(t).getUTCDay()]} ${formatDate(`${iso}T12:00:00`)}`,
    };
  }).filter((h) => h.t >= todayUTC);
}

/** "Melbourne office holidays" card (design's public-holiday panel). */
export function PublicHolidaysCard({
  now,
  note = 'Project work and account management pause on these days. 24/7 support stays available.',
  style,
}: {
  /** Epoch ms captured once by the page (keeps render pure). */
  now: number;
  note?: string;
  style?: React.CSSProperties;
}) {
  const [all, setAll] = useState(false);
  const todayUTC = melbourneToday(now);
  const hols = upcomingHolidays(todayUTC);
  const next = hols[0];
  const nextDays = next ? Math.round((next.t - todayUTC) / DAY) : 0;
  const list = all ? hols.slice(1) : hols.slice(1, 6);

  return (
    <section className="glass card up" style={{ padding: 20, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </span>
        <div>
          <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
            Melbourne office holidays
          </h2>
          <div className="muted" style={{ fontSize: 12 }}>
            Victorian public holidays
          </div>
        </div>
      </div>
      <div className="nexthol">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Next holiday</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{next?.name ?? 'No upcoming holidays listed'}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {next?.date ?? ''}
          </div>
        </div>
        {next && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="stat-big" style={{ color: 'var(--brand)' }}>
              {nextDays === 0 ? 'Today' : nextDays}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              {nextDays === 0 ? 'office closed' : nextDays === 1 ? 'day away' : 'days away'}
            </div>
          </div>
        )}
      </div>
      <div className="stag" style={{ marginTop: 6 }}>
        {list.map((h) => (
          <div key={h.t + h.name} className="kvrow">
            <span>
              {h.name}
              {h.sub && (
                <>
                  {' '}
                  <span className="chip c-ns" style={{ fontSize: 10, padding: '1px 6px' }}>
                    substitute
                  </span>
                </>
              )}
            </span>
            <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
              {h.date}
            </span>
          </div>
        ))}
      </div>
      {hols.length > 6 && (
        <button type="button" className="linkbtn" onClick={() => setAll((v) => !v)} style={{ marginTop: 8, fontSize: 13 }}>
          {all ? 'Show fewer' : `Show all ${hols.length - 1} upcoming`}
        </button>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
        {note}
      </div>
      <a href="https://business.vic.gov.au/business-information/public-holidays" target="_blank" rel="noopener" style={{ fontSize: 11.5 }}>
        Source: Business Victoria ↗
      </a>
    </section>
  );
}
