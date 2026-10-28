import { assertEntier, type Fcfa } from './money.js';

/**
 * Montant remboursé pour un retour partiel : part du montant net payé sur la ligne, au prorata
 * de la quantité rendue (arrondi à l'inférieur, le dernier retour récupère le reste).
 */
export function montantRetour(
  netLigne: Fcfa,
  quantiteVendue: number,
  dejaRendue: number,
  aRendre: number,
): Fcfa {
  [netLigne, quantiteVendue, dejaRendue, aRendre].forEach((v) => assertEntier('valeur', v));
  if (aRendre <= 0 || dejaRendue + aRendre > quantiteVendue) {
    throw new RangeError('Quantité à rendre supérieure à la quantité restante.');
  }
  const avant = Math.floor((netLigne * dejaRendue) / quantiteVendue);
  const apres =
    dejaRendue + aRendre === quantiteVendue
      ? netLigne
      : Math.floor((netLigne * (dejaRendue + aRendre)) / quantiteVendue);
  return apres - avant;
}
