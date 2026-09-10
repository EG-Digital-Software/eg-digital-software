import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { nextSequence, formatSku } from '../utils/sequence.js';

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
  const assignable = ['sku', 'type', 'name', 'description', 'unit', 'category', 'status', 'productCode'] as const;
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

  return prisma.product.update({ where: { id }, data: patch });
}

export async function deleteProduct(id: string) {
  const assigned = await prisma.customerProduct.count({ where: { productId: id } });
  if (assigned > 0) {
    // Preserve history — deactivate instead of hard delete.
    return prisma.product.update({ where: { id }, data: { status: ProductStatus.INACTIVE } });
  }
  return prisma.product.delete({ where: { id } });
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
