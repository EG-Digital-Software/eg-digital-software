import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/misc';
import { AccountSettings, accountTabFrom } from '@/components/account/AccountSettings';

export default function ProfilePage() {
  const [params] = useSearchParams();
  const defaultTab = accountTabFrom(params.get('tab'));

  return (
    <div className="ec-page mx-auto w-full max-w-3xl">
      <PageHeader eyebrow="Account" title="Profile" description="Manage your account details." />
      <section className="glass up" style={{ animationDelay: '.08s', padding: 22 }}>
        <AccountSettings defaultTab={defaultTab} />
      </section>
    </div>
  );
}
