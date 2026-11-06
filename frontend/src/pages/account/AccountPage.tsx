import { PageHeader } from '@/components/shared/misc';
import { AccountSettings } from '@/components/account/AccountSettings';

/** Shared account page for the Customer and Team portals. */
export default function AccountPage() {
  return (
    <div className="ec-page mx-auto w-full max-w-3xl">
      <PageHeader eyebrow="Account" title="My account" description="Update your profile picture and password." />
      <section className="glass up" style={{ animationDelay: '.08s', padding: 22 }}>
        <AccountSettings />
      </section>
    </div>
  );
}
