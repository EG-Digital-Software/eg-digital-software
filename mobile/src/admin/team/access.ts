import type { IconName } from '../../ui';
import type { AccessLevel, AccessMap } from '../../api/admin/team';

/**
 * Admin tabs a team role can grant (mirror of web `lib/staffAccess.ts`, keys
 * must match STAFF_TABS on the API). Team, Approvals and Settings stay admin-only.
 */
export const STAFF_TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', viewOnly: true },
  { key: 'customers', label: 'Customers', icon: 'business-outline', viewOnly: false },
  { key: 'tasks', label: 'Tasks', icon: 'checkbox-outline', viewOnly: false },
  { key: 'billing', label: 'Billing', icon: 'receipt-outline', viewOnly: false },
  { key: 'products', label: 'Products', icon: 'cube-outline', viewOnly: false },
  { key: 'payments', label: 'Payments', icon: 'card-outline', viewOnly: false },
  { key: 'reports', label: 'Report', icon: 'bar-chart-outline', viewOnly: true },
  { key: 'preview', label: 'Preview', icon: 'eye-outline', viewOnly: true },
] as const satisfies readonly { key: string; label: string; icon: IconName; viewOnly: boolean }[];

export type StaffTab = (typeof STAFF_TABS)[number]['key'];

export interface StaffSection {
  key: string;
  label: string;
  hint: string;
  viewOnly?: boolean;
}

/** Sub-tabs granted one by one. The first (Overview) always comes with the tab. */
export const STAFF_SECTIONS: Partial<Record<StaffTab, readonly StaffSection[]>> = {
  customers: [
    { key: 'overview', label: 'Overview', hint: 'Customer list and details. Edit lets them add, edit, renew and archive customers.' },
    { key: 'agreement', label: 'Agreement', hint: 'Agreement documents. Edit lets them upload, fill and remove.' },
    { key: 'products', label: 'Products & Licences', hint: 'Assigned products. Edit lets them assign, change and remove.' },
    { key: 'invoices', label: 'Invoices', hint: "The customer's invoices. Edit lets them create invoices." },
    { key: 'task', label: 'Task', hint: "The customer's task board. Edit lets them add and change tasks." },
    { key: 'history', label: 'Account History', hint: 'Paid invoices, trial period and account renewals.', viewOnly: true },
  ],
};

/** Level held for a tab (best across its sub-tabs) or a sub-tab ("customers.task"). */
export function levelFor(access: AccessMap, key: string): AccessLevel | null {
  if (key.includes('.')) return access[key] ?? null;
  let best: AccessLevel | null = null;
  for (const [k, level] of Object.entries(access)) {
    if (k.split('.')[0] !== key) continue;
    if (level === 'edit') return 'edit';
    best = 'view';
  }
  return best;
}

/** Every permission key a tab covers: its sub-tabs, or the tab itself. */
export const keysOf = (tab: StaffTab) => STAFF_SECTIONS[tab]?.map((s) => `${tab}.${s.key}`) ?? [tab];

/** Short summary of what a role grants, e.g. "Customers (Overview · view, Task · edit)". */
export function describeAccess(access: AccessMap = {}): { key: string; label: string }[] {
  return STAFF_TABS.flatMap((t) => {
    const sections = STAFF_SECTIONS[t.key];
    if (!sections) {
      const level = access[t.key];
      return level ? [{ key: t.key, label: t.viewOnly ? t.label : `${t.label} · ${level}` }] : [];
    }
    const parts = sections.filter((s) => access[`${t.key}.${s.key}`]).map((s) => `${s.label} · ${access[`${t.key}.${s.key}`]}`);
    return parts.length ? [{ key: t.key, label: `${t.label} (${parts.join(', ')})` }] : [];
  });
}

/** What several roles add up to — edit on any role beats view. */
export function mergeAccess(maps: AccessMap[]): AccessMap {
  const out: AccessMap = {};
  for (const m of maps) for (const [k, v] of Object.entries(m ?? {})) if (v === 'edit' || !out[k]) out[k] = v;
  return out;
}
