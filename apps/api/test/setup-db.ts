import { execSync } from 'node:child_process';
import pg from 'pg';

/**
 * Recrée la base de test à chaque passage et y applique les migrations.
 * TEST_DATABASE_URL_ADMIN pointe sur un PostgreSQL local (jamais sur Neon).
 */
export async function prepareTestDatabase(): Promise<string | null> {
  const admin = process.env.TEST_DATABASE_URL_ADMIN;
  if (!admin) return null;
  const nom = 'caisse_tests';
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${nom}`);
  await client.end();

  const url = new URL(admin);
  url.pathname = `/${nom}`;
  const dbUrl = url.toString();
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    stdio: 'ignore',
  });
  return dbUrl;
}
