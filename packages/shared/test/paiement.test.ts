import { describe, expect, it } from 'vitest';
import { calculerRendu, PaiementInvalideError } from '../src/index.js';

describe('calculerRendu', () => {
  it('rend la monnaie sur les espèces', () => {
    expect(calculerRendu(6100, [{ mode: 'ESPECES', montant: 10_000 }])).toEqual({
      totalPaye: 10_000,
      rendu: 3900,
    });
  });

  it('combine Mobile Money et espèces', () => {
    expect(
      calculerRendu(6100, [
        { mode: 'ORANGE_MONEY', montant: 5000 },
        { mode: 'ESPECES', montant: 2000 },
      ]),
    ).toEqual({ totalPaye: 7000, rendu: 900 });
  });

  it('refuse un paiement insuffisant avec le montant manquant', () => {
    expect(() => calculerRendu(6100, [{ mode: 'ESPECES', montant: 6000 }])).toThrow(
      'Il manque 100 FCFA',
    );
  });

  it('refuse un Mobile Money supérieur au total', () => {
    expect(() => calculerRendu(6100, [{ mode: 'MTN_MOMO', montant: 7000 }])).toThrow(
      PaiementInvalideError,
    );
  });
});
