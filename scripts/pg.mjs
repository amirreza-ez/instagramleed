// Embedded PostgreSQL for local development / single-machine installs (real PostgreSQL binaries, no Docker needed).
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const ROOT = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function canConnect(port, password, tries = 1) {
  for (let i = 0; i < tries; i++) {
    const c = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 2000 });
    try { await c.connect(); await c.end(); return true; } catch { await c.end().catch(() => {}); if (i < tries - 1) await sleep(1000); }
  }
  return false;
}

/** Kills postgres processes left behind by an unclean shutdown — only those using this project's data directory. */
function killOrphans(dir) {
  try {
    if (process.platform === 'win32') {
      // Child processes (io workers etc.) carry only the binary path, written with forward slashes — match on this
      // project's bundled binary location, normalised, so we never touch other PostgreSQL installs.
      const needle = ROOT.replace(/\\/g, '/').replace(/'/g, "''").toLowerCase();
      execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='postgres.exe'\\" | Where-Object { $_.CommandLine -and $_.CommandLine.Replace('\\\\','/').ToLower().Contains('${needle}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
    } else {
      execSync(`pkill -f -- "${dir}"`, { stdio: 'ignore' });
    }
  } catch { /* nothing to kill */ }
}

export async function startPg({ port = 54329, password = 'eazazi', db = 'eazazi' } = {}) {
  const dir = path.join(ROOT, '.data', 'pg');
  if (await canConnect(port, password, 3)) { console.log(`[db] PostgreSQL already running on ${port}`); return null; }
  // Recover from an unclean shutdown: orphaned server processes or a stale lock file.
  killOrphans(dir);
  await sleep(1500);
  fs.rmSync(path.join(dir, 'postmaster.pid'), { force: true });

  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: 'postgres', password, port, persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--lc-collate=C', '--lc-ctype=C'],
    onLog: () => {}, onError: (e) => process.env.PG_DEBUG && console.error(String(e)),
  });
  if (fresh) { console.log('[db] initialising data directory…'); await server.initialise(); }
  await server.start();
  const c = server.getPgClient(); await c.connect();
  for (const name of [db, `${db}_test`]) {
    const r = await c.query('select 1 from pg_database where datname=$1', [name]);
    if (!r.rowCount) await c.query(`create database "${name}" encoding 'UTF8' template template0`);
  }
  await c.end();
  console.log(`[db] PostgreSQL ready on 127.0.0.1:${port}`);
  return server;
}
