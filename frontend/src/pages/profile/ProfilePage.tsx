import { useSearchParams } from 'react-router-dom';
import { UserCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import { AccountSettings } from '@/components/account/AccountSettings';

export default function ProfilePage() {
  const [params] = useSearchParams();
  const defaultTab = params.get('tab') === 'password' ? 'password' : 'profile';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" description="Manage your account details" icon={UserCircle} iconTone="violet" />
      <AccountSettings defaultTab={defaultTab} />
    </div>
  );
}
