import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'desktop' ? './' : '/',
  plugins: [react(), tailwindcss()],
  define: { __DESKTOP__: JSON.stringify(mode === 'desktop') },
  server: { port: Number(process.env.WEB_PORT || 5173), strictPort: true, proxy: { '/api': process.env.API_URL || 'http://localhost:4000' } },
  build: { chunkSizeWarningLimit: 1200 },
}));
