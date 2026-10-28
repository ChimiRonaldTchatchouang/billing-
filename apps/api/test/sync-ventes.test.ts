import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '@caisse/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, enregistrerCaisse, jeton, jeuDeBase } from './helpers.js';
import { prepareTestDatabase } from './setup-db.js';

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('synchronisation des ventes', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let d: Awaited<ReturnType<typeof jeuDeBase>>;
  let auth: { Authorization: string };
  let riz: { id: string };
  let huile: { id: string };
  const sessionId = randomUUID();
  let seq = 0;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(dbUrl!);
    db = new PrismaClient({ datasourceUrl: dbUrl! });
    d = await jeuDeBase(db);
    auth = {
      Authorization: `Caisse ${await enregistrerCaisse(app, await jeton(app, 'gerant1@test.cm'), d.c1.id)}`,
    };
    riz = await db.product.create({
      data: {
        organizationId: d.org.id,
        barcode: '111',
        name: 'Riz 5 kg',
        priceTtc: 6500,
        vatRateBp: 1925,
      },
    });
    huile = await db.product.create({
      data: {
        organizationId: d.org.id,
        barcode: '222',
        name: 'Huile 1 L',
        priceTtc: 1500,
        vatRateBp: 1925,
      },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
    await app.close();
  });

  const session = () => ({
    id: sessionId,
    ouvertePar: d.caissier1.id,
    ouverteLe: new Date().toISOString(),
    fondDeCaisse: 20_000,
  });

  function vente(over: Record<string, unknown> = {}) {
    seq++;
    return {
      id: uuidv7(),
      numeroTicket: `M01-C01-${String(seq).padStart(6, '0')}`,
      sessionId,
      userId: d.caissier1.id,
      creeLe: new Date().toISOString(),
      lignes: [
        {
          productId: riz.id,
          libelle: 'Riz 5 kg',
          prixUnitaireTtc: 6500,
          quantite: 2,
          unite: 'PIECE',
          tauxTvaBp: 1925,
        },
        {
          productId: huile.id,
          libelle: 'Huile 1 L',
          prixUnitaireTtc: 1500,
          quantite: 1,
          unite: 'PIECE',
          tauxTvaBp: 1925,
        },
      ],
      paiements: [{ mode: 'ESPECES', montant: 20_000 }],
      ...over,
    };
  }

  it('enregistre la session et la vente : totaux, rendu, paiement net, stock', async () => {
    const v = vente();
    const res = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ sessions: [session()], ventes: [v] });
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([{ id: sessionId, statut: 'ENREGISTREE' }]);
    expect(res.body.ventes).toEqual([{ id: v.id, statut: 'ENREGISTREE' }]);

    const sale = await db.sale.findUniqueOrThrow({
      where: { id: v.id },
      include: { payments: true, lines: true },
    });
    expect(sale).toMatchObject({
      totalTtc: 14_500,
      totalVat: 2341,
      totalHt: 12_159,
      changeGiven: 5500,
    });
    expect(sale.payments).toEqual([
      expect.objectContaining({ mode: 'ESPECES', amount: 14_500, status: 'VALIDE' }),
    ]);
    const stock = await db.stockLevel.findUniqueOrThrow({
      where: { productId_storeId: { productId: riz.id, storeId: d.m1.id } },
    });
    expect(stock.quantity).toBe(-2); // stock négatif accepté, signalé par les rapports
    expect(
      await db.stockMovement.count({
        where: { productId: riz.id, type: 'VENTE', reference: v.numeroTicket },
      }),
    ).toBe(1);
    const reg = await db.register.findUniqueOrThrow({ where: { id: d.c1.id } });
    expect(reg.lastTicketSeq).toBe(1);
    expect(reg.lastSyncAt).not.toBeNull();
  });

  it('renvoi du même lot : rien n’est enregistré deux fois', async () => {
    const v = vente();
    const lot = { sessions: [session()], ventes: [v] };
    await http().post('/api/v1/sync/sales').set(auth).send(lot).expect(200);
    const second = await http().post('/api/v1/sync/sales').set(auth).send(lot);
    expect(second.body.sessions[0].statut).toBe('DEJA_RECUE');
    expect(second.body.ventes).toEqual([{ id: v.id, statut: 'DEJA_RECUE' }]);
    expect(await db.stockMovement.count({ where: { reference: v.numeroTicket } })).toBe(2);
    expect(await db.payment.count({ where: { saleId: v.id } })).toBe(1);
  });

  it('envois simultanés du même lot : une seule vente', async () => {
    const v = vente();
    const [a, b] = await Promise.all([
      http()
        .post('/api/v1/sync/sales')
        .set(auth)
        .send({ ventes: [v] }),
      http()
        .post('/api/v1/sync/sales')
        .set(auth)
        .send({ ventes: [v] }),
    ]);
    expect([a.body.ventes[0].statut, b.body.ventes[0].statut].sort()).toEqual([
      'DEJA_RECUE',
      'ENREGISTREE',
    ]);
    expect(await db.sale.count({ where: { id: v.id } })).toBe(1);
  });

  it('lot partiel : la vente invalide est rejetée avec un message, les autres sont enregistrées', async () => {
    const bonne1 = vente();
    const mauvaise = vente({ paiements: [{ mode: 'ESPECES', montant: 100 }] });
    const bonne2 = vente();
    const res = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [bonne1, mauvaise, bonne2] });
    expect(res.body.ventes).toEqual([
      { id: bonne1.id, statut: 'ENREGISTREE' },
      {
        id: mauvaise.id,
        statut: 'REJETEE',
        message: 'Il manque 14400 FCFA pour terminer l’encaissement.',
      },
      { id: bonne2.id, statut: 'ENREGISTREE' },
    ]);
    expect(await db.sale.count({ where: { id: mauvaise.id } })).toBe(0);
  });

  it('rejette un numéro de ticket d’une autre caisse', async () => {
    const v = vente({ numeroTicket: 'M01-C09-000001' });
    const res = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [v] });
    expect(res.body.ventes[0]).toEqual({
      id: v.id,
      statut: 'REJETEE',
      message: 'Le numéro de ticket doit commencer par M01-C01-.',
    });
  });

  it('rejette une vente d’un employé d’un autre magasin', async () => {
    const v = vente({ userId: d.gerant2.id });
    const res = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [v] });
    expect(res.body.ventes[0].statut).toBe('REJETEE');
  });

  it('écart de prix : la vente est acceptée au prix de la caisse et l’écart est signalé', async () => {
    const v = vente({
      lignes: [
        {
          productId: riz.id,
          libelle: 'Riz 5 kg',
          prixUnitaireTtc: 6000,
          quantite: 1,
          unite: 'PIECE',
          tauxTvaBp: 1925,
        },
      ],
      paiements: [{ mode: 'ESPECES', montant: 6000 }],
    });
    await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [v] })
      .expect(200);
    const ligne = await db.saleLine.findFirstOrThrow({ where: { saleId: v.id } });
    expect(ligne).toMatchObject({ unitPriceTtc: 6000, catalogPriceTtc: 6500, totalTtc: 6000 });
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'ECART_PRIX', entityId: v.id },
    });
    expect(log.after).toMatchObject({ lignes: [{ encaisse: 6000, catalogue: 6500 }] });
  });

  it('remise validée par un gérant : inscrite au journal à son nom', async () => {
    const v = vente({
      remiseTicket: 500,
      paiements: [{ mode: 'ESPECES', montant: 14_000 }],
      approbations: [
        {
          action: 'REMISE',
          approuveePar: d.gerant1.id,
          le: new Date().toISOString(),
          details: 'Remise 500 FCFA',
        },
      ],
    });
    const res = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [v] });
    expect(res.body.ventes[0].statut).toBe('ENREGISTREE');
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'REMISE', entityId: v.id } });
    expect(log.userId).toBe(d.gerant1.id);
    expect((await db.sale.findUniqueOrThrow({ where: { id: v.id } })).discount).toBe(500);
  });

  it('une remise « validée » par un caissier est rejetée', async () => {
    const v = vente({
      remiseTicket: 500,
      paiements: [{ mode: 'ESPECES', montant: 14_000 }],
      approbations: [
        { action: 'REMISE', approuveePar: d.caissier1.id, le: new Date().toISOString() },
      ],
    });
    const res = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [v] });
    expect(res.body.ventes[0]).toMatchObject({
      statut: 'REJETEE',
      message: 'Une validation a été faite par un employé qui n’est pas gérant.',
    });
  });

  it('Mobile Money : enregistré « à rapprocher » avec la référence', async () => {
    const v = vente({
      paiements: [
        {
          mode: 'ORANGE_MONEY',
          montant: 14_500,
          numeroClient: '690000000',
          reference: 'MP261028.1234.A12345',
        },
      ],
    });
    await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [v] })
      .expect(200);
    const p = await db.payment.findFirstOrThrow({ where: { saleId: v.id } });
    expect(p).toMatchObject({
      mode: 'ORANGE_MONEY',
      amount: 14_500,
      status: 'A_RAPPROCHER',
      externalRef: 'MP261028.1234.A12345',
    });
  });

  it('événement sans vente (ticket annulé) : inscrit une seule fois', async () => {
    const e = {
      id: randomUUID(),
      userId: d.caissier1.id,
      approbation: {
        action: 'ANNULATION_TICKET',
        approuveePar: d.gerant1.id,
        le: new Date().toISOString(),
        details: '3 articles, 9500 FCFA',
      },
    };
    const r1 = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ evenements: [e] });
    const r2 = await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ evenements: [e] });
    expect(r1.body.evenements[0].statut).toBe('ENREGISTREE');
    expect(r2.body.evenements[0].statut).toBe('DEJA_RECUE');
    expect(await db.auditLog.count({ where: { clientEventId: e.id } })).toBe(1);
  });

  it('refuse un lot vide ou un montant décimal', async () => {
    await http().post('/api/v1/sync/sales').set(auth).send({}).expect(400);
    await http()
      .post('/api/v1/sync/sales')
      .set(auth)
      .send({ ventes: [vente({ remiseTicket: 0.5 })] })
      .expect(400);
  });

  it('une vente reçue ne peut plus être modifiée en base', async () => {
    const s = await db.sale.findFirstOrThrow();
    await expect(db.sale.update({ where: { id: s.id }, data: { totalTtc: 1 } })).rejects.toThrow(
      /ne peut pas être modifiée/,
    );
  });

  it('back-office : le gérant voit les ventes de son magasin, avec le détail', async () => {
    const t = await jeton(app, 'gerant1@test.cm');
    const liste = await http().get('/api/v1/sales').set('Authorization', `Bearer ${t}`);
    expect(liste.status).toBe(200);
    expect(liste.body.total).toBeGreaterThan(5);
    const detail = await http()
      .get(`/api/v1/sales/${liste.body.ventes[0].id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(detail.body.lignes.length).toBeGreaterThan(0);
    const t2 = await jeton(app, 'gerant2@test.cm');
    const autre = await http().get('/api/v1/sales').set('Authorization', `Bearer ${t2}`);
    expect(autre.body.total).toBe(0);
    await http()
      .get(`/api/v1/sales/${liste.body.ventes[0].id}`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(403);
  });
});
