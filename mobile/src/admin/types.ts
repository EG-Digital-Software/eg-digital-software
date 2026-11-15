import type React from 'react';

/**
 * Admin app route contract. Every module (dashboard, customers, tasks, billing)
 * exports from its `index.tsx`:
 *   - `Home`: the screen shown in its bottom tab
 *   - `routes`: extra full-screen routes pushed on the root stack (no tab bar)
 *
 * Route names are global, so each module keeps to its own names. Names other
 * modules navigate to (keep these params exactly):
 *   CustomerDetail   { clientId }                      — customers
 *   CustomerForm     { clientId? }  (no id = new)      — customers
 *   AdminTaskBoard   { clientId, companyName? }        — tasks
 *   AdminTask        { clientId, taskId }              — tasks
 *   AdminThread      { clientId, taskId }              — shared (task chat)
 *   InvoiceDetail    { id }                            — billing
 *   InvoiceForm      { id?, clientId? } (no id = new)  — billing
 *   Payments         —                                 — billing
 *   Approvals        —                                 — dashboard
 *   Notifications    —                                 — shared
 *   CustomerPicker   —                                 — shared ("View as client")
 */
export interface AdminRoute {
  name: string;
  component: React.ComponentType<any>;
}
