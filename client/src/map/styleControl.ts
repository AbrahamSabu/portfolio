import type { IControl } from 'maplibre-gl';
import { saveSymbolStyle, type SymbolStyle, type SymbolStyleSetting } from '../state/symbolStyle';

const LABEL: Record<SymbolStyle, string> = {
  shapes: 'Symbols: vehicle shapes',
  tactical: 'Symbols: military (MIL-STD-2525C)',
};

/** 16 px icons in currentColor: a plane from above, or a 2525 air frame. */
const ICON: Record<SymbolStyle, string> = {
  shapes: '<path d="M8 1.5v4l5.5 3.5v1.5L8 9v3.5l2 1.5v1L8 14.5 6 15v-1l2-1.5V9l-5.5 1.5V9L8 5.5" fill="currentColor" stroke="none"/>',
  tactical: '<path d="M2.5 12V8a5.5 5.5 0 0 1 11 0v4"/><path d="M5 9.5h6M8 6.5v6"/>',
};

/**
 * One button under the trail toggle that switches between vehicle shapes and
 * tactical symbols (also the S key). The choice is remembered per browser.
 */
export class StyleControl implements IControl {
  private container: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;

  constructor(private readonly style: SymbolStyleSetting) {
    style.subscribe(() => {
      saveSymbolStyle(style.value);
      this.update();
    });
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'style-toggle';
    button.addEventListener('click', () => this.style.toggle());
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

  private update(): void {
    const button = this.button;
    if (!button) return;
    const style = this.style.value;
    button.title = `${LABEL[style]} (S)`;
    button.setAttribute('aria-label', LABEL[style]);
    button.dataset.style = style;
    button.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[style]}</svg>`;
  }
}
