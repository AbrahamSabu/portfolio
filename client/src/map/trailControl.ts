import type { IControl } from 'maplibre-gl';
import type { TrailLayer, TrailMode } from './trailLayer';

const NEXT: Record<TrailMode, TrailMode> = { all: 'selected', selected: 'off', off: 'all' };

const LABEL: Record<TrailMode, string> = {
  all: 'Trails: all tracks',
  selected: 'Trails: selected track only',
  off: 'Trails: off',
};

/** 16 px line icons, drawn in currentColor so they follow the control's text colour. */
const ICON: Record<TrailMode, string> = {
  all: '<path d="M2 13 6 9l3 2 5-6M2 9l4-4 3 2 5-5" opacity=".55"/><path d="M2 13 6 9l3 2 5-6"/>',
  selected: '<path d="M2 13 6 9l3 2 5-6"/><circle cx="14" cy="5" r="1.6" fill="currentColor"/>',
  off: '<path d="M2 13 6 9l3 2 5-6" opacity=".45"/><path d="M2 2l12 12"/>',
};

const STORAGE_KEY = 'watchfloor.trailMode';

/**
 * One button under the zoom controls that cycles trails through
 * all → selected → off. The choice is remembered per browser.
 */
export class TrailControl implements IControl {
  private container: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;

  constructor(private readonly trails: TrailLayer) {}

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trail-toggle';
    button.addEventListener('click', () => this.cycle());
    container.append(button);
    this.container = container;
    this.button = button;
    this.update();
    return container;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = null;
    this.button = null;
  }

  cycle(): void {
    const mode = NEXT[this.trails.mode];
    this.trails.setMode(mode);
    saveTrailMode(mode);
    this.update();
  }

  private update(): void {
    const button = this.button;
    if (!button) return;
    const mode = this.trails.mode;
    button.title = `${LABEL[mode]} (T)`;
    button.setAttribute('aria-label', LABEL[mode]);
    button.dataset.mode = mode;
    button.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[mode]}</svg>`;
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
