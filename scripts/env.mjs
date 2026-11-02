import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './pg.mjs';

// Creates .env with strong random secrets on first run, then loads it.
export function ensureEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    let tpl = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    tpl = tpl.replace(/=__RANDOM_(\d+)__/g, (_, n) => '=' + crypto.randomBytes(Number(n)).toString('hex'));
    fs.writeFileSync(file, tpl);
    console.log('[env] created .env with generated secrets');
  }
  process.loadEnvFile(file);
  return process.env;
}
