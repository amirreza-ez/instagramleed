import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

async function bootstrap() {
  const { createApp } = await import('./app');
  const app = await createApp();
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}  (docs: /api/docs)`);
}
bootstrap();
