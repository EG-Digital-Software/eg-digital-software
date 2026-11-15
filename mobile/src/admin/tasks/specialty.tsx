import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { fileUrl } from '../../api/tasks';
import type { AdminTask, ContentCalendar, ContentPost, ContentPostInput, ReportKind } from '../../api/admin/tasks';
import { formatStamp } from '../../lib/format';
import { Btn, Card, EmptyCard, ErrorBox, KV, Loading, Muted, Pill, Sheet, T, Toggle, type PillKind } from '../../ui';
import { colors } from '../../theme';
import { DateRow, Input, Label, SelectRow, SmallBtn, TimeRow, confirmDestroy, useAdminApi } from './common';

const onErr = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));

// ─── Time zones (Intl does the work, as on the web) ───────

const pad = (n: number) => String(n).padStart(2, '0');
function partsIn(tz: string, ms: number) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour === 24 ? 0 : o.hour!, mi: o.minute!, s: o.second! };
}
function offsetMs(tz: string, ms: number) {
  const p = partsIn(tz, ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
/** "2026-11-12" + "18:00" in `tz` → ISO (UTC). */
function zonedToIso(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  let res = guess - offsetMs(tz, guess);
  const again = guess - offsetMs(tz, res);
  if (again !== res) res = again;
  return new Date(res).toISOString();
}
function isoToZoned(iso: string, tz: string) {
  const p = partsIn(tz, new Date(iso).getTime());
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
function fmtDateTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  } catch {
    return formatStamp(iso);
  }
}

// ─── Content Calendar ─────────────────────────────────────

const POST_STATUS: Record<string, { kind: PillKind; label: string }> = {
  DRAFT: { kind: 'ns', label: 'Draft' },
  AWAITING_APPROVAL: { kind: 'warn', label: 'Awaiting approval' },
  CHANGES_REQUESTED: { kind: 'red', label: 'Changes requested' },
  APPROVED: { kind: 'ok', label: 'Approved' },
  SCHEDULED: { kind: 'info', label: 'Scheduled' },
  PUBLISHING: { kind: 'on', label: 'Publishing' },
  PUBLISHED: { kind: 'ok', label: 'Published' },
  FAILED: { kind: 'red', label: 'Failed' },
};
const PLATFORM_NAME: Record<string, string> = { fb: 'Facebook', ig: 'Instagram' };

interface PostForm {
  title: string;
  caption: string;
  hashtags: string;
  firstComment: string;
  platforms: string[];
  date: string;
  time: string;
  timeZone: string;
  attachmentId: string | null;
}

export function ContentPanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const api = useAdminApi(clientId);
  const q = useQuery({ queryKey: ['admin-tasks', clientId, 'content', task.id], queryFn: () => api.contentCalendar(task.id) });
  const [editing, setEditing] = useState<ContentPost | 'new' | null>(null);
  const [changesFor, setChangesFor] = useState<ContentPost | null>(null);
  const [note, setNote] = useState('');
  const reload = () => void q.refetch();
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: reload, onError: onErr('Something went wrong') });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox message={errorMessage(q.error)} onRetry={reload} />;
  const cal = q.data;
  const posts = [...cal.posts].sort((a, b) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9'));

  const publishNow = (p: ContentPost) =>
    Alert.alert('Publish now?', `"${p.title || 'This post'}" goes live on ${p.platforms.map((x) => PLATFORM_NAME[x] ?? x).join(' and ')} straight away.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Publish', onPress: () => act.mutate(() => api.contentPostAction(task.id, p.id, 'publish')) },
    ]);

  return (
    <>
      <Card style={{ padding: 14, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T w="s" size={14}>
            Auto-publish
          </T>
          <Muted size={12.5}>Approved, scheduled posts go out on time by themselves.</Muted>
        </View>
        <Toggle value={cal.autoPublish} disabled={!cal.canEdit || act.isPending} onChange={(on) => act.mutate(() => api.setContentAutoPublish(task.id, on))} />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {cal.platforms.map((p) => (
          <Pill key={p.key} kind={p.connected ? 'ok' : 'ns'} label={`${p.name}: ${p.connected ? 'connected' : 'not connected'}`} />
        ))}
      </View>
      {!cal.metaConfigured ? (
        <Muted size={12.5} style={{ marginTop: 8 }}>
          Meta publishing isn't set up on the server, so posts can be planned and approved but not published.
        </Muted>
      ) : null}
      {cal.canEdit ? <Btn title="New post" icon="add" style={{ marginTop: 14 }} onPress={() => setEditing('new')} /> : null}

      {posts.length === 0 ? (
        <EmptyCard icon="calendar-outline" title="No posts planned yet" style={{ marginTop: 14 }} />
      ) : (
        posts.map((p) => {
          const st = POST_STATUS[p.status] ?? POST_STATUS.DRAFT!;
          const failing = p.checks.filter((c) => !c.ok);
          return (
            <Card key={p.id} style={{ padding: 14, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {p.media?.url ? (
                  <Image source={{ uri: fileUrl(p.media.url) }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.soft }} />
                ) : (
                  <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={22} color={colors.faint} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Pill kind={st.kind} label={st.label} />
                  <T w="s" size={15} style={{ marginTop: 6 }} numberOfLines={2}>
                    {p.title || 'Untitled post'}
                  </T>
                  <Muted size={12.5}>
                    {p.scheduledAt ? fmtDateTime(p.scheduledAt, p.timeZone) : 'No date'} · {p.platforms.map((x) => PLATFORM_NAME[x] ?? x).join(', ') || 'No platform'}
                  </Muted>
                </View>
              </View>
              {p.caption ? (
                <T size={13.5} style={{ marginTop: 10, lineHeight: 19 }} numberOfLines={4}>
                  {p.caption}
                </T>
              ) : null}
              {p.lastError && p.status === 'FAILED' ? (
                <T size={12.5} color={colors.redFg} style={{ marginTop: 8 }}>
                  {p.lastError}
                </T>
              ) : null}
              {failing.length && p.status !== 'PUBLISHED' ? (
                <Muted size={12.5} style={{ marginTop: 6 }}>
                  Check: {failing.map((c) => c.title).join(' · ')}
                </Muted>
              ) : null}
              {Object.entries(p.published ?? {}).map(([pl, url]) =>
                url ? (
                  <Pressable key={pl} onPress={() => void Linking.openURL(url)} style={{ marginTop: 6 }}>
                    <T w="s" size={13} color={colors.green}>
                      View on {PLATFORM_NAME[pl] ?? pl}
                    </T>
                  </Pressable>
                ) : null
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {cal.canEdit && p.status !== 'PUBLISHED' && p.status !== 'PUBLISHING' ? <SmallBtn title="Edit" icon="create-outline" onPress={() => setEditing(p)} /> : null}
                {cal.canEdit && (p.status === 'DRAFT' || p.status === 'CHANGES_REQUESTED') ? (
                  <SmallBtn title="Send for approval" icon="send" tone="primary" onPress={() => act.mutate(() => api.contentPostAction(task.id, p.id, 'request-approval'))} />
                ) : null}
                {cal.canApprove && p.status === 'AWAITING_APPROVAL' ? (
                  <>
                    <SmallBtn title="Approve" icon="checkmark" tone="good" onPress={() => act.mutate(() => api.decideContentPost(task.id, p.id, true))} />
                    <SmallBtn
                      title="Request changes"
                      icon="return-up-back"
                      tone="danger"
                      onPress={() => {
                        setNote('');
                        setChangesFor(p);
                      }}
                    />
                  </>
                ) : null}
                {cal.canEdit && p.status === 'APPROVED' ? <SmallBtn title="Schedule" icon="time-outline" tone="primary" onPress={() => act.mutate(() => api.contentPostAction(task.id, p.id, 'schedule'))} /> : null}
                {cal.canEdit && p.status === 'SCHEDULED' ? <SmallBtn title="Unschedule" icon="pause-outline" onPress={() => act.mutate(() => api.contentPostAction(task.id, p.id, 'unschedule'))} /> : null}
                {cal.canEdit && (p.status === 'APPROVED' || p.status === 'SCHEDULED' || p.status === 'FAILED') ? (
                  <SmallBtn title={p.status === 'FAILED' ? 'Retry publish' : 'Publish now'} icon="paper-plane-outline" onPress={() => publishNow(p)} />
                ) : null}
                {cal.canEdit ? (
                  <SmallBtn
                    title="Delete"
                    icon="trash-outline"
                    tone="danger"
                    onPress={() => confirmDestroy('Delete post?', `Delete "${p.title || 'this post'}" from the calendar?`, () => act.mutate(() => api.deleteContentPost(task.id, p.id)))}
                  />
                ) : null}
              </View>
            </Card>
          );
        })
      )}

      <Sheet open={!!changesFor} onClose={() => setChangesFor(null)}>
        <T w="s" size={17}>
          Request changes
        </T>
        <Muted size={13} style={{ marginTop: 4, marginBottom: 10 }}>
          Tell the team what to change on "{changesFor?.title}".
        </Muted>
        <Input value={note} onChangeText={setNote} placeholder="What should change?" multiline autoFocus />
        <Btn
          title="Send"
          style={{ marginTop: 12 }}
          onPress={() => {
            const p = changesFor;
            setChangesFor(null);
            if (p) act.mutate(() => api.decideContentPost(task.id, p.id, false, note.trim() || undefined));
          }}
        />
      </Sheet>

      {editing ? <PostEditor clientId={clientId} taskId={task.id} cal={cal} post={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </>
  );
}

function PostEditor({
  clientId,
  taskId,
  cal,
  post,
  onClose,
  onSaved,
}: {
  clientId: string;
  taskId: string;
  cal: ContentCalendar;
  post: ContentPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useAdminApi(clientId);
  const tz0 = post?.timeZone || cal.timeZones[0] || 'Australia/Sydney';
  const at = post?.scheduledAt ? isoToZoned(post.scheduledAt, tz0) : null;
  const [f, setF] = useState<PostForm>({
    title: post?.title ?? '',
    caption: post?.caption ?? '',
    hashtags: post?.hashtags ?? '',
    firstComment: post?.firstComment ?? '',
    platforms: post?.platforms ?? ['fb', 'ig'],
    date: at?.date ?? '',
    time: at?.time ?? '09:00',
    timeZone: tz0,
    attachmentId: null,
  });
  const set = (p: Partial<PostForm>) => setF((x) => ({ ...x, ...p }));
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(f.time);
  const images = cal.attachments.filter((a) => (a.contentType ?? '').startsWith('image/') || (a.contentType ?? '').startsWith('video/'));

  const save = useMutation({
    mutationFn: async () => {
      const body: ContentPostInput = {
        title: f.title.trim(),
        caption: f.caption,
        hashtags: f.hashtags,
        firstComment: f.firstComment,
        platforms: f.platforms,
        scheduledAt: f.date && timeOk ? zonedToIso(f.date, f.time, f.timeZone) : null,
        timeZone: f.timeZone,
      };
      const id = post ? (await api.updateContentPost(taskId, post.id, body), post.id) : (await api.createContentPost(taskId, body)).id;
      if (f.attachmentId) {
        const att = cal.attachments.find((a) => a.id === f.attachmentId);
        const dims = att ? await new Promise<{ w: number; h: number } | null>((res) => Image.getSize(fileUrl(att.url), (w, h) => res({ w, h }), () => res(null))) : null;
        await api.updateContentPost(taskId, id, { attachmentId: f.attachmentId, mediaWidth: dims?.w ?? null, mediaHeight: dims?.h ?? null });
      }
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: onErr('Post not saved'),
  });

  return (
    <Sheet open onClose={onClose}>
      <T w="s" size={17}>
        {post ? 'Edit post' : 'New post'}
      </T>
      <Label>Title</Label>
      <Input value={f.title} onChangeText={(v) => set({ title: v })} placeholder="Internal name" maxLength={200} />
      <Label>Caption</Label>
      <Input value={f.caption} onChangeText={(v) => set({ caption: v })} placeholder="Post text" multiline />
      <Label>Hashtags</Label>
      <Input value={f.hashtags} onChangeText={(v) => set({ hashtags: v })} placeholder="#brand #launch" autoCapitalize="none" />
      <Label>First comment</Label>
      <Input value={f.firstComment} onChangeText={(v) => set({ firstComment: v })} placeholder="Optional" multiline />
      <Label>Design</Label>
      {images.length ? (
        <SelectRow
          value={f.attachmentId ?? ''}
          onChange={(v) => set({ attachmentId: v || null })}
          placeholder={post?.media ? `Keep current (${post.media.name ?? 'design'})` : 'Pick from the task attachments'}
          options={[{ value: '', label: post?.media ? 'Keep current design' : 'No design' }, ...images.map((a) => ({ value: a.id, label: a.fileName }))]}
        />
      ) : (
        <Muted size={12.5}>Add images or videos in the task's Files tab to use them as designs.</Muted>
      )}
      <Label>Platforms</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['fb', 'ig'].map((k) => {
          const on = f.platforms.includes(k);
          return (
            <SmallBtn
              key={k}
              title={PLATFORM_NAME[k]!}
              icon={on ? 'checkmark-circle' : 'ellipse-outline'}
              tone={on ? 'good' : 'default'}
              onPress={() => set({ platforms: on ? f.platforms.filter((x) => x !== k) : [...f.platforms, k] })}
            />
          );
        })}
      </View>
      <Label>Date</Label>
      <DateRow value={f.date} onChange={(v) => set({ date: v })} placeholder="No date yet" />
      <Label>Time</Label>
      <TimeRow value={f.time} onChange={(v) => set({ time: v })} />
      <Label>Time zone</Label>
      <SelectRow value={f.timeZone} onChange={(v) => v && set({ timeZone: v })} options={cal.timeZones.map((z) => ({ value: z, label: z }))} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn title="Save" style={{ flex: 1 }} loading={save.isPending} disabled={!!f.date && !timeOk} onPress={() => save.mutate()} />
      </View>
    </Sheet>
  );
}

// ─── Reports (read-only summary) ──────────────────────────

const REPORT_TITLE: Record<ReportKind, string> = { seo: 'SEO Dashboard', local: 'Local Listing', azure: 'Azure Performance' };

/** One line per top-level section of the report data. */
function describe(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? 'item' : 'items'}`;
  if (v && typeof v === 'object') {
    const n = Object.keys(v).length;
    return `${n} ${n === 1 ? 'entry' : 'entries'}`;
  }
  if (v === null || v === undefined || v === '') return '—';
  return String(v).slice(0, 80);
}
const humanKey = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function ReportPanel({ clientId, task, kind }: { clientId: string; task: AdminTask; kind: ReportKind }) {
  const api = useAdminApi(clientId);
  const q = useQuery({ queryKey: ['admin-tasks', clientId, 'report', task.id, kind], queryFn: () => api.report(task.id, kind) });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const keys = Object.keys(r.data ?? {});
  return (
    <>
      <Muted size={13} style={{ marginTop: 16 }}>
        {REPORT_TITLE[kind]} for {r.customerName || 'this customer'}. The monthly figures, findings and action plan are filled in on the web portal; here is what has been recorded.
      </Muted>
      <KV
        style={{ marginTop: 12 }}
        rows={[
          ['Last updated', r.updatedAt ? formatStamp(r.updatedAt) : 'Not filled in yet'],
          ['Updated by', r.updatedByName],
          ['Team', r.team.join(', ') || null],
        ]}
      />
      {keys.length ? (
        <KV style={{ marginTop: 12 }} rows={keys.map((k) => [humanKey(k), describe(r.data[k])] as [string, string])} />
      ) : (
        <EmptyCard icon="document-text-outline" title="Nothing recorded yet" style={{ marginTop: 12 }} />
      )}
    </>
  );
}

// ─── Social Media Dashboard (read-only summary) ───────────

interface SocialSummary {
  customerName?: string;
  connections?: { id: string; provider: string; name: string | null; status: string; lastError: string | null; lastSyncAt: string | null }[];
  connected?: string[];
  syncing?: boolean;
  lastMetricAt?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
  posts?: { id: string; pl: string; t: string; d: string; reach?: number | null; eng?: number | null; url?: string | null }[];
}

export function SocialPanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const api = useAdminApi(clientId);
  const q = useQuery({ queryKey: ['admin-tasks', clientId, 'social', task.id], queryFn: () => api.social(task.id) as Promise<SocialSummary> });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const posts = [...(s.posts ?? [])].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 10);
  return (
    <>
      <Muted size={13} style={{ marginTop: 16 }}>
        A summary of the Social Media Dashboard. Charts, budgets and the full report are on the web portal.
      </Muted>
      <KV
        style={{ marginTop: 12 }}
        rows={[
          ['Connected', (s.connected ?? []).join(', ') || 'None'],
          ['Latest figures', s.lastMetricAt ? formatStamp(s.lastMetricAt) : null],
          ['Syncing', s.syncing ? 'Yes' : null],
          ['Last edited', s.updatedAt ? `${formatStamp(s.updatedAt)}${s.updatedByName ? ` · ${s.updatedByName}` : ''}` : null],
        ]}
      />
      {(s.connections ?? []).map((c) => (
        <Card key={c.id} style={{ padding: 14, marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T w="s" size={14} style={{ flex: 1 }}>
              {c.name || c.provider}
            </T>
            <Pill kind={c.status === 'ACTIVE' || c.status === 'CONNECTED' ? 'ok' : 'warn'} label={c.status} />
          </View>
          <Muted size={12}>
            {c.provider}
            {c.lastSyncAt ? ` · synced ${formatStamp(c.lastSyncAt)}` : ''}
          </Muted>
          {c.lastError ? (
            <T size={12.5} color={colors.redFg} style={{ marginTop: 4 }}>
              {c.lastError}
            </T>
          ) : null}
        </Card>
      ))}
      <Label style={{ marginTop: 18 }}>Recent posts</Label>
      {posts.length === 0 ? (
        <Muted size={13}>No posts synced yet.</Muted>
      ) : (
        <Card>
          {posts.map((p, i) => (
            <Pressable key={p.id} disabled={!p.url} onPress={() => p.url && void Linking.openURL(p.url)} style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <T w="s" size={13.5} numberOfLines={2}>
                {p.t || 'Post'}
              </T>
              <Muted size={12}>
                {p.pl} · {p.d}
                {p.reach != null ? ` · reach ${p.reach}` : ''}
                {p.eng != null ? ` · engagements ${p.eng}` : ''}
              </Muted>
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}
