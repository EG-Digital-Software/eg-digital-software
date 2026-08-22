import { PageHeader } from '@/components/shared/misc';
import { AccountSettings } from '@/components/account/AccountSettings';

/** Shared account page for the Client, Supplier and Employee portals. */
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="My Account" description="Update your profile picture and password" />
      <AccountSettings />
    </div>
  );
}
