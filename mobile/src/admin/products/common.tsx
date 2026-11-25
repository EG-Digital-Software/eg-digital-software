import type { QueryClient } from '@tanstack/react-query';
import type { BillingPeriod, ContractTerm, Product } from '../../api/admin/products';
import { formatCountryPrice } from './currency';

export const PERIOD_SUFFIX: Record<string, string> = {
  DAILY: ' / day',
  WEEKLY: ' / week',
  MONTHLY: ' / month',
  ANNUALLY: ' / year',
  ONE_TIME: ' one-time',
};

export const BILLING_PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'ANNUALLY', label: 'Annually' },
];

export const CONTRACT_TERMS: { value: ContractTerm; label: string }[] = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'CONTRACT_1_YEAR', label: 'Contract - 1 Year' },
  { value: 'CONTRACT_2_YEARS', label: 'Contract - 2 Years' },
];

export const labelOf = (list: { value: string; label: string }[], v?: string | null) =>
  v ? (list.find((o) => o.value === v)?.label ?? v) : null;

/** The product carries its own price (stored MANUAL; shown as "Automatic", like the web). */
export const hasOwnPrice = (p: Pick<Product, 'priceMode' | 'pricePerQty'>) =>
  p.priceMode === 'MANUAL' && p.pricePerQty != null && p.pricePerQty !== '';

/** Price cell: own price + period, or "Manual" when priced per customer on assignment. */
export function priceLabel(p: Product): string {
  if (!hasOwnPrice(p)) return 'Manual';
  return `${formatCountryPrice(p.pricePerQty, p.country)}${p.billingPeriod ? (PERIOD_SUFFIX[p.billingPeriod] ?? '') : ''}`;
}

/** Refresh every list that shows products (this module, dashboard, customers, billing). */
export function invalidateProducts(qc: QueryClient, deleted = false) {
  qc.invalidateQueries({ queryKey: ['admin-products'] });
  qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
  qc.invalidateQueries({ queryKey: ['admin-customer-form'] });
  qc.invalidateQueries({ queryKey: ['admin-billing'] });
  // A delete also unassigns the product from customers and unpaid invoices.
  if (deleted) {
    qc.invalidateQueries({ queryKey: ['admin-customer'] });
    qc.invalidateQueries({ queryKey: ['admin-customers'] });
  }
}
