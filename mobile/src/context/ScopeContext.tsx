import React, { createContext, useContext, useMemo } from 'react';
import { adminTaskBase, clientTaskBase, taskApi, type TaskApi } from '../api/tasks';
import { useAuth } from './AuthContext';

/**
 * The app always shows one client's portal: the signed-in client's own, or the
 * customer an admin opened (through an impersonation token, also a CLIENT).
 */
interface ScopeState {
  api: TaskApi | null;
  /** Cache key for react-query — changes whenever the portal changes. */
  scopeKey: string;
}

const ScopeContext = createContext<ScopeState | undefined>(undefined);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const { user, admin } = useAuth();
  const value = useMemo<ScopeState>(() => {
    if (user?.role !== 'CLIENT') return { api: null, scopeKey: 'none' };
    return { api: taskApi(clientTaskBase), scopeKey: `client:${admin?.clientId ?? user.id}` };
  }, [user?.role, user?.id, admin?.clientId]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/**
 * Admin app: one customer's task board (`/customers/:clientId/tasks`). Wrap a
 * screen in this and the shared task screens/hooks (chat, useTask, useBoard)
 * work against that customer as the admin.
 */
export function TaskScope({ clientId, children }: { clientId: string; children: React.ReactNode }) {
  const value = useMemo<ScopeState>(
    () => ({ api: taskApi(adminTaskBase(clientId)), scopeKey: `admin:${clientId}` }),
    [clientId]
  );
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used inside ScopeProvider');
  return ctx;
}
