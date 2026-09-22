import { BarChart3, Receipt, Wallet, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/states';

function Kpi({
  title,
  icon: Icon,
  value,
  tone,
}: {
  title: string;
  icon: typeof BarChart3;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone ?? 'bg-primary/10 text-primary'}`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Business reports across revenue, customers and payments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Total Revenue" icon={Wallet} value="—" tone="bg-success/10 text-success" />
        <Kpi title="Invoices" icon={Receipt} value="—" />
        <Kpi title="Customers" icon={Users} value="—" tone="bg-primary/10 text-primary" />
        <Kpi title="Growth" icon={BarChart3} value="—" tone="bg-warning/10 text-[hsl(30_90%_38%)]" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <EmptyState
            title="No reports yet"
            description="Reporting charts and exports will appear here once wired to the dashboard API."
          />
        </CardContent>
      </Card>
    </div>
  );
}
