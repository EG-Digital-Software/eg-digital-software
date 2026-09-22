import { Prisma, CustomerStatus, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { PageQuery } from '../utils/http.js';
import { getLicences } from './dashboard.service.js';
import { ApiError } from '../utils/ApiError.js';
import { signImpersonationToken } from '../utils/tokens.js';

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
  params: { search?: string; businessType?: string } = {}
) {
  const where: Prisma.CustomerWhereInput = { status: CustomerStatus.ACTIVE };
  if (params.businessType) where.businessType = { contains: params.businessType };

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

/**
 * Mint an impersonation session so an admin can open a team member's portal AS
 * them — no password needed. The token carries the employee's own id as `sub`,
 * so their assigned tasks show correctly and any action is attributed to that
 * employee. Short-lived (2h) with no refresh counterpart: it simply expires, or
 * the admin exits, and the admin's own session resumes.
 */
export async function impersonateEmployee(employeeId: string) {
  const employee = await prisma.employeeUser.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      isActive: true,
      approvalStatus: true,
    },
  });
  if (!employee) throw ApiError.notFound('Team member not found');
  if (!employee.isActive || employee.approvalStatus !== 'APPROVED') {
    throw ApiError.badRequest('This team member is inactive or not yet approved');
  }

  const accessToken = signImpersonationToken({
    sub: employee.id,
    role: 'EMPLOYEE',
    email: employee.email,
  });

  const user = {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    role: 'EMPLOYEE' as const,
    avatarUrl: employee.avatarUrl ?? null,
  };

  return {
    accessToken,
    user,
    employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`.trim() },
  };
}

export { getLicences };
