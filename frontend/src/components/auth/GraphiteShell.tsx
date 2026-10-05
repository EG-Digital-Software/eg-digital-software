import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

/** Small uppercase eyebrow/label style used across the graphite auth pages. */
export const GRAPHITE_EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.16em] text-[#a3abb9]';

export const GRAPHITE_INPUT =
  'h-12 w-full rounded-none border border-[#262b36] bg-[#0b0c10] pl-[42px] text-[15px] text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-[#94a3b8]';

/** Primary white action button. */
export const GRAPHITE_BUTTON =
  'mt-1 inline-flex min-h-[50px] items-center justify-center gap-2.5 bg-white px-7 text-[13px] font-bold uppercase tracking-[0.14em] text-[#0b0c10] transition-colors hover:bg-[#e5e7eb] disabled:opacity-60';

const FEATURES = ['Secure', 'Scalable', 'Connected', 'Innovative'];

/** Desktop design canvas: the page as composed on a 1920×1080 screen at 100%
 *  browser zoom. On landscape screens the whole canvas is scaled uniformly to
 *  fit the window, so the composition looks identical at every zoom level and
 *  screen size. Portrait screens (phones) fall back to the fluid layout. */
const STAGE_W = 1920;
const STAGE_H = 945;

function stageScale(): number | null {
  if (typeof window === 'undefined') return null;
  const { innerWidth: w, innerHeight: h } = window;
  return w >= h ? Math.min(w / STAGE_W, h / STAGE_H) : null;
}

function useStageScale() {
  const [scale, setScale] = useState(stageScale);
  useEffect(() => {
    const onResize = () => setScale(stageScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

const ORBITS = [
  { rot: 0, dur: '14s', begin: '0s' },
  { rot: 60, dur: '18s', begin: '-4s' },
  { rot: -60, dur: '22s', begin: '-8s' },
];

/** Three tilted elliptical orbits, each with a travelling dot — the hero backdrop. */
function OrbitArt() {
  return (
    <svg viewBox="0 0 1000 700" width="100%" height="100%" aria-hidden="true" className="block overflow-visible">
      <defs>
        <radialGradient id="egCore">
          <stop offset="0" stopColor="#3a4150" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3a4150" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="500" cy="350" r="160" fill="url(#egCore)">
        <animate attributeName="r" values="140;175;140" dur="6s" repeatCount="indefinite" />
      </circle>
      {ORBITS.map((o, i) => (
        <g key={i} transform={`rotate(${o.rot} 500 350)`}>
          <path
            id={`egOrb${i}`}
            d="M80,350 a420,130 0 1,0 840,0 a420,130 0 1,0 -840,0"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.16"
            strokeWidth="1.2"
          />
          <circle r="5" fill="#64748b">
            <animateMotion dur={o.dur} repeatCount="indefinite" begin={o.begin}>
              <mpath href={`#egOrb${i}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </svg>
  );
}

/** Graphite auth layout: orbit backdrop, headline on the left, `children`
 *  rendered inside the card on the right. Shared by the portal sign-in and
 *  password-recovery pages. */
export function GraphiteShell({
  children,
  eyebrow = 'Customer Portal · Secure sign-in',
}: {
  children: ReactNode;
  /** Small caption above the headline. */
  eyebrow?: string;
}) {
  const scale = useStageScale();
  const locked = scale !== null;
  const year = new Date().getFullYear();

  const scene = (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_32%_50%,#22252d_0%,#0b0c10_75%)]" />
      <div className="pointer-events-none absolute left-[32%] top-1/2 h-[640px] w-[900px] max-w-[140%] -translate-x-1/2 -translate-y-1/2">
        <OrbitArt />
      </div>

      <div
        className={cn(
          'relative z-10 flex flex-col py-[22px]',
          locked ? 'h-full px-8' : 'min-h-screen px-[clamp(16px,2.2vw,32px)]',
        )}
      >
        <Link to="/" className="w-fit text-lg font-semibold tracking-[0.32em] text-white">
          EG DIGITAL
        </Link>

        <div className="flex flex-1 flex-wrap items-center gap-12 py-10">
          {/* ---------- Left: headline ---------- */}
          <div
            className={cn(
              'flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]',
              locked ? 'pl-16' : 'pl-[clamp(0px,4vw,64px)]',
            )}
          >
            <div className={GRAPHITE_EYEBROW}>{eyebrow}</div>
            <h1 className="m-0 flex max-w-[720px] flex-col gap-1.5 tracking-[-0.02em] text-white">
              <span
                className={cn(
                  'font-medium leading-[1.15] text-[#c7ccd6]',
                  locked ? 'text-[34px]' : 'text-[clamp(24px,2.4vw,34px)]',
                )}
              >
                One Platform. One Login.
              </span>
              <span
                className={cn(
                  'font-extrabold leading-[0.92] tracking-[-0.04em] text-transparent [-webkit-text-stroke:1.5px_#e5e7eb]',
                  locked ? 'text-[128px]' : 'text-[clamp(64px,8.6vw,128px)]',
                )}
              >
                Unlimited
              </span>
              <span
                className={cn(
                  'font-extrabold leading-[0.98] tracking-[-0.035em]',
                  locked ? 'text-[88px]' : 'text-[clamp(48px,6vw,88px)]',
                )}
              >
                Possibilities.
              </span>
            </h1>
            <p className="m-0 max-w-[420px] text-[17px] text-[#c7ccd6]">
              Powering digital transformation across Australia and beyond.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-x-7 gap-y-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#e5e7eb]">
              {FEATURES.map((f, i) => (
                <span key={f} className="contents">
                  {i > 0 && <span className="text-[#4b5260]">·</span>}
                  <span>{f}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ---------- Right: card ---------- */}
          <div className="flex min-w-0 flex-[1_1_380px] justify-center">
            <div
              className={cn(
                'flex w-full max-w-[440px] flex-col gap-6 border border-[#1f2430] bg-[rgba(13,16,23,0.92)] pb-7 pt-[34px]',
                locked ? 'px-8' : 'px-6 sm:px-8',
              )}
            >
              {children}
            </div>
          </div>
        </div>

        {/* Footer — the copyright doubles as the hidden admin entry. */}
        <div className="flex flex-wrap justify-between gap-3 border-t border-[#1f2430] pt-[18px] text-xs uppercase tracking-[0.12em] text-[#9ca3af]">
          <Link to="/admin/login" aria-label="EG staff login" className="transition-colors hover:text-white">
            © {year} {brand.companyName} — {brand.legal.country}
          </Link>
        </div>
      </div>
    </>
  );

  if (!locked) {
    return <div className="relative min-h-screen overflow-hidden bg-[#0b0c10] font-sans text-[#e5e7eb]">{scene}</div>;
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#0b0c10] font-sans text-[#e5e7eb]">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {scene}
      </div>
    </div>
  );
}
