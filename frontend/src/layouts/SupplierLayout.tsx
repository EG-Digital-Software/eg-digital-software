import { LayoutDashboard, Package } from 'lucide-react';
import { PortalShell } from '@/components/layout/PortalShell';

export function SupplierLayout() {
  return (
    <PortalShell
      badge="Supplier Portal"
      badgeClass="bg-amber-500/10 text-amber-600"
      home="/supplier/dashboard"
      accountPath="/supplier/account"
      loginPath="/supplier/login"
      nav={[
        { to: '/supplier/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/supplier/products', label: 'Products', icon: Package },
      ]}
    />
  );
}
