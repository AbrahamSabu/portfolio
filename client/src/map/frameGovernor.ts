/**
 * Never fewer than this share of the full particle budget: below it the
 * currents would all but vanish, and on a slow machine most of the cost is
 * the map's own drawing anyway (measured: the page's main-thread time was
 * the same with currents on and off).
 */
export const MIN_SCALE = 0.3;
/** Frames are judged once a second. */
const CHECK_MS = 1000;
/** Late: the second's median frame is this much longer than the best recent one... */
const LATE_RATIO = 1.35;
/** ...and slower than this in any case (50 fps). */
const LATE_FLOOR_MS = 20;
/** Slower than this (about 22 fps) is late whatever came before: no display refreshes that slowly by design. */
const SLOW_MS = 45;
/** Seconds late in a row before trimming: a one-second hitch is not a slow machine. */
const LATE_CHECKS = 2;
/** On time: the median frame within this of the best recent one. */
const ON_TIME_RATIO = 1.2;
/** Seconds on time in a row before anything is given back. */
const CALM_CHECKS = 2;
/**
 * How fast the remembered best frame drifts back up (ms per frame), so one
 * lucky frame doesn't set the bar forever; slowly, or a machine held at 33
 * fps by the particles would soon pass that off as its display's rate.
 */
const BEST_CREEP_MS = 0.002;
/** Gaps longer than this are a hidden tab or a breakpoint, not a slow frame. */
const PAUSE_MS = 250;

/**
 * Keeps an animation near the display's frame rate on any machine. It
 * watches the time between frames (everything on the page, the map's own
 * drawing included, not just ours), trims `scale` when frames run late for a
 * couple of seconds, and gives it back once they're on time again.
 *
 * Each second is judged by its median frame, so the odd long frame (a
 * garbage collection, a field being sampled) doesn't count; and against the
 * best recent frame, not a fixed 60 fps, so a 30 fps cap (the screensaver)
 * and a 144 Hz display both count as on time. Below about 22 fps it trims
 * whatever the history, or a machine that was always slow would never count
 * as late.
 */
export class FrameGovernor {
  /** Share of the full budget to use, MIN_SCALE to 1. */
  scale = 1;
  private readonly frames: number[] = [];
  private best = Infinity;
  private sinceCheck = 0;
  private late = 0;
  private calm = 0;
  private heldMs = 0;

  /**
   * Don't judge the next `ms` of frames: a fresh picture (page load, a new
   * zoom) has the map loading tiles, which says nothing about this machine.
   */
  hold(ms: number): void {
    this.heldMs = Math.max(this.heldMs, ms);
    this.frames.length = 0;
    this.sinceCheck = 0;
    this.late = 0;
    this.calm = 0;
  }

  /** One frame took `dtMs`. True when `scale` changed. */
  observe(dtMs: number): boolean {
    if (!(dtMs > 0) || dtMs > PAUSE_MS) return false;
    if (this.heldMs > 0) {
      this.heldMs -= dtMs;
      return false;
    }
    this.frames.push(dtMs);
    this.best = Math.min(dtMs, this.best + BEST_CREEP_MS);
    this.sinceCheck += dtMs;
    if (this.sinceCheck < CHECK_MS) return false;
    this.sinceCheck = 0;
    const median = this.frames.sort((a, b) => a - b)[this.frames.length >> 1]!;
    this.frames.length = 0;
    const before = this.scale;
    if (median > SLOW_MS || median > Math.max(LATE_FLOOR_MS, this.best * LATE_RATIO)) {
      this.calm = 0;
      if (++this.late >= LATE_CHECKS) {
        this.scale = Math.max(MIN_SCALE, this.scale * 0.75);
        this.late = 0;
      }
    } else if (median < this.best * ON_TIME_RATIO) {
      this.late = 0;
      if (++this.calm >= CALM_CHECKS) {
        this.scale = Math.min(1, this.scale * 1.25);
        this.calm = 0;
      }
    } else {
      this.late = 0;
      this.calm = 0;
    }
    return this.scale !== before;
  }
}
