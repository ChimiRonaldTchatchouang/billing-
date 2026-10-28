import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { prepareTestDatabase } from './setup-db.js';

describe('GET /health — base injoignable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp('postgresql://inconnu:inconnu@127.0.0.1:1/inconnu');
  });
  afterAll(async () => {
    await app.close();
  });

  it('répond 503 au format standard, en français', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: 'BASE_INDISPONIBLE',
      message: 'La base de données ne répond pas pour le moment.',
    });
  });

  it('une route inconnue répond 404 au format standard', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nexiste-pas');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INTROUVABLE');
  });

  it('pose les en-têtes de sécurité', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('GET /health — base disponible', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(dbUrl!);
  });
  afterAll(async () => {
    await app.close();
  });

  it('répond 200', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ statut: 'ok', base: 'ok' });
  });
});
