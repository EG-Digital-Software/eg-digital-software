import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/invoice/InvoiceForm';

export default function CreateInvoicePage() {
  const [params] = useSearchParams();
  const preClient = params.get('clientId') ?? '';
  const navigate = useNavigate();

  return (
    <div className="w-full space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-secondary/30 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/billing">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Create Invoice</h1>
              <p className="text-sm text-muted-foreground">Generate a new invoice for a customer</p>
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
            <Receipt className="h-4 w-4" />
          </span>
        </div>
      </div>

      <InvoiceForm
        clientId={preClient}
        onSuccess={(invoice) => navigate(`/admin/billing/${invoice.id}`)}
        onCancel={() => navigate('/admin/billing')}
      />
    </div>
  );
}
