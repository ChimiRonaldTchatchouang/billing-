import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type VenteLocale } from '../src/caisse/db';
import { envoyerEnAttente, purger } from '../src/caisse/envoi';

const vente = (id: string, creeLe = new Date().toISOString()): VenteLocale => ({
  id,
  numeroTicket: `M01-C01-${id}`,
  creeLe,
  statut: 'EN_ATTENTE',
  vente: { id } as VenteLocale['vente'],
  ticket: {} as VenteLocale['ticket'],
});

describe('file d’envoi des ventes', () => {
  beforeEach(async () => {
    await Promise.all([db.ventes.clear(), db.sessions.clear(), db.evenements.clear()]);
    localStorage.setItem('caisse.appareil', JSON.stringify('jeton'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('marque les ventes confirmées, garde les refusées avec leur motif', async () => {
    await db.sessions.add({
      id: 's1',
      ouverteLe: '',
      ouvertePar: 'u',
      fondDeCaisse: 0,
      statut: 'OUVERTE',
      envoyee: 0,
    });
    await db.ventes.bulkAdd([vente('v1'), vente('v2'), vente('v3')]);
    const corps: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        corps.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            sessions: [{ id: 's1', statut: 'ENREGISTREE' }],
            ventes: [
              { id: 'v1', statut: 'ENREGISTREE' },
              { id: 'v2', statut: 'DEJA_RECUE' },
              { id: 'v3', statut: 'REJETEE', message: 'Article inconnu dans le catalogue.' },
            ],
            evenements: [],
          }),
          { status: 200 },
        );
      }),
    );
    expect(await envoyerEnAttente()).toBe(3);
    expect((await db.ventes.get('v1'))?.statut).toBe('ENVOYEE');
    expect((await db.ventes.get('v2'))?.statut).toBe('ENVOYEE');
    expect(await db.ventes.get('v3')).toMatchObject({
      statut: 'REJETEE',
      erreur: 'Article inconnu dans le catalogue.',
    });
    expect((await db.sessions.get('s1'))?.envoyee).toBe(1);
    expect(corps).toHaveLength(1);
  });

  it('sans réseau, les ventes restent en attente', async () => {
    await db.ventes.add(vente('v1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(envoyerEnAttente()).rejects.toMatchObject({ code: 'RESEAU_INDISPONIBLE' });
    expect((await db.ventes.get('v1'))?.statut).toBe('EN_ATTENTE');
  });

  it('purge les ventes envoyées depuis plus de 7 jours, jamais celles en attente', async () => {
    const vieux = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await db.ventes.bulkAdd([
      { ...vente('ancienne', vieux), statut: 'ENVOYEE', envoyeeLe: vieux },
      { ...vente('recente'), statut: 'ENVOYEE', envoyeeLe: new Date().toISOString() },
      vente('attente', vieux),
    ]);
    await purger();
    expect((await db.ventes.toArray()).map((v) => v.id).sort()).toEqual(['attente', 'recente']);
  });
});
