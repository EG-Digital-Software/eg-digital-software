import { env } from '../../config/env.js';
import type { Role } from '@prisma/client';
import { deliverSecurityEmail, sendEmail, sendResetEmail, type EmailMessage } from './index.js';

const ROLE_SLUG: Record<string, string> = {
  SUPER_ADMIN: 'admin',
  CLIENT: 'client',
  SUPPLIER: 'supplier',
  EMPLOYEE: 'employee',
};
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Admin',
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
        EG Eloma · Australia · This is an automated message.
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
    subject: 'Your EG Eloma account has been approved',
    text: `Hi ${user.firstName}, your ${label} account has been approved. Sign in at ${loginUrl}`,
    html: shell(
      'Your account is approved 🎉',
      `Hi ${user.firstName},<br/><br/>Great news — your <strong>${label}</strong> account with EG Eloma has been approved. You can now sign in and access your portal.`,
      { label: `Sign in to your ${label} portal`, url: loginUrl }
    ),
  });
}

/**
 * Password reset link. The token is single-use and expires in an hour, so the
 * mail is sent immediately (fire-and-forget) — `forgotPassword` must not reveal
 * whether the address exists, so a delivery failure is logged, never surfaced.
 */
export function sendPasswordReset(
  user: { email: string; firstName: string; role: Role },
  rawToken: string,
  expiresInMinutes: number
) {
  const slug = ROLE_SLUG[user.role] ?? 'client';
  const resetUrl = `${env.APP_URL.replace(/\/$/, '')}/${slug}/reset-password?token=${encodeURIComponent(rawToken)}`;
  // Sent from the Microsoft 365 no-reply mailbox, not the main provider.
  sendResetEmail({
    to: user.email,
    subject: 'Reset your EG Eloma password',
    text: `Hi ${user.firstName}, reset your EG Eloma password here: ${resetUrl} — the link expires in ${expiresInMinutes} minutes and can only be used once. If you did not request this, ignore this email; your password stays unchanged.`,
    html: shell(
      'Reset your password',
      `Hi ${user.firstName},<br/><br/>We received a request to reset the password for your EG Eloma account. Use the button below to choose a new one.<br/><br/>This link expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.<br/><br/><span style="color:#94a3b8">If you did not request this, you can safely ignore this email — your password will stay unchanged.</span>`,
      { label: 'Choose a new password', url: resetUrl }
    ),
  });
}

/** The one-time sign-in code, sent after a correct password. Awaited: no code, no sign-in. */
export function sendLoginCode(user: { email: string; firstName: string }, code: string, expiresInMinutes: number) {
  return deliverSecurityEmail({
    to: user.email,
    subject: `${code} is your EG Eloma sign-in code`,
    text: `Hi ${user.firstName}, your EG Eloma sign-in code is ${code}. It expires in ${expiresInMinutes} minutes. If you did not just try to sign in, change your password straight away.`,
    html: shell(
      'Your sign-in code',
      `Hi ${user.firstName},<br/><br/>Enter this code to finish signing in to EG Eloma:<br/><br/><div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0B223B;background:#f4f7fb;border-radius:10px;padding:14px 0;text-align:center">${code}</div><br/>It expires in <strong>${expiresInMinutes} minutes</strong> and works once.<br/><br/><span style="color:#94a3b8">If you did not just try to sign in, someone may know your password — change it straight away. Never share this code.</span>`
    ),
  });
}

export function sendAccountRejected(user: { email: string; firstName: string; role: Role }) {
  const label = ROLE_LABEL[user.role] ?? 'account';
  sendEmail({
    to: user.email,
    subject: 'Update on your EG Eloma account request',
    text: `Hi ${user.firstName}, unfortunately your ${label} account request was not approved. Please contact EG Eloma for details.`,
    html: shell(
      'About your account request',
      `Hi ${user.firstName},<br/><br/>Thank you for your interest. Unfortunately your <strong>${label}</strong> account request was not approved at this time. Please contact EG Eloma if you believe this is a mistake.`
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
    subject: `Invoice ${params.invoiceNumber} from EG Eloma — ${params.currency} ${params.amount}`,
    text:
      `${greeting}\n\n` +
      `Please find your invoice ${params.invoiceNumber}` +
      (params.reference ? ` (reference ${params.reference})` : '') +
      ` for ${params.currency} ${params.amount}, due ${params.dueDate}.\n\n` +
      `View and pay online: ${params.payUrl}\n\n` +
      `If you have already paid, please ignore this message.\n\nEG Eloma · Australia`,
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
