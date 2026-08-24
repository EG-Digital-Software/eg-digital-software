import { Prisma, CustomerStatus, ProductStatus, BusinessType } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { PageQuery } from '../utils/http.js';
import { getLicences } from './dashboard.service.js';

/**
 * Employee = internal staff with read-only operational access (no financials,
 * no create/edit). Reuses dashboard helpers for licence/stock monitoring.
 */
export async function getDashboard() {
  // These were counted from getLicences()/getLowStock(), which return capped
  // lists for display (100 and 25 rows). Counting their length meant the KPIs
  // silently stopped rising past the cap — 40 low-stock products still read 25.
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  const [customers, activeCustomers, expiringLicences, expiredLicences, lowStock] =
    await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } }),
      prisma.customerProduct.count({
        where: { expiryDate: { gte: now, lte: soon } },
      }),
      prisma.customerProduct.count({ where: { expiryDate: { lt: now } } }),
      prisma.product.count({
        where: {
          status: ProductStatus.ACTIVE,
          availableStock: { lte: prisma.product.fields.lowStockThreshold },
        },
      }),
    ]);

  return { customers, activeCustomers, expiringLicences, expiredLicences, lowStock };
}

export async function listCustomers(
  page: PageQuery,
  params: { search?: string; businessType?: BusinessType } = {}
) {
  const where: Prisma.CustomerWhereInput = { status: CustomerStatus.ACTIVE };
  if (params.businessType) where.businessType = params.businessType;

  if (params.search) {
    const q = params.search.trim();
    const like = { contains: q, mode: 'insensitive' as const };
    const digits = q.replace(/\D/g, '') || q;
    where.OR = [
      { companyName: like },
      { tradingAs: like },
      { clientId: like },
      { contactPerson: like },
      { contactEmail: like },
      { abn: { contains: digits } },
      { addresses: { some: { OR: [{ city: like }, { country: like }] } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        clientId: true,
        companyName: true,
        tradingAs: true,
        businessType: true,
        contactPerson: true,
        contactEmail: true,
        contactMobile: true,
        contactMobileCountry: true,
        createdAt: true,
        addresses: { select: { type: true, city: true, country: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);
  return { items, total };
}

export { getLicences };
