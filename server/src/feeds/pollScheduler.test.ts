import { describe, expect, it } from 'vitest';
import type { Logger } from '../log';
import { PollScheduler } from './pollScheduler';

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };

describe('PollScheduler restarted while a poll is in flight', () => {
  it('runs one polling chain, not two', async () => {
    let now = 0;
    let nextId = 1;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let resolveRun: (ms: number) => void = () => {};
    let runs = 0;
    const s = new PollScheduler(
      {
        run: () => {
          runs++;
          return new Promise<number>((r) => (resolveRun = r));
        },
        isActive: () => true,
        wantsEarlyPoll: () => false,
        isWaiting: () => false,
        describe: () => '',
      },
      {
        now: () => now,
        setTimer: (fn, ms) => {
          const id = nextId++;
          timers.set(id, { at: now + ms, fn });
          return id;
        },
        clearTimer: (id) => void timers.delete(id as number),
        log: quiet,
      },
    );
    const fireDue = () => {
      for (const [id, t] of [...timers.entries()]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    };
    s.start();
    fireDue(); // tick: run() is now pending
    expect(runs).toBe(1);
    s.stop();
    s.start(); // schedules a fresh poll at once
    expect(timers.size).toBe(1);
    resolveRun(5000); // the old run finishes after the restart
    await new Promise((r) => setTimeout(r, 0));
    // Expected: still one pending timer. Actual: two (the old chain rescheduled
    // itself because `running` was true again), and the first handle is lost.
    expect(timers.size).toBe(1);
  });
});
