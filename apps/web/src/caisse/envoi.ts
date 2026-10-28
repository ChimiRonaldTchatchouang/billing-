import type { ResultatSync } from '@caisse/shared';
import { api } from '../lib/api';
import { db } from './db';

const LOT_MAX = 50;
const CONSERVATION_MS = 7 * 24 * 60 * 60 * 1000;

let enCours: Promise<number> | null = null;

/**
 * Envoie à l'API les ouvertures de session, ventes et événements en attente. Les ventes
 * confirmées (ou déjà reçues) passent à « ENVOYEE » ; celles que le serveur rejette restent
 * sur la caisse avec le motif, pour qu'un gérant les voie. Renvoie le nombre d'éléments envoyés.
 */
export function envoyerEnAttente(): Promise<number> {
  enCours ??= (async () => {
    try {
      let total = 0;
      for (;;) {
        const sessions = await db.sessions.where('envoyee').equals(0).toArray();
        const ventes = await db.ventes.where('statut').equals('EN_ATTENTE').sortBy('creeLe');
        const evenements = await db.evenements.where('envoye').equals(0).limit(LOT_MAX).toArray();
        const lot = ventes.slice(0, LOT_MAX);
        if (sessions.length + lot.length + evenements.length === 0) break;

        const r = await api<ResultatSync>('/sync/sales', {
          auth: 'caisse',
          body: {
            sessions: sessions.map((s) => ({
              id: s.id,
              ouvertePar: s.ouvertePar,
              ouverteLe: s.ouverteLe,
              fondDeCaisse: s.fondDeCaisse,
            })),
            ventes: lot.map((v) => v.vente),
            evenements: evenements.map((e) => e.evenement),
          },
        });
        const maintenant = new Date().toISOString();
        await db.transaction('rw', db.sessions, db.ventes, db.evenements, async () => {
          for (const s of r.sessions)
            if (s.statut !== 'REJETEE') await db.sessions.update(s.id, { envoyee: 1 });
          for (const v of r.ventes) {
            await db.ventes.update(
              v.id,
              v.statut === 'REJETEE'
                ? { statut: 'REJETEE', erreur: v.message }
                : { statut: 'ENVOYEE', envoyeeLe: maintenant, erreur: undefined },
            );
          }
          for (const e of r.evenements) await db.evenements.update(e.id, { envoye: 1 });
        });
        total += r.ventes.length;
        // Une session rejetée bloquerait la boucle : on s'arrête si rien n'a avancé.
        if (
          r.ventes.length === 0 &&
          r.evenements.length === 0 &&
          r.sessions.every((s) => s.statut === 'REJETEE')
        )
          break;
        if (ventes.length <= LOT_MAX && evenements.length < LOT_MAX) break;
      }
      await purger();
      return total;
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

/** Les ventes confirmées restent 7 jours pour la réimpression, puis sont effacées du poste. */
export async function purger(maintenant = Date.now()): Promise<void> {
  const limite = new Date(maintenant - CONSERVATION_MS).toISOString();
  await db.ventes
    .where('statut')
    .equals('ENVOYEE')
    .filter((v) => (v.envoyeeLe ?? v.creeLe) < limite)
    .delete();
  await db.evenements.where('envoye').equals(1).delete();
}

export const compterEnAttente = () => db.ventes.where('statut').equals('EN_ATTENTE').count();
