import { describe, expect, it } from 'vitest';
import { clientAddress } from './clientAddress';

describe('clientAddress', () => {
  it("uses the socket's address when no header is named (a home server)", () => {
    expect(clientAddress({ 'cf-connecting-ip': '203.0.113.9' }, '192.168.1.20', [])).toBe('192.168.1.20');
  });

  it('uses the first named header that is present', () => {
    const headers = { 'true-client-ip': '198.51.100.4', 'cf-connecting-ip': '203.0.113.9' };
    expect(clientAddress(headers, '10.0.0.1', ['cf-connecting-ip', 'true-client-ip'])).toBe('203.0.113.9');
    expect(clientAddress({ 'true-client-ip': '198.51.100.4' }, '10.0.0.1', ['cf-connecting-ip', 'true-client-ip'])).toBe('198.51.100.4');
  });

  it("ignores headers it wasn't told to trust, such as a forged X-Forwarded-For", () => {
    expect(clientAddress({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, '10.0.0.1', ['cf-connecting-ip'])).toBe('10.0.0.1');
  });

  it('takes the first of a list, trimmed, and caps the length', () => {
    expect(clientAddress({ 'cf-connecting-ip': ' 203.0.113.9 , 10.0.0.1' }, undefined, ['cf-connecting-ip'])).toBe('203.0.113.9');
    expect(clientAddress({ 'cf-connecting-ip': 'x'.repeat(500) }, undefined, ['cf-connecting-ip'])).toHaveLength(64);
    expect(clientAddress({}, undefined, ['cf-connecting-ip'])).toBe('unknown');
  });
});
