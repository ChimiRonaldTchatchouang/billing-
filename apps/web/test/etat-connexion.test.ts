import { describe, expect, it } from 'vitest';
import { DELAI_HORS_LIGNE_LONG_MS, etatConnexion } from '../src/lib/etat-connexion';

const t0 = 1_000_000;

describe('etatConnexion', () => {
  it('vert : en ligne sans vente en attente', () => {
    expect(
      etatConnexion({ enLigne: true, ventesEnAttente: 0, horsLigneDepuis: null, maintenant: t0 }),
    ).toBe('EN_LIGNE');
  });

  it('orange : ventes en attente ou hors ligne depuis peu', () => {
    expect(
      etatConnexion({ enLigne: true, ventesEnAttente: 3, horsLigneDepuis: null, maintenant: t0 }),
    ).toBe('VENTES_EN_ATTENTE');
    expect(
      etatConnexion({
        enLigne: false,
        ventesEnAttente: 0,
        horsLigneDepuis: t0,
        maintenant: t0 + 60_000,
      }),
    ).toBe('VENTES_EN_ATTENTE');
  });

  it('rouge : hors ligne depuis plus de 30 minutes', () => {
    expect(
      etatConnexion({
        enLigne: false,
        ventesEnAttente: 0,
        horsLigneDepuis: t0,
        maintenant: t0 + DELAI_HORS_LIGNE_LONG_MS + 1,
      }),
    ).toBe('HORS_LIGNE_LONG');
  });
});
