import { api } from '../lib/api';
import { db, ecrireMeta, lireMeta, type ProduitLocal } from './db';

interface Curseur {
  depuis: string;
  apresId: string;
}

interface PageCatalogue {
  articles: (Omit<ProduitLocal, 'categorie'> & { categorie: string | null })[];
  suivant: Curseur | null;
  curseur: Curseur | null;
}

/**
 * Télécharge les articles modifiés depuis la dernière mise à jour et les range dans la copie
 * locale. Renvoie le nombre d'articles reçus.
 */
export async function synchroniserCatalogue(): Promise<number> {
  let curseur = await lireMeta<Curseur>('curseurCatalogue');
  let recus = 0;
  for (;;) {
    const q = new URLSearchParams({ limite: '1000' });
    if (curseur) {
      q.set('since', curseur.depuis);
      q.set('apresId', curseur.apresId);
    }
    const page = await api<PageCatalogue>(`/sync/catalog?${q}`, { auth: 'caisse' });
    if (page.articles.length > 0) {
      await db.transaction('rw', db.produits, db.meta, async () => {
        // Un code-barres peut passer d'un article à un autre : on libère l'ancien d'abord.
        const codes = page.articles.map((a) => a.codeBarres);
        const occupants = await db.produits.where('codeBarres').anyOf(codes).toArray();
        const ids = new Set(page.articles.map((a) => a.id));
        await db.produits.bulkDelete(occupants.filter((o) => !ids.has(o.id)).map((o) => o.id));
        await db.produits.bulkPut(page.articles);
        if (page.curseur) await ecrireMeta('curseurCatalogue', page.curseur);
      });
    }
    recus += page.articles.length;
    curseur = page.curseur ?? curseur;
    if (!page.suivant) break;
  }
  await ecrireMeta('catalogueMajLe', new Date().toISOString());
  return recus;
}

/** Recherche locale, en moins d'une seconde même sur 10 000 articles. */
export async function trouverParCode(code: string): Promise<ProduitLocal | undefined> {
  const p = await db.produits.where('codeBarres').equals(code).first();
  return p?.actif ? p : undefined;
}

export async function rechercherLocal(texte: string, limite = 20): Promise<ProduitLocal[]> {
  const t = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (t.length < 2) return [];
  const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return db.produits
    .filter((p) => p.actif && (sansAccent(p.nom).includes(t) || p.codeBarres.startsWith(t)))
    .limit(limite)
    .toArray();
}
