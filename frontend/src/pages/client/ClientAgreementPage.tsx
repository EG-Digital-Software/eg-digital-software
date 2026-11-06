import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, PenLine } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { ErrorState } from '@/components/shared/states';
import { formatDate, mediaUrl } from '@/lib/utils';
import { brand } from '@/config/brand';
import type { CustomerDocument } from '@/types';
import { needsSignature } from '@/lib/agreements';
import AgreementSignDialog from './AgreementSignDialog';

function docSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const isPdf = (d: CustomerDocument) => d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);

/** "EG-Task-Order-Website-Redesign.pdf" → "EG Task Order Website Redesign". */
const docTitle = (d: CustomerDocument) => d.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();

type Filter = 'all' | 'sign' | 'wait' | 'approved' | 'rejected';
type Stage = 'sign' | 'rejected' | 'wait' | 'approved';

const stageOf = (d: CustomerDocument): Stage =>
  d.status === 'APPROVED' ? 'approved' : d.status === 'SUBMITTED' ? 'wait' : d.status === 'REJECTED' ? 'rejected' : 'sign';

const STAGE: Record<Stage, { label: string; chip: string; tag: string; tagText: string }> = {
  sign: { label: 'Signature needed', chip: 'chip c-warn', tag: 'signtag', tagText: 'Sign here' },
  rejected: { label: 'Not approved', chip: 'chip c-red', tag: 'badtag', tagText: 'Sign again' },
  wait: { label: 'Awaiting approval', chip: 'chip c-info', tag: 'senttag', tagText: 'Sent' },
  approved: { label: 'Approved', chip: 'chip c-ok', tag: 'oktag', tagText: 'Approved' },
};

const short = (iso?: string | null) => (iso ? formatDate(iso, 'dd MMM') : '');

function steps(d: CustomerDocument, stage: Stage): { label: string; cls: string }[] {
  const issued = { label: `Issued ${short(d.createdAt)}`.trim(), cls: 'st st-done' };
  switch (stage) {
    case 'sign':
      return [issued, { label: 'Your signature', cls: 'st st-now' }, { label: 'Approval', cls: 'st' }];
    case 'rejected':
      return [issued, { label: 'Not approved', cls: 'st st-bad' }, { label: 'Sign again', cls: 'st' }];
    case 'wait':
      return [
        issued,
        { label: `Sent ${short(d.submittedAt ?? d.signedAt)}`.trim(), cls: 'st st-done' },
        { label: 'Approval', cls: 'st st-wait' },
      ];
    default:
      return [
        issued,
        { label: `Signed ${short(d.signedAt ?? d.submittedAt)}`.trim(), cls: 'st st-done' },
        { label: `Approved ${short(d.approvedAt)}`.trim(), cls: 'st st-done' },
      ];
  }
}

/**
 * Client portal — agreement documents. The client fills + signs the blank PDF the
 * admin shared, waits for approval, then downloads the approved copy.
 */
export default function ClientAgreementPage() {
  const qc = useQueryClient();
  const [signing, setSigning] = useState<CustomerDocument | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const { data: c, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'profile'],
    queryFn: () => clientApi.profile(),
    // Reflect admin approval without the client having to refresh.
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });

  const submit = useMutation({
    mutationFn: async ({ id, bytes, fileName }: { id: string; bytes: Uint8Array; fileName: string }) => {
      const buffer = bytes.slice().buffer as ArrayBuffer;
      return clientApi.signDocument(id, new Blob([buffer], { type: 'application/pdf' }), fileName);
    },
    onSuccess: () => {
      setSigning(null);
      qc.invalidateQueries({ queryKey: ['client', 'profile'] });
      toast.success('Agreement submitted for approval');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not submit the agreement')),
  });

  if (isLoading) {
    return (
      <div className="ec-page">
        <div className="skel" style={{ height: 110 }} />
        <div className="skel" style={{ height: 260 }} />
      </div>
    );
  }
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const docs = c.documents ?? [];
  const toSign = docs.filter(needsSignature);
  const byStage = (s: Stage) => docs.filter((d) => stageOf(d) === s);
  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: docs.length },
    { value: 'sign', label: 'To sign', count: toSign.length },
    { value: 'wait', label: 'Awaiting approval', count: byStage('wait').length },
    { value: 'approved', label: 'Approved', count: byStage('approved').length },
    { value: 'rejected', label: 'Not approved', count: byStage('rejected').length },
  ].filter((t) => t.value === 'all' || t.value === 'sign' || t.count > 0) as { value: Filter; label: string; count: number }[];
  const shown =
    filter === 'all'
      ? docs
      : filter === 'sign'
        ? toSign
        : docs.filter((d) => stageOf(d) === (filter as Stage));

  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Agreements</div>
        <h1 className="disp ec-h1">Documents to review and sign</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          {docs.length === 0
            ? 'Agreements shared with you will appear here.'
            : toSign.length
              ? `${toSign.length} of ${docs.length} ${docs.length === 1 ? 'document needs' : 'documents need'} your signature. Each one confirms the scope and pricing for a piece of work.`
              : 'All your agreements are signed. Download approved copies any time.'}
        </p>
      </div>

      {docs.length > 0 && (
        <div
          className="up"
          style={{ animationDelay: '.08s', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <div className="segs" role="group" aria-label="Filter agreements">
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`seg${filter === t.value ? ' on' : ''}`}
                aria-pressed={filter === t.value}
                onClick={() => setFilter(t.value)}
              >
                {t.label} <span className="mono" style={{ opacity: 0.7 }}>{t.count}</span>
              </button>
            ))}
          </div>
          {toSign.length > 0 && (
            <div className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="dot" style={{ color: '#E39B2E' }} />
              Signing keeps the work on schedule
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <section
          className="glass up"
          style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
        >
          <span className="ico" style={{ width: 48, height: 48, borderRadius: 14, marginBottom: 14 }}>
            <FileText className="h-6 w-6" />
          </span>
          <h2 className="disp" style={{ margin: 0, fontSize: 20 }}>
            {docs.length === 0 ? 'No agreement documents' : 'Nothing here'}
          </h2>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 420 }}>
            {docs.length === 0
              ? 'There are no agreement documents shared with you yet.'
              : 'No agreements match this filter.'}
          </p>
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
          {shown.map((d, i) => {
            const stage = stageOf(d);
            const st = STAGE[stage];
            const pdf = isPdf(d);
            const hasFields = (d.fields?.length ?? 0) > 0;
            const fileUrl = mediaUrl(d.signedUrl || d.url) ?? '';
            const title = docTitle(d);
            const canSign = needsSignature(d) && pdf && hasFields;
            return (
              <article
                key={d.id}
                className="glass card up tord"
                style={{ animationDelay: `${0.05 + i * 0.07}s`, padding: 22, display: 'flex', flexWrap: 'wrap', gap: 22 }}
              >
                <div className="docw" aria-hidden="true">
                  <div className="paper back" />
                  <div className="paper front">
                    <img src={brand.icon} alt="" style={{ height: 14, width: 'auto' }} />
                    <div style={{ fontSize: 5.5, letterSpacing: '.14em', color: '#178A63', fontWeight: 700, marginTop: 9 }}>
                      AGREEMENT
                    </div>
                    <div
                      style={{
                        font: '700 9px/1.2 Manrope, Inter, sans-serif',
                        marginTop: 2,
                        color: '#0F2340',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {title}
                    </div>
                    <div style={{ fontSize: 6, color: '#5B6B80', marginTop: 1 }}>{formatDate(d.createdAt)}</div>
                    <div className="ln" style={{ marginTop: 8, width: '92%' }} />
                    <div className="ln" style={{ width: '78%' }} />
                    <div className="ln" style={{ width: '86%' }} />
                    <div style={{ marginTop: 7, border: '1px solid #E3E8EF', borderRadius: 3, padding: 4 }}>
                      <div className="ln" style={{ marginTop: 0, width: '60%', background: '#CFE9DE' }} />
                      <div className="ln" style={{ width: '80%' }} />
                      <div className="ln" style={{ width: '70%' }} />
                    </div>
                    <div className="ln" style={{ marginTop: 7, width: '88%' }} />
                    <div className="ln" style={{ width: '64%' }} />
                    <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>
                      <span className={st.tag}>{st.tagText}</span>
                      <div style={{ borderTop: '1px solid #9AA8BA', marginTop: 4, fontSize: 5, color: '#5B6B80', paddingTop: 2 }}>
                        Client signature
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={st.chip}>
                      <span className="dot" />
                      {st.label}
                    </span>
                    <span className="chip c-ns">{pdf ? 'PDF' : 'Document'}</span>
                  </div>
                  <h3 className="disp" style={{ margin: '12px 0 2px', fontSize: 20, fontWeight: 600, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                    {title}
                  </h3>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    EG Eloma agreement · issued {formatDate(d.createdAt)}
                  </div>
                  <div className="steps" style={{ marginTop: 18 }}>
                    {steps(d, stage).map((s) => (
                      <div key={s.label} className={s.cls}>
                        <i />
                        <span>{s.label}</span>
                      </div>
                    ))}
                  </div>
                  {stage === 'rejected' && (
                    <p style={{ margin: '14px 0 0', fontSize: 13, fontWeight: 500, color: 'var(--rT)' }}>
                      Not approved — please sign and resubmit again.
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 18,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(var(--w),.04)',
                    }}
                  >
                    <FileText className="h-4 w-4 shrink-0" style={{ color: '#C8264A' }} aria-hidden="true" />
                    <span className="mono" style={{ fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.fileName}
                    </span>
                    <span className="muted mono" style={{ fontSize: 11, flexShrink: 0 }}>
                      {docSize(d.size)}
                      {pdf ? ' · PDF' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    {canSign ? (
                      <button type="button" className="btn bp" style={{ flex: 1 }} onClick={() => setSigning(d)}>
                        <PenLine /> {stage === 'rejected' ? 'Sign and resubmit' : 'Review and sign'}
                      </button>
                    ) : needsSignature(d) ? (
                      <span className="muted" style={{ flex: 1, fontSize: 12 }}>
                        {pdf ? 'Not ready to sign yet' : 'Ask admin for a PDF version'}
                      </span>
                    ) : stage === 'wait' ? (
                      <span className="muted" style={{ flex: 1, fontSize: 12 }}>
                        Sent for approval{d.submittedAt ? ` · ${formatDate(d.submittedAt)}` : ''}
                      </span>
                    ) : null}
                    {fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noreferrer" className="btn bg" style={{ flex: 1 }}>
                        Preview
                      </a>
                    )}
                    {stage === 'approved' && fileUrl && (
                      <a
                        href={fileUrl}
                        download={d.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="btn bg"
                        aria-label="Download signed PDF"
                        title="Download signed PDF"
                        style={{ width: 44, padding: 0 }}
                      >
                        <Download />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {signing && (
        <AgreementSignDialog
          document={signing}
          open={!!signing}
          onOpenChange={(o) => {
            if (!o) setSigning(null);
          }}
          submitting={submit.isPending}
          onSubmit={async (bytes) => {
            await submit.mutateAsync({ id: signing.id, bytes, fileName: signing.fileName });
          }}
        />
      )}
    </div>
  );
}
