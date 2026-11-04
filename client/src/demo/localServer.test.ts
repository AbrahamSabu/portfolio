import type { ServerMessage, SnapshotMessage } from '@watchfloor/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../net/connection';
import { LocalServer } from './localServer';

beforeAll(() => {
  // The demo server only needs timers from `window`; Node has them globally.
  vi.stubGlobal('window', globalThis);
});

let server: LocalServer | undefined;
afterEach(() => server?.stop());

/** Start a demo server and collect what it says, until `until` is satisfied. */
async function run(until: (messages: ServerMessage[]) => boolean): Promise<{ messages: ServerMessage[]; states: ConnectionState[] }> {
  const messages: ServerMessage[] = [];
  const states: ConnectionState[] = [];
  server = new LocalServer({ onMessage: (m) => messages.push(m), onState: (s) => states.push(s) });
  server.start();
  await vi.waitFor(() => expect(until(messages)).toBe(true), { timeout: 15_000, interval: 50 });
  return { messages, states };
}

const snapshotOf = (messages: ServerMessage[]) => messages.find((m): m is SnapshotMessage => m.type === 'snapshot');

describe('LocalServer (the static demo)', () => {
  it('opens like a real server: hello first, simulated traffic, then a full snapshot', async () => {
    const { messages, states } = await run((m) => m.some((x) => x.type === 'snapshot'));
    expect(states.map((s) => s.status)).toEqual(['connecting', 'open']);
    const hello = messages[0];
    expect(hello?.type).toBe('hello');
    expect(hello?.type === 'hello' && hello.traffic).toBe('simulated');
    expect(snapshotOf(messages)!.tracks.length).toBeGreaterThan(50);
  });

  it('comes with history, so the timeline has a past to replay', async () => {
    const { messages } = await run((m) => m.some((x) => x.type === 'snapshot'));
    const ships = snapshotOf(messages)!.tracks.filter((t) => t.domain === 'sea');
    server!.send({ type: 'replay', bbox: { south: 48, west: -6, north: 52, east: 3 } });
    const replay = messages.find((m) => m.type === 'replay');
    expect(replay?.type).toBe('replay');
    if (replay?.type !== 'replay') return;
    // Ships stay in the area all run, so their paths reach well into the past.
    const oldest = Math.min(...replay.tracks.flatMap((t) => t.points.map((p) => p[2])));
    expect(Date.now() - oldest).toBeGreaterThan(50 * 60_000);
    expect(ships.length).toBeGreaterThan(20);
  });

  it('answers a track request with its path and (empty) details', async () => {
    const { messages } = await run((m) => m.some((x) => x.type === 'snapshot'));
    const id = snapshotOf(messages)!.tracks[0]!.id;
    server!.send({ type: 'track', id });
    const path = messages.find((m) => m.type === 'path');
    expect(path?.type === 'path' && path.points.length).toBeGreaterThan(1);
    expect(messages.some((m) => m.type === 'details')).toBe(true);
  });

  it('keeps ticking deltas once live', async () => {
    const { messages } = await run((m) => m.filter((x) => x.type === 'delta').length >= 2);
    const delta = messages.find((m) => m.type === 'delta');
    expect(delta?.type === 'delta' && delta.upserts.length).toBeGreaterThan(0);
  });
});
