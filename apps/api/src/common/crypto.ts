import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const jetonAleatoire = (octets = 32) => randomBytes(octets).toString('base64url');

export function egaliteSure(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Code d'enrôlement lisible : 8 caractères sans ambiguïté (pas de 0/O, 1/I). */
export function codeLisible(longueur = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const octets = randomBytes(longueur);
  return [...octets].map((o) => alphabet[o % alphabet.length]).join('');
}
