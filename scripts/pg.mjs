// Embedded PostgreSQL for local development / single-machine installs (real PostgreSQL binaries, no Docker needed).
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

export const ROOT = path.resolve(import.meta.dirname, '..');

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

export async function startPg({ port = 54329, password = 'eazazi', db = 'eazazi' } = {}) {
  if (await portInUse(port)) { console.log(`[db] PostgreSQL already running on ${port}`); return null; }
  const dir = path.join(ROOT, '.data', 'pg');
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password, port, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C', '--lc-collate=C', '--lc-ctype=C'], onLog: () => {}, onError: (e) => process.env.PG_DEBUG && console.error(String(e)) });
  if (fresh) { console.log('[db] initialising data directory…'); await pg.initialise(); }
  await pg.start();
  const c = pg.getPgClient(); await c.connect();
  const r = await c.query('select 1 from pg_database where datname=$1', [db]);
  if (!r.rowCount) await c.query(`create database "${db}" encoding 'UTF8' template template0`);
  if (!(await c.query('select 1 from pg_database where datname=$1', [db + '_test'])).rowCount) await c.query(`create database "${db}_test" encoding 'UTF8' template template0`);
  await c.end();
  console.log(`[db] PostgreSQL ready on 127.0.0.1:${port}`);
  return pg;
}
