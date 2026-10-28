import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { hacherPin } from '@caisse/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

export function configurerEnv(databaseUrl: string): void {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  process.env.JWT_ACCESS_SECRET ??= 'secret-de-test-secret-de-test-0123456789';
  process.env.PDF_LINK_SECRET ??= 'secret-pdf-de-test-secret-pdf-0123456789';
  process.env.THROTTLE_AUTH_LIMIT ??= '1000';
}

export async function createTestApp(databaseUrl: string): Promise<INestApplication> {
  configurerEnv(databaseUrl);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { CORS_ORIGINS: ['http://localhost:5173'] });
  await app.init();
  return app;
}

export const MDP = 'mot-de-passe-solide';

/** Jeu de données de base : une organisation, deux magasins, un directeur, un gérant et un caissier par magasin. */
export async function jeuDeBase(db: PrismaClient) {
  const org = await db.organization.create({
    data: { name: 'Supermarché Test', niu: 'M0123456789' },
  });
  const m1 = await db.store.create({ data: { organizationId: org.id, code: 'M01', name: 'Akwa' } });
  const m2 = await db.store.create({
    data: { organizationId: org.id, code: 'M02', name: 'Bonamoussadi' },
  });
  const passwordHash = await hash(MDP);
  const directeur = await db.user.create({
    data: {
      organizationId: org.id,
      name: 'Directrice',
      email: 'directeur@test.cm',
      passwordHash,
      pinHash: await hacherPin('0000'),
      role: 'DIRECTEUR',
    },
  });
  const gerant1 = await db.user.create({
    data: {
      organizationId: org.id,
      storeId: m1.id,
      name: 'Gérant Akwa',
      email: 'gerant1@test.cm',
      passwordHash,
      pinHash: await hacherPin('9999'),
      role: 'GERANT',
    },
  });
  const gerant2 = await db.user.create({
    data: {
      organizationId: org.id,
      storeId: m2.id,
      name: 'Gérant Bonamoussadi',
      email: 'gerant2@test.cm',
      passwordHash,
      pinHash: await hacherPin('8888'),
      role: 'GERANT',
    },
  });
  const caissier1 = await db.user.create({
    data: {
      organizationId: org.id,
      storeId: m1.id,
      name: 'Caissière Akwa',
      email: 'caissier1@test.cm',
      passwordHash,
      pinHash: await hacherPin('1234'),
      role: 'CAISSIER',
    },
  });
  const c1 = await db.register.create({
    data: { organizationId: org.id, storeId: m1.id, code: 'C01' },
  });
  return { org, m1, m2, directeur, gerant1, gerant2, caissier1, c1 };
}

export async function jeton(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, motDePasse: MDP });
  if (res.status !== 200)
    throw new Error(`Connexion impossible pour ${email} : ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

/** Enregistre une caisse et renvoie son jeton d'appareil. */
export async function enregistrerCaisse(
  app: INestApplication,
  jetonGerant: string,
  registerId: string,
) {
  const http = request(app.getHttpServer());
  const code = await http
    .post(`/api/v1/registers/${registerId}/enroll`)
    .set('Authorization', `Bearer ${jetonGerant}`);
  const res = await http.post('/api/v1/registers/activate').send({ code: code.body.code });
  return res.body.jetonAppareil as string;
}
