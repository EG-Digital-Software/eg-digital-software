import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Card, Row, Button, SectionTitle } from '../components';
import { useAuth, displayName } from '../context/AuthContext';
import { customerLabel, useScope } from '../context/ScopeContext';
import { colors, spacing, typography } from '../theme';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Admin',
  EMPLOYEE: 'Team member',
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
};

export default function ProfileScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const { isAdmin, customer } = useScope();
  const name = displayName(user);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again to see your tasks.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          qc.clear();
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar name={name} url={user?.avatarUrl} size={80} tone="solid" />
          <Text style={[typography.h2, { marginTop: spacing.sm }]}>{name}</Text>
          <Text style={typography.caption}>{ROLE_LABEL[user?.role ?? ''] ?? ''}</Text>
        </View>

        <SectionTitle title="Account" />
        <Card>
          <Row label="Email" value={user?.email ?? ''} />
          {user?.phone ? <Row label="Phone" value={user.phone} /> : null}
          <Row label="Portal" value={ROLE_LABEL[user?.role ?? ''] ?? ''} last={!isAdmin} />
          {isAdmin && <Row label="Customer" value={customer ? customerLabel(customer) : 'None selected'} last />}
        </Card>

        {isAdmin && (
          <Button
            title="Switch customer"
            icon="business-outline"
            variant="secondary"
            onPress={() => nav.navigate('CustomerPicker')}
            style={{ marginBottom: spacing.sm }}
          />
        )}
        <Text style={styles.note}>
          Profile details, passwords and task setup (new tasks, columns, labels) are managed on the web portal.
        </Text>
        <Button title="Sign out" variant="ghost" icon="log-out-outline" onPress={confirmSignOut} />
        <Text style={styles.version}>EG Eloma Tasks v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  note: { ...typography.caption, textAlign: 'center', marginVertical: spacing.md },
  version: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg },
});
