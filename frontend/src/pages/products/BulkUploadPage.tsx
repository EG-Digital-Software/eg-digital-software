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
import { Spinner } from '@/components/shared/states';

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

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="tile">
      <div className="eyebrow" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color }}>
        {value}
      </div>
    </div>
  );
}

const rowBox = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(var(--w),.04)',
} as const;

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
  const imported = !!result && !result.dryRun;

  // Where the user is in the import: template → file → preview → import.
  const steps = [
    { label: 'Download the template', state: 'done' },
    { label: 'Choose your file', state: file ? 'done' : 'now' },
    { label: 'Preview the rows', state: result ? 'done' : file ? 'now' : '' },
    { label: 'Import products', state: imported ? 'done' : previewed ? 'now' : '' },
  ];

  return (
    <div className="ec-page">
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <Link to="/admin/products" className="btn bg sm" style={{ marginBottom: 14 }}>
            <ArrowLeft /> Products
          </Link>
          <div>
            <div className="eyebrow">Catalogue</div>
          </div>
          <h1 className="disp ec-h1">Bulk upload</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
            Import products from CSV, XLS or XLSX.
          </p>
        </div>
        <button type="button" className="btn bg" onClick={downloadTemplate}>
          <Download /> Download template
        </button>
      </div>

      <section className="glass up" style={{ animationDelay: '.08s', padding: '20px 22px' }}>
        <div className="eyebrow">How it works</div>
        <div className="steps" style={{ marginTop: 14, maxWidth: 720 }}>
          {steps.map((st) => (
            <div key={st.label} className={`st${st.state ? ` st-${st.state}` : ''}`}>
              <i />
              <span>{st.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section className="glass up" style={{ animationDelay: '.14s', overflow: 'hidden', flex: '2 1 480px', minWidth: 0 }}>
          <h2 className="disp" style={{ margin: 0, padding: '18px 22px', fontSize: 18 }}>
            Upload file
          </h2>
          <div style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a file to upload"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
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
              className="tile"
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '44px 24px',
                borderStyle: 'dashed',
                borderWidth: 2,
                borderColor: dragging ? 'var(--brand)' : undefined,
                background: dragging ? 'rgba(45,185,138,.08)' : undefined,
              }}
            >
              <span className="ico" style={{ width: 48, height: 48, borderRadius: 14, marginBottom: 12 }}>
                <UploadCloud className="h-6 w-6" />
              </span>
              <div style={{ fontWeight: 600 }}>{file ? file.name : 'Drop your file here, or click to browse'}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                CSV, XLS, XLSX — up to 10MB, 5,000 rows
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div style={rowBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span className="ico">
                    <FileSpreadsheet className="h-[18px] w-[18px]" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="mono"
                      style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {file.name}
                    </div>
                    <div className="muted mono" style={{ fontSize: 11 }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn bg"
                    onClick={clearFile}
                    disabled={busy}
                    aria-label="Remove file"
                    style={{ width: 44, padding: 0 }}
                  >
                    <X />
                  </button>
                  <button
                    type="button"
                    className="btn bg"
                    onClick={() => runImport.mutate({ f: file, dryRun: true })}
                    disabled={busy}
                  >
                    {busy && runImport.variables?.dryRun ? <Spinner /> : <Eye />}
                    Preview
                  </button>
                  <button
                    type="button"
                    className="btn bp"
                    onClick={() => runImport.mutate({ f: file, dryRun: false })}
                    disabled={busy}
                  >
                    {busy && !runImport.variables?.dryRun && <Spinner />} Import products
                  </button>
                </div>
              </div>
            )}

            {file && !result && (
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                Tip: run <b style={{ color: 'var(--fg)' }}>Preview</b> first — it validates every row and reports
                what would happen without writing anything.
              </p>
            )}
          </div>
        </section>

        <section className="glass up" style={{ animationDelay: '.2s', padding: '18px 22px', flex: '1 1 280px', minWidth: 0 }}>
          <h2 className="disp" style={{ margin: '0 0 6px', fontSize: 17 }}>
            Expected columns
          </h2>
          <div className="kvrow">
            <span className="mono">productCode</span>
            <span className="chip c-warn" style={{ fontSize: 11 }}>
              Required
            </span>
          </div>
          <div className="kvrow">
            <span className="mono">name</span>
            <span className="chip c-warn" style={{ fontSize: 11 }}>
              Required
            </span>
          </div>
          <div className="kvrow" style={{ alignItems: 'flex-start' }}>
            <span className="muted">Optional</span>
            <span className="mono" style={{ fontSize: 11.5, textAlign: 'right' }}>
              sku, type, category, description, unit, pricePerQty, taxRate, totalStock, lowStockThreshold
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '10px 0 0' }}>
            Existing product codes and SKUs are skipped, never overwritten. Column names are matched
            case-insensitively.
          </p>
          <button type="button" className="btn bg sm" style={{ marginTop: 12 }} onClick={downloadTemplate}>
            <Download /> Download template
          </button>
        </section>
      </div>

      {result && (
        <section className="glass up" style={{ overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '18px 22px',
              borderBottom: '1px solid rgba(var(--w),.06)',
            }}
          >
            <h2 className="disp" style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              {previewed ? (
                <>
                  <Eye className="h-5 w-5" style={{ color: 'var(--on)' }} /> Preview result
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--brand)' }} /> Import result
                </>
              )}
            </h2>
            {previewed && (
              <span className="chip c-ns">
                <span className="dot" />
                Nothing was saved
              </span>
            )}
          </div>
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              className="stag"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}
            >
              <Stat label="Total rows" value={result.total} />
              <Stat label={previewed ? 'Would import' : 'Imported'} value={result.imported} color="var(--okT)" />
              <Stat label="Skipped" value={result.skipped} color="var(--wT)" />
              <Stat label="Failed" value={result.failed} color="var(--rT)" />
            </div>

            {previewed && result.imported > 0 && (
              <div style={{ ...rowBox, padding: '12px 14px' }}>
                <span style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {result.failed > 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4" style={{ color: 'var(--wT)' }} />
                      {result.failed} row(s) will be left out. Import the rest anyway?
                    </>
                  ) : (
                    'Everything checks out.'
                  )}
                </span>
                <button
                  type="button"
                  className="btn bp"
                  onClick={() => file && runImport.mutate({ f: file, dryRun: false })}
                  disabled={busy}
                >
                  {busy && <Spinner />} Import {result.imported} product
                  {result.imported === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div style={{ overflowX: 'auto', borderTop: '1px solid rgba(var(--w),.06)' }}>
              <table className="tbl" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Row</th>
                    <th>Field</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => {
                    const skipped = e.error.toLowerCase().includes('skipped');
                    return (
                      <tr key={i} className="row">
                        <td className="mono">{e.row || '—'}</td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {e.field}
                        </td>
                        <td>
                          <span className={`chip ${skipped ? 'c-warn' : 'c-red'}`}>
                            <span className="dot" />
                            {skipped ? 'Skipped' : 'Error'}
                          </span>
                          <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
                            {e.error}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
