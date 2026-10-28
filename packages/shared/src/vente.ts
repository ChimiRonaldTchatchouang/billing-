import { assertEntier, divArrondi, type Fcfa } from './money.js';
import { ventilerTtc, type TauxBp, type VentilationTva } from './tva.js';

export type Unite = 'PIECE' | 'KG';

export interface LigneEntree {
  /** Prix unitaire TTC (par pièce, ou par kilogramme pour une unité KG). */
  prixUnitaireTtc: Fcfa;
  /** Nombre de pièces, ou grammes pour une unité KG. */
  quantite: number;
  unite: Unite;
  tauxTvaBp: TauxBp;
  /** Remise de ligne en FCFA. */
  remise?: Fcfa;
}

export interface LigneCalculee {
  brut: Fcfa;
  remiseLigne: Fcfa;
  remiseTicket: Fcfa;
  net: Fcfa;
  tauxTvaBp: TauxBp;
}

export interface TotauxVente {
  lignes: LigneCalculee[];
  brut: Fcfa;
  remise: Fcfa;
  ht: Fcfa;
  tva: Fcfa;
  ttc: Fcfa;
  parTaux: VentilationTva[];
}

export class VenteInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VenteInvalideError';
  }
}

export function montantBrut(ligne: LigneEntree): Fcfa {
  assertEntier('prix unitaire', ligne.prixUnitaireTtc);
  assertEntier('quantité', ligne.quantite);
  if (ligne.quantite === 0) {
    throw new VenteInvalideError('La quantité d’une ligne doit être supérieure à zéro.');
  }
  const total = ligne.prixUnitaireTtc * ligne.quantite;
  return ligne.unite === 'KG' ? divArrondi(total, 1000) : total;
}

/**
 * Répartit une remise de ticket au prorata des montants nets des lignes.
 * Le reste d'arrondi est porté par la ligne au montant le plus élevé.
 */
export function repartirRemise(montants: Fcfa[], remise: Fcfa): Fcfa[] {
  assertEntier('remise du ticket', remise);
  const total = montants.reduce((a, b) => a + b, 0);
  if (remise > total) {
    throw new VenteInvalideError('La remise du ticket dépasse le total des articles.');
  }
  if (remise === 0 || total === 0) return montants.map(() => 0);
  const parts = montants.map((m) => Math.floor((m * remise) / total));
  const reste = remise - parts.reduce((a, b) => a + b, 0);
  let iMax = 0;
  montants.forEach((m, i) => {
    if (m > (montants[iMax] ?? 0)) iMax = i;
  });
  parts[iMax] = (parts[iMax] ?? 0) + reste;
  return parts;
}

export function calculerVente(lignes: LigneEntree[], remiseTicket: Fcfa = 0): TotauxVente {
  if (lignes.length === 0) {
    throw new VenteInvalideError('Une vente doit contenir au moins un article.');
  }
  const intermediaires = lignes.map((l) => {
    const brut = montantBrut(l);
    const remiseLigne = l.remise ?? 0;
    assertEntier('remise de ligne', remiseLigne);
    if (remiseLigne > brut) {
      throw new VenteInvalideError('La remise d’une ligne dépasse son montant.');
    }
    return { brut, remiseLigne, apresRemise: brut - remiseLigne, tauxTvaBp: l.tauxTvaBp };
  });
  const partsTicket = repartirRemise(
    intermediaires.map((l) => l.apresRemise),
    remiseTicket,
  );

  const lignesCalculees: LigneCalculee[] = intermediaires.map((l, i) => {
    const part = partsTicket[i] ?? 0;
    return {
      brut: l.brut,
      remiseLigne: l.remiseLigne,
      remiseTicket: part,
      net: l.apresRemise - part,
      tauxTvaBp: l.tauxTvaBp,
    };
  });

  const ttcParTaux = new Map<TauxBp, Fcfa>();
  for (const l of lignesCalculees) {
    ttcParTaux.set(l.tauxTvaBp, (ttcParTaux.get(l.tauxTvaBp) ?? 0) + l.net);
  }
  const parTaux = [...ttcParTaux.entries()]
    .sort(([a], [b]) => a - b)
    .map(([taux, ttc]) => ventilerTtc(ttc, taux));

  const somme = (f: (l: LigneCalculee) => number) => lignesCalculees.reduce((a, l) => a + f(l), 0);

  return {
    lignes: lignesCalculees,
    brut: somme((l) => l.brut),
    remise: somme((l) => l.remiseLigne + l.remiseTicket),
    ht: parTaux.reduce((a, v) => a + v.ht, 0),
    tva: parTaux.reduce((a, v) => a + v.tva, 0),
    ttc: somme((l) => l.net),
    parTaux,
  };
}
