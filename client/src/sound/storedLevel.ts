/**
 * A level from 0 to 1 the page remembers in localStorage (the score's
 * volume): StoredToggle's twin for a number. Nothing stored, garbage stored
 * or storage unavailable: the default.
 */
export class StoredLevel {
  private readonly listeners = new Set<() => void>();
  private current: number;

  constructor(
    private readonly key: string,
    fallback: number,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeLocalStorage(),
  ) {
    let stored: string | null = null;
    try {
      stored = storage?.getItem(key) ?? null;
    } catch {
      // Blocked storage: use the default.
    }
    const parsed = stored === null || stored.trim() === '' ? NaN : Number(stored);
    this.current = Number.isFinite(parsed) ? clamp(parsed) : clamp(fallback);
  }

  get value(): number {
    return this.current;
  }

  set(value: number): void {
    const next = clamp(value);
    if (next === this.current || Number.isNaN(next)) return;
    this.current = next;
    try {
      this.storage?.setItem(this.key, String(next));
    } catch {
      // Private browsing: the level just isn't remembered.
    }
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
