import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * E-posta gönderim soyutlaması: `console` (geliştirme; içeriği loga yazar),
 * `memory` (testler), `smtp` (üretim; herhangi bir SMTP sağlayıcısı).
 */
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}

@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger('Mail');
  async send(m: MailMessage): Promise<void> {
    this.logger.log(`→ ${m.to} · ${m.subject}\n${m.text}`);
  }
}

@Injectable()
export class MemoryMailService extends MailService {
  readonly outbox: (MailMessage & { sentAt: Date })[] = [];
  async send(m: MailMessage): Promise<void> {
    this.outbox.push({ ...m, sentAt: new Date() });
  }
  lastTo(to: string) {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

export class SmtpMailService extends MailService {
  private readonly transport: Transporter;
  constructor(
    config: NonNullable<Env['SMTP']>,
    private readonly from: string,
  ) {
    super();
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }
  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: MailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailService => {
        switch (config.get('MAIL_PROVIDER', { infer: true })) {
          case 'memory':
            return new MemoryMailService();
          case 'smtp':
            return new SmtpMailService(config.get('SMTP', { infer: true })!, config.get('MAIL_FROM', { infer: true }));
          default:
            return new ConsoleMailService();
        }
      },
    },
  ],
  exports: [MailService],
})
export class MailModule {}

/** Marka renklerinde sade HTML e-posta (Emlook kırmızısı, mürekkep, kırık beyaz) */
export function brandedMail(opts: { title: string; intro: string; cta?: { label: string; url: string }; outro?: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f6f3ef;font-family:Arial,Helvetica,sans-serif;color:#16171c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdfb;border:1px solid #e6e1da;border-radius:12px">
<tr><td style="background:#c8283f;border-radius:12px 12px 0 0;padding:18px 28px;color:#fffdfb;font-size:22px;font-weight:800">emlook</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${esc(opts.title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#5b5d66">${esc(opts.intro)}</p>
${opts.cta ? `<p style="margin:0 0 20px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#c8283f;color:#fffdfb;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${esc(opts.cta.label)}</a></p>` : ''}
${opts.outro ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#5b5d66">${esc(opts.outro)}</p>` : ''}
</td></tr></table>
<p style="font-size:12px;color:#5b5d66;margin-top:16px">Emlook · Emlakçılar için profesyonel ağ</p>
</td></tr></table></body></html>`;
}
