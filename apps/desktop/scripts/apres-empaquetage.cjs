// Crochet electron-builder : copie serveur/ tel quel dans les ressources de l'application,
// avant la fabrication de l'installateur.
const { cpSync, existsSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function apresEmpaquetage(contexte) {
  const source = join(__dirname, '..', 'serveur');
  if (!existsSync(join(source, 'node_modules'))) {
    throw new Error('serveur/ n’est pas préparé : lancer d’abord node scripts/preparer.mjs');
  }
  const ressources =
    contexte.electronPlatformName === 'darwin'
      ? join(
          contexte.appOutDir,
          `${contexte.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : join(contexte.appOutDir, 'resources');
  cpSync(source, join(ressources, 'serveur'), { recursive: true, verbatimSymlinks: true });
};
