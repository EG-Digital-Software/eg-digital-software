import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Segmented } from '../components';
import { useAuth, type Portal } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

const PORTALS: { value: Portal; label: string }[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'EMPLOYEE', label: 'Team' },
  { value: 'SUPER_ADMIN', label: 'Admin' },
];

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [portal, setPortal] = useState<Portal>('CLIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.includes('@') || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password, portal);
    } catch (e) {
      setError(errorMessage(e, 'Could not sign in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={styles.hero}>
            <Image source={require('../../assets/eg-eloma-mark-light.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brand}>EG Eloma</Text>
            <Text style={styles.tagline}>Tasks & team chat</Text>
          </View>

          <View style={styles.form}>
            <Text style={typography.h2}>Welcome back</Text>
            <Text style={[typography.caption, { marginBottom: spacing.md }]}>
              Sign in with the same account you use on the web portal.
            </Text>

            <Segmented options={PORTALS} value={portal} onChange={setPortal} />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Sign in" onPress={onSubmit} loading={loading} style={{ marginTop: spacing.md }} />
            <Text style={styles.help}>Forgot your password? Reset it from the web portal or contact your account manager.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  logo: { width: 88, height: 88, marginBottom: spacing.md },
  brand: { color: '#fff', fontSize: 26, fontWeight: '700' },
  tagline: { color: '#B7C4D8', fontSize: 15, marginTop: 4 },
  form: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
  },
  label: { ...typography.caption, fontWeight: '600', marginBottom: 6, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
    backgroundColor: colors.background,
    color: colors.text,
  },
  error: { color: colors.danger, marginTop: spacing.sm, fontSize: 14 },
  help: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
});
