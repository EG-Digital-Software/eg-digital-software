import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Boxes, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { supplierApi } from '@/api/staff-portal';
import { useAuth } from '@/store/auth';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/states';
import { formatNumber } from '@/lib/utils';

function Kpi({ title, icon: Icon, value, tone }: { title: string; icon: typeof Package; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone ?? 'bg-primary/10 text-primary'}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function SupplierDashboard() {
  const user = useAuth((s) => s.user);
  const dashQ = useQuery({ queryKey: ['supplier', 'dashboard'], queryFn: supplierApi.dashboard });
  const prodQ = useQuery({
    queryKey: ['supplier', 'products', 'preview'],
    queryFn: () => supplierApi.products({ pageSize: 6 }),
  });
  const d = dashQ.data;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Products you supply and stock status" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashQ.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Kpi title="Products Supplied" icon={Package} value={formatNumber(d.products)} />
            <Kpi title="Total Available Stock" icon={Boxes} value={formatNumber(d.totalStock)} />
            <Kpi title="Low Stock" icon={AlertTriangle} value={formatNumber(d.lowStock)} tone="bg-warning/10 text-[hsl(30_90%_38%)]" />
            <Kpi title="Out of Stock" icon={XCircle} value={formatNumber(d.outOfStock)} tone="bg-destructive/10 text-destructive" />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Restock priority</CardTitle>
          <Link to="/supplier/products" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {prodQ.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !prodQ.data?.items.length ? (
            <div className="p-6">
              <EmptyState title="No products assigned" description="Products you supply will appear here." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prodQ.data.items.map((p) => {
                  const low = p.availableStock <= p.lowStockThreshold;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.sku ?? p.productCode}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.availableStock}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.lowStockThreshold}</TableCell>
                      <TableCell>
                        {p.availableStock <= 0 ? (
                          <Badge variant="destructive">Out of stock</Badge>
                        ) : low ? (
                          <Badge variant="warning">Low</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
