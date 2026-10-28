import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase } from './setup-db.js';

const dbUrl = await prepareTestDatabase();

describe.skipIf(!dbUrl)('garde-fous de la base', () => {
  let db: PrismaClient;
  let orgId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let sessionId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: dbUrl! });
    const org = await db.organization.create({ data: { name: 'Supermarché Test' } });
    orgId = org.id;
    const store = await db.store.create({
      data: { organizationId: orgId, code: 'M01', name: 'Akwa' },
    });
    storeId = store.id;
    const reg = await db.register.create({ data: { organizationId: orgId, storeId, code: 'C01' } });
    registerId = reg.id;
    const user = await db.user.create({
      data: { organizationId: orgId, storeId, name: 'Caissier', role: 'CAISSIER' },
    });
    userId = user.id;
    const session = await db.cashSession.create({
      data: { organizationId: orgId, registerId, openedById: userId, openingFloat: 10_000 },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const vente = (id: string, ticket: string, ht: number, tva: number, ttc: number) =>
    db.sale.create({
      data: {
        id,
        organizationId: orgId,
        registerId,
        userId,
        sessionId,
        ticketNumber: ticket,
        totalHt: ht,
        totalVat: tva,
        totalTtc: ttc,
        createdAt: new Date(),
      },
    });

  it('refuse des totaux incohérents (HT + TVA ≠ TTC)', async () => {
    await expect(
      vente('0192f3a0-7c1e-7b2a-9c3d-000000000001', 'M01-C01-000001', 100, 19, 120),
    ).rejects.toThrow();
  });

  it('un même identifiant de vente ne peut être enregistré deux fois', async () => {
    const id = '0192f3a0-7c1e-7b2a-9c3d-000000000002';
    await vente(id, 'M01-C01-000002', 10_000, 1925, 11_925);
    await expect(vente(id, 'M01-C01-000003', 10_000, 1925, 11_925)).rejects.toThrow();
  });

  it('une vente ne peut pas être supprimée', async () => {
    await expect(
      db.sale.delete({ where: { id: '0192f3a0-7c1e-7b2a-9c3d-000000000002' } }),
    ).rejects.toThrow(/ne peut pas être modifiée/);
  });

  it('le journal d’audit est immuable', async () => {
    const log = await db.auditLog.create({
      data: { organizationId: orgId, userId, action: 'REMISE', entity: 'sale' },
    });
    await expect(
      db.auditLog.update({ where: { id: log.id }, data: { action: 'AUTRE' } }),
    ).rejects.toThrow(/ne peut pas être modifiée/);
    await expect(db.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(
      /ne peut pas être modifiée/,
    );
  });

  it('une facture émise ne change que par sa date d’envoi', async () => {
    const inv = await db.invoice.create({
      data: {
        organizationId: orgId,
        saleId: '0192f3a0-7c1e-7b2a-9c3d-000000000002',
        number: 'F-M01-C01-000001',
        customerName: 'Client SARL',
      },
    });
    await db.invoice.update({ where: { id: inv.id }, data: { sentAt: new Date() } });
    await expect(
      db.invoice.update({ where: { id: inv.id }, data: { customerName: 'Autre' } }),
    ).rejects.toThrow(/avoir/);
    await expect(db.invoice.delete({ where: { id: inv.id } })).rejects.toThrow();
  });
});
