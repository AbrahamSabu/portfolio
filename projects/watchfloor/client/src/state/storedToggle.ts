/**
 * An on/off choice the page remembers in localStorage (airports shown, the
 * briefing open). Nothing stored, or storage unavailable: the default.
 */
export class StoredToggle {
  private readonly listeners = new Set<() => void>();
  private current: boolean;

  constructor(
    private readonly key: string,
    fallback: boolean,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeLocalStorage(),
  ) {
    let stored: string | null = null;
    try {
      stored = storage?.getItem(key) ?? null;
    } catch {
      // Blocked storage: use the default.
    }
    this.current = stored === 'true' ? true : stored === 'false' ? false : fallback;
  }

  get value(): boolean {
    return this.current;
  }

  set(value: boolean): void {
    if (value === this.current) return;
    this.current = value;
    try {
      this.storage?.setItem(this.key, String(value));
    } catch {
      // Private browsing: the choice just isn't remembered.
    }
    for (const listener of this.listeners) listener();
  }

  toggle(): void {
    this.set(!this.current);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
