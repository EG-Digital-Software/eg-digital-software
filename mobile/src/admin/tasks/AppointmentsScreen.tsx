import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import type { Appointment } from '../../api/admin/tasks';
import { initials } from '../../lib/format';
import { Avatar, Btn, Card, EmptyCard, ErrorBox, Loading, Muted, Screen, Sheet, T } from '../../ui';
import { colors } from '../../theme';
import { DateRow, Input, Label, SmallBtn, TimeRow, confirmDestroy, todayInput, useAdminApi } from './common';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fmtRange = (a: Appointment) => {
  const s = new Date(a.startAt);
  const e = new Date(a.endAt);
  const day = s.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(s)} – ${t(e)}`;
};

/** Route AdminTaskAppointments { clientId, companyName? } — the board's Schedule appointments. */
export default function AdminTaskAppointmentsScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  const companyName: string | undefined = route.params?.companyName;
  const api = useAdminApi(clientId);
  const key = ['admin-tasks', clientId, 'appointments'];
  const q = useQuery({ queryKey: key, queryFn: api.appointments });
  const [booking, setBooking] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const cancel = useMutation({
    mutationFn: (id: string) => api.deleteAppointment(id),
    onSuccess: () => void q.refetch(),
    onError: (e) => Alert.alert('Not cancelled', errorMessage(e)),
  });

  const now = Date.now();
  const all = [...(q.data ?? [])].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const upcoming = all.filter((a) => new Date(a.endAt).getTime() >= now);
  const past = all.filter((a) => new Date(a.endAt).getTime() < now).reverse();

  const row = (a: Appointment) => (
    <Card key={a.id} style={{ padding: 14, marginTop: 10 }}>
      <T w="s" size={15}>
        {a.title}
      </T>
      <Muted size={13} style={{ marginTop: 2 }}>
        {fmtRange(a)}
      </Muted>
      {a.location ? (
        <Muted size={13}>
          <Ionicons name="location-outline" size={13} /> {a.location}
        </Muted>
      ) : null}
      {a.notes ? (
        <T size={13.5} style={{ marginTop: 6 }}>
          {a.notes}
        </T>
      ) : null}
      <Muted size={12} style={{ marginTop: 6 }}>
        {a.attendees.map((x) => x.name || x.email).join(', ')} · booked by {a.createdByName}
      </Muted>
      <SmallBtn
        title="Cancel appointment"
        icon="close"
        tone="danger"
        style={{ alignSelf: 'flex-start', marginTop: 10 }}
        onPress={() => confirmDestroy('Cancel appointment?', `Cancel "${a.title}"? Attendees are emailed a cancellation.`, () => cancel.mutate(a.id), 'Cancel it')}
      />
    </Card>
  );

  return (
    <Screen title={companyName ? `Appointments · ${companyName}` : 'Appointments'} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Muted size={13}>Booking emails a calendar invite to every attendee.</Muted>
      <Btn title="Book appointment" icon="add" style={{ marginTop: 12 }} onPress={() => setBooking(true)} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Label style={{ marginTop: 18 }}>Upcoming</Label>
          {upcoming.length ? upcoming.map(row) : <EmptyCard icon="calendar-outline" title="No upcoming appointments" />}
          {past.length ? (
            <Pressable onPress={() => setShowPast((s) => !s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 }}>
              <Ionicons name={showPast ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
              <T w="s" size={14}>
                Past ({past.length})
              </T>
            </Pressable>
          ) : null}
          {showPast ? past.map(row) : null}
        </>
      )}
      {booking ? <BookSheet clientId={clientId} onClose={() => setBooking(false)} onBooked={() => void q.refetch()} /> : null}
    </Screen>
  );
}

function BookSheet({ clientId, onClose, onBooked }: { clientId: string; onClose: () => void; onBooked: () => void }) {
  const api = useAdminApi(clientId);
  const users = useQuery({ queryKey: ['admin-tasks', clientId, 'users'], queryFn: api.assignableUsers });
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayInput());
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('10:30');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');

  const people = (users.data ?? []).filter((u) => u.email);
  const extraEmails = extra
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const badEmail = extraEmails.find((e) => !EMAIL.test(e));
  const attendees = [
    ...people.filter((u) => picked.includes(u.userId)).map((u) => ({ name: u.name, email: u.email! })),
    ...extraEmails.filter((e) => EMAIL.test(e)).map((email) => ({ email })),
  ];
  const timesOk = TIME.test(start) && TIME.test(end) && end > start;
  const valid = !!title.trim() && !!date && timesOk && attendees.length > 0 && !badEmail;

  const book = useMutation({
    mutationFn: () =>
      api.createAppointment({
        title: title.trim(),
        startAt: new Date(`${date}T${start}:00`).toISOString(),
        endAt: new Date(`${date}T${end}:00`).toISOString(),
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        attendees,
      }),
    onSuccess: () => {
      onBooked();
      onClose();
      Alert.alert('Appointment booked', 'Invites have been sent.');
    },
    onError: (e) => Alert.alert('Not booked', errorMessage(e)),
  });

  return (
    <Sheet open onClose={onClose}>
      <T w="s" size={17}>
        Book appointment
      </T>
      <Label>Title</Label>
      <Input value={title} onChangeText={setTitle} placeholder="e.g. Monthly review" maxLength={200} />
      <Label>Date</Label>
      <DateRow value={date} onChange={setDate} clearable={false} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Start</Label>
          <TimeRow value={start} onChange={setStart} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>End</Label>
          <TimeRow value={end} onChange={setEnd} />
        </View>
      </View>
      {!timesOk ? (
        <Muted size={12} style={{ marginTop: 4, color: colors.redFg }}>
          The end time must be after the start.
        </Muted>
      ) : null}
      <Label>Location</Label>
      <Input value={location} onChangeText={setLocation} placeholder="Address or meeting link" maxLength={300} />
      <Label>Notes</Label>
      <Input value={notes} onChangeText={setNotes} placeholder="Optional" multiline maxLength={2000} />
      <Label>Attendees</Label>
      {users.isLoading ? <Loading /> : null}
      {people.map((u) => {
        const on = picked.includes(u.userId);
        return (
          <Pressable
            key={u.userId}
            onPress={() => setPicked((p) => (on ? p.filter((x) => x !== u.userId) : [...p, u.userId]))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 10, borderRadius: 10, backgroundColor: on ? colors.greenTint : 'transparent' }}
          >
            <Avatar name={u.name} label={initials(u.name)} size={28} />
            <View style={{ flex: 1 }}>
              <T w="s" size={14} numberOfLines={1}>
                {u.name}
              </T>
              <Muted size={12} numberOfLines={1}>
                {u.email}
              </Muted>
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.green : colors.faint} />
          </Pressable>
        );
      })}
      <Label>Other emails</Label>
      <Input value={extra} onChangeText={setExtra} placeholder="client@example.com, another@example.com" autoCapitalize="none" keyboardType="email-address" />
      {badEmail ? (
        <Muted size={12} style={{ marginTop: 4, color: colors.redFg }}>
          "{badEmail}" isn't a valid email.
        </Muted>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn title="Book & invite" style={{ flex: 1 }} loading={book.isPending} disabled={!valid} onPress={() => book.mutate()} />
      </View>
    </Sheet>
  );
}
