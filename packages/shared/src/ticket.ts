const CODE_MAGASIN = /^M\d{2}$/;
const CODE_CAISSE = /^C\d{2}$/;
const NUMERO = /^(M\d{2})-(C\d{2})-(\d{6,})$/;

/** Numéro de ticket propre à une caisse : M01-C02-000123. */
export function formaterNumeroTicket(magasin: string, caisse: string, sequence: number): string {
  if (!CODE_MAGASIN.test(magasin)) throw new RangeError(`Code magasin invalide : ${magasin}`);
  if (!CODE_CAISSE.test(caisse)) throw new RangeError(`Code caisse invalide : ${caisse}`);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError('Le numéro de séquence doit être un entier positif.');
  }
  return `${magasin}-${caisse}-${String(sequence).padStart(6, '0')}`;
}

export function lireNumeroTicket(
  numero: string,
): { magasin: string; caisse: string; sequence: number } | null {
  const m = NUMERO.exec(numero);
  if (!m) return null;
  return { magasin: m[1]!, caisse: m[2]!, sequence: Number(m[3]) };
}
