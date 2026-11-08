import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import type { TrackSink } from '../feed';
import { ReadsbFeed, type ReadsbOptions } from './readsbFeed';
import { circlesFor } from './circles';
import { ADSB_LOL } from './services';

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };
/** 17 x 11 degrees on the equator: 3 rows x 2 cols of 250 nm circles = 6, the maximum. */
const BIG = { south: -8, west: 0, north: 9, east: 11 };

const ok = () => new Response('{"now":1793121200,"ac":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
const throttled = () => new Response('', { status: 429 });

function harness(extra: Partial<ReadsbOptions>, respond: () => Response) {
  let now = 1_793_121_200_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const calls: string[] = [];
  const feed = new ReadsbFeed({
    service: ADSB_LOL,
    pollMs: 10_000,
    fetch: (async (input: string | URL | Request) => {
      calls.push(String(input));
      return respond();
    }) as typeof fetch,
    now: () => now,
    random: () => 1,
    sleep: async () => {},
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id as number),
    log: silent,
    ...extra,
  });
  const sink: TrackSink = { upsert() {}, remove() {} };
  const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  };
  /** Move the clock, running timers as they fall due (polls are async, so flush after each). */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await flush();
    }
    now = end;
  };
  const nextTimerAt = () => Math.min(...[...timers.values()].map((t) => t.at));
  return { feed, sink, calls, advance, flush, nextTimerAt, now: () => now };
}

describe('ReadsbFeed request budget', () => {
  it('BIG is a six-circle view on adsb.lol', () => {
    expect(circlesFor([BIG])).toHaveLength(6);
  });

  it('keeps the per-circle budget (6 circles x 8 s = 48 s) when a watched view is re-sent after pollMs', async () => {
    const h = harness({}, ok);
    h.feed.setDemand(true);
    h.feed.start(h.sink);
    h.feed.setAreas([BIG]);
    await h.advance(0); // the first poll: six requests
    expect(h.calls).toHaveLength(6);
    const polledAt = h.now();
    expect(h.nextTimerAt()).toBe(polledAt + 48_000); // the regular poll honours minMsPerCircle

    // 11 s later the browser re-sends its view after a tiny pan (same snapped circles).
    await h.advance(11_000);
    h.feed.setAreas([BIG]);
    // Expected: the regular poll stays where it was (nothing new to cover).
    // Actual: warmDataIsOld() is true (last success > pollMs ago, watched), so an early
    // poll is scheduled 1 s out, and six more requests go 12 s after the last six.
    expect.soft(h.nextTimerAt()).toBe(polledAt + 48_000);
    await h.advance(2_000); // run whatever is due by polledAt + 13 s
    // Expected: still the six requests of the first poll. Actual: twelve.
    expect(h.calls).toHaveLength(6);
  });

  it('stops fetching the remaining circles of a poll once one of them was answered 429', async () => {
    const h = harness({}, throttled);
    h.feed.setDemand(true);
    h.feed.start(h.sink);
    h.feed.setAreas([BIG]);
    await h.advance(0);
    // Two circles are in flight at once, so at most two requests can have been
    // sent before the first 429 was seen. Actual: all six are sent (the worker
    // loop never looks at the results), each a 4xx that adsb.fi counts toward a ban.
    expect(h.calls.length).toBeLessThanOrEqual(2);
  });
});
