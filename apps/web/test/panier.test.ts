import { describe, expect, it } from 'vitest';
import type { ProduitLocal } from '../src/caisse/db';
import {
  ajouter,
  approuver,
  changerPrix,
  changerQuantite,
  lirePoids,
  panierVide,
  remiseLigne,
  retirer,
  totaux,
} from '../src/caisse/panier';

const produit = (id: string, prixTtc: number, unite: 'PIECE' | 'KG' = 'PIECE'): ProduitLocal => ({
  id,
  codeBarres: id,
  nom: `Article ${id}`,
  unite,
  tauxTvaBp: 1925,
  prixTtc,
  actif: true,
  categorie: null,
  majLe: '',
});

describe('panier de caisse', () => {
  it('regroupe un article scanné deux fois et le remonte en tête', () => {
    let p = ajouter(panierVide(), produit('a', 1000));
    p = ajouter(p, produit('b', 500));
    p = ajouter(p, produit('a', 1000));
    expect(p.lignes.map((l) => [l.produit.id, l.quantite])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(totaux(p)?.ttc).toBe(2500);
  });

  it('un article au poids crée toujours une nouvelle ligne', () => {
    let p = ajouter(panierVide(), produit('t', 800, 'KG'), 1250);
    p = ajouter(p, produit('t', 800, 'KG'), 500);
    expect(p.lignes).toHaveLength(2);
    expect(totaux(p)?.ttc).toBe(1000 + 400);
  });

  it('remise, prix modifié, quantité et retrait', () => {
    let p = ajouter(panierVide(), produit('a', 1000));
    const cle = p.lignes[0]!.cle;
    p = changerQuantite(p, cle, 3);
    p = remiseLigne(p, cle, 300);
    expect(totaux(p)?.ttc).toBe(2700);
    p = changerPrix(p, cle, 900);
    expect(totaux(p)?.ttc).toBe(2700); // le changement de prix annule la remise
    p = { ...p, remiseTicket: 200 };
    expect(totaux(p)?.ttc).toBe(2500);
    p = approuver(p, 'REMISE', 'g1', 'Remise 200 FCFA');
    expect(p.approbations[0]).toMatchObject({ action: 'REMISE', approuveePar: 'g1' });
    expect(totaux(retirer(p, cle))).toBeNull();
  });

  it('lit un poids saisi en kg', () => {
    expect(lirePoids('1,250')).toBe(1250);
    expect(lirePoids('0.5')).toBe(500);
    expect(lirePoids('2')).toBe(2000);
    expect(lirePoids('abc')).toBeNull();
    expect(lirePoids('0')).toBeNull();
  });
});
