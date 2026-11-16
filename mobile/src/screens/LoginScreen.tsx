import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, type LoginChallenge, type Portal } from '../context/AuthContext';
import { errorMessage, request } from '../api/client';
import { Bird, Btn, KeyboardSafe, Muted, Pill, T, useFocusedInputVisible } from '../ui';
import { colors, fonts } from '../theme';

/** Dot grid behind the brand, fading out downwards (design's `.ldots`). */
function Dots() {
  const rows = 12;
  const cols = 20;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-around', height: 22, opacity: 0.11 * (1 - r / rows) }}>
          {Array.from({ length: cols }).map((__, c) => (
            <View key={c} style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: colors.navy, marginTop: 10 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function LoginScreen() {
  const { signIn, verifyOtp, resendOtp, signInWithBio } = useAuth();
  const insets = useSafeAreaInsets();
  // Tapping the logo reveals the admin sign-in (the app itself is the client portal).
  const [portal, setPortal] = useState<Portal>('CLIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const isAdmin = portal === 'SUPER_ADMIN';
  const kb = useFocusedInputVisible();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

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

  const onBio = async () => {
    setError(null);
    setBioLoading(true);
    try {
      await signInWithBio(portal);
    } catch (e) {
      setError(errorMessage(e, 'Fingerprint sign-in failed'));
    } finally {
      setBioLoading(false);
    }
  };

  const onReset = async () => {
    if (!email.includes('@')) {
      setError('Enter your email above, then tap Reset it.');
      return;
    }
    try {
      await request('/auth/forgot-password', { method: 'POST', body: { email: email.trim(), portal }, noRetry: true });
      Alert.alert('Check your email', 'If an account exists for that email, we sent a link to reset your password.');
    } catch (e) {
      setError(errorMessage(e, 'Could not send the reset email'));
    }
  };

  const toggleAdmin = () => {
    setPortal((p) => (p === 'CLIENT' ? 'SUPER_ADMIN' : 'CLIENT'));
    setError(null);
  };

  return (
    <KeyboardSafe style={{ backgroundColor: '#fff' }}>
      <ScrollView {...kb.scrollProps} contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={[styles.brand, { paddingTop: insets.top + 24 }]}>
          <Dots />
          <Pressable onPress={toggleAdmin} hitSlop={12} accessibilityLabel="EG Eloma">
            <Bird size={96} />
          </Pressable>
          <T w="s" size={20} style={{ letterSpacing: 6, marginTop: 4 }}>
            EG ELOMA
          </T>
          <Muted size={14}>{isAdmin ? 'Admin sign-in' : 'Your account, tasks and team in one app'}</Muted>
          {isAdmin ? <Pill kind="warn" label="Admin" style={{ alignSelf: 'center', marginTop: 6 }} /> : null}
        </View>

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 32 }]}>
          {challenge ? (
            <>
              <T w="b" size={23}>
                Check your email
              </T>
              <Muted size={14} style={{ marginTop: 4 }}>
                We emailed a 6-digit code to {challenge.email}. It expires in {challenge.expiresInMinutes} minutes.
              </Muted>
              <T w="s" size={13} color={colors.muted} style={styles.label}>
                Sign-in code
              </T>
              <TextInput
                style={[styles.input, styles.code]}
                placeholder="000000"
                placeholderTextColor={colors.faint}
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
              {error ? <T size={14} color={colors.red} style={{ marginTop: 10 }}>{error}</T> : null}
              <Btn title="Verify" onPress={onVerify} loading={loading} style={{ marginTop: 20 }} />
              <Pressable onPress={wait > 0 || loading ? undefined : onResend} style={{ marginTop: 14 }}>
                <T w="s" size={14} color={wait > 0 || loading ? colors.faint : colors.green} style={{ textAlign: 'center' }}>
                  {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
                </T>
              </Pressable>
              <Pressable
                onPress={() => {
                  setChallenge(null);
                  setCode('');
                  setError(null);
                }}
                style={{ marginTop: 12 }}
              >
                <T w="s" size={14} color={colors.green} style={{ textAlign: 'center' }}>
                  Use a different account
                </T>
              </Pressable>
            </>
          ) : (
            <>
              <T w="b" size={23}>
                {isAdmin ? 'Admin sign-in' : 'Welcome back'}
              </T>
              <Muted size={14} style={{ marginTop: 4 }}>
                {isAdmin ? 'Sign in with your admin account, then choose a customer.' : 'Use the same sign-in as the web portal.'}
              </Muted>
              <T w="s" size={13} color={colors.muted} style={styles.label}>
                Email
              </T>
              <TextInput
                style={styles.input}
                placeholder="you@company.com"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                value={email}
                onChangeText={setEmail}
              />
              <T w="s" size={13} color={colors.muted} style={styles.label}>
                Password
              </T>
              <View>
                <TextInput
                  style={[styles.input, { paddingRight: 64 }]}
                  placeholder="Password"
                  placeholderTextColor={colors.faint}
                  secureTextEntry={!showPw}
                  textContentType="password"
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={onSubmit}
                  returnKeyType="go"
                />
                <Pressable onPress={() => setShowPw((v) => !v)} style={styles.show} hitSlop={6}>
                  <T w="s" size={13} color={colors.green}>
                    {showPw ? 'Hide' : 'Show'}
                  </T>
                </Pressable>
              </View>
              {error ? <T size={14} color={colors.red} style={{ marginTop: 10 }}>{error}</T> : null}
              <Btn title="Sign in" onPress={onSubmit} loading={loading} style={{ marginTop: 20 }} />
              <Btn title="Sign in with fingerprint" variant="ghost" onPress={onBio} loading={bioLoading} style={{ marginTop: 10 }} />
              {isAdmin ? (
                <Btn title="Back to client sign-in" variant="ghost" onPress={toggleAdmin} style={{ marginTop: 10 }} />
              ) : null}
              <View style={styles.forgot}>
                <Muted size={13}>Forgot your password? </Muted>
                <Pressable onPress={onReset} hitSlop={8}>
                  <T w="s" size={13} color={colors.green}>
                    Reset it
                  </T>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  brand: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 24 },
  sheet: { backgroundColor: '#fff', paddingHorizontal: 22, paddingTop: 8 },
  label: { marginTop: 14, marginBottom: 6 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#8C99AB',
    backgroundColor: colors.soft,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.fg,
  },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  show: { position: 'absolute', right: 6, top: 7, height: 36, paddingHorizontal: 10, justifyContent: 'center' },
  forgot: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
});
