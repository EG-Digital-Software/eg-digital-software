import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { adminTasks } from '../../api/admin/tasks';
import { DateField, TimeField } from '../pickers';
import type { PickedFile } from '../../api/tasks';
import type { TaskPriority, TaskProgress } from '../../api/types';
import { useScope } from '../../context/ScopeContext';
import { Muted, Sheet, SheetOption, T, useRevealFocused, type PillKind } from '../../ui';
import { colors, fonts, GUTTER } from '../../theme';

// ─── Meta (mirrors the web's lib/tasks) ───────────────────

export const PROGRESS_ORDER: TaskProgress[] = ['NOT_STARTED', 'IN_PROGRESS', 'ONGOING', 'COMPLETED'];
export const PROGRESS_META: Record<TaskProgress, { label: string; kind: PillKind; color: string }> = {
  NOT_STARTED: { label: 'Not started', kind: 'ns', color: '#94A3B8' },
  IN_PROGRESS: { label: 'In progress', kind: 'on', color: '#3B82F6' },
  ONGOING: { label: 'Ongoing', kind: 'info', color: '#8B5CF6' },
  COMPLETED: { label: 'Completed', kind: 'ok', color: '#10B981' },
};

export const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'IMPORTANT', 'MEDIUM', 'LOW'];
export const PRIORITY_META: Record<TaskPriority, { label: string; kind: PillKind; color: string }> = {
  URGENT: { label: 'Urgent', kind: 'red', color: '#F43F5E' },
  IMPORTANT: { label: 'Important', kind: 'warn', color: '#F59E0B' },
  MEDIUM: { label: 'Medium', kind: 'info', color: '#0EA5E9' },
  LOW: { label: 'Low', kind: 'ns', color: '#94A3B8' },
};

/** Teams a task can be assigned to; the client sees this instead of the employees. */
export const TASK_TEAMS = ['Team Alpha', 'Team Beta', 'Team Gamma', 'Team Echo'] as const;

/** Label colour tokens (same tokens as the web) → swatch colours. */
export const LABEL_HEX: Record<string, { solid: string; bg: string; fg: string }> = {
  rose: { solid: '#F43F5E', bg: '#FFE4E6', fg: '#BE123C' },
  amber: { solid: '#F59E0B', bg: '#FEF3C7', fg: '#B45309' },
  lime: { solid: '#84CC16', bg: '#ECFCCB', fg: '#4D7C0F' },
  emerald: { solid: '#10B981', bg: '#D1FAE5', fg: '#047857' },
  teal: { solid: '#14B8A6', bg: '#CCFBF1', fg: '#0F766E' },
  sky: { solid: '#0EA5E9', bg: '#E0F2FE', fg: '#0369A1' },
  indigo: { solid: '#6366F1', bg: '#E0E7FF', fg: '#4338CA' },
  violet: { solid: '#8B5CF6', bg: '#EDE9FE', fg: '#6D28D9' },
  pink: { solid: '#EC4899', bg: '#FCE7F3', fg: '#BE185D' },
  slate: { solid: '#64748B', bg: '#F1F5F9', fg: '#475569' },
};
export const labelHex = (c: string) => LABEL_HEX[c] ?? LABEL_HEX.slate!;

// ─── Dates ────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → yyyy-mm-dd (local day), '' when unset. */
export const toDateInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** yyyy-mm-dd → ISO at local midnight (same as the web). */
export const toIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : '');
export const todayInput = () => toDateInput(new Date().toISOString());
export const fmtDay = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// ─── Hooks ────────────────────────────────────────────────

/** Admin API for one customer. */
export function useAdminApi(clientId: string) {
  return useMemo(() => adminTasks(clientId), [clientId]);
}

/** Refresh the board (and one task) of the current TaskScope. */
export function useRefreshBoard() {
  const { scopeKey } = useScope();
  const qc = useQueryClient();
  return (taskId?: string) => {
    void qc.invalidateQueries({ queryKey: ['board', scopeKey] });
    if (taskId) void qc.invalidateQueries({ queryKey: ['task', scopeKey, taskId] });
  };
}

// ─── Small UI pieces ──────────────────────────────────────

export function confirmDestroy(title: string, message: string, onOk: () => void, action = 'Delete') {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onOk },
  ]);
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 14, marginBottom: 6, marginLeft: 2 }, style]}>
      <T w="s" size={12.5} color={colors.muted}>
        {children}
      </T>
    </View>
  );
}

/** A filled text box that keeps itself visible above the keyboard. */
export function Input({ style, multiline, ...rest }: TextInputProps) {
  const reveal = useRevealFocused();
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      multiline={multiline}
      onContentSizeChange={multiline ? reveal : undefined}
      {...rest}
      style={[
        {
          minHeight: 46,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          borderRadius: 10,
          backgroundColor: colors.soft,
          borderWidth: 1,
          borderColor: colors.line,
          fontFamily: fonts.medium,
          fontSize: 15,
          color: colors.fg,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        multiline && { minHeight: 90, maxHeight: 220 },
        style,
      ]}
    />
  );
}

/** A tappable row showing a value; opens a sheet of options. */
export function SelectRow<V extends string>({
  value,
  options,
  onChange,
  placeholder = 'Choose',
  disabled,
  title,
  dot,
}: {
  value: V | '';
  options: { value: V | ''; label: string }[];
  onChange: (v: V | '') => void;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  dot?: (v: V | '') => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const color = dot?.(value);
  return (
    <>
      <Pressable onPress={() => !disabled && setOpen(true)} style={[rowBox, disabled && { opacity: 0.55 }]}>
        {color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null}
        <T w="s" size={14.5} color={current ? colors.fg : colors.faint} style={{ flex: 1 }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </T>
        <Ionicons name="chevron-down" size={16} color={colors.faint} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        {title ? (
          <T w="s" size={17} style={{ marginBottom: 4 }}>
            {title}
          </T>
        ) : null}
        {options.map((o) => (
          <SheetOption
            key={o.value || '_none'}
            title={o.label}
            selected={o.value === value}
            onPress={() => {
              setOpen(false);
              if (o.value !== value) onChange(o.value);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

export const rowBox: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  minHeight: 46,
  paddingHorizontal: 14,
  borderRadius: 10,
  backgroundColor: colors.soft,
  borderWidth: 1,
  borderColor: colors.line,
};

/** A date row (yyyy-mm-dd) using the native date picker. */
export function DateRow({
  value,
  onChange,
  placeholder = 'Set date',
  disabled,
  clearable = true,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  min?: string;
  max?: string;
}) {
  return <DateField value={value} onChange={(v) => v !== value && onChange(v)} placeholder={placeholder} disabled={disabled} clearable={clearable} min={min} max={max} />;
}

/** A time row ('HH:MM', 24h) using the native time picker. */
export function TimeRow({ value, onChange, placeholder = 'Set time', disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return <TimeField value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />;
}

/** Write text to a cache file and open the share sheet (CSV exports and downloads). */
export async function shareTextFile(name: string, text: string, mimeType = 'text/csv') {
  try {
    const safe = name.replace(/[^\w.-]+/g, '-') || 'file.txt';
    const file = new FSFile(Paths.cache, safe);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: safe });
  } catch (e) {
    Alert.alert('Could not save the file', e instanceof Error ? e.message : String(e));
  }
}

/** A compact outlined button for inline actions. */
export function SmallBtn({
  title,
  onPress,
  icon,
  tone = 'default',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  tone?: 'default' | 'danger' | 'primary' | 'good';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = { default: [colors.fg, '#fff', colors.line], danger: [colors.redFg, colors.redBg, colors.redBg], primary: ['#fff', colors.navy, colors.navy], good: [colors.okFg, colors.okBg, colors.okBg] }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, backgroundColor: c[1], borderColor: c[2] },
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={c[0]} /> : null}
      <T w="s" size={13} color={c[0]}>
        {title}
      </T>
    </Pressable>
  );
}

/** Underlined, horizontally scrolling tabs. */
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -GUTTER, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.line }}
      contentContainerStyle={{ paddingHorizontal: GUTTER - 4 }}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={{ minHeight: 46, paddingHorizontal: 12, justifyContent: 'center' }}>
            <T w="s" size={14} color={on ? colors.green : colors.muted}>
              {t.label}
            </T>
            {on ? <View style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.green }} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Ask for a photo/video or a document; calls back with the picked files. */
export function pickFiles(onPick: (files: PickedFile[]) => void, { multiple = false }: { multiple?: boolean } = {}) {
  const fromFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple });
    if (res.canceled) return;
    const files = (res.assets ?? []).map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }));
    if (files.length) onPick(files);
  };
  const fromPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access in Settings to add photos.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1, allowsMultipleSelection: multiple });
    if (res.canceled) return;
    const files = (res.assets ?? []).map((a) => ({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
      mimeType: a.mimeType,
      size: a.fileSize,
    }));
    if (files.length) onPick(files);
  };
  Alert.alert(multiple ? 'Add files' : 'Add a file', undefined, [
    { text: 'Photo or video', onPress: () => void fromPhotos() },
    { text: 'File', onPress: () => void fromFiles() },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/** Small coloured label chip. */
export function LabelChip({ name, color, onPress, selected }: { name: string; color: string; onPress?: () => void; selected?: boolean }) {
  const c = labelHex(color);
  const body = (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 26, borderRadius: 999, backgroundColor: c.bg },
        selected === false && { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
      ]}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.solid }} />
      <T w="s" size={12} color={selected === false ? colors.muted : c.fg}>
        {name}
      </T>
      {selected ? <Ionicons name="checkmark" size={13} color={c.fg} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}
