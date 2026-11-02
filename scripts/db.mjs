// Run the embedded PostgreSQL in the foreground (Ctrl+C to stop).
import { startPg } from './pg.mjs';
import { ensureEnv } from './env.mjs';
const env = ensureEnv();
const pg = await startPg({ port: Number(env.PG_PORT || 54329), password: env.PG_PASSWORD || 'eazazi' });
const stop = async () => { if (pg) await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
