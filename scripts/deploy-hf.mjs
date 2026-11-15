// Deploys the app to a Hugging Face Docker Space (free, no credit card).
//   HF_TOKEN=hf_xxx node scripts/deploy-hf.mjs <hf-username>/<space-name>
// Reads Neon URLs and secrets from .env and stores them as Space secrets (never in git).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './pg.mjs';
import { ensureEnv } from './env.mjs';

const env = ensureEnv();
const space = process.argv[2];
const token = process.env.HF_TOKEN;
if (!space || !token) { console.error('usage: HF_TOKEN=hf_xxx node scripts/deploy-hf.mjs <user>/<space>'); process.exit(1); }
const appUrl = `https://${space.replace('/', '-').toLowerCase()}.hf.space`;

// 1) Space secrets / variables via the HF API
const api = (p, body) => fetch(`https://huggingface.co/api/spaces/${space}/${p}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => { if (!r.ok) throw new Error(`${p} ${r.status} ${await r.text()}`); });
const secrets = {
  DATABASE_URL: env.NEON_DATABASE_URL, DIRECT_URL: env.NEON_DIRECT_URL, JWT_SECRET: env.JWT_SECRET, ENCRYPTION_KEY: env.ENCRYPTION_KEY,
  META_WEBHOOK_VERIFY_TOKEN: env.META_WEBHOOK_VERIFY_TOKEN, META_APP_ID: env.META_APP_ID, META_APP_SECRET: env.META_APP_SECRET,
  INSTAGRAM_APP_ID: env.INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET: env.INSTAGRAM_APP_SECRET,
};
for (const [key, value] of Object.entries(secrets)) if (value) await api('secrets', { key, value });
for (const [key, value] of Object.entries({ APP_URL: appUrl, API_URL: appUrl, CORS_ORIGINS: 'app://eazazi', NODE_ENV: 'production', EMBEDDED_PG: 'false', PAYMENT_PROVIDER: 'manual', META_GRAPH_VERSION: env.META_GRAPH_VERSION || 'v24.0' }))
  await api('variables', { key, value });
console.log('secrets set');

// 2) Build a clean copy of the committed tree with HF-specific Dockerfile + README header, then push.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-'));
execSync(`git archive HEAD | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'inherit', shell: 'bash' });
fs.rmSync(path.join(dir, 'apps', 'desktop'), { recursive: true, force: true });
fs.writeFileSync(path.join(dir, 'Dockerfile'), fs.readFileSync(path.join(ROOT, 'docker', 'Dockerfile'), 'utf8')
  .replace('PORT=4000', 'PORT=7860').replace('EXPOSE 4000', 'EXPOSE 7860').replace('localhost:4000', 'localhost:7860')
  .replace('pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts', 'DATABASE_URL=$DIRECT_URL pnpm exec prisma migrate deploy'));
const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
fs.writeFileSync(path.join(dir, 'README.md'), `---\ntitle: EAZAZI LEAD\nemoji: 📈\ncolorFrom: blue\ncolorTo: indigo\nsdk: docker\napp_port: 7860\npinned: false\n---\n\n${readme}`);
const run = (c) => execSync(c, { cwd: dir, stdio: 'inherit' });
run('git init -q -b main'); run('git add -A');
run('git -c user.name=deploy -c user.email=deploy@eazazi.local commit -qm deploy');
const [user] = space.split('/');
run(`git push -f -q https://${user}:${token}@huggingface.co/spaces/${space} main`);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`pushed — building at https://huggingface.co/spaces/${space}\napp: ${appUrl}`);
