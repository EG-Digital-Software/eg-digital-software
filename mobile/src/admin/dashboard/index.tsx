import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { dashboardApi } from '../../api/admin/dashboard';
import { EmptyCard, ErrorBox, Loading, Muted, Screen } from '../../ui';
import type { AdminRoute } from '../types';
import DashboardHome from './HomeScreen';
import ApprovalsScreen from './ApprovalsScreen';
import ProductsScreen from './ProductsScreen';
import { LicenceList, LowStockList } from './lists';

/** Dashboard tab. */
export const Home = DashboardHome;

/** Every licence expiring within 30 days, expired or suspended. */
function LicencesScreen() {
  const q = useQuery({ queryKey: ['admin-dashboard', 'licences'], queryFn: dashboardApi.licences });
  return (
    <Screen title="Licences to watch" back refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Muted size={13} style={{ marginBottom: 12, lineHeight: 19 }}>
        Licences expiring within 30 days, already expired, or suspended. Tap one to open the customer.
      </Muted>
      {q.isError ? (
        <ErrorBox message={errorMessage(q.error, 'Could not load licences')} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Loading />
      ) : !q.data.length ? (
        <EmptyCard icon="key-outline" title="All licences are healthy" body="Nothing expires in the next 30 days." />
      ) : (
        <LicenceList rows={q.data} />
      )}
    </Screen>
  );
}

/** Active products at or under their low-stock threshold. */
function LowStockScreen() {
  const q = useQuery({ queryKey: ['admin-dashboard', 'low-stock'], queryFn: dashboardApi.lowStock });
  return (
    <Screen title="Low stock" back refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isError ? (
        <ErrorBox message={errorMessage(q.error, 'Could not load stock')} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Loading />
      ) : !q.data.length ? (
        <EmptyCard icon="cube-outline" title="Stock levels are fine" body="No active product is under its threshold." />
      ) : (
        <LowStockList rows={q.data} />
      )}
    </Screen>
  );
}

export const routes: AdminRoute[] = [
  /** params: { role?: 'EMPLOYEE' | 'CLIENT', view?: 'timesheet' } — all optional. */
  { name: 'Approvals', component: ApprovalsScreen },
  { name: 'DashLicences', component: LicencesScreen },
  { name: 'DashLowStock', component: LowStockScreen },
  { name: 'DashProducts', component: ProductsScreen },
];
