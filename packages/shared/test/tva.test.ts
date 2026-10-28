import { describe, expect, it } from 'vitest';
import { divArrondi, MontantInvalideError, ventilerTtc } from '../src/index.js';

describe('divArrondi', () => {
  it('arrondit au plus proche, demi vers le haut', () => {
    expect(divArrondi(10, 4)).toBe(3); // 2,5 → 3
    expect(divArrondi(9, 4)).toBe(2); // 2,25 → 2
    expect(divArrondi(11, 4)).toBe(3); // 2,75 → 3
  });
});

describe('ventilerTtc', () => {
  it('extrait la TVA à 19,25 % d’un prix TTC', () => {
    // 11 925 TTC = 10 000 HT + 1 925 TVA
    expect(ventilerTtc(11_925, 1925)).toEqual({ tauxBp: 1925, ht: 10_000, tva: 1925, ttc: 11_925 });
  });

  it('HT + TVA = TTC pour tous les montants', () => {
    for (let ttc = 0; ttc < 5000; ttc += 7) {
      const v = ventilerTtc(ttc, 1925);
      expect(v.ht + v.tva).toBe(ttc);
    }
  });

  it('taux zéro : pas de TVA', () => {
    expect(ventilerTtc(500, 0)).toEqual({ tauxBp: 0, ht: 500, tva: 0, ttc: 500 });
  });

  it('refuse un montant non entier', () => {
    expect(() => ventilerTtc(10.5, 1925)).toThrow(MontantInvalideError);
    expect(() => ventilerTtc(-1, 1925)).toThrow(MontantInvalideError);
  });
});
