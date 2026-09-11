import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Download, PenLine } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { ErrorState, EmptyState } from '@/components/shared/states';
import { mediaUrl } from '@/lib/utils';
import type { CustomerDocument } from '@/types';
import AgreementSignDialog from './AgreementSignDialog';

function docSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const isPdf = (d: CustomerDocument) =>
  d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);

/**
 * Client portal — agreement documents. The client fills + signs the blank PDF the
 * admin shared, waits for approval, then downloads the approved copy.
 */
export default function ClientAgreementPage() {
  const qc = useQueryClient();
  const [signing, setSigning] = useState<CustomerDocument | null>(null);

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
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const docs = c.documents ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Agreement" description="Review, sign and download agreements shared with you" icon={FileText} />

      <Card>
        <CardContent className="pt-6">
          {docs.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No agreement documents"
              description="There are no agreement documents shared with you yet."
            />
          ) : (
            <div className="space-y-2">
              {docs.map((d) => {
                const approved = d.status === 'APPROVED';
                const submitted = d.status === 'SUBMITTED';
                const pdf = isPdf(d);
                const hasFields = (d.fields?.length ?? 0) > 0;
                const downloadUrl = mediaUrl(d.signedUrl || d.url) ?? '';
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-sm">
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium" title={d.fileName}>{d.fileName}</span>
                    <Badge variant={approved ? 'success' : submitted ? 'secondary' : 'outline'}>
                      {approved ? 'Approved' : submitted ? 'Awaiting approval' : 'Action needed'}
                    </Badge>
                    <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{docSize(d.size)}</span>
                    {approved ? (
                      <a
                        href={downloadUrl}
                        download={d.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary"
                        title="Download signed PDF"
                      >
                        <Download className="h-4 w-4" /> Download
                      </a>
                    ) : submitted ? (
                      <span className="text-xs text-muted-foreground">Sent for approval</span>
                    ) : pdf && hasFields ? (
                      <Button type="button" size="sm" onClick={() => setSigning(d)}>
                        <PenLine className="h-4 w-4" /> Review &amp; sign
                      </Button>
                    ) : pdf ? (
                      <span className="text-xs text-muted-foreground">Not ready to sign yet</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ask admin for a PDF version</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {signing && (
        <AgreementSignDialog
          document={signing}
          open={!!signing}
          onOpenChange={(o) => { if (!o) setSigning(null); }}
          submitting={submit.isPending}
          onSubmit={async (bytes) => { await submit.mutateAsync({ id: signing.id, bytes, fileName: signing.fileName }); }}
        />
      )}
    </div>
  );
}
