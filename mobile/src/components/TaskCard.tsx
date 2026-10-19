import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, ProgressBar, AvatarStack } from './index';
import { colors, spacing, typography } from '../theme';
import { PRIORITY_META, PROGRESS_META, checklistProgress, dueColor, dueState, labelColor, pendingApprovals } from '../lib/tasks';
import { formatDate } from '../lib/format';
import type { Task } from '../api/types';

export function TaskCard({ task, group, unread, onPress }: { task: Task; group?: string; unread?: number; onPress: () => void }) {
  const progress = PROGRESS_META[task.progress];
  const priority = PRIORITY_META[task.priority];
  const checklist = checklistProgress(task);
  const due = dueState(task);
  const approvals = pendingApprovals(task);

  return (
    <Card onPress={onPress}>
      <View style={styles.top}>
        <Text style={styles.number}>{task.taskNumber}</Text>
        {group ? (
          <Text style={styles.group} numberOfLines={1}>
            · {group}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Badge label={priority.label} fg={priority.fg} bg={priority.bg} icon={priority.icon} />
      </View>

      <Text style={[typography.h3, { marginBottom: spacing.sm }]} numberOfLines={2}>
        {task.title}
      </Text>

      {task.labels.length > 0 && (
        <View style={styles.labels}>
          {task.labels.slice(0, 3).map((l) => (
            <View key={l.id} style={styles.label}>
              <View style={[styles.labelDot, { backgroundColor: labelColor(l.color) }]} />
              <Text style={styles.labelText} numberOfLines={1}>
                {l.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {checklist !== null && (
        <View style={{ marginBottom: spacing.sm }}>
          <ProgressBar value={checklist} color={task.progress === 'COMPLETED' ? colors.success : colors.accent} />
        </View>
      )}

      <View style={styles.footer}>
        <Badge label={progress.label} fg={progress.fg} bg={progress.bg} icon={progress.icon} />
        {task.dueDate ? (
          <View style={styles.meta}>
            <Ionicons name="calendar-outline" size={14} color={dueColor(due)} />
            <Text style={[typography.caption, { color: dueColor(due) }]}>{formatDate(task.dueDate)}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {approvals > 0 && (
          <View style={styles.meta}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.warning} />
            <Text style={[typography.caption, { color: colors.warning }]}>{approvals}</Text>
          </View>
        )}
        <View style={styles.meta}>
          <Ionicons name="chatbubble-outline" size={14} color={unread ? colors.accent : colors.textMuted} />
          <Text style={[typography.caption, unread ? styles.unreadText : null]}>
            {unread ? `${unread} new` : task.comments.length}
          </Text>
        </View>
        <AvatarStack people={task.assignees} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  number: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  group: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  labelDot: { width: 8, height: 8, borderRadius: 4 },
  labelText: { fontSize: 12, color: colors.text, maxWidth: 120 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  unreadText: { color: colors.accent, fontWeight: '700' },
});
