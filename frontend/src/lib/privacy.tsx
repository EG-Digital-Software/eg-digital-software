import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacyStore } from './privacyStore';

export { usePrivacyStore };

/**
 * Admin privacy mode: hides amounts (shown as •••• like a password), blurs
 * customer names, contact details and charts, so the portal can be shown on a
 * shared screen. Purely visual — nothing is sent to or changed on the server.
 *
 * Amounts are masked centrally in formatCurrency; names and details are
 * blurred by CSS wherever an element carries `data-private`.
 */

/** True while privacy mode is on in the Admin portal. */
export function usePrivate(): boolean {
  return usePrivacyStore((s) => s.available && s.on);
}

/** Shortcut label for the current platform. */
export const PRIVACY_SHORTCUT =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform) ? '⌘⇧H' : 'Ctrl⇧H';

const PEEK_MS = 8000;

/**
 * Per-card peek: reveals one card for a few seconds while privacy mode stays on.
 * Returns whether this card's content should be hidden right now.
 */
export function usePeek() {
  const isPrivate = usePrivate();
  const [peeking, setPeeking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toggle = useCallback(() => {
    clearTimeout(timer.current);
    setPeeking((p) => {
      if (!p) timer.current = setTimeout(() => setPeeking(false), PEEK_MS);
      return !p;
    });
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { isPrivate, hidden: isPrivate && !peeking, peeking: isPrivate && peeking, toggle };
}

/** Small "Peek / Hide" control. Stops the click so a card that is a link doesn't navigate. */
export function PeekButton({ peeking, onToggle, label = 'Peek' }: { peeking: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="linkbtn"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      style={{ minHeight: 0, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--mu)' }}
      aria-pressed={peeking}
    >
      {peeking ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {peeking ? 'Hide' : label}
    </button>
  );
}

/** Password-style dots for a hidden value. Money keeps its "$" so the figure's kind is clear. */
export function Dots({ money = false, n = 4 }: { money?: boolean; n?: number }) {
  return (
    <span aria-label="Hidden" style={{ letterSpacing: '0.18em', whiteSpace: 'nowrap' }}>
      {money && '$ '}
      {'•'.repeat(n)}
    </span>
  );
}

/** Blurs its content (names, charts) and blocks selecting or copying it. */
export function Blur({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  if (!hidden) return <>{children}</>;
  return (
    <span aria-label="Hidden" style={{ filter: 'blur(6px)', userSelect: 'none', pointerEvents: 'none' }}>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

/** Keeps a reference's prefix and hides the rest: "EGE-INV-0042" → "EGE-INV-••••". */
export function maskRef(value: string): string {
  const cut = value.lastIndexOf('-');
  return cut > 0 ? `${value.slice(0, cut + 1)}••••` : '••••';
}

/** Header toggle + Ctrl/⌘+Shift+H shortcut. */
export function PrivacyToggle() {
  const on = usePrivacyStore((s) => s.on);
  const toggle = usePrivacyStore((s) => s.toggle);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return (
    <button
      type="button"
      className={`btn ${on ? 'bp' : 'bg'} ec-theme`}
      onClick={toggle}
      aria-pressed={on}
      title={`${on ? 'Turn off' : 'Turn on'} privacy mode (${PRIVACY_SHORTCUT})`}
      style={{ padding: '0 14px' }}
    >
      {on ? <EyeOff /> : <Eye />}
      <span className="lbl">Private</span>
      <kbd className="lbl" style={{ fontSize: 10, opacity: 0.7, fontFamily: 'inherit' }}>
        {PRIVACY_SHORTCUT}
      </kbd>
    </button>
  );
}
