import { describe, expect, it } from 'vitest';
import { montantRetour } from '../src/index.js';

describe('montantRetour', () => {
  it('rembourse au prorata et la somme des retours égale le net payé', () => {
    // 3 articles pour 1000 FCFA net (remise comprise)
    const r1 = montantRetour(1000, 3, 0, 1);
    const r2 = montantRetour(1000, 3, 1, 1);
    const r3 = montantRetour(1000, 3, 2, 1);
    expect([r1, r2, r3]).toEqual([333, 333, 334]);
    expect(r1 + r2 + r3).toBe(1000);
  });

  it('refuse de rendre plus que vendu', () => {
    expect(() => montantRetour(1000, 3, 2, 2)).toThrow(RangeError);
  });
});
