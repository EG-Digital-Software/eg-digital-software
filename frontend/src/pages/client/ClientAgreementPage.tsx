import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Download, PenLine } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { ErrorState, EmptyState } from '@/components/shared/states';
import { formatDate, mediaUrl } from '@/lib/utils';
import { brand } from '@/config/brand';
import type { CustomerDocument } from '@/types';
import { ElPageHead, ElPill, ElSeg, ElSkel } from '@/components/client/eloma';
import { needsSignature } from '@/lib/agreements';
import AgreementSignDialog from './AgreementSignDialog';

function docSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const isPdf = (d: CustomerDocument) =>
  d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);

/** "EG-Task-Order-Website-Redesign.pdf" → "EG Task Order Website Redesign". */
const docTitle = (d: CustomerDocument) => d.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();

type Filter = 'all' | 'sign';

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
      <>
        <ElSkel className="h-24" />
        <ElSkel className="h-64" />
      </>
    );
  }
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const docs = c.documents ?? [];
  const toSign = docs.filter(needsSignature);
  const shown = filter === 'sign' ? toSign : docs;

  return (
    <>
      <ElPageHead
        eyebrow="Agreements"
        title="Documents to review and sign"
        description={
          docs.length === 0
            ? 'Agreements shared with you will appear here.'
            : toSign.length
              ? `${toSign.length} of ${docs.length} ${docs.length === 1 ? 'document needs' : 'documents need'} your signature. Each one confirms the scope and pricing for a piece of work.`
              : 'All your agreements are signed. Download approved copies any time.'
        }
        actions={
          docs.length > 0 && (
            <ElSeg<Filter>
              label="Filter agreements"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: docs.length },
                { value: 'sign', label: 'To sign', count: toSign.length },
              ]}
            />
          )
        }
      />

      {shown.length === 0 ? (
        <section className="el-card p-6">
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={docs.length === 0 ? 'No agreement documents' : 'Nothing to sign'}
            description={
              docs.length === 0
                ? 'There are no agreement documents shared with you yet.'
                : 'Every agreement has been signed or sent for approval.'
            }
          />
        </section>
      ) : (
        <div className="el-docs">
          {shown.map((d) => {
            const approved = d.status === 'APPROVED';
            const submitted = d.status === 'SUBMITTED';
            const rejected = d.status === 'REJECTED';
            const pdf = isPdf(d);
            const hasFields = (d.fields?.length ?? 0) > 0;
            const downloadUrl = mediaUrl(d.signedUrl || d.url) ?? '';
            const title = docTitle(d);
            return (
              <article key={d.id} className="el-card el-doc">
                <div className="el-sheet" aria-hidden="true">
                  <div className="pg">
                    <header>
                      <img src={brand.icon} alt="" />
                      Eloma Group
                    </header>
                    <div className="t">{title}</div>
                    <span className="text-[9px] text-[#77869A]">{formatDate(d.createdAt)}</span>
                    <i />
                    <i className="s" />
                    <i />
                    <i className="s" />
                  </div>
                </div>
                <div className="body">
                  <div className="flex flex-wrap items-center gap-2">
                    {approved ? (
                      <ElPill tone="ok">Approved</ElPill>
                    ) : submitted ? (
                      <ElPill tone="info">Awaiting approval</ElPill>
                    ) : rejected ? (
                      <ElPill tone="bad">Not approved</ElPill>
                    ) : (
                      <ElPill tone="warn">Signature needed</ElPill>
                    )}
                    <span className="el-muted text-[12.5px]">
                      {docSize(d.size)}
                      {pdf ? ' · PDF' : ''}
                    </span>
                  </div>
                  <h3>{title}</h3>
                  <span className="fn">{d.fileName}</span>
                  {rejected && (
                    <p className="m-0 text-[13px] font-medium text-[color:var(--bad)]">
                      Not approved — please sign and resubmit again.
                    </p>
                  )}
                  <div className="dfoot">
                    {approved ? (
                      <a
                        href={downloadUrl}
                        download={d.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="el-btn sm"
                        title="Download signed PDF"
                      >
                        <Download /> Download
                      </a>
                    ) : submitted ? (
                      <span className="el-muted text-xs">
                        Sent for approval{d.submittedAt ? ` · ${formatDate(d.submittedAt)}` : ''}
                      </span>
                    ) : pdf && hasFields ? (
                      <button type="button" className="el-btn sm primary" onClick={() => setSigning(d)}>
                        <PenLine /> {rejected ? 'Sign and resubmit' : 'Review and sign'}
                      </button>
                    ) : pdf ? (
                      <span className="el-muted text-xs">Not ready to sign yet</span>
                    ) : (
                      <span className="el-muted text-xs">Ask admin for a PDF version</span>
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
          onOpenChange={(o) => { if (!o) setSigning(null); }}
          submitting={submit.isPending}
          onSubmit={async (bytes) => { await submit.mutateAsync({ id: signing.id, bytes, fileName: signing.fileName }); }}
        />
      )}
    </>
  );
}
