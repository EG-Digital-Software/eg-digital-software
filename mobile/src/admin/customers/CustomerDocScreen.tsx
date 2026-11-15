import React, { useEffect, useRef, useState } from 'react';
import { View, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, type AdminAgreementField } from '../../api/admin/customers';
import { AppBar, Btn, KeyboardSafe, Muted, T, Toggle, useKeyboardVisible } from '../../ui';
import { colors, fonts, GUTTER } from '../../theme';
import { PDF_ADMIN_HTML, PDF_BASE_URL } from './pdfAdminHtml';
import { customerKey, remainingFields } from './common';
import { downloadAndShare, fetchDocBase64 as fetchPdf } from './download';

// The package's class typings don't line up with React 19's; the runtime is fine.
const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { postMessage: (data: string) => void };

type Mode = 'preview' | 'fill' | 'fields';

/**
 * Admin agreement viewer, three routes:
 *   CustomerDocView   { clientId, documentId } — the client's signed copy (or the
 *                     original); approve / not approve a submitted copy.
 *   CustomerDocFill   { clientId, documentId } — fill the fields the client left empty.
 *   CustomerDocFields { clientId, documentId } — mark where the client fills in.
 */
export default function CustomerDocScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const keyboardUp = useKeyboardVisible();
  const clientId: string = route.params?.clientId;
  const documentId: string = route.params?.documentId;
  const mode: Mode = route.name === 'CustomerDocFill' ? 'fill' : route.name === 'CustomerDocFields' ? 'fields' : 'preview';

  const customer = useQuery({ queryKey: customerKey(clientId), queryFn: () => adminCustomersApi.get(clientId) });
  const doc = customer.data?.documents?.find((d) => d.id === documentId);
  const web = useRef<WebViewHandle>(null);

  const [payload, setPayload] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  // fill mode
  const [count, setCount] = useState({ filled: 0, total: 0 });
  // fields mode
  const [placed, setPlaced] = useState(0);
  const [drawing, setDrawing] = useState(true);
  const [label, setLabel] = useState('Signature');

  const fillFields: AdminAgreementField[] = doc ? remainingFields(doc) : [];
  const nothingToFill = mode === 'fill' && !!doc && fillFields.length === 0;
  const showSigned = mode === 'fill' || (mode === 'preview' && !!doc?.signedUrl);

  useEffect(() => {
    if (!doc || nothingToFill) return;
    let live = true;
    (async () => {
      try {
        const [pdf, signer] = await Promise.all([
          fetchPdf(clientId, doc.id, showSigned, showSigned ? doc.signedUrl || doc.url : doc.url),
          mode === 'fill' ? adminCustomersApi.signer() : Promise.resolve(null),
        ]);
        if (!live) return;
        setPayload(
          JSON.stringify({
            type: 'load',
            pdf,
            mode: mode === 'fill' ? 'sign' : mode,
            fields: mode === 'fill' ? fillFields : mode === 'fields' ? doc.fields ?? [] : [],
            // The admin's "Signed By" line sits under the client's.
            signer: signer ? { ...signer, y: 12 } : null,
          })
        );
      } catch (e) {
        if (live) setError(errorMessage(e, 'Could not load the document'));
      }
    })();
    return () => {
      live = false;
    };
    // Load once per document/attempt; the doc record polls in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, nothingToFill, attempt]);

  useEffect(() => {
    if (payload && webReady) web.current?.postMessage(payload);
  }, [payload, webReady]);

  // Keep the page's drawing switch and label in step.
  useEffect(() => {
    if (mode === 'fields' && loaded) web.current?.postMessage(JSON.stringify({ type: 'draw', on: drawing, label: label.trim() || 'Signature' }));
  }, [mode, loaded, drawing, label]);

  // Never spin forever.
  useEffect(() => {
    if (loaded || error || !doc || nothingToFill) return;
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
  }, [loaded, error, doc, nothingToFill, payload, webReady, attempt]);

  const retry = () => {
    setError(null);
    setPayload(null);
    setWebReady(false);
    setLoaded(false);
    setAttempt((n) => n + 1);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: customerKey(clientId) });

  const uploadFilled = async (pdfB64: string, filled: string[]) => {
    try {
      const file = new File(Paths.cache, `filled-${documentId}.pdf`);
      if (file.exists) file.delete();
      file.create();
      file.write(pdfB64, { encoding: 'base64' });
      await adminCustomersApi.fillDocument(clientId, documentId, file.uri, doc?.fileName ?? 'agreement.pdf', filled);
      try {
        file.delete();
      } catch {
        // Cache cleanup is best effort.
      }
      await refresh();
      Alert.alert('Saved', 'Remaining fields saved.');
      nav.goBack();
    } catch (e) {
      Alert.alert('Not saved', errorMessage(e, 'Could not save the document'));
    } finally {
      setBusy(false);
    }
  };

  const saveFields = async (fields: AdminAgreementField[]) => {
    try {
      await adminCustomersApi.updateDocument(clientId, documentId, { fields });
      await refresh();
      Alert.alert('Fields saved', fields.length ? `${fields.length} field${fields.length === 1 ? '' : 's'} ready for the client.` : 'All fields removed.');
      nav.goBack();
    } catch (e) {
      Alert.alert('Not saved', errorMessage(e, 'Could not save the fields'));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    try {
      await adminCustomersApi.updateDocument(clientId, documentId, { status });
      await refresh();
      Alert.alert(status === 'APPROVED' ? 'Document approved' : 'Marked not approved — the client will be asked to sign and resubmit');
      nav.goBack();
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    } finally {
      setBusy(false);
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
    else if (m.type === 'placed') setPlaced(m.count);
    else if (m.type === 'done') void uploadFilled(m.pdf, m.filled);
    else if (m.type === 'fields') void saveFields(m.fields ?? []);
    else if (m.type === 'error') {
      setBusy(false);
      if (loaded) Alert.alert('Agreement', m.message);
      else setError(m.message);
    }
  };

  const submitFill = () => {
    if (!count.filled) {
      Alert.alert('Nothing filled yet', 'Fill at least one field before saving.');
      return;
    }
    setBusy(true);
    web.current?.postMessage(JSON.stringify({ type: 'submit' }));
  };

  const submitFields = () => {
    setBusy(true);
    web.current?.postMessage(JSON.stringify({ type: 'getFields' }));
  };

  const reject = () =>
    Alert.alert('Not approve?', 'The client will be asked to fill in, sign and resubmit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Not approve', style: 'destructive', onPress: () => void setStatus('REJECTED') },
    ]);

  const title = mode === 'fill' ? 'Fill remaining' : mode === 'fields' ? 'Mark fields' : doc?.signedUrl ? 'Signed copy' : 'Document';
  const subtitle =
    mode === 'fill'
      ? 'The client’s submitted copy. Fill the fields they left empty — type in a box, or tap a signature box to sign.'
      : mode === 'fields'
        ? drawing
          ? 'Drag a box on the page where the client should fill in. Turn drawing off to scroll. Tap × to remove a box.'
          : 'Drawing is off — scroll freely. Turn it on to add boxes.'
        : doc?.status === 'SUBMITTED'
          ? 'The client’s filled and signed copy. Approve it, or mark it not approved so they sign and resubmit.'
          : doc?.signedUrl
            ? 'The client’s filled and signed copy.'
            : null;
  const bottomPad = keyboardUp ? 10 : Math.max(insets.bottom, 10) + 6;

  return (
    <KeyboardSafe style={{ backgroundColor: '#fff' }}>
      <AppBar title={title} back />
      <View style={{ paddingHorizontal: GUTTER, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 }}>
        <T w="s" size={15} numberOfLines={1}>
          {doc?.fileName ?? 'Agreement'}
        </T>
        {subtitle ? <Muted size={12.5}>{subtitle}</Muted> : null}
        {mode === 'preview' && doc ? (
          <Btn
            title="Download / share"
            icon="share-outline"
            variant="ghost"
            loading={sharing}
            onPress={() => {
              setSharing(true);
              downloadAndShare(clientId, doc)
                .catch((e) => Alert.alert('Could not download', errorMessage(e)))
                .finally(() => setSharing(false));
            }}
            style={{ minHeight: 40, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 16 }}
          />
        ) : null}
        {mode === 'fields' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <View style={{ flex: 1, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12 }}>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Label (e.g. Full name)"
                placeholderTextColor={colors.faint}
                style={{ minHeight: 42, fontFamily: fonts.medium, fontSize: 14, color: colors.fg }}
              />
            </View>
            <Muted size={12.5} w="s">
              Draw
            </Muted>
            <Toggle value={drawing} onChange={setDrawing} />
          </View>
        ) : null}
      </View>

      {!doc ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          {customer.isLoading ? <ActivityIndicator color={colors.navy} /> : <Muted>This document is no longer available.</Muted>}
        </View>
      ) : nothingToFill ? (
        <View style={{ padding: 24 }}>
          <Muted size={14} style={{ textAlign: 'center' }}>
            Every field on this copy is already filled.
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
            onError={(ev: { nativeEvent: { description?: string } }) =>
              setError(`Could not open the viewer: ${ev.nativeEvent.description ?? 'network error'}`)
            }
            originWhitelist={['*']}
            source={{ html: PDF_ADMIN_HTML, baseUrl: PDF_BASE_URL }}
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

      {doc && !error && !nothingToFill && (mode !== 'preview' || doc.status === 'SUBMITTED') ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: GUTTER,
            paddingTop: 10,
            paddingBottom: bottomPad,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: '#fff',
          }}
        >
          {mode === 'preview' ? (
            <>
              <Btn title="Not approve" variant="ghost" onPress={reject} disabled={busy || !loaded} style={{ flex: 1 }} />
              <Btn title="Approve" onPress={() => void setStatus('APPROVED')} loading={busy} disabled={!loaded} style={{ flex: 1 }} />
            </>
          ) : mode === 'fill' ? (
            <>
              <View style={{ flex: 1 }}>
                <T w="s" size={14}>
                  {count.filled} of {count.total} filled
                </T>
                <Muted size={12}>{count.filled < count.total ? 'Empty fields can stay empty' : 'All fields filled'}</Muted>
              </View>
              <Btn title="Save" onPress={submitFill} loading={busy} disabled={!loaded} style={{ paddingHorizontal: 26 }} />
            </>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <T w="s" size={14}>
                  {placed} field{placed === 1 ? '' : 's'} placed
                </T>
              </View>
              <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} disabled={busy} style={{ paddingHorizontal: 18 }} />
              <Btn title="Save fields" onPress={submitFields} loading={busy} disabled={!loaded} style={{ paddingHorizontal: 18 }} />
            </>
          )}
        </View>
      ) : null}
    </KeyboardSafe>
  );
}
