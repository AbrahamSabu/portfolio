import { TRACK_VALUES, type Domain, type Platform, type Provider, type Track } from '@watchfloor/shared';

/**
 * What the operator has chosen to see: which kinds of vehicle, from which
 * sources, and whether stale tracks stay on screen.
 *
 * It filters the whole picture (map, trails, track list and counts), unlike
 * the list's own air/sea buttons and search, which only narrow the list.
 * The state records what is *hidden*, so anything new (a type or source this
 * build has never seen in a saved setting) shows by default.
 */
export type SourceKey = Provider | 'sim';

export interface FilterState {
  hiddenPlatforms: readonly Platform[];
  hiddenSources: readonly SourceKey[];
  showStale: boolean;
}

export const DEFAULT_FILTER: FilterState = { hiddenPlatforms: [], hiddenSources: [], showStale: true };

/** Vehicle types grouped the way the panel shows them, most common first. */
export const PLATFORMS_BY_DOMAIN: Record<Domain, readonly Platform[]> = {
  air: ['airliner', 'light-aircraft', 'helicopter', 'military-helicopter', 'maritime-patrol', 'uav', 'aircraft'],
  sea: ['cargo', 'tanker', 'passenger', 'fishing', 'leisure', 'warship', 'vessel'],
};

export const SOURCE_KEYS: readonly SourceKey[] = [...TRACK_VALUES.provider, 'sim'];

/** Who delivered a track's latest report; simulated tracks have no provider. */
export function sourceKeyOf(track: Track): SourceKey {
  return track.provider ?? 'sim';
}

export function isFiltering(state: FilterState): boolean {
  return state.hiddenPlatforms.length > 0 || state.hiddenSources.length > 0 || !state.showStale;
}

/** Saved settings are input like any other: keep only values this build knows. */
export function parseFilterState(raw: unknown): FilterState {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_FILTER;
  const r = raw as Record<string, unknown>;
  const known = <T extends string>(values: readonly T[], list: unknown): T[] =>
    Array.isArray(list) ? values.filter((v) => list.includes(v)) : [];
  return {
    hiddenPlatforms: known(TRACK_VALUES.platform, r.hiddenPlatforms),
    hiddenSources: known(SOURCE_KEYS, r.hiddenSources),
    showStale: r.showStale !== false,
  };
}

type Listener = () => void;

/**
 * The live filter: state plus Sets for the per-track check, which runs for
 * every track on every redraw (tens of thousands with the world loaded).
 */
export class PictureFilter {
  private current: FilterState;
  private platforms = new Set<Platform>();
  private sources = new Set<SourceKey>();
  private readonly listeners = new Set<Listener>();

  constructor(initial: FilterState = DEFAULT_FILTER) {
    this.current = initial;
    this.index();
  }

  get state(): FilterState {
    return this.current;
  }

  get active(): boolean {
    return isFiltering(this.current);
  }

  /** Whether a track is shown. `stale` is the caller's, since each view already works it out. */
  passes(track: Track, stale: boolean): boolean {
    if (stale && !this.current.showStale) return false;
    return !this.platforms.has(track.platform) && !this.sources.has(sourceKeyOf(track));
  }

  /** Show or hide some vehicle types: one, or a whole group at once. */
  setPlatforms(platforms: readonly Platform[], shown: boolean): void {
    const hidden = new Set(this.current.hiddenPlatforms);
    for (const p of platforms) {
      if (shown) hidden.delete(p);
      else hidden.add(p);
    }
    this.set({ ...this.current, hiddenPlatforms: TRACK_VALUES.platform.filter((p) => hidden.has(p)) });
  }

  setSource(source: SourceKey, shown: boolean): void {
    const hidden = new Set(this.current.hiddenSources);
    if (shown) hidden.delete(source);
    else hidden.add(source);
    this.set({ ...this.current, hiddenSources: SOURCE_KEYS.filter((s) => hidden.has(s)) });
  }

  setShowStale(showStale: boolean): void {
    this.set({ ...this.current, showStale });
  }

  reset(): void {
    this.set(DEFAULT_FILTER);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: FilterState): void {
    this.current = state;
    this.index();
    for (const l of this.listeners) l();
  }

  private index(): void {
    this.platforms = new Set(this.current.hiddenPlatforms);
    this.sources = new Set(this.current.hiddenSources);
  }
}

const STORAGE_KEY = 'watchfloor.filter';

/** Storage can be unavailable (private windows, blocked site data), so fall back quietly. */
export function loadFilterState(): FilterState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseFilterState(JSON.parse(saved)) : DEFAULT_FILTER;
  } catch {
    return DEFAULT_FILTER;
  }
}

export function saveFilterState(state: FilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not remembered; that's fine.
  }
}
