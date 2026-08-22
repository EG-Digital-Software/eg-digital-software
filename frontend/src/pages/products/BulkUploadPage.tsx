import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  ArrowLeft,
  FileSpreadsheet,
  CheckCircle2,
  Download,
  Eye,
  X,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { productApi, type ImportResult } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/shared/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ACCEPTED = ['.csv', '.xls', '.xlsx'];
const MAX_BYTES = 10 * 1024 * 1024;

/** Columns the importer understands, in the order the template writes them. */
const TEMPLATE_COLUMNS = [
  'productCode',
  'name',
  'sku',
  'type',
  'category',
  'description',
  'unit',
  'pricePerQty',
  'taxRate',
  'totalStock',
  'lowStockThreshold',
];

const TEMPLATE_SAMPLE = [
  [
    'EGD-P-001',
    'Microsoft 365 Business Premium',
    'SKU-001',
    'Software Licence',
    'Software',
    'Annual subscription per seat',
    'seat',
    '25.50',
    '10',
    '120',
    '10',
  ],
  ['EGD-P-002', 'Managed Firewall', 'SKU-002', 'Hardware', 'Hardware', '', 'device', '450', '10', '14', '5'],
];

/** Build the starter CSV in the browser — no round trip, no server route. */
function downloadTemplate() {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [TEMPLATE_COLUMNS, ...TEMPLATE_SAMPLE].map((r) => r.map(escape).join(',')).join('\r\n');
  // Leading BOM (U+FEFF) so Excel opens the file as UTF-8 rather than ANSI.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'eg-digital-products-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-[hsl(30_90%_38%)]'
        : tone === 'destructive'
          ? 'text-destructive'
          : 'text-foreground';
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default function BulkUploadPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const runImport = useMutation({
    mutationFn: ({ f, dryRun }: { f: File; dryRun: boolean }) => productApi.bulkImport(f, dryRun),
    onSuccess: (res) => {
      setResult(res);
      if (res.dryRun) {
        toast.success(
          res.failed > 0
            ? `Preview: ${res.imported} would import, ${res.failed} row(s) need fixing`
            : `Preview: ${res.imported} product${res.imported === 1 ? '' : 's'} ready to import`
        );
        return;
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${res.imported} product${res.imported === 1 ? '' : 's'} imported`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Import failed')),
  });

  // Reject the obviously-wrong file here rather than after a 10MB upload.
  const handleFile = (f: File | null) => {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      toast.error(`Unsupported file type — use ${ACCEPTED.join(', ')}`);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('File must be under 10MB');
      return;
    }
    setResult(null);
    setFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const busy = runImport.isPending;
  const previewed = !!result?.dryRun;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/products">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Bulk Upload Products"
          description="Import products from CSV, XLS or XLSX"
          actions={
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Download template
            </Button>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">
                {file ? file.name : 'Drop your file here, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                CSV, XLS, XLSX — up to 10MB, 5,000 rows
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={clearFile} disabled={busy}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runImport.mutate({ f: file, dryRun: true })}
                    disabled={busy}
                  >
                    {busy && runImport.variables?.dryRun ? <Spinner /> : <Eye className="h-4 w-4" />}
                    Preview
                  </Button>
                  <Button
                    onClick={() => runImport.mutate({ f: file, dryRun: false })}
                    disabled={busy}
                  >
                    {busy && !runImport.variables?.dryRun && <Spinner />} Import products
                  </Button>
                </div>
              </div>
            )}

            {file && !result && (
              <p className="text-xs text-muted-foreground">
                Tip: run <strong>Preview</strong> first — it validates every row and reports what
                would happen without writing anything.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expected columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">productCode</code> —
              required
            </p>
            <p>
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">name</code> — required
            </p>
            <p>
              Optional:{' '}
              <code className="text-xs">
                sku, type, category, description, unit, pricePerQty, taxRate, totalStock,
                lowStockThreshold
              </code>
            </p>
            <p className="pt-2 text-xs">
              Existing product codes and SKUs are skipped, never overwritten. Column names are
              matched case-insensitively.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> Download template
            </Button>
          </CardContent>
        </Card>
      </div>

      {result && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              {previewed ? (
                <>
                  <Eye className="h-5 w-5 text-primary" /> Preview result
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success" /> Import result
                </>
              )}
            </CardTitle>
            {previewed && <Badge variant="secondary">Nothing was saved</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total Rows" value={result.total} />
              <Stat
                label={previewed ? 'Would Import' : 'Imported'}
                value={result.imported}
                tone="success"
              />
              <Stat label="Skipped" value={result.skipped} tone="warning" />
              <Stat label="Failed" value={result.failed} tone="destructive" />
            </div>

            {previewed && result.imported > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
                <p className="text-sm">
                  {result.failed > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-[hsl(30_90%_38%)]" />
                      {result.failed} row(s) will be left out. Import the rest anyway?
                    </span>
                  ) : (
                    'Everything checks out.'
                  )}
                </p>
                <Button
                  onClick={() => file && runImport.mutate({ f: file, dryRun: false })}
                  disabled={busy}
                >
                  {busy && <Spinner />} Import {result.imported} product
                  {result.imported === 1 ? '' : 's'}
                </Button>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((e, i) => {
                      const skipped = e.error.toLowerCase().includes('skipped');
                      return (
                        <TableRow key={i}>
                          <TableCell className="tabular-nums">{e.row || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{e.field}</TableCell>
                          <TableCell>
                            <Badge variant={skipped ? 'warning' : 'destructive'}>
                              {skipped ? 'Skipped' : 'Error'}
                            </Badge>
                            <span className="ml-2 text-sm text-muted-foreground">{e.error}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
