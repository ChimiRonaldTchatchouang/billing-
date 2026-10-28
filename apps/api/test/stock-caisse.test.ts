import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '@caisse/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, enregistrerCaisse, jeton, jeuDeBase } from './helpers.js';
import { prepareTestDatabase } from './setup-db.js';

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('stock, retours et clôture de caisse', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let d: Awaited<ReturnType<typeof jeuDeBase>>;
  let caisse: { Authorization: string };
  let gerant: { Authorization: string };
  let riz: { id: string };
  let huile: { id: string };
  const sessionId = uuidv7();
  const http = () => request(app.getHttpServer());
  const niveau = async (productId: string) =>
    (
      await db.stockLevel.findUnique({
        where: { productId_storeId: { productId, storeId: d.m1.id } },
      })
    )?.quantity ?? 0;

  beforeAll(async () => {
    app = await createTestApp(dbUrl!);
    db = new PrismaClient({ datasourceUrl: dbUrl! });
    d = await jeuDeBase(db);
    const t = await jeton(app, 'gerant1@test.cm');
    gerant = { Authorization: `Bearer ${t}` };
    caisse = { Authorization: `Caisse ${await enregistrerCaisse(app, t, d.c1.id)}` };
    riz = await db.product.create({
      data: {
        organizationId: d.org.id,
        barcode: '111',
        name: 'Riz 5 kg',
        priceTtc: 6500,
        vatRateBp: 1925,
        alertThreshold: 5,
      },
    });
    huile = await db.product.create({
      data: {
        organizationId: d.org.id,
        barcode: '222',
        name: 'Huile 1 L',
        priceTtc: 1500,
        vatRateBp: 1925,
        alertThreshold: 2,
      },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
    await app.close();
  });

  describe('stock', () => {
    it('réception : entrée en stock, prix d’achat mis à jour, journal', async () => {
      const res = await http()
        .post('/api/v1/receipts')
        .set(gerant)
        .send({
          storeId: d.m1.id,
          fournisseur: 'Grossiste Akwa',
          lignes: [
            { productId: riz.id, quantite: 20, prixAchat: 5200 },
            { productId: huile.id, quantite: 10, prixAchat: 1100 },
          ],
        });
      expect(res.status).toBe(201);
      expect(await niveau(riz.id)).toBe(20);
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: riz.id } })).lastPurchasePrice,
      ).toBe(5200);
      expect(await db.auditLog.count({ where: { action: 'RECEPTION' } })).toBe(1);
      const liste = await http().get('/api/v1/receipts').set(gerant);
      expect(liste.body[0]).toMatchObject({
        fournisseur: 'Grossiste Akwa',
        montantAchat: 20 * 5200 + 10 * 1100,
      });
    });

    it('un gérant ne réceptionne pas dans un autre magasin', async () => {
      const res = await http()
        .post('/api/v1/receipts')
        .set(gerant)
        .send({
          storeId: d.m2.id,
          fournisseur: 'X',
          lignes: [{ productId: riz.id, quantite: 1, prixAchat: 1 }],
        });
      expect(res.status).toBe(403);
    });

    it('ajustement (casse) et inventaire (quantité comptée)', async () => {
      const casse = await http()
        .post('/api/v1/stock/adjustments')
        .set(gerant)
        .send({ storeId: d.m1.id, productId: huile.id, quantite: -2, motif: 'Casse en rayon' });
      expect(casse.body).toEqual({ avant: 10, apres: 8, variation: -2 });
      const inventaire = await http().post('/api/v1/stock/adjustments').set(gerant).send({
        storeId: d.m1.id,
        productId: huile.id,
        quantiteReelle: 1,
        motif: 'Inventaire du soir',
      });
      expect(inventaire.body).toEqual({ avant: 8, apres: 1, variation: -7 });
      const log = await db.auditLog.findFirstOrThrow({
        where: { action: 'AJUSTEMENT_STOCK' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log.after).toMatchObject({ quantite: 1, motif: 'Inventaire du soir' });
      const vide = await http()
        .post('/api/v1/stock/adjustments')
        .set(gerant)
        .send({ storeId: d.m1.id, productId: huile.id, motif: 'rien' });
      expect(vide.status).toBe(400);
    });

    it('liste du stock avec alertes', async () => {
      const res = await http().get('/api/v1/stock?alerte=true').set(gerant);
      expect(res.status).toBe(200);
      expect(res.body.articles).toEqual([
        expect.objectContaining({ nom: 'Huile 1 L', quantite: 1, enAlerte: true }),
      ]);
      const mvts = await http().get(`/api/v1/stock/${huile.id}/movements`).set(gerant);
      expect(mvts.body.map((m: { type: string }) => m.type)).toEqual([
        'AJUSTEMENT',
        'AJUSTEMENT',
        'RECEPTION',
      ]);
    });

    it('le directeur doit préciser le magasin', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http().get('/api/v1/stock').set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(422);
      expect(res.body.message).toBe('Choisissez un magasin.');
    });
  });

  describe('retour et clôture', () => {
    let vente: { id: string };
    let ligneRiz: string;

    beforeAll(async () => {
      const v = {
        id: uuidv7(),
        numeroTicket: 'M01-C01-000001',
        sessionId,
        userId: d.caissier1.id,
        creeLe: new Date().toISOString(),
        remiseTicket: 500,
        lignes: [
          {
            productId: riz.id,
            libelle: 'Riz 5 kg',
            prixUnitaireTtc: 6500,
            quantite: 3,
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
        paiements: [
          { mode: 'MTN_MOMO', montant: 10_000, numeroClient: '670000000', reference: 'REF123456' },
          { mode: 'ESPECES', montant: 15_000 },
        ],
        approbations: [
          { action: 'REMISE', approuveePar: d.gerant1.id, le: new Date().toISOString() },
        ],
      };
      const r = await http()
        .post('/api/v1/sync/sales')
        .set(caisse)
        .send({
          sessions: [
            {
              id: sessionId,
              ouvertePar: d.caissier1.id,
              ouverteLe: new Date().toISOString(),
              fondDeCaisse: 10_000,
            },
          ],
          ventes: [v],
        });
      expect(r.body.ventes[0].statut).toBe('ENREGISTREE');
      vente = v;
      ligneRiz = (
        await db.saleLine.findFirstOrThrow({ where: { saleId: v.id, productId: riz.id } })
      ).id;
    });

    it('la caisse retrouve la vente par son numéro de ticket', async () => {
      const res = await http().get('/api/v1/sales/ticket/m01-c01-000001').set(caisse);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: vente.id, totalTtc: 20_500 });
    });

    it('retour refusé sans PIN de gérant valide', async () => {
      const res = await http()
        .post(`/api/v1/sales/${vente.id}/return`)
        .set(caisse)
        .send({
          sessionId,
          gerantId: d.caissier1.id,
          pin: '1234',
          motif: 'Erreur',
          lignes: [{ ligneId: ligneRiz, quantite: 1 }],
        });
      expect(res.status).toBe(403);
      const faux = await http()
        .post(`/api/v1/sales/${vente.id}/return`)
        .set(caisse)
        .send({
          sessionId,
          gerantId: d.gerant1.id,
          pin: '0000',
          motif: 'Erreur',
          lignes: [{ ligneId: ligneRiz, quantite: 1 }],
        });
      expect(faux.status).toBe(401);
    });

    it('retour partiel : remboursement au prorata, stock réintégré, journal', async () => {
      const avant = await niveau(riz.id);
      const res = await http()
        .post(`/api/v1/sales/${vente.id}/return`)
        .set(caisse)
        .send({
          sessionId,
          gerantId: d.gerant1.id,
          pin: '9999',
          motif: 'Sac abîmé',
          lignes: [{ ligneId: ligneRiz, quantite: 1 }],
        });
      expect(res.status).toBe(201);
      // Ligne riz : 19 500 brut, part de la remise du ticket 465 → 19 035 net ; 1/3 = 6345.
      expect(res.body).toMatchObject({ numeroTicket: 'M01-C01-000001-R1', rembourse: 6345 });
      expect(await niveau(riz.id)).toBe(avant + 1);
      const log = await db.auditLog.findFirstOrThrow({
        where: { action: 'RETOUR', entityId: vente.id },
      });
      expect(log.userId).toBe(d.gerant1.id);
    });

    it('on ne rend pas plus que vendu', async () => {
      const res = await http()
        .post(`/api/v1/sales/${vente.id}/return`)
        .set(caisse)
        .send({
          sessionId,
          gerantId: d.gerant1.id,
          pin: '9999',
          motif: 'Encore',
          lignes: [{ ligneId: ligneRiz, quantite: 3 }],
        });
      expect(res.status).toBe(422);
      expect(res.body.message).toBe('« Riz 5 kg » : il reste au plus 2 à reprendre.');
    });

    it('le détail de la vente montre la quantité déjà rendue', async () => {
      const res = await http().get(`/api/v1/sales/${vente.id}`).set(gerant);
      expect(res.body.lignes.find((l: { id: string }) => l.id === ligneRiz).quantiteRendue).toBe(1);
      expect(res.body.retours).toHaveLength(1);
    });

    it('clôture : écart calculé par mode, journal, puis caisse fermée', async () => {
      // Espèces attendues : 10 000 fond + (15 000 − 4 500 rendu) − 6 345 remboursés = 14 155
      const res = await http()
        .post(`/api/v1/cash-sessions/${sessionId}/close`)
        .set(caisse)
        .send({
          gerantId: d.gerant1.id,
          pin: '9999',
          compte: { ESPECES: 14_000, MTN_MOMO: 10_000 },
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        statut: 'FERMEE',
        tickets: 1,
        chiffreAffairesTtc: 20_500,
        retours: { nombre: 1, montant: 6345 },
        attendu: { ESPECES: 14_155, MTN_MOMO: 10_000, ORANGE_MONEY: 0 },
        ecart: { ESPECES: -155, MTN_MOMO: 0, ORANGE_MONEY: 0 },
        fermeePar: 'Gérant Akwa',
      });
      expect(
        await db.auditLog.count({ where: { action: 'CLOTURE_CAISSE', entityId: sessionId } }),
      ).toBe(1);
      const deuxieme = await http()
        .post(`/api/v1/cash-sessions/${sessionId}/close`)
        .set(caisse)
        .send({ gerantId: d.gerant1.id, pin: '9999', compte: { ESPECES: 0 } });
      expect(deuxieme.status).toBe(409);
      const liste = await http().get('/api/v1/cash-sessions').set(gerant);
      expect(liste.body[0]).toMatchObject({ statut: 'FERMEE', ecartEspeces: -155 });
    });

    it('pas de retour sur une caisse fermée', async () => {
      const res = await http()
        .post(`/api/v1/sales/${vente.id}/return`)
        .set(caisse)
        .send({
          sessionId,
          gerantId: d.gerant1.id,
          pin: '9999',
          motif: 'Tard',
          lignes: [{ ligneId: ligneRiz, quantite: 1 }],
        });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SESSION_FERMEE');
    });
  });
});
