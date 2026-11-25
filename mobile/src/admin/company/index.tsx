import React from 'react';
import { View } from 'react-native';
import { Card, EmptyCard, Eyebrow, Muted, Screen, T } from '../../ui';
import { colors } from '../../theme';
import type { AdminRoute } from '../types';
import CompanyReportScreen from './CompanyReportScreen';

function Kpi({ title, tone }: { title: string; tone?: string }) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1, padding: 16 }}>
      <Eyebrow>{title}</Eyebrow>
      <T w="b" size={26} color={tone} style={{ marginTop: 8 }}>
        —
      </T>
    </Card>
  );
}

/** Report (web admin "Report" tab): placeholder until it's wired to the API, same as web. */
function ReportScreen() {
  return (
    <Screen title="Report" back>
      <Muted size={13} style={{ marginBottom: 14, lineHeight: 19 }}>
        Business reports across revenue, customers and payments.
      </Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Kpi title="Total revenue" tone={colors.green} />
        <Kpi title="Invoices" />
        <Kpi title="Customers" />
        <Kpi title="Growth" />
      </View>
      <EmptyCard
        style={{ marginTop: 16 }}
        icon="bar-chart-outline"
        title="No reports yet"
        body="Reporting charts and exports will appear here once wired to the dashboard API."
      />
    </Screen>
  );
}

export const routes: AdminRoute[] = [
  { name: 'Report', component: ReportScreen },
  /** params: { view: 'mkt' | 'azure' } */
  { name: 'CompanyReport', component: CompanyReportScreen },
];
