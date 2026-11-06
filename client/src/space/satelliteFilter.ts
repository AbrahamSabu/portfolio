import { SATELLITE_GROUPS, type SatelliteGroup } from '@watchfloor/shared';
import { GROUP_LABEL } from './satelliteFormat';

const KEY = 'watchfloor.satelliteGroups';

/**
 * Which satellite groups are hidden, remembered in localStorage like the
 * picture filter. The selected satellite is drawn whatever this says.
 */
export class SatelliteFilter {
  private readonly listeners = new Set<() => void>();
  private hidden: Set<SatelliteGroup>;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeLocalStorage()) {
    this.hidden = new Set(parseHidden(read(storage)));
  }

  isHidden(group: SatelliteGroup): boolean {
    return this.hidden.has(group);
  }

  /** One bit per group, in SATELLITE_GROUPS order: what the shader reads. */
  get mask(): number {
    return SATELLITE_GROUPS.reduce((m, g, i) => (this.hidden.has(g) ? m | (1 << i) : m), 0);
  }

  get active(): boolean {
    return this.hidden.size > 0;
  }

  setHidden(groups: readonly SatelliteGroup[], hidden: boolean): void {
    for (const g of groups) {
      if (hidden) this.hidden.add(g);
      else this.hidden.delete(g);
    }
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.hidden]));
    } catch {
      // Storage full or blocked: the choice still holds for this visit.
    }
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.setHidden(SATELLITE_GROUPS, false);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Saved groups, unknown names dropped (a group may be renamed or retired). */
export function parseHidden(raw: string | null): SatelliteGroup[] {
  try {
    const list = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(list) ? SATELLITE_GROUPS.filter((g) => list.includes(g)) : [];
  } catch {
    return [];
  }
}

function read(storage: Pick<Storage, 'getItem'> | undefined): string | null {
  try {
    return storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The filter panel's "Satellites" group: a box for all of them and one per
 * group with its count, built the way the panel builds its own rows (same
 * classes, so it looks and behaves like them), placed after the ships.
 */
export class SatelliteFilterSection {
  private readonly root: HTMLFieldSetElement;
  private counts: Partial<Record<SatelliteGroup, number>> = {};

  constructor(panel: HTMLElement, private readonly filter: SatelliteFilter) {
    this.root = document.createElement('fieldset');
    this.root.className = 'filter-group';
    const row = (attrs: string, label: string, countAttrs: string, className = '') =>
      `<label class="filter-row ${className}"><input type="checkbox" ${attrs} checked><span class="filter-label">${label}</span><span class="filter-count" ${countAttrs}>0</span></label>`;
    this.root.innerHTML = `<legend>${row('data-sat-all', 'Satellites', 'data-sat-count-all', 'filter-group-title')}</legend>${SATELLITE_GROUPS.map((g) =>
      row(`data-sat-group="${g}"`, GROUP_LABEL[g], `data-sat-count="${g}"`),
    ).join('')}`;
    const body = panel.querySelector<HTMLElement>('[data-body]');
    const ships = body?.querySelector('[data-group="sea"]')?.closest('fieldset');
    if (ships) ships.after(this.root);
    else body?.append(this.root);
    this.root.addEventListener('change', (event) => {
      const box = event.target;
      if (!(box instanceof HTMLInputElement)) return;
      // Stop here: the panel's own handler would look for its data-* names on it.
      event.stopPropagation();
      const group = box.dataset.satGroup as SatelliteGroup | undefined;
      filter.setHidden(group ? [group] : SATELLITE_GROUPS, !box.checked);
    });
    // The panel's Reset shows everything again: satellites too.
    panel.querySelector('[data-reset]')?.addEventListener('click', () => filter.reset());
    filter.subscribe(() => this.refresh());
    this.refresh();
  }

  setCounts(counts: Partial<Record<SatelliteGroup, number>>): void {
    this.counts = counts;
    this.refresh();
  }

  private refresh(): void {
    let shown = 0;
    let total = 0;
    for (const g of SATELLITE_GROUPS) {
      const n = this.counts[g] ?? 0;
      total += n;
      const box = this.root.querySelector<HTMLInputElement>(`[data-sat-group="${g}"]`);
      if (box) box.checked = !this.filter.isHidden(g);
      if (!this.filter.isHidden(g)) shown++;
      const count = this.root.querySelector(`[data-sat-count="${g}"]`);
      if (count) count.textContent = n.toLocaleString('en');
    }
    const all = this.root.querySelector<HTMLInputElement>('[data-sat-all]');
    if (all) {
      all.checked = shown === SATELLITE_GROUPS.length;
      all.indeterminate = shown > 0 && shown < SATELLITE_GROUPS.length;
    }
    const allCount = this.root.querySelector('[data-sat-count-all]');
    if (allCount) allCount.textContent = total.toLocaleString('en');
  }
}
