import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rechercherLocal, synchroniserCatalogue, trouverParCode } from '../src/caisse/catalogue';
import { db, lireMeta } from '../src/caisse/db';

const article = (id: string, codeBarres: string, nom: string, actif = true) => ({
  id,
  codeBarres,
  nom,
  unite: 'PIECE' as const,
  tauxTvaBp: 1925,
  prixTtc: 1000,
  actif,
  categorie: null,
  majLe: '2026-10-28T10:00:00.000Z',
});

describe('copie locale du catalogue', () => {
  beforeEach(async () => {
    await db.produits.clear();
    await db.meta.clear();
    localStorage.setItem('caisse.appareil', JSON.stringify('jeton'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('télécharge toutes les pages puis reprend au curseur', async () => {
    const reponses = [
      {
        articles: [article('a', '111', 'Riz parfumé'), article('b', '222', 'Huile')],
        suivant: { depuis: 't1', apresId: 'b' },
        curseur: { depuis: 't1', apresId: 'b' },
      },
      {
        articles: [article('c', '333', 'Crème')],
        suivant: null,
        curseur: { depuis: 't2', apresId: 'c' },
      },
      {
        articles: [article('b', '222', 'Huile', false)],
        suivant: null,
        curseur: { depuis: 't3', apresId: 'b' },
      },
    ];
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify(reponses.shift()), { status: 200 });
      }),
    );

    expect(await synchroniserCatalogue()).toBe(3);
    expect(await lireMeta('curseurCatalogue')).toEqual({ depuis: 't2', apresId: 'c' });
    expect(await synchroniserCatalogue()).toBe(1);
    expect(urls[2]).toContain('since=t2&apresId=c');

    expect((await trouverParCode('111'))?.nom).toBe('Riz parfumé');
    expect(await trouverParCode('222')).toBeUndefined(); // retiré de la vente
    expect((await rechercherLocal('creme')).map((p) => p.id)).toEqual(['c']);
  });
});
