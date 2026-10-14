import { defineConfig } from 'vite';

export default defineConfig({
  // This artifact is intentionally plain HTML/CSS/ES modules: no React plugin.
  base: process.env.BASE_PATH || '/',
  root: import.meta.dirname,
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
