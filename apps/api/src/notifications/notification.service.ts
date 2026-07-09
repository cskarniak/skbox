import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';

// Clés de réglages (stockées via SettingsService/Setting, éditables sans redémarrage,
// même mécanisme que les autres options du projet — cf. zigbee.*/rfxcom.*).
const KEYS = {
  telegramBotToken: 'alarms.telegramBotToken',
  telegramChatId: 'alarms.telegramChatId',
  smtpHost: 'alarms.smtpHost',
  smtpPort: 'alarms.smtpPort',
  smtpUser: 'alarms.smtpUser',
  smtpPass: 'alarms.smtpPass',
  smtpFrom: 'alarms.smtpFrom',
  smtpTo: 'alarms.smtpTo',
} as const;

export interface NotificationResult {
  ok: boolean;
  error?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly settings: SettingsService) {}

  async sendTelegram(message: string): Promise<NotificationResult> {
    const [token, chatId] = await Promise.all([
      this.settings.get(KEYS.telegramBotToken),
      this.settings.get(KEYS.telegramChatId),
    ]);
    if (!token || !chatId) {
      const error = 'Bot token / chat id non configurés';
      this.logger.warn(`Notification Telegram ignorée : ${error}`);
      return { ok: false, error };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
      if (!res.ok) {
        const error = `${res.status} ${await res.text()}`;
        this.logger.error(`Envoi Telegram échoué (${error})`);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (err) {
      const error = String(err);
      this.logger.error(`Envoi Telegram échoué: ${error}`);
      return { ok: false, error };
    }
  }

  async sendEmail(subject: string, message: string): Promise<NotificationResult> {
    const [host, port, user, pass, from, to] = await Promise.all([
      this.settings.get(KEYS.smtpHost),
      this.settings.get(KEYS.smtpPort),
      this.settings.get(KEYS.smtpUser),
      this.settings.get(KEYS.smtpPass),
      this.settings.get(KEYS.smtpFrom),
      this.settings.get(KEYS.smtpTo),
    ]);
    if (!host || !to) {
      const error = 'SMTP non configuré';
      this.logger.warn(`Notification email ignorée : ${error}`);
      return { ok: false, error };
    }

    try {
      const transport = nodemailer.createTransport({
        host,
        port: port ? Number(port) : 587,
        secure: Number(port) === 465,
        auth: user ? { user, pass: pass ?? undefined } : undefined,
      });
      await transport.sendMail({ from: from ?? user ?? undefined, to, subject, text: message });
      return { ok: true };
    } catch (err) {
      const error = String(err);
      this.logger.error(`Envoi email échoué: ${error}`);
      return { ok: false, error };
    }
  }
}
