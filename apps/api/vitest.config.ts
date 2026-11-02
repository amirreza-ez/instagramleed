import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 120_000, fileParallelism: false, globalSetup: ['test/global-setup.ts'], include: ['test/**/*.spec.ts'] },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
