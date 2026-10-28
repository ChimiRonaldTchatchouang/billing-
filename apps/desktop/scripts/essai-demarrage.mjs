// Essai de démarrage de la version de bureau sans interface : base intégrée, migrations,
// données de démonstration, API, puis un second démarrage sur les mêmes données.
//   node scripts/essai-demarrage.mjs <dossier de l'application> <dossier de données>
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const application = resolve(process.argv[2]);
const donnees = resolve(process.argv[3] ?? 'essai-donnees');
rmSync(donnees, { recursive: true, force: true });
const { demarrer } = await import(pathToFileURL(join(application, 'dist/serveur.js')).href);

for (const tour of [1, 2]) {
  const t0 = Date.now();
  const s = await demarrer({ donnees, application, node: process.execPath }, (m) => {
    if (!/\[Nest\]/.test(m)) console.log('  ·', m.slice(0, 200));
  });
  const sante = await (await fetch(`${s.url}/health`)).json();
  const page = await (await fetch(`${s.url}/caisse`)).text();
  const connexion = await fetch(`${s.url}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gerant@demo.cm', motDePasse: 'gerant-demo-2026' }),
  });
  await s.arreter();
  console.log(
    `Démarrage ${tour} : ${Date.now() - t0} ms, base ${sante.base}, page ${page.includes('id="root"')}, connexion ${connexion.status}`,
  );
  if (sante.base !== 'ok' || !page.includes('id="root"') || connexion.status !== 200)
    process.exit(1);
}
console.log('Essai réussi.');
process.exit(0);
