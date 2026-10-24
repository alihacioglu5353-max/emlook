/**
 * e2e testleri gerçek bir PostgreSQL veritabanında (`emlook_test`) çalışır.
 * Her test dosyası başlamadan migration'lar uygulanır; her testten önce
 * tablolar boşaltılır.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://emlook:emlook@localhost:5433/emlook_test';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.SMS_PROVIDER = 'memory';
process.env.PUSH_PROVIDER = 'memory';
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'emlook-uploads-'));
process.env.CORS_ORIGINS = '';
process.env.ADMIN_PHONES = '';
