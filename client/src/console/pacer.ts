import type { RoomAction, ScreenName } from '@watchfloor/shared';

/** The server drops a console's controls sent less than 50 ms apart (rooms.ts): these go out at least this far apart. */
export const PACE_MS = 60;

interface Queued {
  to: ScreenName;
  action: RoomAction;
}

type Movement = Extract<RoomAction, { do: 'point' | 'pan' }>;
const isMovement = (a: RoomAction): a is Movement => a.do === 'point' || a.do === 'pan';
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * The console's outbox for screen controls. Everything goes out in order and
 * at least PACE_MS apart, so a tap right after a slide isn't dropped by the
 * server's pacing. Movement waiting to go merges with more movement of the
 * same kind for the same screen: the screen only needs the sum.
 */
export class Pacer {
  private readonly queue: Queued[] = [];
  private lastAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly send: (to: ScreenName, action: RoomAction) => void,
    private readonly now: () => number = () => performance.now(),
    private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
  ) {}

  push(to: ScreenName, action: RoomAction): void {
    const last = this.queue.at(-1);
    if (last && last.to === to && isMovement(last.action) && isMovement(action) && last.action.do === action.do) {
      last.action = { do: action.do, dx: clamp(last.action.dx + action.dx), dy: clamp(last.action.dy + action.dy) };
    } else {
      this.queue.push({ to, action });
    }
    this.pump();
  }

  private pump(): void {
    if (this.timer !== undefined || this.queue.length === 0) return;
    const wait = Math.max(0, this.lastAt + PACE_MS - this.now());
    this.timer = this.schedule(() => {
      this.timer = undefined;
      const next = this.queue.shift();
      if (next) {
        this.lastAt = this.now();
        this.send(next.to, next.action);
      }
      this.pump();
    }, wait);
  }
}
