import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { sendEmail } from './email/index.js';

/**
 * Meetings/appointments booked from the task Schedule calendar. On booking, an
 * iCalendar (ICS) invite is emailed to each attendee — Gmail and Outlook add it
 * to the recipient's calendar automatically, so no per-user OAuth is needed.
 */

type ApptWithAttendees = {
  id: string;
  title: string;
  location: string | null;
  notes: string | null;
  startAt: Date;
  endAt: Date;
  icalUid: string;
  createdById: string;
  createdByName: string;
  attendees: { name: string; email: string }[];
};

/** iCalendar UTC timestamp, e.g. 20260910T073000Z. */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escape a text value for an ICS property. */
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function buildIcs(appt: ApptWithAttendees, method: 'REQUEST' | 'CANCEL'): string {
  const organiser = env.EMAIL_FROM;
  const organiserName = env.EMAIL_FROM_NAME || 'EG Digital';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EG Digital//Appointments//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${appt.icalUid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(appt.startAt)}`,
    `DTEND:${icsDate(appt.endAt)}`,
    `SUMMARY:${icsEscape(appt.title)}`,
    appt.notes ? `DESCRIPTION:${icsEscape(appt.notes)}` : '',
    appt.location ? `LOCATION:${icsEscape(appt.location)}` : '',
    `ORGANIZER;CN=${icsEscape(organiserName)}:mailto:${organiser}`,
    ...appt.attendees.map(
      (a) =>
        `ATTENDEE;CN=${icsEscape(a.name || a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
    ),
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${method === 'CANCEL' ? 1 : 0}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

function fmtRange(startAt: Date, endAt: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  };
  return `${startAt.toLocaleString(env.DEFAULT_LOCALE, opts)} – ${endAt.toLocaleString(env.DEFAULT_LOCALE, { hour: 'numeric', minute: '2-digit' })}`;
}

/** Email each attendee an invite carrying the ICS event. */
function sendInvites(appt: ApptWithAttendees, method: 'REQUEST' | 'CANCEL'): void {
  const ics = buildIcs(appt, method);
  const when = fmtRange(appt.startAt, appt.endAt);
  const cancelled = method === 'CANCEL';
  for (const a of appt.attendees) {
    sendEmail({
      to: a.email,
      subject: `${cancelled ? 'Cancelled' : 'Invitation'}: ${appt.title}`,
      html: `
        <p>Hi ${a.name || 'there'},</p>
        <p>${cancelled ? 'This appointment has been cancelled.' : `You have been invited to a meeting by ${appt.createdByName}.`}</p>
        <p><strong>${appt.title}</strong><br/>${when}${appt.location ? `<br/>${appt.location}` : ''}</p>
        ${appt.notes ? `<p>${appt.notes}</p>` : ''}
        <p>This invite has been added to your calendar${cancelled ? ' as cancelled' : ''}.</p>
      `,
      text: `${appt.title}\n${when}${appt.location ? `\n${appt.location}` : ''}${appt.notes ? `\n\n${appt.notes}` : ''}`,
      icalEvent: { method, content: ics, filename: 'invite.ics' },
    });
  }
}

export async function createAppointment(input: {
  customerId: string | null;
  creator: { id: string; type: Role; name: string };
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  notes?: string | null;
  attendees: { name: string; email: string }[];
}) {
  const attendees = input.attendees.filter((a) => a.email?.trim());
  if (!attendees.length) throw ApiError.badRequest('Select at least one attendee');
  if (!(input.startAt < input.endAt)) throw ApiError.badRequest('End time must be after the start time');

  const appt = await prisma.appointment.create({
    data: {
      customerId: input.customerId,
      title: input.title.trim(),
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      startAt: input.startAt,
      endAt: input.endAt,
      createdById: input.creator.id,
      createdByType: input.creator.type,
      createdByName: input.creator.name,
      icalUid: `appt-${randomUUID()}@egdigital`,
      attendees: { create: attendees.map((a) => ({ name: a.name?.trim() || a.email, email: a.email.trim() })) },
    },
    include: { attendees: true },
  });

  sendInvites(appt, 'REQUEST');
  return appt;
}

export function listForCustomer(customerId: string) {
  return prisma.appointment.findMany({
    where: { customerId },
    include: { attendees: true },
    orderBy: { startAt: 'asc' },
  });
}

export function listForEmployee(userId: string, email?: string) {
  return prisma.appointment.findMany({
    where: {
      OR: [{ createdById: userId }, ...(email ? [{ attendees: { some: { email } } }] : [])],
    },
    include: { attendees: true },
    orderBy: { startAt: 'asc' },
  });
}

/** Cancel an appointment — the creator or an admin. Sends a CANCEL to attendees. */
export async function deleteAppointment(appointmentId: string, actor: { id: string; type: Role }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { attendees: true } });
  if (!appt) throw ApiError.notFound('Appointment not found');
  const isOwner = appt.createdById === actor.id;
  if (!isOwner && actor.type !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only the organiser or an admin can cancel this appointment');
  }
  sendInvites(appt, 'CANCEL');
  await prisma.appointment.delete({ where: { id: appointmentId } });
  return { id: appointmentId };
}
