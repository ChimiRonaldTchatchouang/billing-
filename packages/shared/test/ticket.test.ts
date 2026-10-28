import { describe, expect, it } from 'vitest';
import { formaterNumeroTicket, lireNumeroTicket, venteSyncSchema } from '../src/index.js';

describe('numéro de ticket', () => {
  it('formate et relit', () => {
    expect(formaterNumeroTicket('M01', 'C02', 123)).toBe('M01-C02-000123');
    expect(lireNumeroTicket('M01-C02-000123')).toEqual({
      magasin: 'M01',
      caisse: 'C02',
      sequence: 123,
    });
  });

  it('refuse les codes invalides', () => {
    expect(() => formaterNumeroTicket('01', 'C02', 1)).toThrow(RangeError);
    expect(() => formaterNumeroTicket('M01', 'C02', 0)).toThrow(RangeError);
    expect(lireNumeroTicket('nimporte')).toBeNull();
  });
});

describe('venteSyncSchema', () => {
  const vente = {
    id: '0192f3a0-7c1e-7b2a-9c3d-4e5f6a7b8c9d',
    numeroTicket: 'M01-C02-000001',
    sessionId: '7d444840-9dc0-41a4-8b1c-2b7d4c9e1f00',
    userId: '7d444840-9dc0-41a4-8b1c-2b7d4c9e1f02',
    creeLe: '2026-10-28T09:15:00+01:00',
    lignes: [
      {
        productId: '7d444840-9dc0-41a4-8b1c-2b7d4c9e1f01',
        libelle: 'Riz 1 kg',
        prixUnitaireTtc: 1500,
        quantite: 2,
        unite: 'PIECE',
        tauxTvaBp: 1925,
      },
    ],
    paiements: [{ mode: 'ESPECES', montant: 3000 }],
  };

  it('accepte une vente valide', () => {
    expect(venteSyncSchema.safeParse(vente).success).toBe(true);
  });

  it('refuse un montant décimal', () => {
    const r = venteSyncSchema.safeParse({
      ...vente,
      paiements: [{ mode: 'ESPECES', montant: 3000.5 }],
    });
    expect(r.success).toBe(false);
  });

  it('refuse un identifiant qui n’est pas un UUID v7', () => {
    expect(venteSyncSchema.safeParse({ ...vente, id: vente.sessionId }).success).toBe(false);
  });
});
