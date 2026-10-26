import { describe, expect, it } from 'vitest';
import { parseServerMessage } from './protocol';

describe('parseServerMessage', () => {
  it('accepts a v2 snapshot with trails', () => {
    const raw = JSON.stringify({ type: 'snapshot', serverTime: 1, tracks: [], trails: { 'sim:a': [[0, 50, 1]] } });
    expect(parseServerMessage(raw)?.type).toBe('snapshot');
  });

  it('rejects a snapshot without trails (a v1 server)', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'snapshot', serverTime: 1, tracks: [] }))).toBeNull();
  });

  it('rejects malformed and unknown messages', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'delta', serverTime: 1 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'mystery', serverTime: 1 }))).toBeNull();
  });
});
