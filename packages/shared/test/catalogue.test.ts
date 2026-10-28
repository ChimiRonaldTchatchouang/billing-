import { describe, expect, it } from 'vitest';
import { formaterTaux, tauxEnPointsDeBase } from '../src/index.js';

describe('taux de TVA', () => {
  it('lit un pourcentage saisi', () => {
    expect(tauxEnPointsDeBase('19,25')).toBe(1925);
    expect(tauxEnPointsDeBase('19.25 %')).toBe(1925);
    expect(tauxEnPointsDeBase('0')).toBe(0);
    expect(tauxEnPointsDeBase('5,5')).toBe(550);
    expect(tauxEnPointsDeBase(19.25)).toBe(1925);
  });

  it('refuse une saisie invalide', () => {
    expect(tauxEnPointsDeBase('dix')).toBeNull();
    expect(tauxEnPointsDeBase('19,255')).toBeNull();
    expect(tauxEnPointsDeBase('101')).toBeNull();
  });

  it('affiche en français', () => {
    expect(formaterTaux(1925)).toBe('19,25 %');
    expect(formaterTaux(0)).toBe('0 %');
    expect(formaterTaux(550)).toBe('5,5 %');
  });
});
