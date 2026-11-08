import { describe, expect, it } from 'vitest';
import { clientAddress, isPrivateAddress } from './clientAddress';

describe('clientAddress', () => {
  it("uses the socket's address when no header is named (a home server)", () => {
    expect(clientAddress({ 'cf-connecting-ip': '203.0.113.9' }, '192.168.1.20', [])).toBe('192.168.1.20');
  });

  it('uses the first named header that holds an address, from a proxy on a private network', () => {
    const headers = { 'true-client-ip': '198.51.100.4', 'cf-connecting-ip': '203.0.113.9' };
    expect(clientAddress(headers, '10.0.0.1', ['cf-connecting-ip', 'true-client-ip'])).toBe('203.0.113.9');
    expect(clientAddress({ 'true-client-ip': '198.51.100.4' }, '10.0.0.1', ['cf-connecting-ip', 'true-client-ip'])).toBe('198.51.100.4');
    expect(clientAddress({ 'cf-connecting-ip': ' 203.0.113.9 , 10.0.0.1' }, '::ffff:127.0.0.1', ['cf-connecting-ip'])).toBe('203.0.113.9');
  });

  it('believes no header from a connection that came straight from the internet', () => {
    // A visitor reaching the server directly could set the header to anything and dodge every limit.
    expect(clientAddress({ 'cf-connecting-ip': '203.0.113.9' }, '198.51.100.77', ['cf-connecting-ip'])).toBe('198.51.100.77');
  });

  it("ignores headers it wasn't told to trust, such as a forged X-Forwarded-For, and values that aren't addresses", () => {
    expect(clientAddress({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, '10.0.0.1', ['cf-connecting-ip'])).toBe('10.0.0.1');
    expect(clientAddress({ 'cf-connecting-ip': 'x'.repeat(500) }, '10.0.0.1', ['cf-connecting-ip'])).toBe('10.0.0.1');
    expect(clientAddress({ 'cf-connecting-ip': 'not an address' }, '10.0.0.1', ['cf-connecting-ip'])).toBe('10.0.0.1');
    expect(clientAddress({}, undefined, ['cf-connecting-ip'])).toBe('unknown');
  });
});

describe('isPrivateAddress', () => {
  it('knows loopback, private and link-local ranges, IPv4-mapped ones included', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.20', '169.254.1.1', '::1', 'fd12::1', 'fe80::1', '::ffff:192.168.0.5']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '203.0.113.9', '2001:db8::1', '::ffff:203.0.113.9']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
