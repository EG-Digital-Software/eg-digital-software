import { InvoiceStatus, Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { computeInvoiceTotals, computeLine, D, round2, type LineInput } from '../utils/money.js';
import type { PageQuery } from '../utils/http.js';
import { nextSequence, formatSku } from '../utils/sequence.js';
import { syncUnpaidInvoicesSafely } from './invoice.service.js';

/** The SKU the next created product will get, without consuming it (preview). */
export async function previewNextSku(): Promise<string> {
  const counter = await prisma.counter.findUnique({ where: { key: 'sku' } });
  return formatSku((counter?.value ?? 0) + 1);
}

/**
 * The next auto product code in the EG-101, EG-102, … series. Derived from the
 * highest existing EG-<n> code (starts at EG-101, so with EG-101…EG-105 present
 * the next is EG-106). Read-only — nothing is consumed or written here.
 */
export async function nextProductCode(): Promise<string> {
  const rows = await prisma.product.findMany({ select: { productCode: true } });
  let max = 100; // so the first ever code is EG-101
  for (const r of rows) {
    const m = /^EG-0*(\d+)$/i.exec((r.productCode ?? '').trim());
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `EG-${max + 1}`;
}

interface ListParams extends PageQuery {
  search?: string;
  status?: ProductStatus;
  stock?: 'low' | 'out';
  category?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listProducts(params: ListParams) {
  const where: Prisma.ProductWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.category) where.category = params.category;

  if (params.search) {
    const like = { contains: params.search.trim(), mode: 'insensitive' as const };
    where.OR = [
      { name: like },
      { productCode: like },
      { sku: like },
      { type: like },
      { category: like },
      { description: like },
    ];
  }

  // Stock filters run in the database — doing the low-stock comparison in memory
  // would only narrow the current page, leaving `total` wrong and pages short.
  if (params.stock === 'out') {
    where.availableStock = { lte: 0 };
  } else if (params.stock === 'low') {
    where.availableStock = { lte: prisma.product.fields.lowStockThreshold };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = params.sortBy
    ? { [params.sortBy]: params.sortDir ?? 'asc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy, skip: params.skip, take: params.take }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

/** Distinct categories in use, for the catalogue filter. */
export async function listCategories() {
  const rows = await prisma.product.findMany({
    where: { category: { not: null } },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}

export function getProduct(id: string) {
  return prisma.product.findUniqueOrThrow({ where: { id } });
}

export async function createProduct(data: {
  productCode?: string;
  sku?: string;
  country?: string;
  type?: string;
  name: string;
  description?: string;
  unit?: string;
  category?: string;
  pricePerQty: number;
  taxRate: number;
  totalStock: number;
  lowStockThreshold: number;
  status: ProductStatus;
  priceMode: string;
  billingPeriod?: string | null;
  contractTerm?: string | null;
  gstType?: string | null;
  planInclusive?: string | null;
}) {
  // Auto-generate the SKU when the admin didn't supply one.
  const sku = data.sku?.trim() || formatSku(await nextSequence(prisma, 'sku'));
  // The product code is auto-generated (EG-101, EG-102, …) unless one is passed.
  const supplied = data.productCode?.trim();
  for (let attempt = 0; attempt < 5; attempt++) {
    const productCode = supplied || (await nextProductCode());
    try {
      return await prisma.product.create({
        data: {
          productCode,
          country: data.country,
          sku,
          type: data.type,
          name: data.name,
          description: data.description,
          unit: data.unit,
          category: data.category,
          pricePerQty: new Prisma.Decimal(data.pricePerQty),
          taxRate: new Prisma.Decimal(data.taxRate),
          totalStock: data.totalStock,
          availableStock: data.totalStock,
          lowStockThreshold: data.lowStockThreshold,
          status: data.status,
          priceMode: data.priceMode,
          billingPeriod: data.billingPeriod ?? null,
          contractTerm: data.contractTerm ?? null,
          gstType: data.gstType ?? null,
          planInclusive: data.planInclusive?.trim() || null,
        },
      });
    } catch (e) {
      // A caller-supplied code that clashes is a real error — surface it.
      if (supplied) throw e;
      // An auto code raced with another create — recompute and retry.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  throw ApiError.badRequest('Could not allocate a product code — please try again');
}

export async function updateProduct(id: string, data: Record<string, unknown>) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Product not found');

  const patch: Prisma.ProductUpdateInput = {};
  const assignable = ['country', 'sku', 'type', 'name', 'description', 'unit', 'category', 'status', 'priceMode', 'billingPeriod', 'contractTerm', 'gstType', 'planInclusive', 'productCode'] as const;
  for (const key of assignable) {
    if (data[key] !== undefined) (patch as Record<string, unknown>)[key] = data[key];
  }
  if (data.pricePerQty !== undefined) patch.pricePerQty = new Prisma.Decimal(data.pricePerQty as number);
  if (data.taxRate !== undefined) patch.taxRate = new Prisma.Decimal(data.taxRate as number);
  if (data.lowStockThreshold !== undefined) patch.lowStockThreshold = data.lowStockThreshold as number;

  // Adjusting total stock also adjusts available stock by the same delta.
  if (data.totalStock !== undefined) {
    const delta = (data.totalStock as number) - existing.totalStock;
    patch.totalStock = data.totalStock as number;
    patch.availableStock = Math.max(0, existing.availableStock + delta);
  }

  const product = await prisma.product.update({ where: { id }, data: patch });
  // Unpaid invoices billing this product follow the change straight away.
  await syncUnpaidInvoicesSafely({ productId: id });
  return product;
}

/** Invoices still awaiting payment — a deleted product is taken off these. */
const UNPAID_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PENDING,
  InvoiceStatus.OVERDUE,
];

/**
 * Take a product off every unpaid invoice (no payment received yet). A line that
 * bills only this product is removed; a licence-group line drops this product's
 * share and keeps the rest. Each touched invoice's totals are recomputed.
 * Paid, part-paid and cancelled invoices are left exactly as issued.
 * Returns how many invoices were changed.
 */
async function removeProductFromUnpaidInvoices(tx: Prisma.TransactionClient, productId: string) {
  const invoices = await tx.invoice.findMany({
    where: {
      status: { in: UNPAID_STATUSES },
      amountPaid: { lte: 0 },
      items: { some: { OR: [{ productId }, { products: { some: { productId } } }] } },
    },
    include: { items: { include: { products: { orderBy: { position: 'asc' } } } } },
  });

  for (const inv of invoices) {
    const remaining: LineInput[] = [];
    for (const item of inv.items) {
      const line: LineInput = {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        gstType: item.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
      };
      const keep = item.products.filter((s) => s.productId !== productId);
      const touched = keep.length < item.products.length;

      // Older lines have no per-product snapshot — they bill their own product.
      const billsOnlyThis = touched ? !keep.length : !item.products.length && item.productId === productId;
      if (billsOnlyThis) {
        await tx.invoiceItem.delete({ where: { id: item.id } }); // snapshot rows cascade
        continue;
      }
      if (!touched) {
        remaining.push(line);
        continue;
      }

      // Shrink the group line to what its remaining products bill.
      const oldTotal = D(item.lineTotal);
      const keptTotal = keep.reduce((sum, s) => sum.add(s.amount), D(0));
      if (oldTotal.gt(0)) line.unitPrice = round2(D(item.unitPrice).mul(keptTotal).div(oldTotal));
      const { taxAmount, lineTotal } = computeLine(line);
      await tx.invoiceItemProduct.deleteMany({ where: { itemId: item.id, productId } });
      // The last remaining product absorbs the rounding so shares sum to the line.
      const last = keep[keep.length - 1];
      const othersTotal = keptTotal.sub(last.amount);
      await tx.invoiceItemProduct.update({
        where: { id: last.id },
        data: { amount: round2(lineTotal.sub(othersTotal)) },
      });
      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          unitPrice: D(line.unitPrice),
          taxAmount,
          lineTotal,
          ...(item.productId === productId ? { productId: keep[0].productId } : {}),
        },
      });
      remaining.push(line);
    }

    // A discount can't exceed what is left to bill.
    const gross = computeInvoiceTotals(remaining, 0);
    const discount = D(inv.discount).gt(gross.total) ? gross.total : inv.discount;
    const totals = computeInvoiceTotals(remaining, discount);
    await tx.invoice.update({
      where: { id: inv.id },
      data: { subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount, total: totals.total },
    });
  }
  return invoices.length;
}

/**
 * Permanently delete a product. Every customer it is assigned to loses that
 * assignment (its licence cascades; task time entries keep their hours with the
 * link set to NULL), and it is taken off every unpaid invoice. Paid and
 * part-paid invoices keep their line snapshots, with the product link set to
 * NULL. Returns how many assignments and invoices were changed.
 */
export async function deleteProduct(id: string) {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Product not found');
  return prisma.$transaction(
    async (tx) => {
      const invoicesUpdated = await removeProductFromUnpaidInvoices(tx, id);
      const { count: unassigned } = await tx.customerProduct.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      return { unassigned, invoicesUpdated };
    },
    { timeout: 30_000 }
  );
}

/**
 * Reserve stock atomically when assigning a product to a customer.
 * Throws if requested quantity exceeds available stock. Must run inside a tx.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  productId: string,
  _quantity: number
) {
  // Inventory is unlimited — no product ever goes out of stock — so this only
  // confirms the product exists; it no longer checks or decrements stock.
  const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw ApiError.notFound('Product not found');
}
