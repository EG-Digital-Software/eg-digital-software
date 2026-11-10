import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Segmented } from '../components';
import { useAuth, type LoginChallenge, type Portal } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

const PORTALS: { value: Portal; label: string }[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'SUPER_ADMIN', label: 'Admin' },
];

export default function LoginScreen() {
  const { signIn, verifyOtp, resendOtp } = useAuth();
  const [portal, setPortal] = useState<Portal>('CLIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the password is right: the screen then asks for the emailed code.
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const onVerify = async () => {
    if (!challenge) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(challenge.challengeId, code);
    } catch (e) {
      setError(errorMessage(e, 'That code did not work'));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      const next = await resendOtp(challenge.challengeId);
      setChallenge(next);
      setWait(next.resendInSeconds);
      setCode('');
    } catch (e) {
      setError(errorMessage(e, 'Could not send a new code'));
    } finally {
      setLoading(false);
    }
  };

  const backToPassword = () => {
    setChallenge(null);
    setCode('');
    setError(null);
  };

  const onSubmit = async () => {
    setError(null);
    if (!email.includes('@') || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const next = await signIn(email, password, portal);
      if (next) {
        setChallenge(next);
        setWait(next.resendInSeconds);
      }
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

          {challenge ? (
          <View style={styles.form}>
            <Text style={typography.h2}>Check your email</Text>
            <Text style={[typography.caption, { marginBottom: spacing.md }]}>
              We emailed a 6-digit code to {challenge.email}. It expires in {challenge.expiresInMinutes} minutes.
            </Text>
            <Text style={styles.label}>Sign-in code</Text>
            <TextInput
              style={[styles.input, styles.code]}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              onSubmitEditing={onVerify}
              returnKeyType="go"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Verify" onPress={onVerify} loading={loading} style={{ marginTop: spacing.md }} />
            <Text
              style={[styles.link, (wait > 0 || loading) && styles.linkDisabled]}
              onPress={wait > 0 || loading ? undefined : onResend}
            >
              {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
            </Text>
            <Text style={styles.link} onPress={backToPassword}>
              Use a different account
            </Text>
          </View>
          ) : (
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
          )}
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
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '600', textAlign: 'center', marginTop: spacing.md, fontSize: 15 },
  linkDisabled: { color: colors.textMuted },
});
