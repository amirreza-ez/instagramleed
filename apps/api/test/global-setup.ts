// Points the app at the isolated test database, applies migrations and wipes data.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export default async function setup() {
  const env = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(env)) process.loadEnvFile(env);
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required (database must be running: pnpm db)');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  execSync('pnpm exec prisma migrate deploy', { cwd: path.resolve(__dirname, '..'), stdio: 'ignore', env: process.env });
  const p = new PrismaClient();
  const tables: { tablename: string }[] = await p.$queryRaw`select tablename from pg_tables where schemaname='public' and tablename <> '_prisma_migrations'`;
  await p.$executeRawUnsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(',')} cascade`);
  await p.$disconnect();
}
