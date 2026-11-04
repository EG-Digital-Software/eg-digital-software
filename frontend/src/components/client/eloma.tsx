import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import '@/components/layout/eloma.css';

/* Building blocks for the customer portal's "Eloma" design (see eloma.css). */

export function ElPageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="el-page-h">
      <div className="grow">
        <span className="el-eyebrow">{eyebrow}</span>
        <h1 className="el-h1">{title}</h1>
        {description && <p className="desc">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ElCard({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('el-card', className)}>
      {title && (
        <div className="el-card-h">
          <h2 className="el-h2 grow">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type PillTone = 'ok' | 'idle' | 'warn' | 'info' | 'bad';

export function ElPill({ tone, children, dot = true }: { tone: PillTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('el-pill', tone)}>
      {dot && <i />}
      {children}
    </span>
  );
}

/** Segmented filter control (All / Outstanding / …). */
export function ElSeg<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div className="el-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <small>{o.count}</small>}
        </button>
      ))}
    </div>
  );
}

export function ElSkel({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('el-skel skeleton', className)} style={style} />;
}

