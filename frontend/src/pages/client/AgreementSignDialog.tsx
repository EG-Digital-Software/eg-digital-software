import { AgreementFillDialog } from '@/components/shared/AgreementFillDialog';
import type { CustomerDocument } from '@/types';

export interface AgreementSignDialogProps {
  document: CustomerDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the filled + signed PDF bytes and the ids of the fields filled. */
  onSubmit: (bytes: Uint8Array, filledFieldIds: string[]) => Promise<void>;
  submitting?: boolean;
}

/**
 * Client-facing fill-and-sign viewer over the blank template. The client may fill
 * only some fields — the admin fills the rest after it is submitted.
 */
export default function AgreementSignDialog({
  document: doc,
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: AgreementSignDialogProps) {
  const rejected = doc.status === 'REJECTED';
  return (
    <AgreementFillDialog
      filePath={`/client/documents/${doc.id}/file`}
      fields={doc.fields ?? []}
      signer={{ path: '/client/signer', footerLine: 0 }}
      title={`Review & sign — ${doc.fileName}`}
      description="Fill the fields that apply to you. In any field you can type, or upload an image (e.g. your signature) with the image button. Nothing is downloaded until an admin approves it."
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      submitting={submitting}
      submitLabel={rejected ? 'Save & resubmit' : 'Save & submit'}
      emptyMessage="This document isn’t ready to sign yet. Please check back once the admin has marked the fields to fill."
      notice={
        rejected && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive">
            This agreement was not approved. Please fill it in, sign and resubmit it again.
          </div>
        )
      }
    />
  );
}
