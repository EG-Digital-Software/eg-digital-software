import React, { useState } from 'react';
import { View, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { productsApi, type ImportResult, type PickedFile } from '../../api/admin/products';
import { Btn, Card, Eyebrow, Muted, Pill, Screen, SectionHead, Steps, T, type StepState } from '../../ui';
import { colors } from '../../theme';
import { invalidateProducts } from './common';

const ACCEPTED = ['.csv', '.xls', '.xlsx'];
const MAX_BYTES = 10 * 1024 * 1024;

/** Columns the importer understands, in template order. */
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
  ['EGD-P-001', 'Microsoft 365 Business Premium', 'SKU-001', 'Software Licence', 'Software', 'Annual subscription per seat', 'seat', '25.50', '10', '120', '10'],
  ['EGD-P-002', 'Managed Firewall', 'SKU-002', 'Hardware', 'Hardware', '', 'device', '450', '10', '14', '5'],
];

/** Write the starter CSV to the cache and open the share sheet. */
async function shareTemplate() {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [TEMPLATE_COLUMNS, ...TEMPLATE_SAMPLE].map((r) => r.map(escape).join(',')).join('\r\n');
  const file = new File(Paths.cache, 'eg-digital-products-template.csv');
  if (file.exists) file.delete();
  file.create();
  // Leading BOM so Excel opens it as UTF-8.
  file.write(`﻿${csv}`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Products template' });
}

interface Picked extends PickedFile {
  size?: number | null;
}

/** ProductsBulkUpload — import products from CSV / XLS / XLSX (server parses the file). */
export default function BulkUploadScreen() {
  const qc = useQueryClient();
  const [file, setFile] = useState<Picked | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: ({ f, dryRun }: { f: Picked; dryRun: boolean }) => productsApi.bulkImport(f, dryRun),
    onSuccess: (res) => {
      setResult(res);
      if (res.dryRun) return;
      invalidateProducts(qc);
      Alert.alert('Import complete', `${res.imported} product${res.imported === 1 ? '' : 's'} imported`);
    },
    onError: (e) => Alert.alert('Import failed', errorMessage(e, 'Import failed')),
  });

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const name = a.name || 'products.csv';
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      // Reject the obviously-wrong file here rather than after the upload.
      if (!ACCEPTED.includes(ext)) {
        Alert.alert('Unsupported file', `Use ${ACCEPTED.join(', ')}`);
        return;
      }
      if (a.size && a.size > MAX_BYTES) {
        Alert.alert('File too large', 'File must be under 10MB');
        return;
      }
      setResult(null);
      setFile({ uri: a.uri, name, mimeType: a.mimeType, size: a.size });
    } catch (e) {
      Alert.alert('Could not open file', errorMessage(e));
    }
  };

  const busy = run.isPending;
  const previewed = !!result?.dryRun;
  const imported = !!result && !result.dryRun;
  const steps: { label: string; state: StepState }[] = [
    { label: 'Template', state: 'done' },
    { label: 'Choose file', state: file ? 'done' : 'now' },
    { label: 'Preview', state: result ? 'done' : file ? 'now' : 'todo' },
    { label: 'Import', state: imported ? 'done' : previewed ? 'now' : 'todo' },
  ];

  return (
    <Screen title="Bulk upload" back>
      <Muted size={13.5} style={{ lineHeight: 20 }}>
        Import products from CSV, XLS or XLSX.
      </Muted>
      <Steps steps={steps} />

      <SectionHead title="Upload file" />
      <Pressable
        onPress={pick}
        disabled={busy}
        style={{
          alignItems: 'center',
          paddingVertical: 32,
          paddingHorizontal: 20,
          borderRadius: 14,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: file ? colors.green2 : colors.line,
          backgroundColor: file ? colors.greenTint : colors.soft2,
        }}
        accessibilityRole="button"
        accessibilityLabel="Choose a file to upload"
      >
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Ionicons name="cloud-upload-outline" size={24} color={colors.green} />
        </View>
        <T w="s" size={14.5} style={{ textAlign: 'center' }}>
          {file ? file.name : 'Tap to choose a file'}
        </T>
        <Muted size={12} style={{ marginTop: 4, textAlign: 'center' }}>
          CSV, XLS, XLSX — up to 10MB, 5,000 rows
        </Muted>
      </Pressable>

      {file ? (
        <Card style={{ padding: 12, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="document-text-outline" size={20} color={colors.green} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T mono size={12} numberOfLines={1}>
                {file.name}
              </T>
              {file.size ? (
                <T mono size={11} color={colors.muted}>
                  {(file.size / 1024).toFixed(0)} KB
                </T>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                setFile(null);
                setResult(null);
              }}
              disabled={busy}
              hitSlop={10}
              accessibilityLabel="Remove file"
            >
              <Ionicons name="close-circle" size={22} color={colors.faint} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Btn
              title="Preview"
              icon="eye-outline"
              variant="ghost"
              onPress={() => run.mutate({ f: file, dryRun: true })}
              loading={busy && run.variables?.dryRun}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Btn
              title="Import"
              onPress={() => run.mutate({ f: file, dryRun: false })}
              loading={busy && !run.variables?.dryRun}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </View>
          {!result ? (
            <Muted size={12} style={{ marginTop: 10, lineHeight: 17 }}>
              Tip: run Preview first — it validates every row and reports what would happen without writing anything.
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {result ? <ResultCard result={result} busy={busy} onImport={() => file && run.mutate({ f: file, dryRun: false })} /> : null}

      <SectionHead title="Expected columns" />
      <Card style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T mono size={13}>
            productCode
          </T>
          <Pill kind="warn" label="Required" />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <T mono size={13}>
            name
          </T>
          <Pill kind="warn" label="Required" />
        </View>
        <Muted size={12.5} style={{ marginTop: 12 }}>
          Optional
        </Muted>
        <T mono size={12} style={{ marginTop: 4, lineHeight: 18 }}>
          sku, type, category, description, unit, pricePerQty, taxRate, totalStock, lowStockThreshold
        </T>
        <Muted size={12} style={{ marginTop: 10, lineHeight: 17 }}>
          Existing product codes and SKUs are skipped, never overwritten. Column names are matched case-insensitively.
        </Muted>
        <Btn
          title="Download template"
          icon="download-outline"
          variant="ghost"
          style={{ marginTop: 12 }}
          onPress={() => shareTemplate().catch((e) => Alert.alert('Could not share template', errorMessage(e)))}
        />
      </Card>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, padding: 12, borderRadius: 12, backgroundColor: colors.soft2 }}>
      <Eyebrow>{label}</Eyebrow>
      <T w="b" size={22} color={color} style={{ marginTop: 4 }}>
        {value}
      </T>
    </View>
  );
}

function ResultCard({ result, busy, onImport }: { result: ImportResult; busy: boolean; onImport: () => void }) {
  const previewed = result.dryRun;
  return (
    <>
      <SectionHead title={previewed ? 'Preview result' : 'Import result'} />
      <Card style={{ padding: 16 }}>
        {previewed ? <Pill kind="ns" label="Nothing was saved" style={{ marginBottom: 12 }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat label="Total rows" value={result.total} />
          <Stat label={previewed ? 'Would import' : 'Imported'} value={result.imported} color={colors.okFg} />
          <Stat label="Skipped" value={result.skipped} color={colors.warnFg} />
          <Stat label="Failed" value={result.failed} color={colors.redFg} />
        </View>

        {previewed && result.imported > 0 ? (
          <View style={{ marginTop: 14 }}>
            <T size={13.5} style={{ lineHeight: 19 }}>
              {result.failed > 0 ? `${result.failed} row(s) will be left out. Import the rest anyway?` : 'Everything checks out.'}
            </T>
            <Btn
              title={`Import ${result.imported} product${result.imported === 1 ? '' : 's'}`}
              onPress={onImport}
              loading={busy}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : null}

        {result.errors.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            {result.errors.map((e, i) => {
              const skipped = e.error.toLowerCase().includes('skipped');
              return (
                <View key={i} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pill kind={skipped ? 'warn' : 'red'} label={skipped ? 'Skipped' : 'Error'} style={{ height: 24 }} />
                    <T mono size={12} color={colors.muted}>
                      Row {e.row || '—'}
                      {e.field ? ` · ${e.field}` : ''}
                    </T>
                  </View>
                  <Muted size={13}>{e.error}</Muted>
                </View>
              );
            })}
          </View>
        ) : null}
      </Card>
    </>
  );
}
