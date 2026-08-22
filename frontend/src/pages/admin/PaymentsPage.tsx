import { useState } from 'react';
import { PageHeader } from '@/components/shared/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentsTransactionsTab } from './PaymentsTransactionsTab';
import PaymentSettingsForm from './PaymentSettingsPage';

/**
 * Payments has two halves: the money that has come in (Transactions) and how it
 * is allowed to come in (Settings). Until now this route only showed the
 * settings, so there was nowhere to see payments across invoices at all.
 */
export default function PaymentsPage() {
  const [tab, setTab] = useState('transactions');

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Money received and how customers can pay you" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <PaymentsTransactionsTab />
        </TabsContent>

        <TabsContent value="settings">
          <PaymentSettingsForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
