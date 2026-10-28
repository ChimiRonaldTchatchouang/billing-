import {
  type Approbation,
  type ActionSensible,
  calculerVente,
  type TotauxVente,
  uuidv7,
} from '@caisse/shared';
import type { ProduitLocal } from './db';

export interface LignePanier {
  cle: string;
  produit: ProduitLocal;
  /** Pièces, ou grammes pour un article au poids. */
  quantite: number;
  prixUnitaireTtc: number;
  remise: number;
}

export interface Panier {
  id: string;
  lignes: LignePanier[];
  remiseTicket: number;
  approbations: Approbation[];
}

export const panierVide = (): Panier => ({
  id: uuidv7(),
  lignes: [],
  remiseTicket: 0,
  approbations: [],
});

export function totaux(p: Panier): TotauxVente | null {
  if (p.lignes.length === 0) return null;
  return calculerVente(
    p.lignes.map((l) => ({
      prixUnitaireTtc: l.prixUnitaireTtc,
      quantite: l.quantite,
      unite: l.produit.unite,
      tauxTvaBp: l.produit.tauxTvaBp,
      remise: l.remise,
    })),
    p.remiseTicket,
  );
}

/** Ajoute un article ; un article à la pièce déjà présent au même prix voit sa quantité augmenter. */
export function ajouter(
  p: Panier,
  produit: ProduitLocal,
  quantite = produit.unite === 'KG' ? 1000 : 1,
): Panier {
  if (produit.unite === 'PIECE') {
    const i = p.lignes.findIndex(
      (l) => l.produit.id === produit.id && l.prixUnitaireTtc === produit.prixTtc && l.remise === 0,
    );
    if (i >= 0) {
      const lignes = [...p.lignes];
      const l = lignes[i]!;
      lignes.splice(i, 1);
      // La ligne modifiée remonte en tête : c'est la dernière scannée.
      return { ...p, lignes: [{ ...l, quantite: l.quantite + quantite }, ...lignes] };
    }
  }
  const ligne: LignePanier = {
    cle: uuidv7(),
    produit,
    quantite,
    prixUnitaireTtc: produit.prixTtc,
    remise: 0,
  };
  return { ...p, lignes: [ligne, ...p.lignes] };
}

const modifierLigne = (p: Panier, cle: string, f: (l: LignePanier) => LignePanier): Panier => ({
  ...p,
  lignes: p.lignes.map((l) => (l.cle === cle ? f(l) : l)),
});

export const changerQuantite = (p: Panier, cle: string, quantite: number) =>
  modifierLigne(p, cle, (l) => ({
    ...l,
    quantite,
    remise: Math.min(l.remise, montantLigne(l.prixUnitaireTtc, quantite, l.produit.unite)),
  }));

export const retirer = (p: Panier, cle: string): Panier => ({
  ...p,
  lignes: p.lignes.filter((l) => l.cle !== cle),
});

export const remiseLigne = (p: Panier, cle: string, remise: number) =>
  modifierLigne(p, cle, (l) => ({ ...l, remise }));

export const changerPrix = (p: Panier, cle: string, prix: number) =>
  modifierLigne(p, cle, (l) => ({ ...l, prixUnitaireTtc: prix, remise: 0 }));

export const approuver = (
  p: Panier,
  action: ActionSensible,
  approuveePar: string,
  details: string,
): Panier => ({
  ...p,
  approbations: [
    ...p.approbations,
    { action, approuveePar, le: new Date().toISOString(), details },
  ],
});

export function montantLigne(prix: number, quantite: number, unite: 'PIECE' | 'KG'): number {
  const total = prix * quantite;
  return unite === 'KG' ? Math.floor((total + 500) / 1000) : total;
}

/** « 1,250 » kg → 1250 g. Renvoie null si la saisie n'est pas un poids valide. */
export function lirePoids(saisie: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,3}))?$/.exec(saisie.trim());
  if (!m) return null;
  const g = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
  return g > 0 ? g : null;
}

export const formaterQuantite = (q: number, unite: 'PIECE' | 'KG') =>
  unite === 'KG' ? `${(q / 1000).toFixed(3).replace('.', ',')} kg` : String(q);
