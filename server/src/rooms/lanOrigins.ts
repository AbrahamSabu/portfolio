import type { NetworkInterfaceInfo } from 'node:os';
import { MAX_JOIN_ORIGINS, isJoinOrigin } from '@watchfloor/shared';

/** Whether a host the server binds (or a page is served from) is reachable from this computer only. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/** Binding these means every network interface. */
const ALL_INTERFACES = new Set(['0.0.0.0', '::', '']);

/**
 * Virtual adapters (Hyper-V, WSL, VirtualBox, VMware, Docker) carry private
 * addresses too, but a phone on the Wi-Fi can't reach them.
 */
const VIRTUAL_ADAPTER = /vethernet|wsl|virtualbox|vbox|vmware|docker|hyper-v|loopback/i;

/** Home networks mostly use 192.168/16, then 10/8; 172.16/12 is where virtual adapters tend to live. */
function privateRank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return -1;
}

/**
 * The addresses phones on the same network can open to reach this server,
 * best first, for the ops room's QR code. Empty when the server listens on
 * this computer only (the default, HOST=127.0.0.1): then nothing else can
 * reach it, and the main screen says how to opt in.
 */
export function lanOrigins(host: string, port: number, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  // Browsers drop a room message whose addresses are out of shape, so never send one.
  return candidates(host, port, interfaces).filter(isJoinOrigin).slice(0, MAX_JOIN_ORIGINS);
}

function candidates(host: string, port: number, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  if (isLoopbackHost(host)) return [];
  if (!ALL_INTERFACES.has(host)) {
    // One address on purpose (HOST=192.168.1.20, or a name): that's the one.
    return [`http://${host.includes(':') ? `[${host}]` : host}:${port}`];
  }
  const found: Array<{ address: string; rank: number; virtual: boolean }> = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      // Node 18.0-18.3 reported family as a number.
      const ipv4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (!ipv4 || info.internal) continue;
      const rank = privateRank(info.address);
      if (rank < 0) continue; // public, link-local (169.254) or carrier-grade NAT: not a home network
      found.push({ address: info.address, rank, virtual: VIRTUAL_ADAPTER.test(name) });
    }
  }
  // Stable sort: the OS's order breaks ties.
  found.sort((a, b) => Number(a.virtual) - Number(b.virtual) || a.rank - b.rank);
  return [...new Set(found.map((f) => `http://${f.address}:${port}`))];
}
