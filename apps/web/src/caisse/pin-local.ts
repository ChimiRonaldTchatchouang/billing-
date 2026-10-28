import { verifierPin } from '@caisse/shared';
import { db, type Employe, ecrireMeta, lireMeta } from './db';

const ESSAIS_MAX = 3;
const BLOCAGE_MS = 5 * 60 * 1000;
const NIVEAU = { CAISSIER: 1, GERANT: 2, DIRECTEUR: 3 } as const;

interface Compteur {
  echecs: number;
  bloqueJusqua: number | null;
}

export class PinRefuse extends Error {}

/**
 * Vérifie un PIN sur la caisse, même sans réseau (décision 0004), avec la même règle que
 * l'API : 3 erreurs bloquent 5 minutes.
 */
export async function verifierPinLocal(
  userId: string,
  pin: string,
  roleMin: Employe['role'] = 'CAISSIER',
): Promise<Employe> {
  const employe = await db.personnel.get(userId);
  if (!employe) throw new PinRefuse('Employé inconnu sur ce poste.');
  const cle = `pin:${userId}`;
  const c = (await lireMeta<Compteur>(cle)) ?? { echecs: 0, bloqueJusqua: null };
  const maintenant = Date.now();
  if (c.bloqueJusqua && c.bloqueJusqua > maintenant) {
    const minutes = Math.ceil((c.bloqueJusqua - maintenant) / 60_000);
    throw new PinRefuse(
      `Trop d’erreurs de PIN. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    );
  }
  if (!(await verifierPin(pin, employe.empreintePin))) {
    const echecs = c.echecs + 1;
    if (echecs >= ESSAIS_MAX) {
      await ecrireMeta(cle, { echecs: 0, bloqueJusqua: maintenant + BLOCAGE_MS });
      throw new PinRefuse('Trop d’erreurs de PIN. Réessayez dans 5 minutes.');
    }
    await ecrireMeta(cle, { echecs, bloqueJusqua: null });
    throw new PinRefuse('PIN incorrect.');
  }
  await ecrireMeta(cle, { echecs: 0, bloqueJusqua: null });
  if (NIVEAU[employe.role] < NIVEAU[roleMin]) {
    throw new PinRefuse('Cette action doit être validée par le PIN d’un gérant.');
  }
  return employe;
}
