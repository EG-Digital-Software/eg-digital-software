import React, { useEffect, useRef, useState } from 'react';
import { View, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';

// The package's class typings don't line up with React 19's; the runtime is fine.
const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { postMessage: (data: string) => void };
import { File, Paths } from 'expo-file-system';
import { API_URL } from '../config';
import { errorMessage, getSession, refreshSession } from '../api/client';
import { portalApi } from '../api/portal';
import { PDF_BASE_URL, PDF_HTML } from '../lib/pdfHtml';
import { docTitle, stageOf, useProfile } from '../lib/portal';
import { useScope } from '../context/ScopeContext';
import { AppBar, Btn, KeyboardSafe, Muted, T, useKeyboardVisible } from '../ui';
import { colors, GUTTER } from '../theme';

/** ArrayBuffer → base64 (chunked so big PDFs don't overflow the call stack). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

/** A stored file path → full URL (same as the web's mediaUrl). */
function fileUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL.replace(/\/api\/?$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * The agreement PDF bytes. Tries the API's proxy first (the signed copy when there
 * is one), then the stored file itself — the link the web portal's Preview opens.
 */
async function fetchPdf(documentId: string, signed: boolean, direct: string | null | undefined): Promise<string> {
  const viaApi = async (withSigned: boolean) => {
    const url = `${API_URL}/client/documents/${documentId}/file${withSigned ? '?signed=1' : ''}`;
    const get = () =>
      fetch(url, { headers: { 'X-Client': 'mobile', Authorization: `Bearer ${getSession()?.accessToken ?? ''}` } });
    let res = await get();
    if (res.status === 401 && (await refreshSession())) res = await get();
    return res;
  };
  let res = await viaApi(signed);
  if (!res.ok && signed) res = await viaApi(false);
  if (!res.ok && direct) {
    const fallback = await fetch(fileUrl(direct)).catch(() => null);
    if (fallback?.ok) res = fallback;
  }
  if (!res.ok) throw new Error(`Could not load the document (${res.status})`);
  return toBase64(await res.arrayBuffer());
}

/**
 * Agreement viewer. `AgreementPreview` shows the PDF; `AgreementSign` overlays the
 * fields the admin placed so the client can type or draw a signature, then uploads
 * the filled copy for admin approval — the same flow as the web portal.
 */
export default function AgreementViewerScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { scopeKey } = useScope();
  const signMode = route.name === 'AgreementSign';
  const documentId: string = route.params?.documentId;
  const profile = useProfile();
  const doc = profile.data?.documents?.find((d) => d.id === documentId);
  const web = useRef<WebViewHandle>(null);
  const keyboardUp = useKeyboardVisible();

  const [payload, setPayload] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState({ filled: 0, total: 0 });
  const [submitting, setSubmitting] = useState(false);
  /** Bumped by "Try again" to fetch the PDF and rebuild the viewer. */
  const [attempt, setAttempt] = useState(0);

  const fields = doc?.fields ?? [];
  const noFields = signMode && !!doc && fields.length === 0;
  // Preview shows the signed copy whenever there is one, like the web portal.
  const showSigned = !!doc?.signedUrl && !signMode;

  // Fetch the PDF (and the signer line) once the document is known.
  useEffect(() => {
    if (!doc || noFields) return;
    let live = true;
    (async () => {
      try {
        const [pdf, signer] = await Promise.all([
          fetchPdf(doc.id, showSigned, signMode ? doc.url : doc.signedUrl || doc.url),
          signMode ? portalApi.signer() : Promise.resolve(null),
        ]);
        if (live) setPayload(JSON.stringify({ type: 'load', pdf, mode: signMode ? 'sign' : 'preview', fields, signer }));
      } catch (e) {
        if (live) setError(errorMessage(e, 'Could not load the document'));
      }
    })();
    return () => {
      live = false;
    };
    // Load once per document; field edits by the admin need a reopen anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, noFields, attempt]);

  useEffect(() => {
    if (payload && webReady) web.current?.postMessage(payload);
  }, [payload, webReady]);

  // Never spin forever: if the pages haven't drawn in time, say so.
  useEffect(() => {
    if (loaded || error || !doc || noFields) return;
    const t = setTimeout(() => {
      setError(
        !payload
          ? 'The document is taking too long to download. Check your internet connection and try again.'
          : !webReady
            ? 'Could not load the PDF viewer. Check your internet connection and try again.'
            : 'The document could not be shown. Please try again.'
      );
    }, 45000);
    return () => clearTimeout(t);
  }, [loaded, error, doc, noFields, payload, webReady, attempt]);

  const retry = () => {
    setError(null);
    setPayload(null);
    setWebReady(false);
    setLoaded(false);
    setAttempt((n) => n + 1);
  };

  const upload = async (pdfB64: string, filled: string[]) => {
    try {
      const file = new File(Paths.cache, `signed-${documentId}.pdf`);
      if (file.exists) file.delete();
      file.create();
      file.write(pdfB64, { encoding: 'base64' });
      await portalApi.signDocument(documentId, file.uri, doc?.fileName ?? 'agreement.pdf', filled);
      try {
        file.delete();
      } catch {
        // Cache cleanup is best effort.
      }
      await qc.invalidateQueries({ queryKey: ['profile', scopeKey] });
      Alert.alert('Submitted', 'Your signed agreement was sent to EG Eloma for approval.');
      nav.goBack();
    } catch (e) {
      Alert.alert('Not submitted', errorMessage(e, 'Could not submit the agreement'));
    } finally {
      setSubmitting(false);
    }
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let m: any;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'ready') {
      if (!m.libs) setError('Could not load the PDF viewer. Check your internet connection and try again.');
      else setWebReady(true);
    } else if (m.type === 'loaded') setLoaded(true);
    else if (m.type === 'count') setCount({ filled: m.filled, total: m.total });
    else if (m.type === 'done') void upload(m.pdf, m.filled);
    else if (m.type === 'error') {
      setSubmitting(false);
      if (loaded || submitting) Alert.alert('Agreement', m.message);
      else setError(m.message);
    }
  };

  const submit = () => {
    if (!count.filled) {
      Alert.alert('Nothing filled yet', 'Fill at least one field before submitting.');
      return;
    }
    setSubmitting(true);
    web.current?.postMessage(JSON.stringify({ type: 'submit' }));
  };

  const rejected = doc?.status === 'REJECTED';
  const title = signMode ? 'Review and sign' : showSigned && stageOf(doc!) === 'approved' ? 'Signed copy' : 'Preview';

  // The WebView shrinks with the keyboard, so the page scrolls the box being
  // typed in (or the signature pad's name field) into view by itself.
  return (
    <KeyboardSafe style={{ backgroundColor: '#fff' }}>
      <AppBar title={title} back />
      <View style={{ paddingHorizontal: GUTTER, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <T w="s" size={15} numberOfLines={1}>
          {doc ? docTitle(doc) : 'Agreement'}
        </T>
        {signMode ? (
          <Muted size={12.5}>
            {rejected ? 'Not approved last time — fill it in, sign and resubmit. ' : ''}
            Type in the boxes, and tap a signature box to sign with your finger.
          </Muted>
        ) : null}
      </View>

      {!doc ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          {profile.isLoading ? <ActivityIndicator color={colors.navy} /> : <Muted>This agreement is no longer available.</Muted>}
        </View>
      ) : noFields ? (
        <View style={{ padding: 24 }}>
          <Muted size={14} style={{ textAlign: 'center', lineHeight: 21 }}>
            This document isn’t ready to sign yet. Please check back once EG Eloma has marked the fields to fill.
          </Muted>
        </View>
      ) : error ? (
        <View style={{ padding: 24, gap: 12 }}>
          <Muted size={14} style={{ textAlign: 'center' }}>
            {error}
          </Muted>
          <Btn title="Try again" onPress={retry} />
          <Btn title="Close" variant="ghost" onPress={() => nav.goBack()} />
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.track }}>
          <WebView
            key={attempt}
            ref={web}
            onError={(e: { nativeEvent: { description?: string } }) =>
              setError(`Could not open the viewer: ${e.nativeEvent.description ?? 'network error'}`)
            }
            originWhitelist={['*']}
            source={{ html: PDF_HTML, baseUrl: PDF_BASE_URL }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            style={{ flex: 1, backgroundColor: colors.track }}
          />
          {!loaded ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.track }}>
              <ActivityIndicator color={colors.navy} />
              <Muted size={13} style={{ marginTop: 8 }}>
                Loading document…
              </Muted>
            </View>
          ) : null}
        </View>
      )}

      {signMode && doc && !noFields && !error ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: GUTTER,
            paddingTop: 10,
            paddingBottom: keyboardUp ? 10 : Math.max(insets.bottom, 10) + 6,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: '#fff',
          }}
        >
          <View style={{ flex: 1 }}>
            <T w="s" size={14}>
              {count.filled} of {count.total} filled
            </T>
            <Muted size={12}>{count.filled < count.total ? 'Empty fields can be filled later' : 'All fields filled'}</Muted>
          </View>
          <Btn
            title={rejected ? 'Save & resubmit' : 'Save & submit'}
            onPress={submit}
            loading={submitting}
            disabled={!loaded}
            style={{ paddingHorizontal: 22 }}
          />
        </View>
      ) : null}
    </KeyboardSafe>
  );
}
