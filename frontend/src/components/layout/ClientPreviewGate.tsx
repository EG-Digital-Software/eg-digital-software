import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { canSeePreview } from '@/lib/clientPreview';

/** Route guard for preview sections (Feedback, Vault): only the demo client gets in. */
export function ClientPreviewGate() {
  const { data: profile, isLoading } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  if (isLoading) return <div className="ec-page"><div className="skel" style={{ height: 320 }} /></div>;
  if (canSeePreview(profile?.clientId)) return <Outlet />;
  return (
    <div className="ec-page">
      <div className="glass" style={{ padding: '72px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Lock style={{ width: 28, height: 28, opacity: 0.6 }} />
        <span className="eyebrow">COMING SOON</span>
        <h3 style={{ margin: 0, color: 'var(--fg)' }}>This section is on its way</h3>
        <p className="muted" style={{ maxWidth: 420, margin: 0 }}>
          We're putting the finishing touches on it. It will open on your account soon.
        </p>
      </div>
    </div>
  );
}
