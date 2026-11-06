import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isLoopbackHost, lanOrigins } from './lanOrigins';

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal, cidr: `${address}/24`,
});
const v6 = (address: string): NetworkInterfaceInfo => ({
  address, netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/64`, scopeid: 0,
});

/** A Windows laptop: Wi-Fi, a WSL adapter and loopback, in the order the OS lists them. */
const laptop = {
  'vEthernet (WSL)': [v4('172.29.16.1')],
  'Wi-Fi': [v6('fe80::1'), v4('192.168.1.20')],
  'Ethernet 2': [v4('10.0.0.7'), v4('169.254.10.2')],
  'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
  Tailscale: [v4('100.101.102.103')],
};

describe('isLoopbackHost', () => {
  it('knows the addresses only this computer can use', () => {
    for (const host of ['localhost', 'LOCALHOST', 'wall.localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    for (const host of ['0.0.0.0', '::', '192.168.1.20', 'example.org', '127.example.org']) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });
});

describe('lanOrigins', () => {
  it('offers nothing while the server listens on this computer only', () => {
    expect(lanOrigins('127.0.0.1', 8103, laptop)).toEqual([]);
    expect(lanOrigins('localhost', 8103, laptop)).toEqual([]);
  });

  it('lists home-network addresses on every interface, Wi-Fi first and virtual adapters last', () => {
    expect(lanOrigins('0.0.0.0', 8103, laptop)).toEqual([
      'http://192.168.1.20:8103',
      'http://10.0.0.7:8103',
      'http://172.29.16.1:8103',
    ]);
    expect(lanOrigins('::', 8103, laptop)[0]).toBe('http://192.168.1.20:8103');
  });

  it('uses the one address the server was told to bind', () => {
    expect(lanOrigins('192.168.1.20', 8103, laptop)).toEqual(['http://192.168.1.20:8103']);
    expect(lanOrigins('fd00::20', 8103, laptop)).toEqual(['http://[fd00::20]:8103']);
    expect(lanOrigins('watchfloor.lan', 8080, laptop)).toEqual(['http://watchfloor.lan:8080']);
  });

  it('never offers what a browser would refuse', () => {
    expect(lanOrigins('bad_host!', 8080, laptop)).toEqual([]);
    const many = { eth: Array.from({ length: 12 }, (_, i) => v4(`10.0.0.${i + 1}`)) };
    expect(lanOrigins('0.0.0.0', 8080, many)).toHaveLength(8);
  });
});
