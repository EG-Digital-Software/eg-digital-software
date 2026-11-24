export function Monogram({ text, big }: { text: string; big?: boolean }) {
  const s = big ? 48 : 40;
  return (
    <span
      style={{
        width: s,
        height: s,
        borderRadius: 12,
        background: 'rgba(31, 138, 91, 0.12)',
        color: 'var(--gT)',
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

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

/** Read-only star row. */
export function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span role="img" aria-label={`${n} out of 5 stars`} style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d={STAR} fill={i <= n ? '#D97706' : 'none'} stroke={i <= n ? '#B45309' : 'currentColor'} strokeOpacity={i <= n ? 1 : 0.45} strokeWidth={1.5} />
        </svg>
      ))}
    </span>
  );
}

/** Five tappable stars (44px targets). */
export function StarPicker({ value, onPick, label }: { value: number; onPick: (n: number) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            aria-pressed={on}
            onClick={() => onPick(n)}
            style={{
              width: 44,
              height: 44,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'inherit',
              padding: 0,
            }}
          >
            <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR} fill={on ? '#D97706' : 'none'} stroke={on ? '#B45309' : 'currentColor'} strokeOpacity={on ? 1 : 0.5} strokeWidth={1.5} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
