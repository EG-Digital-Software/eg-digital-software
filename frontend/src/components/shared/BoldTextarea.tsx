import { Fragment, useRef } from 'react';
import { Bold } from 'lucide-react';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Plain text where **double asterisks** mark bold runs. */
export function BoldText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <p className={cn('whitespace-pre-wrap', className)}>
      {parts.map((part, i) =>
        /^\*\*[^*\n]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
      )}
    </p>
  );
}

/**
 * Textarea with a Bold button (and Ctrl/⌘+B) that wraps the selection in **…**.
 * The value stays plain text, so it is safe to store and render anywhere.
 */
export function BoldTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const toggleBold = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end);
    const wrapped = start >= 2 && value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**';
    let next: string;
    let selStart: number;
    let selEnd: number;
    if (wrapped) {
      // Already bold — unwrap.
      next = value.slice(0, start - 2) + selected + value.slice(end + 2);
      selStart = start - 2;
      selEnd = end - 2;
    } else {
      const inner = selected || 'bold text';
      next = value.slice(0, start) + `**${inner}**` + value.slice(end);
      selStart = start + 2;
      selEnd = start + 2 + inner.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
        <div className="flex items-center gap-1 border-b border-input bg-secondary/40 px-1.5 py-1">
          <button
            type="button"
            onClick={toggleBold}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Bold className="h-4 w-4" />
          </button>
        </div>
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              toggleBold();
            }
          }}
          placeholder={placeholder}
          rows={4}
          className={cn('rounded-none border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0', className)}
        />
      </div>
      {/\*\*[^*\n]+\*\*/.test(value) && (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
          <BoldText text={value} />
        </div>
      )}
    </div>
  );
}
