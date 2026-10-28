// Extraction minimale d'un fichier ZIP (zip ou wheel), sans dépendance : node scripts/dezip.mjs archive dossier fichier...
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export function extraire(archive, dossier, noms) {
  const z = readFileSync(archive);
  let fin = z.length - 22;
  while (fin >= 0 && z.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('Archive ZIP invalide.');
  const total = z.readUInt16LE(fin + 10);
  let p = z.readUInt32LE(fin + 16);
  const voulus = new Set(noms);
  const extraits = [];
  mkdirSync(dossier, { recursive: true });
  for (let i = 0; i < total; i++) {
    const methode = z.readUInt16LE(p + 10);
    const taille = z.readUInt32LE(p + 20);
    const lnom = z.readUInt16LE(p + 28);
    const lextra = z.readUInt16LE(p + 30);
    const lcom = z.readUInt16LE(p + 32);
    const local = z.readUInt32LE(p + 42);
    const nom = z.toString('utf8', p + 46, p + 46 + lnom);
    const court = nom.split('/').at(-1);
    if (voulus.has(court) && !extraits.includes(court)) {
      const debut = local + 30 + z.readUInt16LE(local + 26) + z.readUInt16LE(local + 28);
      const brut = z.subarray(debut, debut + taille);
      writeFileSync(join(dossier, court), methode === 8 ? inflateRawSync(brut) : brut);
      extraits.push(court);
    }
    p += 46 + lnom + lextra + lcom;
  }
  const manquants = noms.filter((n) => !extraits.includes(n));
  if (manquants.length) throw new Error(`Absents de l'archive : ${manquants.join(', ')}`);
}

if (process.argv[1]?.endsWith('dezip.mjs')) {
  const [archive, dossier, ...noms] = process.argv.slice(2);
  extraire(archive, dossier, noms);
}
