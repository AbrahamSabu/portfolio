import type { TrailLayer, TrailMode } from './trailLayer';

const NEXT: Record<TrailMode, TrailMode> = { all: 'selected', selected: 'off', off: 'all' };

const STORAGE_KEY = 'watchfloor.trailMode';

/**
 * The trail mode (all tracks, selected only, off), shared by the T key and
 * the Layers menu, and remembered per browser.
 */
export class TrailSetting {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly trails: TrailLayer) {}

  get mode(): TrailMode {
    return this.trails.mode;
  }

  set(mode: TrailMode): void {
    if (mode === this.trails.mode) return;
    this.trails.setMode(mode);
    saveTrailMode(mode);
    for (const listener of this.listeners) listener();
  }

  /** All → selected → off → all (the T key). */
  cycle(): void {
    this.set(NEXT[this.trails.mode]);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Storage can be unavailable (private windows, blocked site data), so fall back quietly. */
export function loadTrailMode(): TrailMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'all' || saved === 'selected' || saved === 'off') return saved;
  } catch {
    // Use the default.
  }
  return 'all';
}

function saveTrailMode(mode: TrailMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not remembered; that's fine.
  }
}
