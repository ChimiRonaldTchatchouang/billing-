import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  setupApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API démarrée sur le port ${env.PORT}`, 'Bootstrap');
}

void bootstrap();
