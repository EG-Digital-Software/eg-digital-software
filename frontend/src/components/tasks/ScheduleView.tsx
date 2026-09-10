import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Users, Trash2, CalendarPlus } from 'lucide-react';
import type { Appointment, AssignableUser, Task, TaskBucket } from '@/types';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PRIORITY_META } from '@/lib/tasks';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

interface BookInput {
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  notes?: string;
  attendees: { name?: string; email: string }[];
}

export function ScheduleView({
  buckets,
  onOpenTask,
  appointments = [],
  users = [],
  onBook,
  onCancel,
  booking,
}: {
  buckets: TaskBucket[];
  onOpenTask: (task: Task) => void;
  appointments?: Appointment[];
  users?: AssignableUser[];
  onBook?: (input: BookInput) => void;
  onCancel?: (id: string) => void;
  booking?: boolean;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [bookDate, setBookDate] = useState<Date | null>(null);
  const [detail, setDetail] = useState<Appointment | null>(null);

  const tasks = useMemo(() => buckets.flatMap((b) => b.tasks), [buckets]);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = dayKey(new Date(t.dueDate));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const apptByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = dayKey(new Date(a.startAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appointments]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const unscheduled = tasks.filter((t) => !t.dueDate);
  const canBook = !!onBook;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{MONTHS[month]} {year}</h3>
        <div className="flex items-center gap-1">
          {canBook && (
            <Button size="sm" onClick={() => setBookDate(new Date())} className="mr-1">
              <CalendarPlus className="h-4 w-4" /> Book appointment
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-secondary/40 text-center text-xs font-semibold text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const key = date ? dayKey(date) : `empty-${i}`;
            const dayTasks = date ? byDay.get(dayKey(date)) ?? [] : [];
            const dayAppts = date ? apptByDay.get(dayKey(date)) ?? [] : [];
            const isToday = date && dayKey(date) === todayKey;
            return (
              <div
                key={key}
                onClick={() => date && canBook && setBookDate(date)}
                className={cn(
                  'group min-h-[6.5rem] border-b border-r border-border p-1.5 last:border-r-0',
                  !date && 'bg-secondary/20',
                  date && canBook && 'cursor-pointer hover:bg-primary/5',
                  (i + 1) % 7 === 0 && 'border-r-0'
                )}
              >
                {date && (
                  <>
                    <div className={cn('mb-1 flex items-center justify-between text-xs', isToday ? 'font-bold text-primary' : 'text-muted-foreground')}>
                      {canBook && (
                        <Plus className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                      )}
                      <span className="ml-auto">
                        {isToday ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">{date.getDate()}</span>
                        ) : (
                          date.getDate()
                        )}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayAppts.slice(0, 2).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDetail(a); }}
                          className="flex w-full items-center gap-1 rounded bg-primary/10 px-1.5 py-1 text-left text-[11px] text-primary shadow-sm hover:ring-1 hover:ring-primary/40"
                        >
                          <Clock className="h-3 w-3 shrink-0" />
                          <span className="truncate font-medium">{timeLabel(a.startAt)} {a.title}</span>
                        </button>
                      ))}
                      {dayTasks.slice(0, 2).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenTask(t); }}
                          className="flex w-full items-center gap-1 rounded bg-card px-1.5 py-1 text-left text-[11px] shadow-sm hover:ring-1 hover:ring-primary/40"
                        >
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_META[t.priority].bar)} />
                          <span className={cn('truncate', t.progress === 'COMPLETED' && 'text-muted-foreground line-through')}>{t.title}</span>
                        </button>
                      ))}
                      {dayTasks.length + dayAppts.length > 4 && (
                        <div className="px-1 text-[11px] text-muted-foreground">+{dayTasks.length + dayAppts.length - 4} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">No due date ({unscheduled.length})</h4>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTask(t)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm shadow-sm hover:border-primary/40"
              >
                <span className={cn('h-2 w-2 rounded-full', PRIORITY_META[t.priority].bar)} />
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {bookDate && onBook && (
        <BookDialog
          date={bookDate}
          users={users}
          booking={!!booking}
          onClose={() => setBookDate(null)}
          onBook={(input) => { onBook(input); setBookDate(null); }}
        />
      )}

      {detail && (
        <Dialog open onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> {formatDate(detail.startAt, 'dd MMM yyyy, h:mm a')} – {timeLabel(detail.endAt)}</p>
              {detail.location && <p>{detail.location}</p>}
              {detail.notes && <p className="whitespace-pre-wrap text-muted-foreground">{detail.notes}</p>}
              <div>
                <p className="mb-1 flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-muted-foreground" /> Attendees</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {detail.attendees.map((a) => (
                    <li key={a.id}>{a.name} — {a.email}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">Booked by {detail.createdByName}</p>
            </div>
            <DialogFooter>
              {onCancel && (
                <Button variant="outline" onClick={() => { onCancel(detail.id); setDetail(null); }}>
                  <Trash2 className="h-4 w-4" /> Cancel appointment
                </Button>
              )}
              <Button onClick={() => setDetail(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function BookDialog({
  date,
  users,
  booking,
  onClose,
  onBook,
}: {
  date: Date;
  users: AssignableUser[];
  booking: boolean;
  onClose: () => void;
  onBook: (input: BookInput) => void;
}) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('09:30');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Only assignees with an email can receive a calendar invite. The platform
  // super-admin mailbox is excluded — it is not a meeting attendee.
  const invitable = users.filter(
    (u) => !!u.email && u.email.toLowerCase() !== 'admin@egdigital.com.au'
  );

  const toggle = (email: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email); else n.add(email);
      return n;
    });

  const iso = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0).toISOString();
  };

  const submit = () => {
    if (!title.trim() || picked.size === 0 || booking) return;
    const attendees = invitable
      .filter((u) => picked.has(u.email!))
      .map((u) => ({ name: u.name, email: u.email! }));
    onBook({
      title: title.trim(),
      startAt: iso(start),
      endAt: iso(end),
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      attendees,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book appointment — {formatDate(date.toISOString(), 'dd MMM yyyy')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <Input value={title} placeholder="Meeting title" onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start time</label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End time</label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Who to meet with (task assignees)</label>
            {invitable.length === 0 ? (
              <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">No assignees with an email to invite.</p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
                {invitable.map((u) => (
                  <label key={u.userId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/50">
                    <input type="checkbox" checked={picked.has(u.email!)} onChange={() => toggle(u.email!)} />
                    <span className="font-medium">{u.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{u.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Location (optional)</label>
            <Input value={location} placeholder="Google Meet link, office, …" onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea value={notes} className="min-h-[60px]" onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || picked.size === 0 || booking} onClick={submit}>
            {booking ? 'Booking…' : 'Book appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
