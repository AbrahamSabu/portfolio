import type { RoomAction, ScreenName } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { PACE_MS, Pacer } from './pacer';

/** A pacer on a hand-wound clock: `run` fires everything scheduled up to a time. */
function harness() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const sent: { at: number; to: ScreenName; action: RoomAction }[] = [];
  const pacer = new Pacer(
    (to, action) => sent.push({ at: now, to, action }),
    () => now,
    (fn, ms) => {
      timers.push({ at: now + ms, fn });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
  );
  const run = (until: number) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = until;
  };
  return { pacer, sent, run };
}

describe("the console's paced outbox", () => {
  it('sends everything in order, never closer than the server allows', () => {
    const { pacer, sent, run } = harness();
    pacer.push('MAIN', { do: 'point', dx: 0.1, dy: 0 });
    pacer.push('MAIN', { do: 'click' });
    pacer.push('MAIN', { do: 'zoom', by: 1 });
    run(1_000);
    expect(sent.map((s) => s.action.do)).toEqual(['point', 'click', 'zoom']);
    for (let i = 1; i < sent.length; i++) expect(sent[i]!.at - sent[i - 1]!.at).toBeGreaterThanOrEqual(PACE_MS);
  });

  it('merges movement still waiting, but never across a click or between screens', () => {
    const { pacer, sent, run } = harness();
    pacer.push('MAIN', { do: 'click' }); // goes at once; what follows waits
    pacer.push('MAIN', { do: 'point', dx: 0.1, dy: 0.2 });
    pacer.push('MAIN', { do: 'point', dx: 0.3, dy: -0.1 });
    pacer.push('MAIN', { do: 'click' });
    pacer.push('MAIN', { do: 'point', dx: 0.9, dy: 0 });
    pacer.push('MAIN', { do: 'point', dx: 0.9, dy: 0 });
    pacer.push('SCREEN 2', { do: 'point', dx: 0.5, dy: 0 });
    run(1_000);
    expect(sent.map((s) => [s.to, s.action])).toEqual([
      ['MAIN', { do: 'click' }],
      ['MAIN', { do: 'point', dx: expect.closeTo(0.4, 10), dy: expect.closeTo(0.1, 10) }],
      ['MAIN', { do: 'click' }],
      ['MAIN', { do: 'point', dx: 1, dy: 0 }], // clamped to a whole screen
      ['SCREEN 2', { do: 'point', dx: 0.5, dy: 0 }],
    ]);
  });
});
