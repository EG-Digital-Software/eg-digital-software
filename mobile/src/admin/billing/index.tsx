import type { AdminRoute } from '../types';
import BillingHome from './BillingHome';
import InvoiceDetailScreen from './InvoiceDetailScreen';
import InvoiceFormScreen from './InvoiceFormScreen';
import PaymentsScreen from './PaymentsScreen';
import PaymentSettingsScreen from './PaymentSettingsScreen';

/** Billing tab: invoices grouped by client. */
export const Home = BillingHome;

/**
 * Billing routes (root stack):
 *   InvoiceDetail   { id }
 *   InvoiceForm     { id?, clientId? }  (no id = new invoice; clientId preselects the customer)
 *   Payments        —
 *   PaymentSettings —
 */
export const routes: AdminRoute[] = [
  { name: 'InvoiceDetail', component: InvoiceDetailScreen },
  { name: 'InvoiceForm', component: InvoiceFormScreen },
  { name: 'Payments', component: PaymentsScreen },
  { name: 'PaymentSettings', component: PaymentSettingsScreen },
];
