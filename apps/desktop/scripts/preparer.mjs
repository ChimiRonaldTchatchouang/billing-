// Prépare les deux dossiers de l'application de bureau pour electron-builder :
// - coquille/ : la fenêtre Electron, sans dépendance ;
// - serveur/ : copié tel quel dans les ressources (electron-builder ne recalcule pas ses
//   dépendances, qui doivent être celles de Windows et non de la machine qui fabrique) :
// API compilée et ses dépendances pour Windows x64, application web compilée, migrations.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraire } from './dezip.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const desktop = join(ici, '..');
const racine = join(desktop, '../..');
const app = join(desktop, 'serveur');
const coquille = join(desktop, 'coquille');
const cible = process.env.CIBLE_OS ?? 'win32';
// Runtime Visual C++ redistribuable (paquet PyPI msvc-runtime, DLL Microsoft redistribuables).
const MSVC_RUNTIME =
  'https://files.pythonhosted.org/packages/98/33/be9ef68901200813fc174a06758b4ae48ca4eb58fa783280dd879d5fd048/msvc_runtime-14.51.36231-cp312-cp312-win_amd64.whl';
const sh = (cmd, cwd = racine, env = {}) =>
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

console.log('→ Compilation');
sh('pnpm --filter @caisse/shared build');
sh('pnpm --filter @caisse/api build');
// Même origine que l'API : les appels partent en chemins relatifs.
sh('pnpm --filter @caisse/web exec vite build', racine, { VITE_API_URL: '' });
sh('pnpm --filter @caisse/desktop build');

console.log('→ Dossier serveur/');
rmSync(app, { recursive: true, force: true });
mkdirSync(join(app, 'api'), { recursive: true });
cpSync(join(racine, 'apps/api/dist'), join(app, 'api/dist'), { recursive: true });
cpSync(join(racine, 'apps/api/prisma'), join(app, 'api/prisma'), { recursive: true });
cpSync(join(racine, 'apps/web/dist'), join(app, 'web'), { recursive: true });
cpSync(join(desktop, 'dist'), join(app, 'dist'), { recursive: true });
mkdirSync(join(app, 'shared'), { recursive: true });
cpSync(join(racine, 'packages/shared/dist'), join(app, 'shared/dist'), { recursive: true });
const shared = JSON.parse(readFileSync(join(racine, 'packages/shared/package.json'), 'utf8'));
writeFileSync(
  join(app, 'shared/package.json'),
  JSON.stringify(
    {
      name: shared.name,
      version: shared.version,
      type: 'module',
      main: shared.main,
      types: shared.types,
      exports: shared.exports,
      dependencies: shared.dependencies,
    },
    null,
    2,
  ),
);
// L'API est en modules ES.
writeFileSync(join(app, 'api/package.json'), JSON.stringify({ type: 'module' }, null, 2));

// Moteur Prisma pour la plateforme cible.
const schema = join(app, 'api/prisma/schema.prisma');
writeFileSync(
  schema,
  readFileSync(schema, 'utf8').replace(
    'provider = "prisma-client-js"',
    `provider = "prisma-client-js"\n  binaryTargets = ["native", "${cible === 'win32' ? 'windows' : 'debian-openssl-3.0.x'}"]`,
  ),
);

const apiPkg = JSON.parse(readFileSync(join(racine, 'apps/api/package.json'), 'utf8'));
const desktopPkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
const dependances = {
  ...apiPkg.dependencies,
  ...desktopPkg.dependancesServeur,
  '@caisse/shared': 'file:./shared',
};
writeFileSync(
  join(app, 'package.json'),
  JSON.stringify(
    {
      name: 'caisse-supermarche',
      productName: 'Caisse et facturation',
      version: desktopPkg.version,
      description: desktopPkg.description,
      author: desktopPkg.author,
      type: 'module',
      main: 'dist/main.js',
      dependencies: dependances,
    },
    null,
    2,
  ),
);

console.log(`→ Dépendances pour ${cible} x64`);
sh(`npm install --omit=dev --no-audit --no-fund --os=${cible} --cpu=x64 --ignore-scripts`, app);
if (cible === 'win32') {
  // PostgreSQL pour Windows a besoin du runtime Visual C++ (VCRUNTIME140.dll), absent de
  // certains postes : les DLL redistribuables sont déposées à côté de postgres.exe.
  const bin = join(app, 'node_modules/@embedded-postgres/windows-x64/native/bin');
  const roue = join(desktop, 'build/msvc_runtime.whl');
  sh(`curl -sSfL -o "${roue}" ${MSVC_RUNTIME}`);
  extraire(roue, bin, ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']);
  rmSync(roue);
}
sh(
  `npx --yes prisma@${apiPkg.devDependencies.prisma.replace(/^[~^]/, '')} generate --schema api/prisma/schema.prisma`,
  app,
);
console.log('→ Dossier coquille/');
rmSync(coquille, { recursive: true, force: true });
mkdirSync(join(coquille, 'dist'), { recursive: true });
cpSync(join(desktop, 'dist/main.js'), join(coquille, 'dist/main.js'));
writeFileSync(
  join(coquille, 'package.json'),
  JSON.stringify(
    {
      name: 'caisse-supermarche',
      productName: 'Caisse et facturation',
      version: desktopPkg.version,
      description: desktopPkg.description,
      author: desktopPkg.author,
      type: 'module',
      main: 'dist/main.js',
    },
    null,
    2,
  ),
);
console.log('→ Prêt');
