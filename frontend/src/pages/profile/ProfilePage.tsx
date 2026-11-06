import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/misc';
import { AccountSettings } from '@/components/account/AccountSettings';

export default function ProfilePage() {
  const [params] = useSearchParams();
  const defaultTab = params.get('tab') === 'password' ? 'password' : 'profile';

  return (
    <div className="ec-page mx-auto w-full max-w-3xl">
      <PageHeader eyebrow="Account" title="Profile" description="Manage your account details." />
      <section className="glass up" style={{ animationDelay: '.08s', padding: 22 }}>
        <AccountSettings defaultTab={defaultTab} />
      </section>
    </div>
  );
}
