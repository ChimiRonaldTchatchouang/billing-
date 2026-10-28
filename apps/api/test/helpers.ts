import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

export async function createTestApp(databaseUrl: string): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { CORS_ORIGINS: ['http://localhost:5173'] });
  await app.init();
  return app;
}
