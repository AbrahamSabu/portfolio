/**
 * How tracks are drawn: top-down vehicle shapes that turn with heading (the
 * default, how Flightradar24 reads), or MIL-STD-2525C tactical symbols.
 * Remembered per browser.
 */
export type SymbolStyle = 'shapes' | 'tactical';

const STORAGE_KEY = 'watchfloor.symbolStyle';

export class SymbolStyleSetting {
  private readonly listeners = new Set<() => void>();

  constructor(private current: SymbolStyle) {}

  get value(): SymbolStyle {
    return this.current;
  }

  set(style: SymbolStyle): void {
    if (style === this.current) return;
    this.current = style;
    for (const listener of this.listeners) listener();
  }

  toggle(): void {
    this.set(this.current === 'shapes' ? 'tactical' : 'shapes');
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Storage can be unavailable (private windows, blocked site data), so fall back quietly. */
export function loadSymbolStyle(): SymbolStyle {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'tactical') return 'tactical';
  } catch {
    // Use the default.
  }
  return 'shapes';
}

export function saveSymbolStyle(style: SymbolStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Not remembered; that's fine.
  }
}
