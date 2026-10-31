import type { IControl } from 'maplibre-gl';

/** Something the menu can show and change, with a way to hear about changes made elsewhere (keys). */
interface Watched {
  subscribe(listener: () => void): unknown;
}

export interface SwitchRow {
  kind: 'switch';
  label: string;
  hint: string;
  key?: string;
  get(): boolean;
  set(on: boolean): void;
  /** Extra words beside the hint that change (the radar's time). */
  detail?: () => string;
  watch: Watched[];
}

export interface ChoiceRow {
  kind: 'choice';
  label: string;
  key: string;
  options: { value: string; label: string }[];
  get(): string;
  set(value: string): void;
  watch: Watched[];
}

export interface ActionRow {
  kind: 'action';
  label: string;
  key?: string;
  run(): void;
}

export type LayerRow = SwitchRow | ChoiceRow | ActionRow;
export interface LayerSection {
  title: string;
  rows: LayerRow[];
}

/** Every key the menu shows, in order: each must be unique, and in the map key's shortcut list. */
export function menuKeys(sections: readonly LayerSection[]): string[] {
  return sections.flatMap((s) => s.rows.flatMap((r) => (r.key ? [r.key] : [])));
}

/**
 * The Layers menu (M, or the stacked-sheets button): every way of changing
 * what the map shows, in one labelled place, each with a line saying what
 * it is and the key that does the same. The rows read and write the same
 * settings the keys do, and redraw when those change, so the two never
 * disagree. Shares the left side with the filter and watch areas: one at
 * a time.
 */
export class LayersPanel {
  private readonly openListeners = new Set<() => void>();
  private readonly refreshers: (() => void)[] = [];
  private built = false;

  /**
   * `sections` is called on first opening: the settings it wires to are
   * created all through main.ts, some after the menu's button must be
   * placed (it sits right under the zoom buttons).
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly sections: () => readonly LayerSection[],
    showKey: () => void,
  ) {
    root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    root.querySelector('[data-all-keys]')!.addEventListener('click', () => {
      this.setOpen(false);
      showKey();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    if (open && !this.built) {
      this.built = true;
      this.root.querySelector<HTMLElement>('[data-body]')!.replaceChildren(...this.sections().map((s) => this.section(s)));
    }
    this.root.hidden = !open;
    if (open) for (const refresh of this.refreshers) refresh();
    for (const listener of this.openListeners) listener();
  }

  onOpenChange(listener: () => void): void {
    this.openListeners.add(listener);
  }

  private section(section: LayerSection): HTMLElement {
    const el = document.createElement('section');
    el.className = 'layers-section';
    const title = document.createElement('h3');
    title.className = 'filter-group-title';
    title.textContent = section.title;
    el.append(title, ...section.rows.map((r) => this.row(r)));
    return el;
  }

  private row(row: LayerRow): HTMLElement {
    const el = document.createElement('div');
    el.className = `layers-row layers-row-${row.kind}`;
    const text = document.createElement('div');
    text.className = 'layers-text';
    const label = document.createElement('span');
    label.className = 'layers-label';
    label.textContent = row.label;
    text.append(label);
    const hint = document.createElement('span');
    hint.className = 'layers-hint';
    if (row.kind === 'switch') {
      hint.textContent = row.hint;
      text.append(hint);
    }
    const key = document.createElement('kbd');
    key.className = 'layers-key';
    key.textContent = row.key ?? '';
    key.hidden = !row.key;

    if (row.kind === 'switch') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layers-switch';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', row.label);
      button.innerHTML = '<span class="news-switch-track" aria-hidden="true"><span class="news-switch-thumb"></span></span>';
      button.addEventListener('click', () => row.set(!row.get()));
      // The whole row is the target, not just the little switch.
      el.addEventListener('click', (event) => {
        if (!(event.target as Element).closest('button')) row.set(!row.get());
      });
      const refresh = () => {
        const on = row.get();
        button.setAttribute('aria-checked', String(on));
        el.classList.toggle('layers-on', on);
        hint.textContent = row.detail && on ? `${row.hint} · ${row.detail()}` : row.hint;
      };
      for (const w of row.watch) w.subscribe(refresh);
      this.refreshers.push(refresh);
      refresh();
      el.append(text, key, button);
    } else if (row.kind === 'choice') {
      const group = document.createElement('div');
      group.className = 'layers-choice-group';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', row.label);
      const buttons = row.options.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.textContent = o.label;
        b.addEventListener('click', () => row.set(o.value));
        group.append(b);
        return { b, value: o.value };
      });
      const refresh = () => {
        const current = row.get();
        for (const { b, value } of buttons) b.setAttribute('aria-checked', String(value === current));
      };
      for (const w of row.watch) w.subscribe(refresh);
      this.refreshers.push(refresh);
      refresh();
      text.append(group);
      el.append(text, key);
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button layers-action';
      button.textContent = row.label;
      button.addEventListener('click', () => {
        this.setOpen(false);
        row.run();
      });
      el.replaceChildren(button, key);
    }
    return el;
  }
}

/** The stacked-sheets button under the zoom buttons. */
export class LayersControl implements IControl {
  private button: HTMLButtonElement | null = null;

  constructor(private readonly panel: LayersPanel) {
    panel.onOpenChange(() => this.button?.setAttribute('aria-expanded', String(panel.open)));
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Layers: what the map shows (M)';
    button.setAttribute('aria-label', 'Layers');
    button.setAttribute('aria-controls', 'layers-panel');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M8 2 14.5 5.5 8 9 1.5 5.5z"/><path d="M1.5 8.5 8 12l6.5-3.5" opacity=".75"/><path d="M1.5 11.25 8 14.75l6.5-3.5" opacity=".5"/></svg>';
    button.addEventListener('click', () => this.panel.setOpen(!this.panel.open));
    container.append(button);
    this.button = button;
    return container;
  }

  onRemove(): void {
    this.button?.parentElement?.remove();
    this.button = null;
  }
}
