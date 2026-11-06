import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { InvoiceForm } from '@/components/invoice/InvoiceForm';

export default function CreateInvoicePage() {
  const [params] = useSearchParams();
  const preClient = params.get('clientId') ?? '';
  const navigate = useNavigate();

  return (
    <div className="ec-page">
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Billing · New invoice</div>
          <h1 className="disp ec-h1">Create invoice</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            Generate a new invoice for a customer.
          </p>
        </div>
        <Link to="/admin/billing" className="btn bg">
          <ArrowLeft /> All invoices
        </Link>
      </div>

      <section className="up" style={{ animationDelay: '.08s' }}>
        <InvoiceForm
          clientId={preClient}
          onSuccess={(invoice) => navigate(`/admin/billing/${invoice.id}`)}
          onCancel={() => navigate('/admin/billing')}
        />
      </section>
    </div>
  );
}
