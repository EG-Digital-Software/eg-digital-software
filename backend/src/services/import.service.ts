import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

export interface ImportRowError {
  row: number;
  field: string;
  error: string;
}

export interface ImportResult {
  total: number;
  /** In a dry run this is what *would* be imported. */
  imported: number;
  skipped: number;
  failed: number;
  errors: ImportRowError[];
  /** True when nothing was written. */
  dryRun: boolean;
}

type RawRow = Record<string, string>;

/** Parse CSV/XLS/XLSX buffer into a flat array of string-keyed rows. */
export function parseSpreadsheet(buffer: Buffer, filename: string): RawRow[] {
  const isCsv = filename.toLowerCase().endsWith('.csv');
  if (isCsv) {
    const text = buffer.toString('utf-8');
    const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
    return parsed.data;
  }
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });
}

const pick = (row: RawRow, ...keys: string[]): string => {
  for (const k of keys) {
    const found = Object.keys(row).find((c) => c.trim().toLowerCase() === k.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
  }
  return '';
};

/** Guard against someone dropping a 200k-row export into the importer. */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Validate and import products from parsed rows.
 *
 * `dryRun` validates everything and reports exactly what would happen without
 * writing a single row — the importer used to commit the moment a file was
 * chosen, with no way to preview the outcome first.
 */
export async function importProducts(rows: RawRow[], dryRun = false): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    dryRun,
  };

  if (rows.length > MAX_IMPORT_ROWS) {
    throw ApiError.badRequest(
      `File has ${rows.length} rows — the limit is ${MAX_IMPORT_ROWS}. Split it and import in batches.`
    );
  }

  // Pull every existing code and SKU in two queries instead of one lookup per
  // row: a 1,000-row file previously issued 1,000 sequential SELECTs.
  const codes = rows.map((r) => pick(r, 'productCode', 'product code', 'code')).filter(Boolean);
  const skus = rows.map((r) => pick(r, 'sku')).filter(Boolean);
  const [existingProducts, existingSkus] = await Promise.all([
    codes.length
      ? prisma.product.findMany({ where: { productCode: { in: codes } }, select: { productCode: true } })
      : Promise.resolve([]),
    skus.length
      ? prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } })
      : Promise.resolve([]),
  ]);
  const takenCodes = new Set(existingProducts.map((p) => p.productCode));
  const takenSkus = new Set(existingSkus.map((p) => p.sku).filter((v): v is string => !!v));

  // Duplicates *within* the file were previously only caught by the database,
  // surfacing as a raw constraint error on the second occurrence.
  const seenCodes = new Set<string>();
  const seenSkus = new Set<string>();

  const toCreate: Prisma.ProductCreateManyInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // account for header row
    const row = rows[i];
    const productCode = pick(row, 'productCode', 'product code', 'code');
    const name = pick(row, 'name', 'product name', 'productName');
    const sku = pick(row, 'sku');
    const priceRaw = pick(row, 'pricePerQty', 'price', 'price per quantity', 'pricePerQuantity');
    const stockRaw = pick(row, 'totalStock', 'stock', 'number of stock', 'quantity');
    const taxRaw = pick(row, 'taxRate', 'tax rate');
    const thresholdRaw = pick(row, 'lowStockThreshold', 'threshold');

    const rowErrors: ImportRowError[] = [];
    if (!productCode) rowErrors.push({ row: rowNumber, field: 'productCode', error: 'Required' });
    if (!name) rowErrors.push({ row: rowNumber, field: 'name', error: 'Required' });

    const price = Number(priceRaw || 0);
    const stock = Number(stockRaw || 0);
    const tax = Number(taxRaw || 0);
    const threshold = Number(thresholdRaw || 10);

    if (priceRaw && (Number.isNaN(price) || price < 0))
      rowErrors.push({ row: rowNumber, field: 'pricePerQty', error: 'Must be a number of 0 or more' });
    if (stockRaw && (!Number.isInteger(stock) || stock < 0))
      rowErrors.push({ row: rowNumber, field: 'totalStock', error: 'Must be a non-negative integer' });
    if (taxRaw && (Number.isNaN(tax) || tax < 0 || tax > 100))
      rowErrors.push({ row: rowNumber, field: 'taxRate', error: 'Must be between 0 and 100' });
    if (thresholdRaw && (!Number.isInteger(threshold) || threshold < 0))
      rowErrors.push({
        row: rowNumber,
        field: 'lowStockThreshold',
        error: 'Must be a non-negative integer',
      });

    if (rowErrors.length) {
      result.failed++;
      result.errors.push(...rowErrors);
      continue;
    }

    if (takenCodes.has(productCode) || seenCodes.has(productCode)) {
      result.skipped++;
      result.errors.push({
        row: rowNumber,
        field: 'productCode',
        error: seenCodes.has(productCode)
          ? 'Duplicate within this file — skipped'
          : 'Already exists — skipped',
      });
      continue;
    }
    if (sku && (takenSkus.has(sku) || seenSkus.has(sku))) {
      result.skipped++;
      result.errors.push({
        row: rowNumber,
        field: 'sku',
        error: seenSkus.has(sku) ? 'Duplicate SKU within this file — skipped' : 'SKU already exists — skipped',
      });
      continue;
    }

    seenCodes.add(productCode);
    if (sku) seenSkus.add(sku);

    toCreate.push({
      productCode,
      sku: sku || null,
      type: pick(row, 'type', 'product type') || null,
      name,
      description: pick(row, 'description') || null,
      category: pick(row, 'category') || null,
      unit: pick(row, 'unit') || 'unit',
      pricePerQty: new Prisma.Decimal(price),
      taxRate: new Prisma.Decimal(tax),
      totalStock: stock,
      availableStock: stock,
      lowStockThreshold: threshold,
      status: ProductStatus.ACTIVE,
    });
  }

  if (dryRun) {
    result.imported = toCreate.length;
    return result;
  }

  if (toCreate.length) {
    // One statement instead of a create per row.
    const created = await prisma.product.createMany({ data: toCreate, skipDuplicates: true });
    result.imported = created.count;
    // createMany can silently drop a row a concurrent import just claimed.
    const dropped = toCreate.length - created.count;
    if (dropped > 0) {
      result.skipped += dropped;
      result.errors.push({
        row: 0,
        field: 'productCode',
        error: `${dropped} row(s) were claimed by another import and skipped`,
      });
    }
  }

  return result;
}
