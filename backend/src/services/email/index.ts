import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProd } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
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

/**
 * Why the configured provider cannot actually deliver, or null when it can.
 *
 * A misconfigured provider used to degrade quietly to the console one, which made
 * "Send invoice" report success and mark the invoice SENT while nothing was ever
 * emailed. The reason is kept so the send path can fail loudly instead.
 */
let undeliverableReason: string | null = null;

function build(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      // Deliberate in development. In production it means no email was ever
      // configured, which must not look like a successful send.
      if (isProd) {
        undeliverableReason =
          'EMAIL_PROVIDER is "console", which only logs. Set EMAIL_PROVIDER=brevo with EMAIL_API_KEY (or =smtp with SMTP_HOST/USER/PASS).';
      }
      return new ConsoleProvider();
    case 'brevo':
      if (!env.EMAIL_API_KEY) {
        undeliverableReason = 'EMAIL_PROVIDER=brevo but EMAIL_API_KEY is not set.';
        logger.warn('EMAIL_PROVIDER=brevo but EMAIL_API_KEY is unset — email cannot be delivered');
        return new ConsoleProvider();
      }
      return new BrevoApiProvider(env.EMAIL_API_KEY);
    case 'smtp':
      if (!env.SMTP_HOST) {
        undeliverableReason = 'EMAIL_PROVIDER=smtp but SMTP_HOST is not set.';
        logger.warn('EMAIL_PROVIDER=smtp but SMTP_HOST is unset — email cannot be delivered');
        return new ConsoleProvider();
      }
      return new SmtpProvider();
    default:
      undeliverableReason = `EMAIL_PROVIDER="${env.EMAIL_PROVIDER}" is not a provider this build knows (console, brevo, smtp).`;
      return new UnconfiguredProvider(env.EMAIL_PROVIDER);
  }
}

export const emailProvider = build();

/** Whether email can actually leave the building, and why not when it cannot. */
export function emailStatus(): {
  provider: string;
  canDeliver: boolean;
  reason: string | null;
  from: string;
} {
  return {
    provider: env.EMAIL_PROVIDER,
    canDeliver: undeliverableReason === null,
    reason: undeliverableReason,
    from: fromHeader(),
  };
}

// Say it once at boot, so the App Service log stream shows the truth rather than
// leaving a silent misconfiguration to be discovered by a customer not replying.
if (undeliverableReason) {
  logger.error(
    { provider: env.EMAIL_PROVIDER, reason: undeliverableReason },
    '✉️  Email is NOT deliverable — invoices and notifications will fail to send'
  );
} else {
  logger.info({ provider: env.EMAIL_PROVIDER, from: fromHeader() }, '✉️  Email provider ready');
}

/** Fire-and-forget send — never breaks the primary flow (used by notifications). */
export function sendEmail(msg: EmailMessage): void {
  emailProvider.send(msg).catch((err) => logger.error({ err }, 'Email send failed'));
}

/**
 * Awaitable send — resolves on success, throws on failure. Use this when the
 * caller (e.g. an admin clicking "Send invoice") needs to report the outcome.
 *
 * Refuses outright when the provider cannot deliver, so a misconfiguration
 * surfaces as a visible failure instead of an invoice quietly marked as sent.
 */
export async function deliverEmail(msg: EmailMessage): Promise<void> {
  if (undeliverableReason) {
    // ApiError, not a plain Error: the handler echoes an ApiError's message to the
    // caller, while a plain one becomes an opaque "Internal server error" in
    // production — which is how this failure stayed invisible in the first place.
    throw ApiError.internal(`Email is not configured, so nothing was sent. ${undeliverableReason}`);
  }
  try {
    await emailProvider.send(msg);
  } catch (err) {
    // Same reasoning: a provider's own error (a rejected key, a blocked IP, a
    // refused recipient) is a plain Error, so it would reach the admin as an
    // opaque 500. Log it with context and pass the provider's own words on.
    const detail = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, to: msg.to, cc: msg.cc, provider: env.EMAIL_PROVIDER },
      'Email delivery failed'
    );
    throw ApiError.badGateway(`The email provider rejected the message: ${detail}`);
  }
}
