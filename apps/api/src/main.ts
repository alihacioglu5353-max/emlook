import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  // rawBody: ödeme sağlayıcısı bildirim imzası ham gövde üzerinden doğrulanır
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Ters vekil (load balancer) arkasında gerçek istemci IP'si için
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API hazır: http://localhost:${port}/api/v1 · Swagger: /docs`);
}
await bootstrap();
