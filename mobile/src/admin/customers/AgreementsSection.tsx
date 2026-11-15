import React, { useState } from 'react';
import { View, Alert, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, type AdminCustomer, type AdminDocument } from '../../api/admin/customers';
import { Btn, Card, EmptyCard, Muted, Pill, Sheet, SheetOption, T } from '../../ui';
import { colors } from '../../theme';
import { downloadAndShare } from './download';
import { DOC_STATUS, Field, IconBtn, SheetTitle, customerKey, docSize, fileUrl, fmtDateTime, isPdfDoc, remainingFields } from './common';

type DocStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

/**
 * Agreement documents (web Agreement tab): upload, view the client's signed copy,
 * fill the fields they left empty, approve / not approve / revoke, mark fields on
 * a PDF, rename, open the file, delete.
 */
export function AgreementsSection({ c }: { c: AdminCustomer }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const clientId = c.clientId;
  const docs = c.documents ?? [];
  const [menuFor, setMenuFor] = useState<AdminDocument | null>(null);
  const [renaming, setRenaming] = useState<AdminDocument | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sharingId, setSharingId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: customerKey(clientId) });

  const upload = useMutation({
    mutationFn: async () => {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return null;
      const a = res.assets[0];
      return adminCustomersApi.uploadDocument(clientId, {
        uri: a.uri,
        name: a.name || 'document',
        type: a.mimeType || 'application/octet-stream',
      });
    },
    onSuccess: (doc) => {
      if (!doc) return;
      void refresh();
      // Flat PDFs need fields marked before the client can fill them — go straight
      // to the placement tool, as on the web.
      if (isPdfDoc(doc)) {
        Alert.alert('Document uploaded', 'Mark where the client should fill in and sign?', [
          { text: 'Later', style: 'cancel' },
          { text: 'Mark fields', onPress: () => nav.navigate('CustomerDocFields', { clientId, documentId: doc.id }) },
        ]);
      } else {
        Alert.alert('Document uploaded');
      }
    },
    onError: (e) => Alert.alert('Upload failed', errorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: DocStatus }) => adminCustomersApi.updateDocument(clientId, v.id, { status: v.status }),
    onSuccess: (_d, v) => {
      void refresh();
      Alert.alert(
        v.status === 'APPROVED'
          ? 'Document approved'
          : v.status === 'REJECTED'
            ? 'Marked not approved — the client will be asked to sign and resubmit'
            : 'Approval revoked'
      );
    },
    onError: (e) => Alert.alert('Could not update', errorMessage(e)),
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; fileName: string }) => adminCustomersApi.updateDocument(clientId, v.id, { fileName: v.fileName }),
    onSuccess: () => {
      void refresh();
      setRenaming(null);
    },
    onError: (e) => Alert.alert('Could not rename', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminCustomersApi.deleteDocument(clientId, id),
    onSuccess: () => {
      void refresh();
      Alert.alert('Document deleted');
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  const reject = (d: AdminDocument) =>
    Alert.alert('Not approve?', `The client will be asked to fill in, sign and resubmit "${d.fileName}".`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Not approve', style: 'destructive', onPress: () => setStatus.mutate({ id: d.id, status: 'REJECTED' }) },
    ]);
  const revoke = (d: AdminDocument) =>
    Alert.alert('Revoke approval?', `"${d.fileName}" goes back to awaiting your approval.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => setStatus.mutate({ id: d.id, status: 'SUBMITTED' }) },
    ]);
  const confirmDelete = (d: AdminDocument) =>
    Alert.alert('Delete document?', `"${d.fileName}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(d.id) },
    ]);

  const view = (d: AdminDocument) => nav.navigate('CustomerDocView', { clientId, documentId: d.id });

  return (
    <View style={{ gap: 12 }}>
      <Btn title="Upload document" icon="cloud-upload-outline" onPress={() => upload.mutate()} loading={upload.isPending} />
      {!docs.length ? (
        <EmptyCard icon="document-text-outline" title="No agreement documents" body="Upload an agreement or contract for this customer." />
      ) : (
        docs.map((d) => {
          const st = DOC_STATUS[d.status ?? 'AWAITING_CLIENT'] ?? DOC_STATUS.AWAITING_CLIENT!;
          const approved = d.status === 'APPROVED';
          const submitted = d.status === 'SUBMITTED';
          const pdf = isPdfDoc(d);
          const needsFields = pdf && !approved && (d.fields?.length ?? 0) === 0;
          const remaining = remainingFields(d).length;
          return (
            <Card key={d.id} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="document-text-outline" size={22} color={colors.muted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w="s" size={14.5} numberOfLines={2}>
                    {d.fileName}
                  </T>
                  <Muted size={12} style={{ marginTop: 2 }}>
                    {docSize(d.size)} · uploaded {fmtDateTime(d.createdAt).split(',')[0]}
                  </Muted>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <Pill kind={st.kind} label={st.label} />
                    {needsFields ? <Pill kind="warn" label="Needs fields" /> : null}
                  </View>
                </View>
                <IconBtn icon="ellipsis-vertical" label="Document actions" onPress={() => setMenuFor(d)} />
              </View>

              {(d.signLog?.length ?? 0) > 0 ? (
                <View style={{ marginTop: 10, gap: 2 }}>
                  {d.signLog!.map((s, i) => (
                    <Muted key={i} size={11.5}>
                      Signed by {s.name} · IP {s.ip} · {fmtDateTime(s.at)}
                    </Muted>
                  ))}
                </View>
              ) : null}

              {sharingId === d.id ? (
                <Muted size={12} style={{ marginTop: 8 }}>
                  Preparing download…
                </Muted>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <Btn
                  title={d.signedUrl ? 'View signed copy' : 'View'}
                  icon="eye-outline"
                  variant="ghost"
                  onPress={() => view(d)}
                  style={{ flexGrow: 1, minHeight: 42 }}
                />
                {remaining > 0 ? (
                  <Btn
                    title={`Fill remaining (${remaining})`}
                    icon="create-outline"
                    variant="ghost"
                    onPress={() => nav.navigate('CustomerDocFill', { clientId, documentId: d.id })}
                    style={{ flexGrow: 1, minHeight: 42 }}
                  />
                ) : null}
              </View>
              {submitted ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Btn
                    title="Not approve"
                    variant="ghost"
                    onPress={() => reject(d)}
                    disabled={setStatus.isPending}
                    style={{ flex: 1, minHeight: 42 }}
                  />
                  <Btn
                    title="Approve"
                    onPress={() => setStatus.mutate({ id: d.id, status: 'APPROVED' })}
                    disabled={setStatus.isPending}
                    style={{ flex: 1, minHeight: 42 }}
                  />
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {/* Per-document actions */}
      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)}>
        {menuFor ? (
          <>
            <SheetTitle title={menuFor.fileName} />
            {isPdfDoc(menuFor) && menuFor.status !== 'APPROVED' ? (
              <SheetOption
                title="Mark fields to fill"
                chevron
                onPress={() => {
                  const d = menuFor;
                  setMenuFor(null);
                  nav.navigate('CustomerDocFields', { clientId, documentId: d.id });
                }}
              />
            ) : null}
            <SheetOption
              title={menuFor.signedUrl ? 'Open signed file' : 'Open original file'}
              chevron
              onPress={() => {
                const d = menuFor;
                setMenuFor(null);
                void Linking.openURL(fileUrl(d.signedUrl || d.url)).catch(() => Alert.alert('Could not open the file'));
              }}
            />
            <SheetOption
              title={menuFor.signedUrl ? 'Download / share signed copy' : 'Download / share'}
              chevron
              onPress={() => {
                const d = menuFor;
                setMenuFor(null);
                setSharingId(d.id);
                downloadAndShare(clientId, d)
                  .catch((e) => Alert.alert('Could not download', errorMessage(e)))
                  .finally(() => setSharingId(null));
              }}
            />
            {menuFor.status === 'APPROVED' ? (
              <SheetOption
                title="Revoke approval"
                onPress={() => {
                  const d = menuFor;
                  setMenuFor(null);
                  revoke(d);
                }}
              />
            ) : null}
            <SheetOption
              title="Rename"
              onPress={() => {
                const d = menuFor;
                setMenuFor(null);
                setRenameValue(d.fileName);
                setRenaming(d);
              }}
            />
            <SheetOption
              title="Delete"
              onPress={() => {
                const d = menuFor;
                setMenuFor(null);
                confirmDelete(d);
              }}
            />
          </>
        ) : null}
      </Sheet>

      {/* Rename */}
      <Sheet open={!!renaming} onClose={() => setRenaming(null)}>
        <SheetTitle title="Rename document" />
        <Field label="File name" value={renameValue} onChangeText={setRenameValue} autoFocus autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Btn title="Cancel" variant="ghost" onPress={() => setRenaming(null)} style={{ flex: 1 }} />
          <Btn
            title="Save"
            onPress={() => {
              const v = renameValue.trim();
              if (renaming && v) rename.mutate({ id: renaming.id, fileName: v });
            }}
            disabled={!renameValue.trim()}
            loading={rename.isPending}
            style={{ flex: 1 }}
          />
        </View>
      </Sheet>
    </View>
  );
}
