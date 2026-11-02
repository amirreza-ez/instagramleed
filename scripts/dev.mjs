// One-command runner: embedded PostgreSQL → migrations → seed → API + web.
//   node scripts/dev.mjs              development (watch mode)
//   node scripts/dev.mjs --setup-only  prepare database and exit
//   node scripts/dev.mjs --prod        build and run production server (API serves the web app)
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { startPg, ROOT } from './pg.mjs';
import { ensureEnv } from './env.mjs';

const args = process.argv.slice(2);
const env = ensureEnv();
const api = path.join(ROOT, 'apps', 'api');
const web = path.join(ROOT, 'apps', 'web');
const sh = process.platform === 'win32';

let pg = null;
if (env.EMBEDDED_PG !== 'false') pg = await startPg({ port: Number(env.PG_PORT || 54329), password: env.PG_PASSWORD || 'eazazi' });

const run = (cmd, a, cwd) => {
  const r = spawnSync(cmd, a, { cwd, stdio: 'inherit', shell: sh, env });
  if (r.status !== 0) { console.error(`[dev] failed: ${cmd} ${a.join(' ')}`); process.exit(r.status ?? 1); }
};
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], api);
run('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], api);

const children = [];
const stop = async () => { children.forEach((c) => c.kill()); if (pg) await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

if (args.includes('--setup-only')) { await stop(); }
else if (args.includes('--prod')) {
  run('pnpm', ['build'], api); run('pnpm', ['build'], web);
  children.push(spawn('node', ['dist/main.js'], { cwd: api, stdio: 'inherit', env: { ...env, NODE_ENV: 'production' } }));
} else {
  run('pnpm', ['build'], api);
  children.push(spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json', '-w', '--preserveWatchOutput'], { cwd: api, stdio: 'ignore', shell: sh, env }));
  children.push(spawn('node', ['--watch', 'dist/main.js'], { cwd: api, stdio: 'inherit', env }));
  children.push(spawn('pnpm', ['dev'], { cwd: web, stdio: 'inherit', shell: sh, env }));
  console.log(`\n  ➜ Web:  http://localhost:${env.WEB_PORT || 5173}\n  ➜ API:  http://localhost:${env.PORT || 4000}/api/docs\n`);
}
