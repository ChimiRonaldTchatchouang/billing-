import 'reflect-metadata';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

/**
 * Version de bureau : l'API sert aussi l'application web compilée (même origine, pas de CORS).
 * Toute URL qui n'est ni l'API ni /health renvoie index.html (routes de l'application).
 */
function servirApplicationWeb(app: NestExpressApplication): void {
  const dossier = process.env.WEB_DIST;
  if (!dossier) return;
  const index = join(dossier, 'index.html');
  app.useStaticAssets(dossier, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && req.path !== '/health')
      res.sendFile(index);
    else next();
  });
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render place l'API derrière un proxy : l'adresse du client sert au limiteur de requêtes.
  app.set('trust proxy', 1);
  setupApp(app, env);
  servirApplicationWeb(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API démarrée sur le port ${env.PORT}`, 'Bootstrap');
}

void bootstrap();
