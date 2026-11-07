import type { IncomingHttpHeaders } from 'node:http';

/**
 * The address a browser's limits are kept against (its connections, the
 * rooms it opens, the room codes it tries). Behind a proxy every connection
 * arrives from the proxy, so a public deployment names the header its proxy
 * sets to the visitor's own address (`CLIENT_IP_HEADER`). Name only a header
 * the proxy always overwrites: Render's proxy appends to X-Forwarded-For, so
 * a visitor can forge its first entry, while Cloudflare, in front of Render,
 * overwrites CF-Connecting-IP. The first named header present wins; without
 * one, the socket's own address (a home server, where each device has its
 * own). Capped in length: it becomes a map key.
 */
export function clientAddress(headers: IncomingHttpHeaders, socketAddress: string | undefined, names: readonly string[]): string {
  for (const name of names) {
    const value = headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    const address = first?.split(',')[0]?.trim();
    if (address) return address.slice(0, 64);
  }
  return socketAddress ?? 'unknown';
}
