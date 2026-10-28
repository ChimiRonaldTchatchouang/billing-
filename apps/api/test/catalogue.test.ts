import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyserLignes, lireCsv } from '../src/catalogue/import.js';
import { createTestApp, enregistrerCaisse, jeton, jeuDeBase } from './helpers.js';
import { prepareTestDatabase } from './setup-db.js';

describe('lecture des fichiers d’import', () => {
  it('lit un CSV au point-virgule avec guillemets', () => {
    expect(lireCsv('code_barres;nom;prix_ttc\r\n123;"Riz; 5 kg";6 500\n')).toEqual([
      ['code_barres', 'nom', 'prix_ttc'],
      ['123', 'Riz; 5 kg', '6 500'],
    ]);
  });

  it('signale chaque ligne fautive avec son numéro', () => {
    const { erreurs } = analyserLignes([
      ['Code-barres', 'Désignation', 'Prix TTC', 'TVA', 'Unité'],
      ['111', 'Riz', '6500', '19,25', 'PIECE'],
      ['222', 'Huile', '1500,50', '19,25', 'PIECE'],
      ['333', 'Sucre', '1000', 'dix', 'sac'],
      ['111', 'Riz bis', '100', '0', ''],
    ]);
    expect(erreurs).toEqual([
      { ligne: 3, message: 'prix TTC invalide (nombre entier de FCFA attendu)' },
      { ligne: 4, message: 'taux de TVA invalide (ex. 19,25 ou 0) ; unité invalide (PIECE ou KG)' },
      { ligne: 5, message: 'code-barres déjà présent ligne 2' },
    ]);
  });

  it('exige les colonnes obligatoires', () => {
    expect(analyserLignes([['nom', 'prix']]).erreurs[0]?.message).toBe(
      'Colonne « code_barres » introuvable dans la première ligne.',
    );
  });
});

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('catalogue', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let d: Awaited<ReturnType<typeof jeuDeBase>>;
  let tGerant: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(dbUrl!);
    db = new PrismaClient({ datasourceUrl: dbUrl! });
    d = await jeuDeBase(db);
    tGerant = await jeton(app, 'gerant1@test.cm');
  });
  afterAll(async () => {
    await db.$disconnect();
    await app.close();
  });

  const article = {
    codeBarres: '6001234000011',
    nom: 'Riz parfumé 5 kg',
    tauxTvaBp: 1925,
    prixTtc: 6500,
  };

  it('un gérant crée un article ; un code-barres en double est refusé', async () => {
    const ok = await http()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tGerant}`)
      .send(article);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ nom: 'Riz parfumé 5 kg', unite: 'PIECE', prixTtc: 6500 });
    const doublon = await http()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tGerant}`)
      .send(article);
    expect(doublon.status).toBe(409);
    expect(doublon.body.message).toBe(
      'Le code-barres 6001234000011 est déjà utilisé par un autre article.',
    );
  });

  it('refuse un prix décimal', async () => {
    const res = await http()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tGerant}`)
      .send({ ...article, codeBarres: '999', prixTtc: 10.5 });
    expect(res.status).toBe(400);
  });

  it('un caissier lit le catalogue mais ne le modifie pas', async () => {
    const t = await jeton(app, 'caissier1@test.cm');
    const lecture = await http()
      .get('/api/v1/products?recherche=riz')
      .set('Authorization', `Bearer ${t}`);
    expect(lecture.body.total).toBe(1);
    await http()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${t}`)
      .send({ ...article, codeBarres: '777' })
      .expect(403);
  });

  it('un changement de prix est inscrit au journal', async () => {
    const p = await db.product.findFirstOrThrow({ where: { barcode: article.codeBarres } });
    await http()
      .patch(`/api/v1/products/${p.id}`)
      .set('Authorization', `Bearer ${tGerant}`)
      .send({ prixTtc: 6800 })
      .expect(200);
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'PRIX_MODIFIE', entityId: p.id },
    });
    expect(log.before).toMatchObject({ prixTtc: 6500 });
    expect(log.after).toMatchObject({ prixTtc: 6800 });
  });

  it('import CSV : crée et met à jour par code-barres, crée les catégories', async () => {
    const csv =
      'code_barres;nom;prix_ttc;taux_tva;unite;categorie;seuil_alerte\n6001234000011;Riz parfumé 5 kg;7000;19,25;PIECE;Épicerie;10\n2000000000107;Tomates;800;0;KG;Fruits et légumes;\n';
    const res = await http()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${tGerant}`)
      .attach('fichier', Buffer.from(csv), 'articles.csv');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ crees: 1, modifies: 1 });
    const tomates = await db.product.findFirstOrThrow({
      where: { barcode: '2000000000107' },
      include: { category: true },
    });
    expect(tomates).toMatchObject({ unit: 'KG', vatRateBp: 0, priceTtc: 800 });
    expect(tomates.category?.name).toBe('Fruits et légumes');
  });

  it('import Excel avec une erreur : rien n’est importé', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Articles');
    ws.addRow(['code_barres', 'nom', 'prix_ttc']);
    ws.addRow(['5550001', 'Savon', 350]);
    ws.addRow(['5550002', '', 500]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await http()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${tGerant}`)
      .attach('fichier', buffer, 'articles.xlsx');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IMPORT_INVALIDE');
    expect(res.body.details).toEqual([{ ligne: 3, message: 'Le nom est obligatoire.' }]);
    expect(await db.product.count({ where: { barcode: '5550001' } })).toBe(0);
  });

  it('import Excel valide', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Articles');
    ws.addRow(['Code-barres', 'Désignation', 'Prix TTC', 'TVA']);
    ws.addRow(['5550001', 'Savon', 350, 19.25]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await http()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${tGerant}`)
      .attach('fichier', buffer, 'articles.xlsx');
    expect(res.body).toEqual({ crees: 1, modifies: 0 });
  });

  it('refuse un format inconnu', async () => {
    const res = await http()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${tGerant}`)
      .attach('fichier', Buffer.from('x'), 'articles.pdf');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('FORMAT_NON_SUPPORTE');
  });

  it('synchronisation du catalogue par pages, puis seulement les modifications', async () => {
    const jetonCaisse = await enregistrerCaisse(app, tGerant, d.c1.id);
    const auth = { Authorization: `Caisse ${jetonCaisse}` };
    const page1 = await http().get('/api/v1/sync/catalog?limite=2').set(auth);
    expect(page1.body.articles).toHaveLength(2);
    expect(page1.body.suivant).not.toBeNull();
    const page2 = await http()
      .get('/api/v1/sync/catalog')
      .query({ limite: 2, since: page1.body.suivant.depuis, apresId: page1.body.suivant.apresId })
      .set(auth);
    expect(page2.body.articles).toHaveLength(1);
    expect(page2.body.suivant).toBeNull();
    const ids = [...page1.body.articles, ...page2.body.articles].map((a: { id: string }) => a.id);
    expect(new Set(ids).size).toBe(3);

    const curseur = page2.body.curseur;
    const rien = await http()
      .get('/api/v1/sync/catalog')
      .query({ since: curseur.depuis, apresId: curseur.apresId })
      .set(auth);
    expect(rien.body.articles).toHaveLength(0);

    const savon = await db.product.findFirstOrThrow({ where: { barcode: '5550001' } });
    await http()
      .patch(`/api/v1/products/${savon.id}`)
      .set('Authorization', `Bearer ${tGerant}`)
      .send({ actif: false })
      .expect(200);
    const modif = await http()
      .get('/api/v1/sync/catalog')
      .query({ since: curseur.depuis, apresId: curseur.apresId })
      .set(auth);
    expect(modif.body.articles).toEqual([
      expect.objectContaining({ codeBarres: '5550001', actif: false }),
    ]);
  });
});
