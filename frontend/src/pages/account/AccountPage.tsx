import { PageHeader } from '@/components/shared/misc';
import { useSearchParams } from 'react-router-dom';
import { AccountSettings, accountTabFrom } from '@/components/account/AccountSettings';

/** Shared account page for the Customer and Team portals. */
export default function AccountPage() {
  const [params] = useSearchParams();
  return (
    <div className="ec-page mx-auto w-full max-w-3xl">
      <PageHeader eyebrow="Account" title="My account" description="Update your profile picture, password and Access PIN." />
      <section className="glass up" style={{ animationDelay: '.08s', padding: 22 }}>
        <AccountSettings defaultTab={accountTabFrom(params.get('tab'))} />
      </section>
    </div>
  );
}
