// Recrée la base de bout en bout, applique les migrations et charge les données de démonstration.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = new URL(process.env.DATABASE_URL);
const nom = url.pathname.slice(1);
const admin = new URL(url);
admin.pathname = '/postgres';
const api = join(dirname(fileURLToPath(import.meta.url)), '../../api');
const psql = (sql) =>
  execSync(`psql "${admin}" -v ON_ERROR_STOP=1 -c "${sql}"`, { stdio: 'inherit' });

psql(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
psql(`CREATE DATABASE ${nom}`);
const env = { ...process.env, DIRECT_URL: process.env.DATABASE_URL };
execSync('pnpm exec prisma migrate deploy', { cwd: api, env, stdio: 'inherit' });
execSync('node dist/seed.js', {
  cwd: api,
  env: {
    ...env,
    SEED_ORG_NAME: 'Supermarché Démo',
    SEED_ORG_NIU: 'M012345678901A',
    SEED_ADMIN_EMAIL: 'directeur@demo.cm',
    SEED_ADMIN_PASSWORD: 'directeur-demo-2026',
    SEED_DEMO: '1',
  },
  stdio: 'inherit',
});
