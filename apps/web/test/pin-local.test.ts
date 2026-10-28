import 'fake-indexeddb/auto';
import { hacherPin } from '@caisse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/caisse/db';
import { verifierPinLocal } from '../src/caisse/pin-local';

describe('PIN vérifié sur la caisse (hors ligne)', () => {
  beforeEach(async () => {
    await db.meta.clear();
    await db.personnel.clear();
    await db.personnel.bulkPut([
      { id: 'c1', nom: 'Caissière', role: 'CAISSIER', empreintePin: await hacherPin('1234') },
      { id: 'g1', nom: 'Gérant', role: 'GERANT', empreintePin: await hacherPin('9999') },
    ]);
  });

  it('accepte le bon PIN', async () => {
    expect((await verifierPinLocal('c1', '1234')).nom).toBe('Caissière');
  });

  it('bloque après 3 erreurs, même avec le bon PIN ensuite', async () => {
    await expect(verifierPinLocal('c1', '0000')).rejects.toThrow('PIN incorrect.');
    await expect(verifierPinLocal('c1', '0001')).rejects.toThrow('PIN incorrect.');
    await expect(verifierPinLocal('c1', '0002')).rejects.toThrow('Réessayez dans 5 minutes');
    await expect(verifierPinLocal('c1', '1234')).rejects.toThrow('Trop d’erreurs');
  });

  it('exige un gérant quand la validation le demande', async () => {
    await expect(verifierPinLocal('c1', '1234', 'GERANT')).rejects.toThrow('PIN d’un gérant');
    expect((await verifierPinLocal('g1', '9999', 'GERANT')).role).toBe('GERANT');
  });
});
