import React from 'react';
import { errorMessage } from '../../api/client';
import { Card, EmptyCard, ErrorBox, Loading, Muted, Screen } from '../../ui';
import { LogLine, VaultShell, useQueryLockGuard, useVaultLogs } from './common';

/** Full vault access log, newest first (web LogDrawer). */
export default function VaultLogScreen() {
  return (
    <VaultShell>
      <LogList />
    </VaultShell>
  );
}

function LogList() {
  const q = useVaultLogs();
  useQueryLockGuard(q.error);
  const rows = q.data ?? [];
  return (
    <Screen title="Access log" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Muted size={13} style={{ marginBottom: 12, lineHeight: 19 }}>
        Every unlock, reveal, copy and change in the vault — newest first.
      </Muted>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        (q.error as { status?: number })?.status === 423 ? null : (
          <ErrorBox message={errorMessage(q.error, 'Could not load the access log')} onRetry={() => void q.refetch()} />
        )
      ) : rows.length === 0 ? (
        <EmptyCard icon="time-outline" title="No activity yet" />
      ) : (
        <Card style={{ paddingHorizontal: 14, paddingVertical: 2 }}>
          {rows.map((l, i) => (
            <LogLine key={l.id} l={l} withEntry first={i === 0} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
