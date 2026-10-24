import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { PushProvider, type PushPayload, type PushResult } from './push.service.js';

/** Firebase konsolundan indirilen servis hesabı JSON'unun kullandığımız alanları */
export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const CONCURRENCY = 10;

/** Ortam değişkeni: ham JSON veya base64 kodlanmış JSON */
export function parseServiceAccount(raw: string): FcmServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  let json: Partial<FcmServiceAccount>;
  try {
    json = JSON.parse(text) as Partial<FcmServiceAccount>;
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT geçerli bir JSON (veya base64 JSON) değil');
  }
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT içinde project_id, client_email ve private_key olmalı');
  }
  return {
    project_id: json.project_id,
    client_email: json.client_email,
    // .env içinde satır sonları "\n" olarak gelebilir
    private_key: json.private_key.replace(/\\n/g, '\n'),
    token_uri: json.token_uri,
  };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/**
 * Firebase Cloud Messaging HTTP v1 sağlayıcısı (Android + iOS/APNs).
 * Erişim belirteci servis hesabıyla imzalanan JWT'den alınır ve süresi
 * dolana kadar önbellekte tutulur. HTTP v1'de toplu gönderim olmadığından
 * her cihaza ayrı istek atılır (eşzamanlı en fazla 10).
 */
export class FcmPushProvider extends PushProvider {
  private readonly logger = new Logger('Push:fcm');
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly account: FcmServiceAccount,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    const invalidTokens: string[] = [];
    let failures = 0;
    const queue = [...new Set(tokens)];
    const worker = async () => {
      for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
        const outcome = await this.sendOne(t, payload);
        if (outcome === 'invalid') invalidTokens.push(t);
        else if (outcome === 'error') failures++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    if (failures > 0) this.logger.warn(`${failures}/${tokens.length} cihaza gönderilemedi`);
    return { invalidTokens };
  }

  private async sendOne(deviceToken: string, p: PushPayload, retried = false): Promise<'ok' | 'invalid' | 'error'> {
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: p.title, body: p.body },
            data: p.data ?? {},
            android: { priority: 'HIGH', notification: { sound: 'default' } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.debug(`FCM'e ulaşılamadı: ${String(e)}`);
      return 'error';
    }
    if (res.ok) return 'ok';

    const err = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
    };
    const codes = [err.error?.status, ...(err.error?.details ?? []).map((d) => d.errorCode)];
    // Belirteç süresi dolmuşsa bir kez yenileyip dene
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.sendOne(deviceToken, p, true);
    }
    // Uygulama kaldırıldı / belirteç geçersiz → kaydı sil
    if (
      codes.includes('UNREGISTERED') ||
      (res.status === 400 && /registration token/i.test(err.error?.message ?? ''))
    ) {
      return 'invalid';
    }
    this.logger.debug(`FCM ${res.status}: ${err.error?.message ?? ''}`);
    return 'error';
  }

  /** OAuth2 erişim belirteci (JWT bearer akışı) */
  /** Ayarlar ekranındaki "bağlantıyı test et": servis hesabıyla erişim belirteci alınabiliyor mu */
  async checkCredentials(): Promise<void> {
    await this.accessToken();
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const iat = Math.floor(this.now() / 1000);
    const tokenUri = this.account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({ iss: this.account.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 }),
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.account.private_key);
    const assertion = `${header}.${claims}.${b64url(signature)}`;

    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM erişim belirteci alınamadı (HTTP ${res.status})`);
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    this.token = { value: data.access_token, expiresAt: this.now() + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }
}
