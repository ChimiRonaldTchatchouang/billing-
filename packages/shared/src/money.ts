/**
 * Montants en francs CFA entiers. Aucun flottant pour un montant : chaque
 * fonction publique vérifie que ses entrées sont des entiers sûrs.
 */
export type Fcfa = number;

export class MontantInvalideError extends Error {
  constructor(nom: string, valeur: unknown) {
    super(`Le montant « ${nom} » doit être un nombre entier de FCFA (reçu : ${String(valeur)}).`);
    this.name = 'MontantInvalideError';
  }
}

export function assertEntier(nom: string, valeur: number, { positif = true } = {}): void {
  if (!Number.isSafeInteger(valeur) || (positif && valeur < 0)) {
    throw new MontantInvalideError(nom, valeur);
  }
}

/** Division entière arrondie au plus proche, demi vers le haut (n ≥ 0, d > 0). */
export function divArrondi(n: number, d: number): number {
  assertEntier('numérateur', n);
  if (!Number.isSafeInteger(d) || d <= 0) {
    throw new RangeError('Le diviseur doit être un entier strictement positif.');
  }
  const q = Math.floor(n / d);
  const r = n - q * d;
  return r * 2 >= d ? q + 1 : q;
}
