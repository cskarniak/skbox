import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SettingsService } from '../settings/settings.service';

const PASSWORD_SETTING_KEY = 'terminal.passwordHash';
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

// Le terminal donne un vrai shell (utilisateur christian, avec ses droits sudo NOPASSWD),
// contrairement au reste de l'app qui n'a aucune authentification (protégée uniquement par
// le périmètre réseau LAN/Tailscale) — d'où ce mot de passe dédié et un verrouillage
// progressif après plusieurs échecs pour limiter le bruteforce.
@Injectable()
export class TerminalService {
  private failedAttempts = 0;
  private lockedUntil = 0;

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    return (await this.settings.get(PASSWORD_SETTING_KEY)) !== null;
  }

  async setup(password: string): Promise<void> {
    if (await this.isConfigured()) {
      throw new Error('Un mot de passe est déjà configuré pour le terminal.');
    }
    this.assertPasswordStrength(password);
    await this.settings.set(PASSWORD_SETTING_KEY, await bcrypt.hash(password, 12));
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const ok = await this.verifyPassword(currentPassword);
    if (!ok) {
      throw new Error('Mot de passe actuel incorrect.');
    }
    this.assertPasswordStrength(newPassword);
    await this.settings.set(PASSWORD_SETTING_KEY, await bcrypt.hash(newPassword, 12));
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (Date.now() < this.lockedUntil) {
      throw new Error('Trop de tentatives, réessayez dans une minute.');
    }
    const hash = await this.settings.get(PASSWORD_SETTING_KEY);
    if (!hash) return false;

    const ok = await bcrypt.compare(password, hash);
    if (ok) {
      this.failedAttempts = 0;
      return true;
    }

    this.failedAttempts++;
    if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      this.lockedUntil = Date.now() + LOCKOUT_MS;
      this.failedAttempts = 0;
    }
    return false;
  }

  private assertPasswordStrength(password: string): void {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
    }
  }
}
