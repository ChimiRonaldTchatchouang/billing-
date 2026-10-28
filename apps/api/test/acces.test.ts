import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, enregistrerCaisse, jeton, jeuDeBase, MDP } from './helpers.js';
import { prepareTestDatabase } from './setup-db.js';

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('accès : connexion, rôles, caisses, utilisateurs', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let d: Awaited<ReturnType<typeof jeuDeBase>>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(dbUrl!);
    db = new PrismaClient({ datasourceUrl: dbUrl! });
    d = await jeuDeBase(db);
  });
  afterAll(async () => {
    await db.$disconnect();
    await app.close();
  });

  describe('connexion', () => {
    it('refuse un mauvais mot de passe, en français', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'directeur@test.cm', motDePasse: 'faux' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        code: 'IDENTIFIANTS_INCORRECTS',
        message: 'E-mail ou mot de passe incorrect.',
      });
    });

    it('valide le corps de la requête', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: 'pas-un-email' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REQUETE_INVALIDE');
      expect(res.body.details.map((x: { champ: string }) => x.champ)).toContain('email');
    });

    it('connecte, renvoie le profil, et inscrit la connexion au journal', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'DIRECTEUR@test.cm', motDePasse: MDP });
      expect(res.status).toBe(200);
      expect(res.body.expiresIn).toBe(900);
      const me = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.body).toMatchObject({ nom: 'Directrice', role: 'DIRECTEUR', magasin: null });
      expect(
        await db.auditLog.count({ where: { action: 'CONNEXION', userId: d.directeur.id } }),
      ).toBeGreaterThan(0);
    });

    it('renouvelle les jetons ; un jeton réutilisé révoque toute la session', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'gerant1@test.cm', motDePasse: MDP });
      const r1 = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      expect(r1.status).toBe(200);
      const reutilise = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      expect(reutilise.status).toBe(401);
      const r2 = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1.body.refreshToken });
      expect(r2.status).toBe(401);
    });

    it('déconnexion : le jeton de renouvellement ne sert plus', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'gerant1@test.cm', motDePasse: MDP });
      await http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });

    it('sans jeton : 401', async () => {
      const res = await http().get('/api/v1/stores');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NON_CONNECTE');
    });
  });

  describe('rôles et magasins', () => {
    it('un gérant ne voit que son magasin', async () => {
      const t = await jeton(app, 'gerant1@test.cm');
      const res = await http().get('/api/v1/stores').set('Authorization', `Bearer ${t}`);
      expect(res.body.map((s: { code: string }) => s.code)).toEqual(['M01']);
    });

    it('le directeur voit tous les magasins', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http().get('/api/v1/stores').set('Authorization', `Bearer ${t}`);
      expect(res.body.map((s: { code: string }) => s.code)).toEqual(['M01', 'M02']);
    });

    it('un gérant ne peut pas demander les caisses d’un autre magasin', async () => {
      const t = await jeton(app, 'gerant1@test.cm');
      const res = await http()
        .get(`/api/v1/registers?storeId=${d.m2.id}`)
        .set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Vous n’avez accès qu’aux données de votre magasin.');
    });

    it('un caissier ne peut pas créer de magasin', async () => {
      const t = await jeton(app, 'caissier1@test.cm');
      const res = await http()
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${t}`)
        .send({ code: 'M09', nom: 'X' });
      expect(res.status).toBe(403);
    });

    it('le directeur crée un magasin ; un code en double est refusé', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const ok = await http()
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${t}`)
        .send({ code: 'M03', nom: 'Bali' });
      expect(ok.status).toBe(201);
      const doublon = await http()
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${t}`)
        .send({ code: 'M03', nom: 'Bis' });
      expect(doublon.status).toBe(409);
      expect(doublon.body.code).toBe('CODE_DEJA_UTILISE');
    });
  });

  describe('enregistrement d’une caisse et PIN', () => {
    let jetonCaisse: string;

    beforeAll(async () => {
      jetonCaisse = await enregistrerCaisse(app, await jeton(app, 'gerant1@test.cm'), d.c1.id);
    });

    it('le code ne sert qu’une fois', async () => {
      const t = await jeton(app, 'gerant1@test.cm');
      const code = await http()
        .post(`/api/v1/registers/${d.c1.id}/enroll`)
        .set('Authorization', `Bearer ${t}`);
      expect(code.body.code).toMatch(/^[A-Z2-9]{8}$/);
      const premier = await http()
        .post('/api/v1/registers/activate')
        .send({ code: code.body.code });
      expect(premier.status).toBe(200);
      expect(premier.body).toMatchObject({ caisse: { code: 'C01' }, magasin: { code: 'M01' } });
      const second = await http().post('/api/v1/registers/activate').send({ code: code.body.code });
      expect(second.status).toBe(422);
      // Le nouvel enregistrement révoque l'ancien poste.
      const ancien = await http()
        .get('/api/v1/sync/staff')
        .set('Authorization', `Caisse ${jetonCaisse}`);
      expect(ancien.status).toBe(401);
      jetonCaisse = premier.body.jetonAppareil;
    });

    it('la caisse obtient le personnel de son magasin et les empreintes de PIN', async () => {
      const res = await http()
        .get('/api/v1/sync/staff')
        .set('Authorization', `Caisse ${jetonCaisse}`);
      expect(res.status).toBe(200);
      const noms = res.body.map((u: { nom: string }) => u.nom);
      expect(noms).toEqual(expect.arrayContaining(['Caissière Akwa', 'Gérant Akwa', 'Directrice']));
      expect(noms).not.toContain('Gérant Bonamoussadi');
      expect(res.body[0].empreintePin).toMatch(/^pbkdf2-sha256\$/);
    });

    it('une caisse ne peut pas utiliser le back-office', async () => {
      const res = await http().get('/api/v1/users').set('Authorization', `Caisse ${jetonCaisse}`);
      expect(res.status).toBe(403);
    });

    it('un jeton d’appareil faux est refusé', async () => {
      const res = await http()
        .get('/api/v1/sync/staff')
        .set('Authorization', `Caisse ${d.c1.id}.faux`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('CAISSE_NON_ENREGISTREE');
    });

    it('PIN correct : jetons liés à la caisse', async () => {
      const res = await http()
        .post('/api/v1/auth/pin')
        .set('Authorization', `Caisse ${jetonCaisse}`)
        .send({ userId: d.caissier1.id, pin: '1234' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('le PIN d’un employé d’un autre magasin est refusé', async () => {
      const res = await http()
        .post('/api/v1/auth/pin')
        .set('Authorization', `Caisse ${jetonCaisse}`)
        .send({ userId: d.gerant2.id, pin: '8888' });
      expect(res.status).toBe(401);
    });

    it('3 erreurs de PIN bloquent 5 minutes, et c’est inscrit au journal', async () => {
      const essai = (pin: string) =>
        http()
          .post('/api/v1/auth/pin')
          .set('Authorization', `Caisse ${jetonCaisse}`)
          .send({ userId: d.caissier1.id, pin });
      expect((await essai('0001')).status).toBe(401);
      expect((await essai('0002')).status).toBe(401);
      const troisieme = await essai('0003');
      expect(troisieme.status).toBe(429);
      expect(troisieme.body.code).toBe('PIN_BLOQUE');
      const bonPin = await essai('1234');
      expect(bonPin.status).toBe(429);
      expect(bonPin.body.message).toMatch(/Réessayez dans 5 minutes/);
      expect(
        await db.auditLog.count({ where: { action: 'PIN_BLOQUE', userId: d.caissier1.id } }),
      ).toBe(1);
      await db.user.update({ where: { id: d.caissier1.id }, data: { lockedUntil: null } });
    });

    it('une caisse désactivée ne peut plus se synchroniser', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      await http()
        .patch(`/api/v1/registers/${d.c1.id}`)
        .set('Authorization', `Bearer ${t}`)
        .send({ actif: false })
        .expect(204);
      await http()
        .get('/api/v1/sync/staff')
        .set('Authorization', `Caisse ${jetonCaisse}`)
        .expect(401);
      await http()
        .patch(`/api/v1/registers/${d.c1.id}`)
        .set('Authorization', `Bearer ${t}`)
        .send({ actif: true })
        .expect(204);
    });
  });

  describe('utilisateurs', () => {
    it('un caissier sans PIN est refusé avec un message clair', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${t}`)
        .send({ nom: 'Paul', role: 'CAISSIER', storeId: d.m1.id });
      expect(res.status).toBe(400);
      expect(res.body.details).toContainEqual({
        champ: 'pin',
        message: 'Un PIN est obligatoire pour utiliser la caisse.',
      });
    });

    it('crée un caissier, sans exposer d’empreinte', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${t}`)
        .send({ nom: 'Paul', role: 'CAISSIER', storeId: d.m1.id, pin: '4321' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ nom: 'Paul', aUnPin: true, magasin: { code: 'M01' } });
      expect(JSON.stringify(res.body)).not.toMatch(/pbkdf2|argon/);
      expect(
        await db.auditLog.count({ where: { action: 'UTILISATEUR_CREE', entityId: res.body.id } }),
      ).toBe(1);
    });

    it('refuse un e-mail déjà utilisé', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http().post('/api/v1/users').set('Authorization', `Bearer ${t}`).send({
        nom: 'Doublon',
        role: 'GERANT',
        storeId: d.m1.id,
        email: 'gerant1@test.cm',
        motDePasse: 'un-mot-de-passe',
        pin: '1111',
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_DEJA_UTILISE');
    });

    it('désactiver un utilisateur coupe immédiatement son accès', async () => {
      const tDir = await jeton(app, 'directeur@test.cm');
      const tGer = await jeton(app, 'gerant2@test.cm');
      await http()
        .patch(`/api/v1/users/${d.gerant2.id}`)
        .set('Authorization', `Bearer ${tDir}`)
        .send({ actif: false })
        .expect(200);
      await http().get('/api/v1/stores').set('Authorization', `Bearer ${tGer}`).expect(401);
    });

    it('le directeur ne peut pas se désactiver lui-même', async () => {
      const t = await jeton(app, 'directeur@test.cm');
      const res = await http()
        .patch(`/api/v1/users/${d.directeur.id}`)
        .set('Authorization', `Bearer ${t}`)
        .send({ actif: false });
      expect(res.status).toBe(422);
    });

    it('un gérant n’a pas accès à la gestion des utilisateurs', async () => {
      const t = await jeton(app, 'gerant1@test.cm');
      await http().get('/api/v1/users').set('Authorization', `Bearer ${t}`).expect(403);
    });
  });
});
