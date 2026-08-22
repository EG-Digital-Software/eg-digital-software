import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';

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
  productCode: string;
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
  return prisma.product.create({
    data: {
      productCode: data.productCode,
      sku: data.sku || null,
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
  quantity: number
) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw ApiError.notFound('Product not found');
  if (quantity > product.availableStock) {
    throw ApiError.badRequest(
      `Insufficient stock for ${product.name}: requested ${quantity}, available ${product.availableStock}`
    );
  }
  await tx.product.update({
    where: { id: productId },
    data: {
      availableStock: { decrement: quantity },
      reservedStock: { increment: quantity },
    },
  });
}
