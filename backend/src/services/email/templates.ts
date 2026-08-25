import { env } from '../../config/env.js';
import type { Role } from '@prisma/client';
import { sendEmail, type EmailMessage } from './index.js';

const ROLE_SLUG: Record<string, string> = {
  CLIENT: 'client',
  SUPPLIER: 'supplier',
  EMPLOYEE: 'employee',
};
const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  EMPLOYEE: 'Employee',
};

function shell(title: string, body: string, cta?: { label: string; url: string }): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#f4f7fb;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6ebf1;border-radius:14px;overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #eef2f6">
        <span style="font-size:20px;font-weight:700;color:#0B223B">eg <span style="color:#34B98C">digital</span></span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:20px;color:#0B223B">${title}</h1>
        <div style="font-size:14px;line-height:1.6;color:#475569">${body}</div>
        ${
          cta
            ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600">${cta.label}</a>`
            : ''
        }
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eef2f6;font-size:12px;color:#94a3b8">
        EG Digital · Australia · This is an automated message.
      </div>
    </div>
  </div>`;
}

export function sendAccountApproved(user: { email: string; firstName: string; role: Role }) {
  const slug = ROLE_SLUG[user.role] ?? 'client';
  const label = ROLE_LABEL[user.role] ?? 'account';
  const loginUrl = `${env.APP_URL.replace(/\/$/, '')}/login/${slug}`;
  sendEmail({
    to: user.email,
    subject: 'Your EG Digital account has been approved',
    text: `Hi ${user.firstName}, your ${label} account has been approved. Sign in at ${loginUrl}`,
    html: shell(
      'Your account is approved 🎉',
      `Hi ${user.firstName},<br/><br/>Great news — your <strong>${label}</strong> account with EG Digital has been approved. You can now sign in and access your portal.`,
      { label: `Sign in to your ${label} portal`, url: loginUrl }
    ),
  });
}

export function sendLicenceReminderClient(
  user: { email: string; firstName: string },
  lines: Array<{ product: string; message: string; expired: boolean }>
) {
  const loginUrl = `${env.APP_URL.replace(/\/$/, '')}/login/client`;
  const rows = lines
    .map(
      (l) =>
        `<li style="margin:6px 0"><strong>${l.product}</strong> — <span style="color:${l.expired ? '#dc2626' : '#b45309'}">${l.message}</span></li>`
    )
    .join('');
  sendEmail({
    to: user.email,
    subject: 'Licence expiry reminder — action needed',
    text: `Hi ${user.firstName}, some of your licences need attention: ${lines
      .map((l) => `${l.product} (${l.message})`)
      .join('; ')}. Sign in at ${loginUrl}`,
    html: shell(
      'Your licences need attention',
      `Hi ${user.firstName},<br/><br/>The following licence${lines.length === 1 ? '' : 's'} on your account ${lines.length === 1 ? 'is' : 'are'} expiring soon or expired:<ul style="padding-left:18px;margin:12px 0">${rows}</ul>Please renew to avoid interruption.`,
      { label: 'View my licences', url: `${env.APP_URL.replace(/\/$/, '')}/client/licences` }
    ),
  });
}

export function sendLicenceDigestAdmin(
  user: { email: string; firstName: string },
  summary: { critical: number; expiringSoon: number; expired: number; total: number }
) {
  sendEmail({
    to: user.email,
    subject: `Licence reminders — ${summary.total} need attention`,
    text: `${summary.total} licences need attention: ${summary.critical} critical, ${summary.expiringSoon} expiring soon, ${summary.expired} expired.`,
    html: shell(
      'Daily licence report',
      `Hi ${user.firstName},<br/><br/><strong>${summary.total}</strong> licence${summary.total === 1 ? '' : 's'} need attention today:<ul style="padding-left:18px;margin:12px 0">
        <li style="margin:6px 0;color:#dc2626">${summary.critical} critical (0–7 days)</li>
        <li style="margin:6px 0;color:#b45309">${summary.expiringSoon} expiring soon (8–30 days)</li>
        <li style="margin:6px 0;color:#64748b">${summary.expired} expired</li>
      </ul>`,
      { label: 'Open dashboard', url: `${env.APP_URL.replace(/\/$/, '')}/admin/dashboard` }
    ),
  });
}

export function sendAccountRejected(user: { email: string; firstName: string; role: Role }) {
  const label = ROLE_LABEL[user.role] ?? 'account';
  sendEmail({
    to: user.email,
    subject: 'Update on your EG Digital account request',
    text: `Hi ${user.firstName}, unfortunately your ${label} account request was not approved. Please contact EG Digital for details.`,
    html: shell(
      'About your account request',
      `Hi ${user.firstName},<br/><br/>Thank you for your interest. Unfortunately your <strong>${label}</strong> account request was not approved at this time. Please contact EG Digital if you believe this is a mistake.`
    ),
  });
}

export function sendInvoiceOverdueClient(
  user: { email: string; firstName: string },
  lines: Array<{ invoiceNumber: string; balance: string; days: number }>
) {
  const loginUrl = `${env.APP_URL.replace(/\/$/, '')}/login/client`;
  const rows = lines
    .map(
      (l) =>
        `<tr>
           <td style="padding:6px 0;color:#0B223B;font-weight:600">${l.invoiceNumber}</td>
           <td style="padding:6px 0;color:#dc2626;text-align:right">${env.DEFAULT_CURRENCY} ${l.balance}</td>
           <td style="padding:6px 0;color:#64748b;text-align:right">${l.days} day${l.days === 1 ? '' : 's'} overdue</td>
         </tr>`
    )
    .join('');
  const plural = lines.length === 1 ? 'invoice is' : 'invoices are';
  sendEmail({
    to: user.email,
    subject: `Payment overdue — ${lines.length} ${lines.length === 1 ? 'invoice' : 'invoices'}`,
    text: `Hi ${user.firstName}, ${lines.length} ${plural} past due: ${lines
      .map((l) => `${l.invoiceNumber} (${env.DEFAULT_CURRENCY} ${l.balance}, ${l.days} days overdue)`)
      .join('; ')}. View and pay at ${loginUrl}`,
    html: shell(
      'Payment overdue',
      `Hi ${user.firstName},<br/><br/>${lines.length} ${plural} past their due date:<br/><br/>
       <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
       <br/>If you have already paid, please ignore this message.`,
      { label: 'View and pay online', url: loginUrl }
    ),
  });
}

/**
 * Builds (does not send) the "here is your invoice" email a client receives when
 * an admin clicks Send. Returns the message so the caller can await delivery and
 * report success/failure. Includes a plain-text part and a single clear CTA to
 * view and pay online — both help it land in the inbox.
 */
export function buildInvoiceEmail(params: {
  to: string;
  cc?: string;
  companyName: string;
  contactName?: string;
  invoiceNumber: string;
  reference?: string | null;
  amount: string;
  currency: string;
  dueDate: string;
  payUrl: string;
}): EmailMessage {
  const greeting = params.contactName ? `Hi ${params.contactName},` : `Hi ${params.companyName},`;
  const refLine = params.reference
    ? `<tr><td style="padding:4px 0;color:#64748b">Reference</td><td style="padding:4px 0;text-align:right;color:#0B223B;font-weight:600">${params.reference}</td></tr>`
    : '';

  return {
    to: params.to,
    cc: params.cc,
    subject: `Invoice ${params.invoiceNumber} from EG Digital — ${params.currency} ${params.amount}`,
    text:
      `${greeting}\n\n` +
      `Please find your invoice ${params.invoiceNumber}` +
      (params.reference ? ` (reference ${params.reference})` : '') +
      ` for ${params.currency} ${params.amount}, due ${params.dueDate}.\n\n` +
      `View and pay online: ${params.payUrl}\n\n` +
      `If you have already paid, please ignore this message.\n\nEG Digital · Australia`,
    html: shell(
      `Invoice ${params.invoiceNumber}`,
      `${greeting}<br/><br/>Please find your invoice below. You can view the full invoice and pay securely online using the button.
       <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
         <tr><td style="padding:4px 0;color:#64748b">Invoice</td><td style="padding:4px 0;text-align:right;color:#0B223B;font-weight:600">${params.invoiceNumber}</td></tr>
         ${refLine}
         <tr><td style="padding:4px 0;color:#64748b">Amount due</td><td style="padding:4px 0;text-align:right;color:#0B223B;font-weight:700">${params.currency} ${params.amount}</td></tr>
         <tr><td style="padding:4px 0;color:#64748b">Due date</td><td style="padding:4px 0;text-align:right;color:#0B223B;font-weight:600">${params.dueDate}</td></tr>
       </table>
       <br/>If you have already paid, please ignore this message.`,
      { label: 'View & pay invoice', url: params.payUrl }
    ),
  };
}

export function sendInvoiceOverdueDigestAdmin(
  admin: { email: string; firstName: string },
  stats: { count: number; outstanding: string; newlyOverdue: number }
) {
  const url = `${env.APP_URL.replace(/\/$/, '')}/admin/billing`;
  sendEmail({
    to: admin.email,
    subject: `Overdue invoices — ${stats.count} outstanding`,
    text: `${stats.count} invoices overdue (${stats.newlyOverdue} newly overdue today), ${env.DEFAULT_CURRENCY} ${stats.outstanding} outstanding.`,
    html: shell(
      'Overdue invoices',
      `Hi ${admin.firstName},<br/><br/>
       <strong>${stats.count}</strong> invoice${stats.count === 1 ? '' : 's'} past due —
       <strong>${env.DEFAULT_CURRENCY} ${stats.outstanding}</strong> outstanding.<br/>
       ${stats.newlyOverdue} became overdue today.`,
      { label: 'Open Billing', url }
    ),
  });
}
