import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminTaskBase, clientTaskBase, employeeTaskBase, taskApi, type TaskApi } from '../api/tasks';
import type { CustomerSummary } from '../api/types';
import { useAuth } from './AuthContext';

/**
 * Which task board the app is looking at:
 *  - a client sees their own company's board,
 *  - a team member sees every task assigned to them (grouped by customer),
 *  - an admin picks a customer, like the web app's company picker.
 */
interface ScopeState {
  api: TaskApi | null;
  /** Cache key for react-query — changes whenever the board changes. */
  scopeKey: string;
  /** Admin only: the customer whose board is open. */
  customer: CustomerSummary | null;
  setCustomer: (c: CustomerSummary) => void;
  isAdmin: boolean;
  isClient: boolean;
  isEmployee: boolean;
}

const ScopeContext = createContext<ScopeState | undefined>(undefined);
const CUSTOMER_KEY = 'eg.admin.customer';

export const customerLabel = (c: Pick<CustomerSummary, 'companyName' | 'contactPerson' | 'clientId'>) =>
  c.companyName || c.contactPerson || c.clientId;

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const [customer, setCustomerState] = useState<CustomerSummary | null>(null);

  useEffect(() => {
    if (role !== 'SUPER_ADMIN') {
      setCustomerState(null);
      return;
    }
    AsyncStorage.getItem(CUSTOMER_KEY)
      .then((raw) => raw && setCustomerState(JSON.parse(raw) as CustomerSummary))
      .catch(() => undefined);
  }, [role]);

  const setCustomer = (c: CustomerSummary) => {
    setCustomerState(c);
    AsyncStorage.setItem(CUSTOMER_KEY, JSON.stringify(c)).catch(() => undefined);
  };

  const value = useMemo<ScopeState>(() => {
    let base: string | null = null;
    if (role === 'CLIENT') base = clientTaskBase;
    else if (role === 'EMPLOYEE') base = employeeTaskBase;
    else if (role === 'SUPER_ADMIN' && customer) base = adminTaskBase(customer.clientId);
    return {
      api: base ? taskApi(base) : null,
      scopeKey: base ?? 'none',
      customer,
      setCustomer,
      isAdmin: role === 'SUPER_ADMIN',
      isClient: role === 'CLIENT',
      isEmployee: role === 'EMPLOYEE',
    };
    // setCustomer is stable enough (only writes state/storage).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, customer]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used inside ScopeProvider');
  return ctx;
}
