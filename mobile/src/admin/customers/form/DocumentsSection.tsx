import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Btn, Muted, T } from '../../../ui';
import { colors } from '../../../theme';
import { errorMessage } from '../../../api/client';
import { fileUrl, type PickedFile } from '../../../api/tasks';
import { customerFormApi, type FormDocument } from '../../../api/admin/customerForm';
import { formatSize } from '../../../lib/format';
import { useFileViewer } from '../../../lib/fileViewer';
import { Section } from './fields';

/**
 * Agreement Document — already-uploaded files (edit) can be opened or deleted
 * at once; newly picked files are staged and uploaded after the customer saves
 * (on create the customer must exist first), like the web form.
 */
export function DocumentsSection({
  clientId,
  existing,
  staged,
  onStaged,
  open,
  onToggle,
}: {
  clientId?: string;
  existing: FormDocument[];
  staged: PickedFile[];
  onStaged: (files: PickedFile[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const view = useFileViewer();
  const openDoc = (d: FormDocument) =>
    view(
      existing.map((x) => ({ url: fileUrl(x.url), name: x.fileName, contentType: x.contentType })),
      existing.indexOf(d)
    );
  const isEdit = !!clientId;

  const del = useMutation({
    mutationFn: (docId: string) => customerFormApi.deleteDocument(clientId!, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-customer-form', clientId] });
      qc.invalidateQueries({ queryKey: ['admin-customer'] });
    },
    onError: (e) => Alert.alert('Could not delete the document', errorMessage(e)),
  });

  const confirmDelete = (d: FormDocument) =>
    Alert.alert('Delete document?', `"${d.fileName}" is removed from this customer straight away.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(d.id) },
    ]);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (res.canceled || !res.assets?.length) return;
    onStaged([...staged, ...res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }))]);
  };

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginTop: 10 };

  return (
    <Section
      icon="document-text-outline"
      title="Agreement Document"
      description="Upload signed agreements or contracts for this customer — any file type, no size limit."
      open={open}
      onToggle={onToggle}
    >
      {existing.map((d) => (
        <View key={d.id} style={[row, { borderColor: colors.line }]}>
          <Ionicons name="document-outline" size={18} color={colors.green} />
          <Pressable style={{ flex: 1 }} onPress={() => openDoc(d)}>
            <T w="s" size={13.5} numberOfLines={1}>
              {d.fileName}
            </T>
            <Muted size={11.5}>{formatSize(d.size)}</Muted>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => openDoc(d)} accessibilityLabel="Open">
            <Ionicons name="download-outline" size={19} color={colors.muted} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => confirmDelete(d)} disabled={del.isPending} accessibilityLabel="Delete">
            <Ionicons name="trash-outline" size={19} color={colors.redFg} />
          </Pressable>
        </View>
      ))}

      {staged.map((f, i) => (
        <View key={`${f.name}-${i}`} style={[row, { borderColor: '#C9D2DD', borderStyle: 'dashed', backgroundColor: colors.soft2 }]}>
          <Ionicons name="cloud-upload-outline" size={18} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <T w="s" size={13.5} numberOfLines={1}>
              {f.name}
            </T>
            <Muted size={11.5}>Pending{isEdit ? ' — uploads on “Save changes”' : ' — uploads when the customer is created'}</Muted>
          </View>
          <Pressable hitSlop={8} onPress={() => onStaged(staged.filter((_, j) => j !== i))} accessibilityLabel="Remove">
            <Ionicons name="close-circle-outline" size={20} color={colors.redFg} />
          </Pressable>
        </View>
      ))}

      {existing.length === 0 && staged.length === 0 ? (
        <Muted size={13.5} style={{ marginTop: 14 }}>
          No documents uploaded yet.
        </Muted>
      ) : null}

      <Btn title="Upload document" icon="cloud-upload-outline" variant="dashed" onPress={() => void pick()} style={{ marginTop: 14 }} />
    </Section>
  );
}
