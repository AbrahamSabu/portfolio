import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export interface HttpOptions {
  /** Built client to serve in production. Ignored if it doesn't exist (dev uses Vite). */
  staticDir: string;
  health: () => Record<string, unknown>;
  /** An airport's latest METAR, for `/api/weather/<ICAO>`. */
  weather?: (station: string) => Promise<unknown>;
  /** The live aircraft near a point, for the plane-spotter's `/api/sky?lat=…&lon=…`. */
  sky?: (lat: number, lon: number) => unknown;
}

/**
 * HTTP side of the server: a health endpoint plus static hosting of the built
 * client, so production is a single process on a single port.
 */
export function createHttpServer(opts: HttpOptions): http.Server {
  const root = path.resolve(opts.staticDir);
  const hasStatic = fs.existsSync(path.join(root, 'index.html'));

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, ...opts.health() }));
      return;
    }

    if (url.pathname === '/api/sky' && opts.sky) {
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      // Number('') is 0, so a missing parameter must be caught before the range check.
      if (!url.searchParams.get('lat') || !url.searchParams.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('lat and lon, in degrees');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(opts.sky(lat, lon)));
      return;
    }

    const weather = /^\/api\/weather\/([A-Z0-9]{4})$/.exec(url.pathname);
    if (weather && opts.weather) {
      opts.weather(weather[1]!).then(
        (body) => {
          // Browsers may keep it a few minutes too: METARs change every half hour or hour.
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' });
          res.end(JSON.stringify({ weather: body }));
        },
        () => res.writeHead(502).end(),
      );
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }

    if (!hasStatic) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No built client found. In development, open the Vite dev server (npm run dev).\n');
      return;
    }

    serveStatic(root, url.pathname, req, res);
  });
}

function serveStatic(
  root: string,
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // Resolve inside root only; anything that escapes (../) is refused.
  const requested = path.resolve(root, '.' + path.posix.normalize(decoded));
  if (requested !== root && !requested.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }

  let file = requested;
  if (!isFile(file)) {
    // Unknown paths fall back to the app shell; missing assets are a real 404.
    if (path.extname(file)) {
      res.writeHead(404).end();
      return;
    }
    file = path.join(root, 'index.html');
  }

  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
