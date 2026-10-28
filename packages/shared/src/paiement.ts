import { assertEntier, type Fcfa } from './money.js';

export type ModePaiement = 'ESPECES' | 'ORANGE_MONEY' | 'MTN_MOMO';

export interface PaiementEntree {
  mode: ModePaiement;
  montant: Fcfa;
}

export interface Encaissement {
  totalPaye: Fcfa;
  /** Monnaie à rendre, uniquement sur les espèces. */
  rendu: Fcfa;
}

export class PaiementInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaiementInvalideError';
  }
}

/**
 * Calcule le rendu monnaie. Seules les espèces peuvent dépasser le reste dû :
 * un paiement Mobile Money doit correspondre exactement à ce qu'il couvre.
 */
export function calculerRendu(totalTtc: Fcfa, paiements: PaiementEntree[]): Encaissement {
  assertEntier('total TTC', totalTtc);
  paiements.forEach((p) => assertEntier('montant payé', p.montant));

  const electronique = paiements
    .filter((p) => p.mode !== 'ESPECES')
    .reduce((a, p) => a + p.montant, 0);
  const especes = paiements.filter((p) => p.mode === 'ESPECES').reduce((a, p) => a + p.montant, 0);

  if (electronique > totalTtc) {
    throw new PaiementInvalideError('Le paiement Mobile Money dépasse le montant à payer.');
  }
  const totalPaye = electronique + especes;
  if (totalPaye < totalTtc) {
    throw new PaiementInvalideError(
      `Il manque ${totalTtc - totalPaye} FCFA pour terminer l’encaissement.`,
    );
  }
  return { totalPaye, rendu: totalPaye - totalTtc };
}
