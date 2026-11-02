import type { Finding, FindingKind } from '@watchfloor/shared';

/** What the operator reads on cards and markers. Observations, never conclusions. */
export const FINDING_LABEL: Record<FindingKind, string> = {
  circling: 'Circling',
  dark: 'AIS contact lost',
  converging: 'Converging',
};

/**
 * Whether a new finding earns a card in the alert stack. Circling and
 * converging are rare and worth a glance; a ship falling out of terrestrial
 * AIS coverage is routine, so those only mark the map.
 */
export function interrupts(f: Finding): boolean {
  return f.kind !== 'dark';
}

/**
 * The watchers' current findings, replaced whole by each `findings` message.
 * Listeners get the ones new since the last list; on the first list, none
 * (they were there before the page was).
 */
export class FindingStore {
  private list: Finding[] = [];
  private byId = new Map<string, Finding>();
  private loaded = false;
  private readonly listeners = new Set<(added: Finding[]) => void>();

  get items(): readonly Finding[] {
    return this.list;
  }

  get(id: string): Finding | undefined {
    return this.byId.get(id);
  }

  apply(items: Finding[]): void {
    const added = this.loaded ? items.filter((f) => !this.byId.has(f.id)) : [];
    this.loaded = true;
    this.list = items;
    this.byId = new Map(items.map((f) => [f.id, f]));
    for (const listener of this.listeners) listener(added);
  }

  subscribe(listener: (added: Finding[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
