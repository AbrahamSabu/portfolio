import type { ReplayMessage } from '@watchfloor/shared';
import { formatBehind, fractionOf, stateAt, type TimelineState } from '../state/timeline';

export interface TimelineDeps {
  now: () => number;
  /** Fires on every mode or moment change: main switches the layers over. */
  onState: (state: TimelineState) => void;
  /** Ask the server for the current view's recent paths (once per visit to the past). */
  requestReplay: () => void;
}

/** Playback speeds, cycled by the speed button. */
const SPEEDS = [60, 300, 900];
const TICK_MS = 100;

/**
 * The timeline bar: six hours of past, NOW, and thirty minutes of projected
 * future on one strip above the ticker. Drag left of NOW and the live picture
 * is replaced by the replay (tag: REPLAY); drag right and dead-reckoned
 * ghosts appear over the live picture (tag: PROJECTED). The bar is the
 * honesty device: whenever what's on screen isn't the present, it says so.
 */
export class Timeline {
  private state: TimelineState = { mode: 'live' };
  private readonly bar: HTMLElement;
  private readonly handle: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly tag: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly speedButton: HTMLButtonElement;
  private readonly liveButton: HTMLButtonElement;
  private speed = SPEEDS[1]!;
  private playTimer: number | undefined;
  private refreshTimer: number | undefined;
  private fetched = false;
  private trackCount: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: TimelineDeps,
  ) {
    this.bar = root.querySelector('[data-bar]')!;
    this.handle = root.querySelector('[data-handle]')!;
    this.fill = root.querySelector('[data-fill]')!;
    this.tag = root.querySelector('[data-tag]')!;
    this.playButton = root.querySelector('[data-play]')!;
    this.speedButton = root.querySelector('[data-speed]')!;
    this.liveButton = root.querySelector('[data-live-btn]')!;
    root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    this.liveButton.addEventListener('click', () => this.setState({ mode: 'live' }));
    this.playButton.addEventListener('click', () => this.togglePlay());
    this.speedButton.addEventListener('click', () => {
      this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]!;
      this.speedButton.textContent = `${this.speed}×`;
    });

    const scrubTo = (clientX: number) => {
      const rect = this.bar.getBoundingClientRect();
      this.setState(stateAt((clientX - rect.left) / rect.width, this.deps.now()));
    };
    this.bar.addEventListener('pointerdown', (event) => {
      this.stopPlay();
      try {
        this.bar.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic or already-lifted pointer can't be captured; the press still scrubs.
      }
      scrubTo(event.clientX);
    });
    this.bar.addEventListener('pointermove', (event) => {
      if (this.bar.hasPointerCapture(event.pointerId)) scrubTo(event.clientX);
    });
    this.handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      const f = fractionOf(this.state, this.deps.now()) + (event.key === 'ArrowLeft' ? -0.01 : 0.01);
      this.setState(stateAt(f, this.deps.now()));
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (this.root.hidden === !open) return;
    if (open) {
      this.root.hidden = false;
      this.fetched = false;
      this.trackCount = null;
      this.setState({ mode: 'live' }, true);
      // The tag and handle drift as now moves on; keep them honest.
      this.refreshTimer = window.setInterval(() => this.renderState(), 1000);
    } else {
      this.stopPlay();
      window.clearInterval(this.refreshTimer);
      this.root.hidden = true;
      this.setState({ mode: 'live' });
    }
  }

  /** The server's paths arrived: note how much of the picture the replay holds. */
  /** A fresh connection: a replay asked for while the link was down was never answered. */
  reconnected(): void {
    if (this.state.mode === 'replay') this.deps.requestReplay();
  }

  loaded(message: ReplayMessage): void {
    this.trackCount = message.tracks.length;
    if (message.truncated) this.trackCount = -message.tracks.length; // negative marks "capped"
    this.renderState();
  }

  private setState(state: TimelineState, force = false): void {
    const same =
      !force &&
      this.state.mode === state.mode &&
      (state.mode !== 'replay' || (this.state as { t?: number }).t === state.t) &&
      (state.mode !== 'project' || (this.state as { offsetMs?: number }).offsetMs === state.offsetMs);
    if (same) return;
    if (state.mode !== 'replay') this.stopPlay();
    this.state = state;
    if (state.mode === 'replay' && !this.fetched) {
      this.fetched = true;
      this.deps.requestReplay();
    }
    this.renderState();
    this.deps.onState(state);
  }

  private renderState(): void {
    const now = this.deps.now();
    const f = fractionOf(this.state, now);
    this.handle.style.left = this.fill.style.width = `${(f * 100).toFixed(2)}%`;
    this.root.dataset.mode = this.state.mode;
    this.playButton.hidden = this.speedButton.hidden = this.state.mode !== 'replay';
    this.liveButton.hidden = this.state.mode === 'live';
    this.tag.textContent = this.tagText(now);
    this.handle.setAttribute('aria-valuetext', this.tag.textContent);
  }

  private tagText(now: number): string {
    switch (this.state.mode) {
      case 'live':
        return 'LIVE';
      case 'replay': {
        const count =
          this.trackCount === null ? 'fetching paths…' : `${Math.abs(this.trackCount)} tracks${this.trackCount < 0 ? ' (capped)' : ''}`;
        return `REPLAY ${formatBehind(now - this.state.t)} · ${count}`;
      }
      case 'project':
        return `PROJECTED +${Math.max(1, Math.round(this.state.offsetMs / 60_000))} min`;
    }
  }

  private togglePlay(): void {
    if (this.playTimer !== undefined) {
      this.stopPlay();
      return;
    }
    this.playButton.textContent = 'Pause';
    this.playTimer = window.setInterval(() => {
      if (this.state.mode !== 'replay') {
        this.stopPlay();
        return;
      }
      const t = this.state.t + this.speed * TICK_MS;
      // Caught up with the present: back to live.
      this.setState(t >= this.deps.now() ? { mode: 'live' } : { mode: 'replay', t });
    }, TICK_MS);
  }

  private stopPlay(): void {
    window.clearInterval(this.playTimer);
    this.playTimer = undefined;
    this.playButton.textContent = 'Play';
  }
}
