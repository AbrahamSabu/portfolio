import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage } from './protocol';

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

describe('parseClientMessage', () => {
  const view = (bbox: unknown) => JSON.stringify({ type: 'view', bbox });

  it('accepts a view, including longitudes past ±180 from a wrapped map', () => {
    expect(parseClientMessage(view({ south: 49, west: -5, north: 52, east: 2 }))).toEqual({
      type: 'view',
      bbox: { south: 49, west: -5, north: 52, east: 2 },
    });
    expect(parseClientMessage(view({ south: -20, west: 170, north: 0, east: 190 }))).not.toBeNull();
  });

  it('keeps only the four numbers, dropping anything extra', () => {
    const parsed = parseClientMessage(JSON.stringify({ type: 'view', bbox: { south: 0, west: 0, north: 1, east: 1, x: 'y' }, z: 1 }));
    expect(parsed).toEqual({ type: 'view', bbox: { south: 0, west: 0, north: 1, east: 1 } });
  });

  it('rejects junk, inverted boxes and impossible coordinates', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'hello' }))).toBeNull();
    expect(parseClientMessage(view(null))).toBeNull();
    expect(parseClientMessage(view({ south: '1', west: 0, north: 2, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 0, west: 0, north: Infinity, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 10, west: 0, north: 5, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 0, west: 5, north: 1, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: -91, west: 0, north: 1, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 0, west: -1000, north: 1, east: 1 }))).toBeNull();
  });
});
