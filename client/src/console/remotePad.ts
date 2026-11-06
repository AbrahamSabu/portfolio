/** A drag sends at most one pan this often: the server paces a console at 50 ms, a screen redraws at 10 Hz. */
const SEND_EVERY_MS = 100;
/** Less than this (a fraction of the pad) isn't worth a message. */
const DEAD_ZONE = 0.002;

/**
 * The remote's touch pad: drag on it and the steered screen's map moves the
 * way your finger did. Movement is collected as fractions of the pad and
 * sent every 100 ms at most, so a whole sweep across the pad moves the map
 * by about a screen.
 */
export class RemotePad {
  private dx = 0;
  private dy = 0;
  private last: { x: number; y: number } | null = null;
  private timer = 0;

  constructor(
    private readonly pad: HTMLElement,
    private readonly send: (dx: number, dy: number) => void,
  ) {
    pad.addEventListener('pointerdown', (event) => {
      try {
        pad.setPointerCapture(event.pointerId); // synthetic pointers (tests) can't be captured
      } catch {
        // keep going without capture
      }
      this.last = { x: event.clientX, y: event.clientY };
      pad.classList.add('console-pad-active');
    });
    pad.addEventListener('pointermove', (event) => {
      if (!this.last) return;
      const box = pad.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      this.dx += (event.clientX - this.last.x) / box.width;
      this.dy += (event.clientY - this.last.y) / box.height;
      this.last = { x: event.clientX, y: event.clientY };
      this.timer ||= window.setTimeout(() => {
        this.timer = 0;
        this.flush();
      }, SEND_EVERY_MS);
    });
    const end = () => {
      this.last = null;
      pad.classList.remove('console-pad-active');
      window.clearTimeout(this.timer);
      this.timer = 0;
      this.flush();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  private flush(): void {
    if (Math.abs(this.dx) < DEAD_ZONE && Math.abs(this.dy) < DEAD_ZONE) return;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.send(clamp(this.dx), clamp(this.dy));
    this.dx = 0;
    this.dy = 0;
  }
}
