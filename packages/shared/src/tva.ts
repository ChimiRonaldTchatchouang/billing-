import { assertEntier, divArrondi, type Fcfa } from './money.js';

/** Taux de TVA en points de base : 1925 = 19,25 %. */
export type TauxBp = number;

export interface VentilationTva {
  tauxBp: TauxBp;
  ht: Fcfa;
  tva: Fcfa;
  ttc: Fcfa;
}

/**
 * Extrait la TVA d'un montant TTC : TVA = arrondi(TTC × taux / (10 000 + taux)), HT = TTC − TVA.
 * A_CONFIRMER (comptable du client) : arrondi au FCFA le plus proche, demi vers le haut, par taux.
 */
export function ventilerTtc(ttc: Fcfa, tauxBp: TauxBp): VentilationTva {
  assertEntier('TTC', ttc);
  assertEntier('taux de TVA', tauxBp);
  const tva = divArrondi(ttc * tauxBp, 10_000 + tauxBp);
  return { tauxBp, ht: ttc - tva, tva, ttc };
}
