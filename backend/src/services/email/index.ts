import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Provider-agnostic email abstraction. Development logs to the console; wire a
 * real provider (Azure Communication Services / SendGrid / SMTP) by implementing
 * EmailProvider and selecting it via EMAIL_PROVIDER. Credentials stay in env.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleProvider implements EmailProvider {
  readonly name = 'console';
  async send(msg: EmailMessage): Promise<void> {
    logger.info(
      { to: msg.to, subject: msg.subject, from: env.EMAIL_FROM },
      `📧 [email:console] ${msg.text ?? msg.subject}`
    );
  }
}

// Placeholder providers — implement when enabling production email.
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
    // case 'sendgrid': return new SendGridProvider();
    // case 'smtp':     return new SmtpProvider();
    // case 'azure':    return new AzureEmailProvider();
    default:
      return new UnconfiguredProvider(env.EMAIL_PROVIDER);
  }
}

export const emailProvider = build();

/** Fire-and-forget send — never breaks the primary flow. */
export function sendEmail(msg: EmailMessage): void {
  emailProvider.send(msg).catch((err) => logger.error({ err }, 'Email send failed'));
}
