import type { AdminRoute } from '../types';
import CustomersListScreen from './CustomersListScreen';
import CustomerDetailScreen from './CustomerDetailScreen';
import CustomerDocScreen from './CustomerDocScreen';
import ProductAssignScreen from './ProductAssignScreen';
import CustomerFormScreen from './form/CustomerFormScreen';

/** Customers tab: search, filter and open customers. */
export const Home = CustomersListScreen;

/**
 * Routes (params):
 *   CustomerDetail        { clientId, tab? }  tab: overview|agreements|products|invoices|logins|history
 *   CustomerForm          { clientId? }       (no id = new customer)
 *   CustomerDocView       { clientId, documentId }   view / approve an agreement
 *   CustomerDocFill       { clientId, documentId }   fill the fields the client left empty
 *   CustomerDocFields     { clientId, documentId }   mark the fields the client fills in
 *   CustomerProductAssign { clientId, groupKey? }    assign products / edit a licence group
 */
export const routes: AdminRoute[] = [
  { name: 'CustomerDetail', component: CustomerDetailScreen },
  { name: 'CustomerForm', component: CustomerFormScreen },
  { name: 'CustomerDocView', component: CustomerDocScreen },
  { name: 'CustomerDocFill', component: CustomerDocScreen },
  { name: 'CustomerDocFields', component: CustomerDocScreen },
  { name: 'CustomerProductAssign', component: ProductAssignScreen },
];
