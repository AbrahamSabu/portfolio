import type { IControl } from 'maplibre-gl';
import type { PictureFilter } from '../state/pictureFilter';
import type { FilterPanel } from '../ui/filterPanel';

/** A funnel, drawn in currentColor so it follows the control's text colour. */
const ICON = '<path d="M2.5 3h11l-4.2 5.2v4.3l-2.6 1.3V8.2z"/>';

/**
 * The button under the trail toggle that opens the filter panel (F). It
 * carries a dot while anything is filtered, so a thinned-out picture is
 * never mistaken for an empty sky.
 */
export class FilterControl implements IControl {
  private container: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;

  constructor(
    private readonly panel: FilterPanel,
    private readonly filter: PictureFilter,
  ) {
    filter.subscribe(() => this.update());
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-toggle';
    button.setAttribute('aria-controls', 'filter-panel');
    button.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${ICON}</svg>`;
    button.addEventListener('click', () => this.toggle());
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

  toggle(): void {
    this.panel.setOpen(!this.panel.open);
  }

  /** Called by the panel when it opens or closes, whoever closed it. */
  update(): void {
    const button = this.button;
    if (!button) return;
    const label = this.filter.active ? 'Filter: some tracks hidden' : 'Filter';
    button.title = `${label} (F)`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(this.panel.open));
    button.toggleAttribute('data-active', this.filter.active);
  }
}
