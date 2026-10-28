/**
 * Empreinte des PIN de caisse : PBKDF2-SHA256 via WebCrypto, disponible dans le navigateur et
 * dans Node. La même empreinte sert à la vérification par l'API et, hors ligne, par la caisse
 * enregistrée (décision 0004).
 */
const ITERATIONS = 100_000;
const PREFIXE = 'pbkdf2-sha256';

export const PIN_REGEX = /^\d{4}$/;

function versBase64(octets: Uint8Array): string {
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

function depuisBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const octets = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) octets[i] = s.charCodeAt(i);
  return octets;
}

async function deriver(pin: string, sel: Uint8Array<ArrayBuffer>, iterations: number) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations },
    cle,
    256,
  );
  return new Uint8Array(bits);
}

export async function hacherPin(pin: string): Promise<string> {
  if (!PIN_REGEX.test(pin)) throw new RangeError('Le PIN doit comporter 4 chiffres.');
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const empreinte = await deriver(pin, sel, ITERATIONS);
  return `${PREFIXE}$${ITERATIONS}$${versBase64(sel)}$${versBase64(empreinte)}`;
}

export async function verifierPin(pin: string, stocke: string): Promise<boolean> {
  const [prefixe, iter, sel, attendu] = stocke.split('$');
  if (prefixe !== PREFIXE || !iter || !sel || !attendu || !PIN_REGEX.test(pin)) return false;
  const calcule = await deriver(pin, depuisBase64(sel), Number(iter));
  const ref = depuisBase64(attendu);
  if (calcule.length !== ref.length) return false;
  let diff = 0;
  for (let i = 0; i < ref.length; i++) diff |= calcule[i]! ^ ref[i]!;
  return diff === 0;
}
