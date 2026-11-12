import { PageHeader } from '@/components/shared/misc';

/** Placeholder for an admin section that is on the menu but not built yet. */
export default function ComingSoonPage({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="ec-page">
      <PageHeader eyebrow="Admin" title={title} description={text} />
      <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
        <h4 className="mt-4 text-base font-semibold">{title}</h4>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
        <span className="mt-4 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          Coming soon
        </span>
      </div>
    </div>
  );
}
