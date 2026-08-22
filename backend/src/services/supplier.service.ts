import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { PageQuery } from '../utils/http.js';

/**
 * Stock summary for the products this supplier supplies.
 *
 * Counted in the database rather than by loading every product row and
 * reducing in memory — the tallies stay correct as the catalogue grows.
 */
export async function getDashboard(supplierId: string) {
  const [products, active, stockAgg, lowStock, outOfStock] = await Promise.all([
    prisma.product.count({ where: { supplierId } }),
    prisma.product.count({ where: { supplierId, status: ProductStatus.ACTIVE } }),
    prisma.product.aggregate({ _sum: { availableStock: true }, where: { supplierId } }),
    prisma.product.count({
      where: {
        supplierId,
        availableStock: { gt: 0, lte: prisma.product.fields.lowStockThreshold },
      },
    }),
    prisma.product.count({ where: { supplierId, availableStock: { lte: 0 } } }),
  ]);

  return {
    products,
    active,
    totalStock: stockAgg._sum.availableStock ?? 0,
    lowStock,
    outOfStock,
  };
}

export async function listProducts(
  supplierId: string,
  page: PageQuery,
  params: { search?: string; status?: ProductStatus; stock?: 'low' | 'out' } = {}
) {
  const where: Prisma.ProductWhereInput = { supplierId };
  if (params.status) where.status = params.status;

  // Same database-side comparison the admin catalogue uses, so the filter is
  // applied before paging rather than to a single page of results.
  if (params.stock === 'out') {
    where.availableStock = { lte: 0 };
  } else if (params.stock === 'low') {
    where.availableStock = { lte: prisma.product.fields.lowStockThreshold };
  }

  if (params.search) {
    const like = { contains: params.search.trim(), mode: 'insensitive' as const };
    where.OR = [{ name: like }, { productCode: like }, { sku: like }, { category: like }];
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { availableStock: 'asc' },
      skip: page.skip,
      take: page.take,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total };
}
