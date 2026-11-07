import type { RoomAction } from '@watchfloor/shared';

/** Less than this (a fraction of the pad) isn't worth a message. */
const DEAD_ZONE = 0.002;
/** Within this (a fraction of the pad) a finger hasn't moved: a tap, or the start of a hold. */
const SLOP = 0.03;
/** A tap is quicker than this. */
const TAP_MS = 350;
/** Holding still this long presses, in pointer mode: slide on to drag. */
const HOLD_MS = 450;
/** Pinching by this ratio of the fingers' spread is one zoom step. */
const PINCH_STEP = 1.35;
/** Movement is gathered and handed on this often (the pacer spaces messages further). */
const SEND_EVERY_MS = 60;

export type PadMode = 'pan' | 'pointer';

/**
 * The remote's touch pad. To move the map, drag and the steered screen's
 * map moves the way your finger went. In pointer mode it's that screen's
 * touchpad: slide to move the pointer, tap to click, hold still then slide
 * to drag. In both, two fingers move the map and a pinch zooms. Movement is
 * in fractions of the pad, so a sweep across the pad crosses the screen.
 * A pointer's first few pixels wait until it's clear the finger is sliding
 * rather than tapping, so a tap clicks exactly where the pointer was.
 */
export class RemotePad {
  private mode: PadMode = 'pan';
  private readonly fingers = new Map<number, { x: number; y: number }>();
  /** The first finger's start, for telling taps and holds from slides. */
  private start: { x: number; y: number; at: number } | null = null;
  private moved = false;
  /** Two fingers touched in this gesture: the one left behind doesn't point. */
  private multi = false;
  private dragging = false;
  private holdTimer = 0;
  private sendTimer = 0;
  /** The two fingers' distance at the last zoom step. */
  private spread = 0;
  private kind: 'pan' | 'point' = 'pan';
  private dx = 0;
  private dy = 0;

  constructor(
    private readonly pad: HTMLElement,
    private readonly send: (action: RoomAction) => void,
  ) {
    pad.addEventListener('pointerdown', (event) => this.down(event));
    pad.addEventListener('pointermove', (event) => this.move(event));
    pad.addEventListener('pointerup', (event) => this.up(event, false));
    pad.addEventListener('pointercancel', (event) => this.up(event, true));
  }

  setMode(mode: PadMode): void {
    this.mode = mode;
  }

  private down(event: PointerEvent): void {
    try {
      this.pad.setPointerCapture(event.pointerId); // synthetic pointers (tests) can't be captured
    } catch {
      // keep going without capture
    }
    this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pad.classList.add('console-pad-active');
    if (this.fingers.size === 1) {
      this.start = { x: event.clientX, y: event.clientY, at: performance.now() };
      this.moved = false;
      this.multi = false;
      if (this.mode === 'pointer') {
        this.holdTimer = window.setTimeout(() => {
          if (this.moved || this.fingers.size !== 1) return;
          this.dragging = true;
          this.flush();
          this.send({ do: 'press', down: true });
          navigator.vibrate?.(15);
          this.pad.classList.add('console-pad-holding');
        }, HOLD_MS);
      }
      return;
    }
    // A second finger: no tap and no hold. Two fingers move the map, a pinch zooms.
    window.clearTimeout(this.holdTimer);
    this.flush();
    this.moved = true;
    this.multi = true;
    this.spread = this.fingerSpread();
  }

  private move(event: PointerEvent): void {
    const prev = this.fingers.get(event.pointerId);
    if (!prev) return;
    const box = this.pad.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const fx = (event.clientX - prev.x) / box.width;
    const fy = (event.clientY - prev.y) / box.height;
    this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.fingers.size >= 2) {
      // Each finger's share: together, the movement of the point between them.
      this.gather('pan', fx / this.fingers.size, fy / this.fingers.size, true);
      const spread = this.fingerSpread();
      if (this.spread > 0 && (spread / this.spread > PINCH_STEP || this.spread / spread > PINCH_STEP)) {
        this.flush();
        this.send({ do: 'zoom', by: spread > this.spread ? 1 : -1 });
        this.spread = spread;
      }
      return;
    }
    if (this.multi || !this.start) return;
    if (!this.moved && Math.hypot((event.clientX - this.start.x) / box.width, (event.clientY - this.start.y) / box.height) > SLOP) {
      this.moved = true;
      window.clearTimeout(this.holdTimer);
    }
    if (this.mode === 'pan') {
      this.gather('pan', fx, fy, true);
      return;
    }
    // Pointer: hold the first few pixels back until it's a slide, a drag, or too slow for a tap.
    const sliding = this.moved || this.dragging || performance.now() - this.start.at > TAP_MS;
    this.gather('point', fx, fy, sliding);
  }

  private up(event: PointerEvent, cancelled: boolean): void {
    if (!this.fingers.delete(event.pointerId)) return;
    if (this.fingers.size > 0) {
      this.spread = this.fingerSpread();
      return;
    }
    window.clearTimeout(this.holdTimer);
    this.pad.classList.remove('console-pad-active', 'console-pad-holding');
    const tap =
      this.mode === 'pointer' && !cancelled && !this.moved && !this.dragging && this.start !== null && performance.now() - this.start.at < TAP_MS;
    if (tap) {
      this.dx = 0;
      this.dy = 0;
      window.clearTimeout(this.sendTimer);
      this.sendTimer = 0;
      this.send({ do: 'click' });
    } else {
      this.flush();
    }
    if (this.dragging) {
      this.dragging = false;
      this.send({ do: 'press', down: false });
    }
    this.start = null;
  }

  /** Movement of one kind adds up; a different kind sends what's gathered first. */
  private gather(kind: 'pan' | 'point', dx: number, dy: number, sendSoon: boolean): void {
    if (kind !== this.kind) this.flush();
    this.kind = kind;
    this.dx += dx;
    this.dy += dy;
    if (!sendSoon) return;
    this.sendTimer ||= window.setTimeout(() => {
      this.sendTimer = 0;
      this.flush();
    }, SEND_EVERY_MS);
  }

  private flush(): void {
    window.clearTimeout(this.sendTimer);
    this.sendTimer = 0;
    if (Math.abs(this.dx) < DEAD_ZONE && Math.abs(this.dy) < DEAD_ZONE) return;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.send({ do: this.kind, dx: clamp(this.dx), dy: clamp(this.dy) });
    this.dx = 0;
    this.dy = 0;
  }

  private fingerSpread(): number {
    const [a, b] = [...this.fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
