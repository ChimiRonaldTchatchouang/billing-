import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '@caisse/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { aujourdhui } from '../src/rapports/rapports.service.js';
import { createTestApp, enregistrerCaisse, jeton, jeuDeBase, MDP } from './helpers.js';
import { prepareTestDatabase } from './setup-db.js';

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('factures, paiements, rapports, mot de passe', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let d: Awaited<ReturnType<typeof jeuDeBase>>;
  let caisse: { Authorization: string };
  let gerant: { Authorization: string };
  let boite: MailService['boite'];
  const sessionId = uuidv7();
  const venteId = uuidv7();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(dbUrl!);
    boite = app.get(MailService).boite;
    db = new PrismaClient({ datasourceUrl: dbUrl! });
    d = await jeuDeBase(db);
    await db.organization.update({ where: { id: d.org.id }, data: { rccm: 'RC/DLA/2020/B/1234' } });
    const t = await jeton(app, 'gerant1@test.cm');
    gerant = { Authorization: `Bearer ${t}` };
    caisse = { Authorization: `Caisse ${await enregistrerCaisse(app, t, d.c1.id)}` };
    const riz = await db.product.create({
      data: {
        organizationId: d.org.id,
        barcode: '111',
        name: 'Riz 5 kg',
        priceTtc: 6500,
        vatRateBp: 1925,
        alertThreshold: 5,
      },
    });
    const pain = await db.product.create({
      data: { organizationId: d.org.id, barcode: '333', name: 'Pain', priceTtc: 200, vatRateBp: 0 },
    });
    const r = await http()
      .post('/api/v1/sync/sales')
      .set(caisse)
      .send({
        sessions: [
          {
            id: sessionId,
            ouvertePar: d.caissier1.id,
            ouverteLe: new Date().toISOString(),
            fondDeCaisse: 0,
          },
        ],
        ventes: [
          {
            id: venteId,
            numeroTicket: 'M01-C01-000001',
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
                productId: pain.id,
                libelle: 'Pain',
                prixUnitaireTtc: 200,
                quantite: 5,
                unite: 'PIECE',
                tauxTvaBp: 0,
              },
            ],
            paiements: [
              {
                mode: 'ORANGE_MONEY',
                montant: 10_000,
                numeroClient: '690000000',
                reference: 'OM-REF-0001',
              },
              { mode: 'ESPECES', montant: 5000 },
            ],
          },
        ],
      });
    expect(r.body.ventes[0].statut).toBe('ENREGISTREE');
  });
  afterAll(async () => {
    await db.$disconnect();
    await app.close();
  });

  describe('factures', () => {
    let factureId: string;

    it('émet une facture numérotée FA-000001, inscrite au journal', async () => {
      const res = await http()
        .post(`/api/v1/sales/${venteId}/invoice`)
        .set(caisse)
        .send({
          client: {
            raisonSociale: 'Hôtel du Wouri SARL',
            niu: 'P098765432109Z',
            adresse: 'Bonanjo, Douala',
            email: 'compta@wouri.cm',
          },
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        numero: 'FA-000001',
        type: 'FACTURE',
        totalTtc: 14_000,
        client: { niu: 'P098765432109Z' },
      });
      factureId = res.body.id;
      expect(
        await db.auditLog.count({ where: { action: 'FACTURE_EMISE', entityId: factureId } }),
      ).toBe(1);
    });

    it('une vente n’a qu’une facture', async () => {
      const res = await http()
        .post(`/api/v1/sales/${venteId}/invoice`)
        .set(gerant)
        .send({ client: { raisonSociale: 'Autre' } });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Cette vente a déjà la facture FA-000001.');
    });

    it('génère le PDF', async () => {
      const res = await http()
        .get(`/api/v1/invoices/${factureId}/pdf`)
        .set(gerant)
        .buffer(true)
        .parse((r, cb) => {
          const morceaux: Buffer[] = [];
          r.on('data', (c: Buffer) => morceaux.push(c));
          r.on('end', () => cb(null, Buffer.concat(morceaux)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('lien signé : valable, puis refusé s’il est altéré ; lien WhatsApp prérempli', async () => {
      const lien = await http().post(`/api/v1/invoices/${factureId}/link`).set(caisse);
      expect(lien.status).toBe(201);
      expect(lien.body.whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
      const chemin = new URL(lien.body.url);
      const ok = await http().get(chemin.pathname + chemin.search);
      expect(ok.status).toBe(200);
      const altere = await http().get(
        chemin.pathname +
          chemin.search.replace(/sig=(.)/, (_, c: string) => `sig=${c === 'A' ? 'B' : 'A'}`),
      );
      expect(altere.status).toBe(403);
      expect(altere.body.message).toBe(
        'Ce lien n’est plus valable. Demandez un nouveau lien au magasin.',
      );
    });

    it('envoi par e-mail avec le PDF joint ; la date d’envoi est enregistrée', async () => {
      const res = await http().post(`/api/v1/invoices/${factureId}/send`).set(gerant).send({});
      expect(res.status).toBe(201);
      expect(res.body.envoyeeLe).not.toBeNull();
      const m = boite.at(-1)!;
      expect(m).toMatchObject({
        a: 'compta@wouri.cm',
        sujet: 'Facture FA-000001 — Supermarché Test',
      });
      expect(m.pieceJointe?.nom).toBe('FA-000001.pdf');
    });

    it('une facture émise ne peut pas être modifiée en base', async () => {
      await expect(
        db.invoice.update({ where: { id: factureId }, data: { customerName: 'X' } }),
      ).rejects.toThrow(/avoir/);
    });

    it('un retour sur une vente facturée donne un avoir AV-000001', async () => {
      const ligne = await db.saleLine.findFirstOrThrow({
        where: { saleId: venteId, label: 'Pain' },
      });
      const retour = await http()
        .post(`/api/v1/sales/${venteId}/return`)
        .set(caisse)
        .send({
          sessionId,
          gerantId: d.gerant1.id,
          pin: '9999',
          motif: 'Pain rassis',
          lignes: [{ ligneId: ligne.id, quantite: 2 }],
        });
      expect(retour.status).toBe(201);
      const avoir = await http()
        .post(`/api/v1/sales/${retour.body.id}/invoice`)
        .set(caisse)
        .send({ client: { raisonSociale: 'ignoré' } });
      expect(avoir.status).toBe(201);
      expect(avoir.body).toMatchObject({
        numero: 'AV-000001',
        type: 'AVOIR',
        totalTtc: 400,
        client: { raisonSociale: 'Hôtel du Wouri SARL' },
      });
    });
  });

  describe('rapprochement Mobile Money', () => {
    it('liste les paiements à rapprocher puis les marque', async () => {
      const liste = await http().get('/api/v1/payments').set(gerant);
      expect(liste.body).toEqual([
        expect.objectContaining({
          mode: 'ORANGE_MONEY',
          montant: 10_000,
          reference: 'OM-REF-0001',
          ticket: 'M01-C01-000001',
          statut: 'A_RAPPROCHER',
        }),
      ]);
      const id = liste.body[0].id;
      const res = await http()
        .patch(`/api/v1/payments/${id}/reconcile`)
        .set(gerant)
        .send({ statut: 'ECART', note: 'Absent du relevé Orange' });
      expect(res.body).toEqual({ traites: 1 });
      const ecarts = await http().get('/api/v1/payments?statut=ECART').set(gerant);
      expect(ecarts.body[0]).toMatchObject({ statut: 'ECART', note: 'Absent du relevé Orange' });
      expect(await db.auditLog.count({ where: { action: 'PAIEMENT_ECART', entityId: id } })).toBe(
        1,
      );
    });

    it('un gérant d’un autre magasin ne voit rien', async () => {
      const t = await jeton(app, 'gerant2@test.cm');
      const res = await http()
        .get('/api/v1/payments?statut=ECART')
        .set('Authorization', `Bearer ${t}`);
      expect(res.body).toEqual([]);
    });
  });

  describe('rapports', () => {
    it('tableau de bord du jour', async () => {
      const res = await http().get('/api/v1/reports/dashboard').set(gerant);
      expect(res.status).toBe(200);
      expect(res.body.ventes).toMatchObject({
        tickets: 1,
        chiffreAffairesTtc: 14_000,
        retours: 400,
        net: 13_600,
        panierMoyen: 14_000,
      });
      expect(res.body.septJours).toHaveLength(7);
      expect(res.body.septJours[6]).toEqual({ jour: aujourdhui(), net: 13_600 });
      expect(res.body.meilleursArticles[0]).toMatchObject({
        nom: 'Riz 5 kg',
        quantite: 2,
        ttc: 13_000,
      });
      expect(res.body.alertes).toMatchObject({
        stockNegatif: 2,
        mobileMoneyARapprocher: { nombre: 0 },
      });
      expect(res.body.alertes.caissesOuvertes).toHaveLength(1);
    });

    it('ventes de la période : par jour, par mode, par taux de TVA', async () => {
      const jour = aujourdhui();
      const res = await http().get(`/api/v1/reports/sales?du=${jour}&au=${jour}`).set(gerant);
      expect(res.body.totaux).toMatchObject({ tickets: 1, ttc: 14_000, retours: 400, net: 13_600 });
      expect(res.body.parMode).toEqual(
        expect.arrayContaining([
          { mode: 'ESPECES', encaisse: 4000, rembourse: 400, net: 3600 },
          { mode: 'ORANGE_MONEY', encaisse: 10_000, rembourse: 0, net: 10_000 },
        ]),
      );
      expect(res.body.parTaux).toEqual([
        { tauxBp: 0, ht: 600, tva: 0, ttc: 600 },
        { tauxBp: 1925, ht: 10_901, tva: 2099, ttc: 13_000 },
      ]);
    });

    it('export CSV ouvrable dans Excel', async () => {
      const jour = aujourdhui();
      const res = await http()
        .get(`/api/v1/reports/sales/export?du=${jour}&au=${jour}`)
        .set(gerant);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lignes = res.text
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lignes[0]).toBe(
        'Date;Ticket;Magasin;Caisse;Caissier;Type;Article;Code-barres;Quantité;Unité;PU TTC;Remise;TVA (%);Total TTC',
      );
      expect(lignes).toHaveLength(4);
      expect(lignes.at(-1)).toMatch(/Retour;Pain;333;2;pièce;200;0;0;-400$/);
    });

    it('période invalide', async () => {
      const res = await http().get('/api/v1/reports/sales?du=2026-10-10&au=2026-10-01').set(gerant);
      expect(res.status).toBe(422);
    });
  });

  describe('organisation et mot de passe', () => {
    it('le directeur renseigne le RCCM et le NIU', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http()
        .patch('/api/v1/organization')
        .set('Authorization', `Bearer ${t}`)
        .send({ rccm: 'RC/DLA/2021/B/9999' });
      expect(res.body).toMatchObject({ rccm: 'RC/DLA/2021/B/9999', niu: 'M0123456789' });
      await http().patch('/api/v1/organization').set(gerant).send({ rccm: 'x' }).expect(403);
    });

    it('mot de passe oublié : lien par e-mail, nouveau mot de passe, ancien refusé', async () => {
      await http().post('/api/v1/auth/forgot').send({ email: 'inconnu@test.cm' }).expect(204);
      const avant = boite.length;
      await http().post('/api/v1/auth/forgot').send({ email: 'gerant2@test.cm' }).expect(204);
      expect(boite.length).toBe(avant + 1);
      const jetonReset = /jeton=([\w-]+)/.exec(boite.at(-1)!.html)![1]!;
      await http()
        .post('/api/v1/auth/reset')
        .send({ jeton: jetonReset, motDePasse: 'nouveau-mot-de-passe' })
        .expect(204);
      await http()
        .post('/api/v1/auth/reset')
        .send({ jeton: jetonReset, motDePasse: 'encore-un-autre' })
        .expect(422);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'gerant2@test.cm', motDePasse: MDP })
        .expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'gerant2@test.cm', motDePasse: 'nouveau-mot-de-passe' })
        .expect(200);
    });
  });
});
