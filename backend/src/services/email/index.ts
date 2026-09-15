import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Provider-agnostic email abstraction. Development logs to the console; set
 * EMAIL_PROVIDER=smtp with the SMTP_* credentials to send for real. Credentials
 * stay in env — no secrets in code.
 */
export interface EmailMessage {
  /** One address, or several joined with commas. */
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Carbon-copy recipients (e.g. the customer's linked client-account email). */
  cc?: string;
  /** Overrides EMAIL_REPLY_TO for this message. */
  replyTo?: string;
  /** A calendar invite (iCalendar) — Gmail/Outlook add it to the recipient's calendar. */
  icalEvent?: { method: string; filename?: string; content: string };
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

/** Common From header — a display name plus the sending address. */
function fromHeader(): string {
  return env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM;
}

class ConsoleProvider implements EmailProvider {
  readonly name = 'console';
  async send(msg: EmailMessage): Promise<void> {
    logger.info(
      { to: msg.to, cc: msg.cc, subject: msg.subject, from: fromHeader() },
      `📧 [email:console] ${msg.text ?? msg.subject}`
    );
  }
}

/**
 * Real SMTP send via the admin mailbox. Authenticated sends from a domain with
 * SPF/DKIM/DMARC configured land in the inbox rather than spam/junk. A plain
 * text part is always included alongside the HTML — text-only-less messages are
 * a classic spam signal.
 */
class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  private transport: Transporter;

  constructor() {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true for 465, false for 587 (STARTTLS)
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: fromHeader(),
      to: msg.to,
      cc: msg.cc,
      replyTo: msg.replyTo ?? env.EMAIL_REPLY_TO ?? env.EMAIL_FROM,
      subject: msg.subject,
      html: msg.html,
      // Fall back to a stripped-down text part so every message is multipart.
      text: msg.text ?? msg.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      // A calendar invite the recipient's mail client adds to their calendar.
      icalEvent: msg.icalEvent
        ? { method: msg.icalEvent.method, filename: msg.icalEvent.filename ?? 'invite.ics', content: msg.icalEvent.content }
        : undefined,
      // Bounce/return-path is EMAIL_FROM, not SMTP_USER: DMARC aligns the
      // return-path domain against the From: domain, and with a relay (Brevo,
      // SES, Mailgun) the SMTP login is the provider's own address — using it
      // here breaks alignment and lands the mail in spam. With a mailbox relay
      // (M365/Google) the two are the same address anyway.
      // Naming an envelope replaces the recipient list, so `cc` must be
      // repeated here or the CC'd address is never actually delivered to.
      envelope: { from: env.EMAIL_FROM, to: [msg.to, msg.cc].filter(Boolean).join(',') },
    });
  }
}

/** Split a comma-joined recipient list into Brevo's `[{ email }]` shape. */
function toAddressList(value?: string): Array<{ email: string }> | undefined {
  if (!value) return undefined;
  const list = value
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
  return list.length ? list : undefined;
}

/**
 * Brevo transactional email over its HTTP API (https://api.brevo.com/v3/smtp/email).
 * Unlike the SMTP relay, the API authenticates with an api-key and is NOT subject
 * to Brevo's "Authorized IPs" restriction — so it sends from any host (incl. Azure
 * App Service) without whitelisting outbound IPs. Uses the global fetch (Node 18+).
 */
class BrevoApiProvider implements EmailProvider {
  readonly name = 'brevo';
  constructor(private readonly apiKey: string) {}

  async send(msg: EmailMessage): Promise<void> {
    const text =
      msg.text ?? msg.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const payload: Record<string, unknown> = {
      sender: { email: env.EMAIL_FROM, ...(env.EMAIL_FROM_NAME ? { name: env.EMAIL_FROM_NAME } : {}) },
      to: toAddressList(msg.to),
      cc: toAddressList(msg.cc),
      replyTo: { email: msg.replyTo ?? env.EMAIL_REPLY_TO ?? env.EMAIL_FROM },
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: text,
      // A calendar invite goes as a base64 .ics attachment (the API has no
      // dedicated icalEvent field like nodemailer does).
      ...(msg.icalEvent
        ? {
            attachment: [
              {
                name: msg.icalEvent.filename ?? 'invite.ics',
                content: Buffer.from(msg.icalEvent.content, 'utf-8').toString('base64'),
              },
            ],
          }
        : {}),
    };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API ${res.status}: ${body}`);
    }
  }
}

// Placeholder for API-based providers — implement when enabling one.
class UnconfiguredProvider implements EmailProvider {
  constructor(readonly name: string) {}
  async send(): Promise<void> {
    logger.warn(`Email provider "${this.name}" is not configured — email skipped`);
  }
}

function build(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      return new ConsoleProvider();
    case 'brevo':
      // API key not in yet? Don't crash — log to console so the flow works
      // end-to-end until the key is dropped into env.
      if (!env.EMAIL_API_KEY) {
        logger.warn('EMAIL_PROVIDER=brevo but EMAIL_API_KEY is unset — falling back to console');
        return new ConsoleProvider();
      }
      return new BrevoApiProvider(env.EMAIL_API_KEY);
    case 'smtp':
      // Credentials not in yet? Don't crash — log to console so the flow works
      // end-to-end until the mailbox details are dropped into env.
      if (!env.SMTP_HOST) {
        logger.warn('EMAIL_PROVIDER=smtp but SMTP_HOST is unset — falling back to console');
        return new ConsoleProvider();
      }
      return new SmtpProvider();
    default:
      return new UnconfiguredProvider(env.EMAIL_PROVIDER);
  }
}

export const emailProvider = build();

/** Fire-and-forget send — never breaks the primary flow (used by notifications). */
export function sendEmail(msg: EmailMessage): void {
  emailProvider.send(msg).catch((err) => logger.error({ err }, 'Email send failed'));
}

/**
 * Awaitable send — resolves on success, throws on failure. Use this when the
 * caller (e.g. an admin clicking "Send invoice") needs to report the outcome.
 */
export async function deliverEmail(msg: EmailMessage): Promise<void> {
  await emailProvider.send(msg);
}
