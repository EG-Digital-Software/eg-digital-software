import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useSessionInit } from '@/hooks/useSession';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ClientLayout } from '@/layouts/ClientLayout';
import { SupplierLayout } from '@/layouts/SupplierLayout';
import { EmployeeLayout } from '@/layouts/EmployeeLayout';
import { TooltipProvider } from '@/components/ui/misc';
import { LoadingBlock } from '@/components/shared/states';

const PortalPage = lazy(() => import('@/pages/auth/PortalPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage'));
const CustomerFormPage = lazy(() => import('@/pages/customers/CustomerFormPage'));
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'));
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'));
const BulkUploadPage = lazy(() => import('@/pages/products/BulkUploadPage'));
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'));
const CreateInvoicePage = lazy(() => import('@/pages/billing/CreateInvoicePage'));
const InvoiceDetailPage = lazy(() => import('@/pages/billing/InvoiceDetailPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const SettingsPage = lazy(() => import('@/pages/misc/SettingsPage'));
const ApprovalsPage = lazy(() => import('@/pages/admin/ApprovalsPage'));
const PaymentsPage = lazy(() => import('@/pages/admin/PaymentsPage'));
const PayPage = lazy(() => import('@/pages/pay/PayPage'));
const ClientDashboard = lazy(() => import('@/pages/client/ClientDashboard'));
const ClientInvoicesPage = lazy(() => import('@/pages/client/ClientInvoicesPage'));
const ClientInvoiceDetail = lazy(() => import('@/pages/client/ClientInvoiceDetail'));
const ClientLicencesPage = lazy(() => import('@/pages/client/ClientLicencesPage'));
const ClientDetailsPage = lazy(() => import('@/pages/client/ClientDetailsPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const SupplierDashboard = lazy(() => import('@/pages/supplier/SupplierDashboard'));
const SupplierProductsPage = lazy(() => import('@/pages/supplier/SupplierProductsPage'));
const EmployeeDashboard = lazy(() => import('@/pages/employee/EmployeeDashboard'));
const EmployeeCustomersPage = lazy(() => import('@/pages/employee/EmployeeCustomersPage'));
const EmployeeLicencesPage = lazy(() => import('@/pages/employee/EmployeeLicencesPage'));

function Fallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingBlock />
    </div>
  );
}

export default function App() {
  useSessionInit();

  return (
    <TooltipProvider>
      <BrowserRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            {/* Public — each portal owns its own auth URLs (/client/login, …) */}
            <Route path="/" element={<PortalPage />} />
            <Route path="/:portal/login" element={<LoginPage />} />
            <Route path="/:portal/register" element={<RegisterPage />} />
            <Route path="/:portal/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/:portal/reset-password" element={<ResetPasswordPage />} />
            <Route path="/pay/:id" element={<PayPage />} />

            {/* Back-compat redirects from the old flat auth URLs (query preserved) */}
            <Route path="/login" element={<LegacyAuthRedirect kind="login" />} />
            <Route path="/login/:role" element={<LegacyAuthRedirect kind="login" />} />
            <Route path="/register/:role" element={<LegacyAuthRedirect kind="register" />} />
            <Route path="/forgot-password" element={<LegacyAuthRedirect kind="forgot-password" />} />
            <Route path="/forgot-password/:role" element={<LegacyAuthRedirect kind="forgot-password" />} />
            <Route path="/reset-password" element={<LegacyAuthRedirect kind="reset-password" />} />
            <Route path="/reset-password/:role" element={<LegacyAuthRedirect kind="reset-password" />} />

            {/* Protected client portal */}
            <Route element={<ProtectedRoute roles={['CLIENT']} />}>
              <Route path="/client" element={<ClientLayout />}>
                <Route index element={<Navigate to="/client/dashboard" replace />} />
                <Route path="dashboard" element={<ClientDashboard />} />
                <Route path="invoices" element={<ClientInvoicesPage />} />
                <Route path="invoices/:id" element={<ClientInvoiceDetail />} />
                <Route path="licences" element={<ClientLicencesPage />} />
                <Route path="details" element={<ClientDetailsPage />} />
                <Route path="account" element={<AccountPage />} />
              </Route>
            </Route>

            {/* Protected supplier portal */}
            <Route element={<ProtectedRoute roles={['SUPPLIER']} />}>
              <Route path="/supplier" element={<SupplierLayout />}>
                <Route index element={<Navigate to="/supplier/dashboard" replace />} />
                <Route path="dashboard" element={<SupplierDashboard />} />
                <Route path="products" element={<SupplierProductsPage />} />
                <Route path="account" element={<AccountPage />} />
              </Route>
            </Route>

            {/* Protected employee portal */}
            <Route element={<ProtectedRoute roles={['EMPLOYEE']} />}>
              <Route path="/employee" element={<EmployeeLayout />}>
                <Route index element={<Navigate to="/employee/dashboard" replace />} />
                <Route path="dashboard" element={<EmployeeDashboard />} />
                <Route path="customers" element={<EmployeeCustomersPage />} />
                <Route path="licences" element={<EmployeeLicencesPage />} />
                <Route path="account" element={<AccountPage />} />
              </Route>
            </Route>

            {/* Protected admin */}
            <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/new" element={<CustomerFormPage />} />
                <Route path="customers/:clientId" element={<CustomerDetailPage />} />
                <Route path="customers/:clientId/edit" element={<CustomerFormPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="products/bulk-upload" element={<BulkUploadPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="billing/new" element={<CreateInvoicePage />} />
                <Route path="billing/:id" element={<InvoiceDetailPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="approvals" element={<ApprovalsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>

            <Route path="/forbidden" element={<ForbiddenLazy />} />
            <Route path="*" element={<NotFoundLazy />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  );
}

/** Redirect the old flat auth URLs (/login/client, …) to the portal-prefixed ones. */
function LegacyAuthRedirect({
  kind,
}: {
  kind: 'login' | 'register' | 'forgot-password' | 'reset-password';
}) {
  const { role } = useParams();
  const location = useLocation();
  const portal = role === 'super-admin' ? 'admin' : (role ?? 'admin');
  return <Navigate to={`/${portal}/${kind}${location.search}`} replace />;
}

const ForbiddenLazy = lazy(() =>
  import('@/pages/misc/ErrorPages').then((m) => ({ default: m.ForbiddenPage }))
);
const NotFoundLazy = lazy(() =>
  import('@/pages/misc/ErrorPages').then((m) => ({ default: m.NotFoundPage }))
);
