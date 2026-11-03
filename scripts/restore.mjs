// Restores a JSON backup made by scripts/backup.mjs into DATABASE_URL (or --url). DESTRUCTIVE: replaces all data.
//   node scripts/restore.mjs backups/eazazi-XXXX.json.gz --yes [--url postgresql://...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import pg from 'pg';
import { ensureEnv } from './env.mjs';

const env = ensureEnv();
const file = process.argv[2];
const urlArg = process.argv.indexOf('--url');
const conn = urlArg > 0 ? process.argv[urlArg + 1] : env.DATABASE_URL;
if (!file || !process.argv.includes('--yes')) { console.error('usage: node scripts/restore.mjs <backup.json.gz> --yes [--url <db>]'); process.exit(1); }
const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
if (snap.format !== 'eazazi-json-backup') { console.error('not an EAZAZI backup'); process.exit(1); }
const c = new pg.Client({ connectionString: conn });
await c.connect();
try {
  await c.query('begin');
  await c.query(`set session_replication_role = replica`); // defer FK checks while reloading
  const tables = Object.keys(snap.tables).filter((t) => t !== '_prisma_migrations');
  await c.query(`truncate ${tables.map((t) => `"${t}"`).join(',')} cascade`);
  const { rows: jsonCols } = await c.query(`select table_name, column_name from information_schema.columns where table_schema='public' and data_type in ('json','jsonb')`);
  const isJson = new Set(jsonCols.map((r) => `${r.table_name}.${r.column_name}`));
  for (const t of tables) {
    for (const row of snap.tables[t]) {
      const cols = Object.keys(row);
      const vals = cols.map((k) => (isJson.has(`${t}.${k}`) && row[k] !== null ? JSON.stringify(row[k]) : row[k]));
      await c.query(`insert into "${t}" (${cols.map((k) => `"${k}"`).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, vals);
    }
  }
  await c.query(`set session_replication_role = origin`);
  await c.query('commit');
  console.log(`restored ${tables.length} tables from ${file}`);
} catch (e) { await c.query('rollback'); console.error('restore failed, nothing changed:', e.message); process.exitCode = 1; }
finally { await c.end(); }
