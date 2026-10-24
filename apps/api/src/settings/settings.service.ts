import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { appSettings } from '../db/schema.js';
import {
  BADGE_METRICS,
  GENERAL_FIELDS,
  INTEGRATION_DEFS,
  INTEGRATIONS,
  type BadgeSettings,
  type FieldDef,
  type GeneralSettings,
  type IntegrationName,
} from './settings.defs.js';

const CACHE_MS = 15_000;

export const DEFAULT_BADGES: BadgeSettings = {
  weights: {
    activeListing: 10,
    soldListing: 25,
    eidsVerified: 5,
    match: 8,
    likeReceived: 1,
    follower: 2,
    paidPayment: 30,
    accountMonth: 3,
    profileComplete: 15,
  },
  tiers: [
    { key: 'new', label: 'Yeni Danışman', minScore: 0, color: 'ink' },
    { key: 'bronze', label: 'Bronz', minScore: 40, color: 'bronze' },
    { key: 'silver', label: 'Gümüş', minScore: 100, color: 'silver' },
    { key: 'gold', label: 'Altın', minScore: 180, color: 'gold' },
    { key: 'platinum', label: 'Platin', minScore: 300, color: 'brand' },
  ],
};

type Stored = Record<string, unknown>;
/** Çözülmüş entegrasyon ayarı: alan değerleri metin, sayı veya mantıksal */
export type IntegrationValues = Record<string, string | number | boolean | null>;
interface Encrypted {
  __enc: string;
}
const isEnc = (v: unknown): v is Encrypted => typeof v === 'object' && v !== null && '__enc' in v;

/**
 * Yönetici ayarları. Okumalar kısa süre önbellekte tutulur; yazınca önbellek temizlenir.
 * Ayarlanmamış alanlar ortam değişkenlerinden (env) veya varsayılandan gelir.
 */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { at: number; value: Stored | null }>();
  private readonly key: Buffer;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {
    // Ayrı anahtar verilmezse JWT sırrından türetilir (sır değişirse kayıtlı gizli değerler yeniden girilmeli)
    const material = process.env.SETTINGS_ENCRYPTION_KEY || `${this.config.get('JWT_ACCESS_SECRET', { infer: true })}:settings`;
    this.key = createHash('sha256').update(material).digest();
  }

  /** Testler ve toplu değişiklikler için önbelleği boşaltır */
  clearCache() {
    this.cache.clear();
  }

  // ---- düşük seviye ----

  private async raw(key: string): Promise<Stored | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const [row] = await this.db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
    const value = row?.value ?? null;
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async write(key: string, value: Stored, userId: string | null) {
    await this.db
      .insert(appSettings)
      .values({ key, value, updatedBy: userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
    this.cache.delete(key);
  }

  encrypt(plain: string): Encrypted {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return { __enc: [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.') };
  }

  decrypt(v: Encrypted): string | null {
    try {
      const [iv, tag, data] = v.__enc.split('.').map((p) => Buffer.from(p, 'base64url'));
      const d = createDecipheriv('aes-256-gcm', this.key, iv!);
      d.setAuthTag(tag!);
      return Buffer.concat([d.update(data!), d.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  // ---- genel ----

  async general(): Promise<GeneralSettings> {
    const s = (await this.raw('general')) ?? {};
    const env = (k: keyof Env) => this.config.get(k, { infer: true }) as number;
    return {
      supportEmail: (s.supportEmail as string) ?? '',
      supportPhone: (s.supportPhone as string) ?? '',
      platformFeeBps: (s.platformFeeBps as number) ?? env('PLATFORM_FEE_BPS'),
      vatRateBps: (s.vatRateBps as number) ?? env('VAT_RATE_BPS'),
      paymentLinkDays: (s.paymentLinkDays as number) ?? env('PAYMENT_LINK_DAYS'),
      maxListingPhotos: (s.maxListingPhotos as number) ?? env('MAX_LISTING_PHOTOS'),
      defaultCobrokeShare: (s.defaultCobrokeShare as number) ?? 50,
      onlineWindowMinutes: (s.onlineWindowMinutes as number) ?? 5,
      announcement: (s.announcement as string) ?? '',
    };
  }

  async setGeneral(input: Record<string, unknown>, userId: string) {
    const current = (await this.raw('general')) ?? {};
    const next: Stored = { ...current };
    for (const f of GENERAL_FIELDS) {
      if (!(f.key in input)) continue;
      next[f.key] = this.coerce(f, input[f.key]);
    }
    await this.write('general', next, userId);
    return this.general();
  }

  // ---- rozetler ----

  async badges(): Promise<BadgeSettings> {
    const s = await this.raw('badges');
    if (!s) return DEFAULT_BADGES;
    return {
      weights: { ...DEFAULT_BADGES.weights, ...(s.weights as Record<string, number>) },
      tiers: (s.tiers as BadgeSettings['tiers']) ?? DEFAULT_BADGES.tiers,
    };
  }

  async setBadges(input: BadgeSettings, userId: string) {
    const weights: Record<string, number> = {};
    for (const m of BADGE_METRICS) {
      const v = Number(input.weights?.[m] ?? DEFAULT_BADGES.weights[m]);
      if (!Number.isFinite(v) || v < 0 || v > 1000) throw new BadRequestException(`Geçersiz puan: ${m}`);
      weights[m] = Math.round(v);
    }
    const tiers = (input.tiers ?? []).map((t) => ({
      key: String(t.key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24),
      label: String(t.label || '').trim().slice(0, 40),
      minScore: Math.max(0, Math.round(Number(t.minScore) || 0)),
      color: ['brand', 'ink', 'ok', 'warn', 'gold', 'silver', 'bronze'].includes(t.color) ? t.color : 'ink',
    }));
    if (tiers.length < 1 || tiers.length > 8) throw new BadRequestException('1 ile 8 arasında rozet tanımlayın');
    if (tiers.some((t) => !t.key || !t.label)) throw new BadRequestException('Her rozetin anahtarı ve adı olmalı');
    if (new Set(tiers.map((t) => t.key)).size !== tiers.length) throw new BadRequestException('Rozet anahtarları benzersiz olmalı');
    tiers.sort((a, b) => a.minScore - b.minScore);
    if (tiers[0]!.minScore !== 0) throw new BadRequestException('En düşük rozetin eşiği 0 olmalı');
    await this.write('badges', { weights, tiers }, userId);
    return this.badges();
  }

  // ---- entegrasyonlar ----

  /** Çözülmüş (gizli alanlar açık) entegrasyon ayarı; yalnızca sunucu içinde kullanılır */
  async integration(name: IntegrationName): Promise<IntegrationValues | null> {
    const s = await this.raw(`integration.${name}`);
    if (!s) return null;
    const out: IntegrationValues = {};
    for (const [k, v] of Object.entries(s)) {
      out[k] = isEnc(v) ? this.decrypt(v) : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null;
    }
    return out;
  }

  /** Etkinse çözülmüş ayar, değilse null */
  async activeIntegration(name: IntegrationName) {
    const s = await this.integration(name);
    return s?.enabled ? s : null;
  }

  /** Yönetim ekranı için: gizli değerler maskelenir */
  async integrationsView() {
    const out = [];
    for (const name of INTEGRATIONS) {
      const def = INTEGRATION_DEFS[name];
      const s = (await this.raw(`integration.${name}`)) ?? {};
      const values: Record<string, unknown> = {};
      for (const f of def.fields) {
        const v = s[f.key];
        if (f.type === 'secret') {
          const plain = isEnc(v) ? this.decrypt(v) : null;
          values[f.key] = { configured: !!plain, hint: plain ? `••••${plain.slice(-4)}` : null };
        } else values[f.key] = v ?? (f.type === 'boolean' ? false : null);
      }
      const missing = def.fields.filter((f) => f.required && (f.type === 'secret' ? !isEnc(s[f.key]) : s[f.key] == null || s[f.key] === '')).map((f) => f.label);
      out.push({ ...def, values, configured: missing.length === 0 && Object.keys(s).length > 0, missing, envFallback: this.envFallback(name) });
    }
    return out;
  }

  async setIntegration(name: IntegrationName, input: Record<string, unknown>, userId: string) {
    const def = INTEGRATION_DEFS[name];
    const current = (await this.raw(`integration.${name}`)) ?? {};
    const next: Stored = { ...current };
    for (const f of def.fields) {
      if (!(f.key in input)) continue;
      const v = input[f.key];
      if (f.type === 'secret') {
        // Boş gönderim mevcut değeri korur; null siler
        if (v === null) delete next[f.key];
        else if (typeof v === 'string' && v.trim()) next[f.key] = this.encrypt(v.trim());
        continue;
      }
      next[f.key] = this.coerce(f, v);
    }
    if (next.enabled) {
      const missing = def.fields.filter((f) => f.required && (f.type === 'secret' ? !isEnc(next[f.key]) : next[f.key] == null || next[f.key] === ''));
      if (missing.length) throw new BadRequestException(`Etkinleştirmek için doldurun: ${missing.map((f) => f.label).join(', ')}`);
    }
    await this.write(`integration.${name}`, next, userId);
    return (await this.integrationsView()).find((i) => i.name === name)!;
  }

  /** Ortam değişkenlerinde tanımlı sağlayıcı (ekranda "şu an kullanılan" bilgisi) */
  private envFallback(name: IntegrationName): string {
    const c = (k: keyof Env) => String(this.config.get(k, { infer: true }) as string);
    switch (name) {
      case 'netgsm':
        return `SMS_PROVIDER=${c('SMS_PROVIDER')}`;
      case 'smtp':
        return `MAIL_PROVIDER=${c('MAIL_PROVIDER')}`;
      case 'fcm':
        return `PUSH_PROVIDER=${c('PUSH_PROVIDER')}`;
      case 's3':
        return `STORAGE_DRIVER=${c('STORAGE_DRIVER')}`;
      case 'eids':
        return `EIDS_PROVIDER=${c('EIDS_PROVIDER')}`;
      case 'trinkle360':
        return `PAYMENT_PROVIDER=${c('PAYMENT_PROVIDER')}`;
      default:
        return 'tanımlı değil';
    }
  }

  private coerce(f: FieldDef, v: unknown): unknown {
    if (v === null || v === undefined || v === '') return f.type === 'boolean' ? false : null;
    switch (f.type) {
      case 'boolean':
        return v === true || v === 'true';
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new BadRequestException(`${f.label} sayı olmalı`);
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
          throw new BadRequestException(`${f.label} ${f.min}–${f.max} arasında olmalı`);
        }
        return Math.round(n);
      }
      case 'select':
        if (!f.options?.some((o) => o.value === v)) throw new BadRequestException(`${f.label} için geçersiz seçim`);
        return v;
      default:
        if (typeof v !== 'string' && typeof v !== 'number') throw new BadRequestException(`${f.label} metin olmalı`);
        return String(v).trim().slice(0, f.type === 'textarea' ? 2000 : 500);
    }
  }
}
