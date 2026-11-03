// Database backup.
//  - If pg_dump is on PATH (servers / Docker): compressed custom-format dump  → restore with pg_restore.
//  - Otherwise (embedded PostgreSQL ships no client tools): gzip'd JSON snapshot of every table → restore with scripts/restore.mjs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import pg from 'pg';
import { ROOT } from './pg.mjs';
import { ensureEnv } from './env.mjs';

const env = ensureEnv();
const dir = path.join(ROOT, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const url = new URL(env.DATABASE_URL);

const hasPgDump = spawnSync('pg_dump', ['--version'], { stdio: 'ignore', shell: false }).status === 0;
if (hasPgDump && !process.argv.includes('--json')) {
  const file = path.join(dir, `eazazi-${stamp}.dump`);
  const r = spawnSync('pg_dump', ['-Fc', '-d', env.DATABASE_URL, '-f', file], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('pg_dump failed'); process.exitCode = 1; }
  else console.log(`backup written: ${file}`);
} else {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const { rows: tables } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename`);
  const snapshot = { format: 'eazazi-json-backup', version: 1, createdAt: new Date().toISOString(), database: url.pathname.slice(1), tables: {} };
  for (const { tablename } of tables) snapshot.tables[tablename] = (await client.query(`select * from "${tablename}"`)).rows;
  await client.end();
  const file = path.join(dir, `eazazi-${stamp}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(snapshot)));
  const counts = Object.entries(snapshot.tables).map(([t, r]) => `${t}:${r.length}`).join(' ');
  console.log(`backup written: ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)\n${counts}`);
}
