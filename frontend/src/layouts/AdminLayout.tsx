import { Outlet, useLocation } from 'react-router-dom';
import { Topbar } from '@/components/layout/Topbar';

export function AdminLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Topbar />
      <main className="flex-1 overflow-x-hidden">
        {/* keyed by pathname → content fades in on every navigation */}
        <div
          key={location.pathname}
          className="animate-fade-in w-full space-y-6 p-4 lg:p-6 xl:p-8"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
