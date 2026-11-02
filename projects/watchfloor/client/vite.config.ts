import { defineConfig } from 'vite';

const server = process.env.WATCHFLOOR_SERVER ?? 'http://127.0.0.1:8080';

export default defineConfig({
  // Read VITE_* variables from the repo-root .env, shared with the server.
  envDir: '..',
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: server.replace(/^http/, 'ws'), ws: true },
      '/healthz': server,
      '/api': server,
    },
  },
  build: {
    sourcemap: true,
    // MapLibre and milsymbol (all symbol standards) are large; they're cached after first load.
    chunkSizeWarningLimit: 2500,
  },
});
