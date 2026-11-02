import type { TrailLayer, TrailMode, TrailStyle } from './trailLayer';

const NEXT: Record<TrailMode, TrailMode> = { all: 'selected', selected: 'off', off: 'all' };

const STORAGE_KEY = 'watchfloor.trailMode';
const STYLE_KEY = 'watchfloor.trailStyle';

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

  get style(): TrailStyle {
    return this.trails.style;
  }

  /** Line, or a radar scope's fading blips; from the Layers menu, remembered per browser. */
  setStyle(style: TrailStyle): void {
    if (style === this.trails.style) return;
    this.trails.setStyle(style);
    save(STYLE_KEY, style);
    for (const listener of this.listeners) listener();
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

export function loadTrailStyle(): TrailStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved === 'line' || saved === 'scope') return saved;
  } catch {
    // Use the default.
  }
  return 'line';
}

function saveTrailMode(mode: TrailMode): void {
  save(STORAGE_KEY, mode);
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; that's fine.
  }
}
