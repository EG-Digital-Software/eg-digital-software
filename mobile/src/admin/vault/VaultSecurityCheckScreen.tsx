import React, { useState } from 'react';
import { View, Image } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { isVaultLocked, vaultApi, type VaultBreach } from '../../api/admin/vault';
import { Btn, Card, Eyebrow, Loading, Muted, Pill, Screen, T } from '../../ui';
import { colors } from '../../theme';
import { Input } from '../customers/form/fields';
import { setCheck, useVaultError, useVaultState } from './store';
import { LIST_QK, LOGS_QK, VaultShell, fmtNum, initialsOf } from './common';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const breachDate = (b: { date: string | null; added: string | null }) => {
  if (b.date && /^\d{4}$/.test(b.date)) return b.date;
  const d = b.date ?? b.added;
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
};

/** "Has this email been pwned?" — breaches for an email + saved passwords in leak lists. */
export default function VaultSecurityCheckScreen() {
  return (
    <VaultShell>
      <SecurityCheck />
    </VaultShell>
  );
}

function SecurityCheck() {
  const qc = useQueryClient();
  const onErr = useVaultError();
  const { check: res } = useVaultState();
  const [email, setEmail] = useState(res?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const v = email.trim();
    if (!EMAIL.test(v)) return setError('Enter a valid email address');
    setBusy(true);
    setError(null);
    try {
      const r = await vaultApi.securityCheck(v);
      setCheck(r);
      void qc.invalidateQueries({ queryKey: LIST_QK });
      void qc.invalidateQueries({ queryKey: LOGS_QK });
    } catch (e) {
      if (isVaultLocked(e)) onErr(e);
      else setError(errorMessage(e, 'Could not run the check'));
    } finally {
      setBusy(false);
    }
  };

  const leaked = (res?.passwords ?? []).filter((p) => (p.pwnedCount ?? 0) > 0);
  const unchecked = (res?.passwords ?? []).filter((p) => p.pwnedCount === null).length;
  const checkedCount = (res?.passwords.length ?? 0) - unchecked;
  const pwnedEmail = (res?.breaches.length ?? 0) > 0 || (res?.pastes ?? 0) > 0;
  const tone = pwnedEmail ? colors.redFg : colors.okFg;

  return (
    <Screen title="Security check" back>
      <Eyebrow>Security check</Eyebrow>
      <T w="s" size={20} style={{ marginTop: 4 }}>
        Has this email been pwned?
      </T>
      <Muted size={13} style={{ marginTop: 6, lineHeight: 19 }}>
        Checks the email against known data breaches, and every saved password against leaked-password lists.
      </Muted>

      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="email address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onSubmitEditing={() => void run()}
        style={{ marginTop: 14 }}
      />
      {error ? (
        <T size={13} color={colors.redFg} style={{ marginTop: 8 }}>
          {error}
        </T>
      ) : null}
      <Btn title="Check" icon="shield-checkmark-outline" onPress={() => void run()} loading={busy} style={{ marginTop: 12 }} />

      {busy ? <Loading /> : null}

      {res && !busy ? (
        <>
          {/* Verdict */}
          <View
            style={{
              marginTop: 18,
              borderRadius: 14,
              padding: 16,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
              backgroundColor: pwnedEmail ? colors.redBg : colors.okBg,
              borderWidth: 1,
              borderColor: pwnedEmail ? 'rgba(200,38,74,0.35)' : 'rgba(45,185,138,0.35)',
            }}
          >
            <Ionicons name={pwnedEmail ? 'shield-outline' : 'shield-checkmark'} size={32} color={tone} />
            <View style={{ flex: 1 }}>
              <T w="b" size={18} color={tone}>
                {pwnedEmail ? 'Oh no — pwned!' : 'Good news — no pwnage found!'}
              </T>
              <T size={13.5} style={{ marginTop: 2, lineHeight: 19 }}>
                {pwnedEmail ? (
                  <>
                    <T w="b" size={13.5}>{res.email}</T> was found in <T w="b" size={13.5}>{fmtNum(res.breaches.length)}</T> data breach
                    {res.breaches.length === 1 ? '' : 'es'}
                    {res.pastes > 0 ? (
                      <>
                        {' '}
                        and <T w="b" size={13.5}>{fmtNum(res.pastes)}</T> paste{res.pastes === 1 ? '' : 's'}
                      </>
                    ) : null}
                    .{res.risk ? <Muted size={13.5}> Risk: {res.risk.label}.</Muted> : null}
                  </>
                ) : (
                  <>
                    No breached accounts and no pastes found for <T w="b" size={13.5}>{res.email}</T>.
                  </>
                )}
              </T>
            </View>
          </View>

          {/* Saved passwords */}
          <Card style={{ padding: 14, marginTop: 12, gap: 8 }}>
            <Eyebrow>Saved passwords</Eyebrow>
            {res.passwords.length === 0 ? (
              <Muted size={13}>No saved passwords to check.</Muted>
            ) : leaked.length === 0 ? (
              checkedCount > 0 ? (
                <T size={13.5} color={colors.okFg}>
                  None of your {fmtNum(checkedCount)} saved password{checkedCount === 1 ? ' was' : 's were'} found in known data leaks.
                </T>
              ) : null
            ) : (
              <>
                <T size={13.5} style={{ lineHeight: 19 }}>
                  <T w="b" size={13.5} color={colors.redFg}>
                    {leaked.length} of {res.passwords.length}
                  </T>{' '}
                  saved password{res.passwords.length === 1 ? '' : 's'} appear in known data leaks — change them now:
                </T>
                {leaked.map((p) => (
                  <View key={p.entryId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
                    <T size={13} style={{ flex: 1 }}>
                      {p.name}
                    </T>
                    <T size={13} color={colors.redFg}>
                      Seen {fmtNum(p.pwnedCount!)} times
                    </T>
                  </View>
                ))}
              </>
            )}
            {unchecked > 0 ? (
              <Muted size={12}>
                {unchecked} password{unchecked === 1 ? '' : 's'} could not be checked right now.
              </Muted>
            ) : null}
            <Muted size={12} style={{ lineHeight: 17 }}>
              Passwords never leave the server — only the first 5 characters of each one’s hash are compared.
            </Muted>
          </Card>

          {/* Breaches */}
          {res.breaches.length > 0 ? (
            <>
              <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>Breaches you were pwned in</Eyebrow>
              <View style={{ gap: 10 }}>
                {res.breaches.map((b, i) => (
                  <BreachCard key={`${b.name}-${i}`} b={b} />
                ))}
              </View>
            </>
          ) : null}

          <Muted size={11} style={{ marginTop: 14, lineHeight: 16 }}>
            Breach data from XposedOrNot · leaked-password data from Have I Been Pwned (Pwned Passwords) · checked {fmtWhen(res.checkedAt)}
          </Muted>
        </>
      ) : null}
    </Screen>
  );
}

function BreachCard({ b }: { b: VaultBreach }) {
  const when = breachDate(b);
  return (
    <Card style={{ padding: 14, flexDirection: 'row', gap: 12 }}>
      <BreachLogo src={b.logo} name={b.name} />
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <T w="s" size={15}>
            {b.name}
          </T>
          {b.domain ? <Muted size={12}>{b.domain}</Muted> : null}
          {b.verified ? <Pill kind="info" label="Verified" style={{ height: 24 }} /> : null}
        </View>
        {b.description ? (
          <T size={13} style={{ lineHeight: 19 }}>
            {b.description}
          </T>
        ) : null}
        <Muted size={12}>
          {[when && `Breach date: ${when}`, b.records ? `Accounts: ${fmtNum(b.records)}` : null, b.industry && `Industry: ${b.industry}`]
            .filter(Boolean)
            .join('  ·  ')}
        </Muted>
        {b.dataClasses.length > 0 ? (
          <T size={13}>
            <T w="b" size={13}>
              Compromised data:
            </T>{' '}
            {b.dataClasses.join(', ')}
          </T>
        ) : null}
      </View>
    </Card>
  );
}

function BreachLogo({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const box = { width: 48, height: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const;
  if (!src || broken || !/^https:\/\//i.test(src)) {
    return (
      <View style={[box, { backgroundColor: colors.soft }]}>
        <T w="b" size={13}>
          {initialsOf(name)}
        </T>
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: '#fff' }]}>
      <Image source={{ uri: src }} onError={() => setBroken(true)} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
    </View>
  );
}
