import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';

/**
 * The address a browser's limits are kept against (its connections, the
 * rooms it opens, the room codes it tries). Behind a proxy every connection
 * arrives from the proxy, so a public deployment names the header its proxy
 * sets to the visitor's own address (`CLIENT_IP_HEADER`). The header is
 * believed only when the connection comes from a private or loopback
 * address, i.e. from a proxy on this host or network: a visitor reaching the
 * server directly could set it to anything and dodge every limit. Name only
 * a header the proxy always overwrites: Render's proxy appends to
 * X-Forwarded-For, so a visitor can forge its first entry, while Cloudflare,
 * in front of Render, overwrites CF-Connecting-IP. The first named header
 * that holds an IP address wins; otherwise the socket's own address (a home
 * server, where each device has its own). Capped in length: it's a map key.
 */
export function clientAddress(headers: IncomingHttpHeaders, socketAddress: string | undefined, names: readonly string[]): string {
  if (socketAddress !== undefined && isPrivateAddress(socketAddress)) {
    for (const name of names) {
      const value = headers[name];
      const first = Array.isArray(value) ? value[0] : value;
      const address = first?.split(',')[0]?.trim() ?? '';
      if (isIP(address)) return address.slice(0, 64);
    }
  }
  return socketAddress ?? 'unknown';
}

/** Loopback, RFC 1918, link-local and unique-local addresses, IPv4-mapped ones included. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const lower = ip.toLowerCase();
  return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || lower.startsWith('fe80');
}
