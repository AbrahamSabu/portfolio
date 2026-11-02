import type { Hazard } from '@watchfloor/shared';

/** Big enough to interrupt the operator: a strong quake, or GDACS's orange or red. */
export function isSignificant(h: Hazard): boolean {
  return (h.magnitude ?? 0) >= 6 || h.alert === 'orange' || h.alert === 'red';
}

/** How large to draw a hazard: by magnitude for quakes, by GDACS's alert level otherwise. */
export function hazardScale(h: Hazard): number {
  if (h.magnitude !== undefined) return Math.min(1.5, Math.max(0.55, 0.55 + (h.magnitude - 2.5) * 0.19));
  return h.alert === 'red' ? 1.3 : h.alert === 'orange' ? 1.05 : 0.75;
}

/**
 * The current hazards, replaced whole by each `hazards` message. Listeners
 * get the hazards that are new since the last list; on the first list,
 * none (they were there before the page was).
 */
export class HazardStore {
  private list: Hazard[] = [];
  private byId = new Map<string, Hazard>();
  private loaded = false;
  private readonly listeners = new Set<(added: Hazard[]) => void>();

  get items(): readonly Hazard[] {
    return this.list;
  }

  get(id: string): Hazard | undefined {
    return this.byId.get(id);
  }

  apply(items: Hazard[]): void {
    const added = this.loaded ? items.filter((h) => !this.byId.has(h.id)) : [];
    this.loaded = true;
    this.list = items;
    this.byId = new Map(items.map((h) => [h.id, h]));
    for (const listener of this.listeners) listener(added);
  }

  subscribe(listener: (added: Hazard[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
