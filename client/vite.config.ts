import { defineConfig } from 'vite';

const server = process.env.WATCHFLOOR_SERVER ?? 'http://127.0.0.1:8080';

export default defineConfig(({ mode }) => {
  // `vite build --mode demo`: a static build with the server inside the page
  // (src/demo/localServer.ts), for hosting anywhere files are served.
  const demo = mode === 'demo';
  return {
    // Read VITE_* variables from the repo-root .env, shared with the server.
    envDir: '..',
    // Relative asset paths, so the demo works from any folder (GitHub Pages
    // serves it under /portfolio/demos/watchfloor/, not the site root).
    base: demo ? './' : '/',
    define: demo
      ? {
          'import.meta.env.VITE_DEMO': JSON.stringify('sim'),
          // The server's logger reads its level at load; a browser has no process.
          'process.env.LOG_LEVEL': 'undefined',
        }
      : {},
    server: {
      port: 5173,
      proxy: {
        '/ws': { target: server.replace(/^http/, 'ws'), ws: true },
        '/healthz': server,
        '/api': server,
      },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      sourcemap: !demo,
      // MapLibre and milsymbol (all symbol standards) are large; they're cached after first load.
      chunkSizeWarningLimit: 2500,
    },
  };
});
