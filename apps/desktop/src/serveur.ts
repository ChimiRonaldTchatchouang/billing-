/**
 * Démarrage autonome, sans Electron : PostgreSQL intégré, migrations, données de démonstration
 * au premier lancement, puis l'API (qui sert aussi l'application web). Utilisé par la version
 * de bureau et testable seul avec Node.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

export const PORT_API = 47321;
export const PORT_BASE = 47322;

export interface Chemins {
  /** Dossier des données de l'utilisateur (base, secrets). */
  donnees: string;
  /** Dossier de l'application : api/, web/. */
  application: string;
  /** Exécutable Node (process.execPath ; Electron en mode Node). */
  node: string;
}

interface Config {
  motDePasseBase: string;
  jwt: string;
  pdf: string;
  demoChargee: boolean;
}

export interface Serveur {
  url: string;
  arreter: () => Promise<void>;
}

type Journal = (m: string) => void;

function lireConfig(fichier: string): Config {
  if (existsSync(fichier)) return JSON.parse(readFileSync(fichier, 'utf8')) as Config;
  const c: Config = {
    motDePasseBase: randomBytes(18).toString('base64url'),
    jwt: randomBytes(36).toString('base64url'),
    pdf: randomBytes(36).toString('base64url'),
    demoChargee: false,
  };
  writeFileSync(fichier, JSON.stringify(c, null, 2));
  return c;
}

/** Applique dans l'ordre les migrations SQL de l'API qui n'ont pas encore été jouées. */
async function migrer(url: string, dossier: string, journal: Journal): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS desktop_migrations (nom text PRIMARY KEY, le timestamptz NOT NULL DEFAULT now())',
    );
    const faites = new Set(
      (await client.query<{ nom: string }>('SELECT nom FROM desktop_migrations')).rows.map(
        (r) => r.nom,
      ),
    );
    const toutes = readdirSync(dossier, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const nom of toutes.filter((n) => !faites.has(n))) {
      journal(`Migration ${nom}`);
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dossier, nom, 'migration.sql'), 'utf8'));
        await client.query('INSERT INTO desktop_migrations (nom) VALUES ($1)', [nom]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}

function executer(
  chemins: Chemins,
  script: string,
  env: NodeJS.ProcessEnv,
  journal: Journal,
): ChildProcess {
  const p = spawn(chemins.node, [script], {
    cwd: join(chemins.application, 'api'),
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  p.stdout?.on('data', (d: Buffer) => journal(d.toString().trimEnd()));
  p.stderr?.on('data', (d: Buffer) => journal(d.toString().trimEnd()));
  return p;
}

async function attendreSante(url: string, api: ChildProcess, delaiMs = 60_000): Promise<void> {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (api.exitCode !== null)
      throw new Error(`L’API s’est arrêtée au démarrage (code ${api.exitCode}).`);
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return;
    } catch {
      // pas encore prête
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('L’API ne répond pas.');
}

export async function demarrer(
  chemins: Chemins,
  journal: Journal = () => undefined,
): Promise<Serveur> {
  mkdirSync(chemins.donnees, { recursive: true });
  const config = lireConfig(join(chemins.donnees, 'config.json'));
  const dossierBase = join(chemins.donnees, 'postgres');
  const premiereFois = !existsSync(join(dossierBase, 'PG_VERSION'));

  const base = new EmbeddedPostgres({
    databaseDir: dossierBase,
    port: PORT_BASE,
    user: 'caisse',
    password: config.motDePasseBase,
    persistent: true,
    // Sous Linux en administrateur (tests), PostgreSQL refuse de tourner en root.
    createPostgresUser: process.platform !== 'win32' && process.getuid?.() === 0,
    onLog: journal,
    onError: (e) => journal(`PostgreSQL : ${String(e)}`),
  });
  if (premiereFois) {
    journal('Création de la base de données…');
    await base.initialise();
  }
  await base.start();
  if (premiereFois) await base.createDatabase('caisse');

  const urlBase = `postgresql://caisse:${encodeURIComponent(config.motDePasseBase)}@127.0.0.1:${PORT_BASE}/caisse`;
  await migrer(urlBase, join(chemins.application, 'api', 'prisma', 'migrations'), journal);

  const url = `http://localhost:${PORT_API}`;
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    PORT: String(PORT_API),
    DATABASE_URL: urlBase,
    DIRECT_URL: urlBase,
    CORS_ORIGINS: url,
    PUBLIC_API_URL: url,
    PUBLIC_WEB_URL: url,
    JWT_ACCESS_SECRET: config.jwt,
    PDF_LINK_SECRET: config.pdf,
    WEB_DIST: join(chemins.application, 'web'),
  };

  if (!config.demoChargee) {
    journal('Chargement des données de démonstration…');
    const seed = executer(
      chemins,
      join(chemins.application, 'api', 'dist', 'seed.js'),
      {
        ...env,
        SEED_ORG_NAME: 'Supermarché Démo',
        SEED_ORG_NIU: 'M012345678901A',
        SEED_ORG_RCCM: 'RC/DLA/2024/B/0001',
        SEED_ORG_ADDRESS: 'Douala',
        SEED_ADMIN_NAME: 'Directrice Démo',
        SEED_ADMIN_EMAIL: 'directeur@demo.cm',
        SEED_ADMIN_PASSWORD: 'directeur-demo-2026',
        SEED_DEMO: '1',
      },
      journal,
    );
    const code = await new Promise<number | null>((r) => seed.on('exit', r));
    if (code !== 0) throw new Error('Les données de démonstration n’ont pas pu être chargées.');
    config.demoChargee = true;
    writeFileSync(join(chemins.donnees, 'config.json'), JSON.stringify(config, null, 2));
  }

  const api = executer(chemins, join(chemins.application, 'api', 'dist', 'main.js'), env, journal);
  try {
    await attendreSante(url, api);
  } catch (e) {
    api.kill();
    await base.stop();
    throw e;
  }

  return {
    url,
    arreter: async () => {
      api.kill();
      await new Promise((r) => setTimeout(r, 300));
      await base.stop();
    },
  };
}
