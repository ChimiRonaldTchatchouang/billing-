import { describe, expect, it } from 'vitest';
import { calculerVente, montantBrut, repartirRemise, VenteInvalideError } from '../src/index.js';

const riz = { prixUnitaireTtc: 1500, quantite: 2, unite: 'PIECE', tauxTvaBp: 1925 } as const;
const huile = { prixUnitaireTtc: 2500, quantite: 1, unite: 'PIECE', tauxTvaBp: 1925 } as const;
const pain = { prixUnitaireTtc: 200, quantite: 3, unite: 'PIECE', tauxTvaBp: 0 } as const;

describe('montantBrut', () => {
  it('multiplie prix et quantité', () => {
    expect(montantBrut(riz)).toBe(3000);
  });

  it('article au poids : quantité en grammes', () => {
    // 1 250 g de viande à 4 000 FCFA/kg = 5 000
    expect(montantBrut({ prixUnitaireTtc: 4000, quantite: 1250, unite: 'KG', tauxTvaBp: 0 })).toBe(
      5000,
    );
    // 333 g à 1 000 FCFA/kg = 333
    expect(montantBrut({ prixUnitaireTtc: 1000, quantite: 333, unite: 'KG', tauxTvaBp: 0 })).toBe(
      333,
    );
  });

  it('refuse une quantité nulle', () => {
    expect(() => montantBrut({ ...riz, quantite: 0 })).toThrow(VenteInvalideError);
  });
});

describe('repartirRemise', () => {
  it('répartit au prorata et la somme est exacte', () => {
    const parts = repartirRemise([3000, 2500, 600], 1000);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([493, 409, 98]);
  });

  it('refuse une remise supérieure au total', () => {
    expect(() => repartirRemise([100], 101)).toThrow(VenteInvalideError);
  });
});

describe('calculerVente', () => {
  it('calcule les totaux et la TVA par taux', () => {
    const v = calculerVente([riz, huile, pain]);
    expect(v.ttc).toBe(6100);
    expect(v.brut).toBe(6100);
    expect(v.remise).toBe(0);
    expect(v.parTaux).toEqual([
      { tauxBp: 0, ht: 600, tva: 0, ttc: 600 },
      { tauxBp: 1925, ht: 4612, tva: 888, ttc: 5500 },
    ]);
    expect(v.ht + v.tva).toBe(v.ttc);
  });

  it('applique remises de ligne et de ticket', () => {
    const v = calculerVente([{ ...riz, remise: 500 }, huile], 1000);
    expect(v.brut).toBe(5500);
    expect(v.remise).toBe(1500);
    expect(v.ttc).toBe(4000);
    expect(v.lignes.map((l) => l.net)).toEqual([2000, 2000]);
  });

  it('refuse une vente vide', () => {
    expect(() => calculerVente([])).toThrow(VenteInvalideError);
  });

  it('refuse une remise de ligne supérieure à la ligne', () => {
    expect(() => calculerVente([{ ...pain, remise: 601 }])).toThrow(VenteInvalideError);
  });
});
