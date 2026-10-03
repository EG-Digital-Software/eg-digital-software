import { cn } from '@/lib/utils';

/** Blinking red dot marking activity the current user hasn't opened yet. */
export function NewActivityDot({ className }: { className?: string }) {
  return (
    <span title="New activity" aria-label="New activity" className={cn('relative flex h-2.5 w-2.5 shrink-0', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
    </span>
  );
}
