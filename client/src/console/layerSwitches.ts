import { LAYER_NAMES, type LayerName, type LayerState } from '@watchfloor/shared';

const LABEL: Record<LayerName, string> = {
  news: 'News',
  trails: 'Trails',
  symbols: 'Military symbols',
  radar: 'Weather radar',
  airports: 'Airports',
  hazards: 'Earthquakes and disasters',
  findings: 'Findings',
  chokepoints: 'Shipping chokepoints',
};

/** A tap waits this long for the screen to confirm before the switch shows the screen's word again. */
const PENDING_MS = 3_000;

/**
 * The Layers tab: one switch per layer, showing what the steered screen says
 * it shows. A tap flips the switch at once and waits for the screen's own
 * status to agree, so it doesn't flick back while the message is on its way.
 */
export class LayerSwitches {
  private readonly buttons = new Map<LayerName, HTMLButtonElement>();
  private readonly pending = new Map<LayerName, { on: boolean; at: number }>();
  private shown: LayerState | undefined;

  constructor(root: HTMLElement, onToggle: (layer: LayerName, on: boolean) => void) {
    for (const name of LAYER_NAMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'console-switch';
      button.setAttribute('role', 'switch');
      const label = document.createElement('span');
      label.textContent = LABEL[name];
      const knob = document.createElement('span');
      knob.className = 'console-switch-knob';
      knob.setAttribute('aria-hidden', 'true');
      button.append(label, knob);
      button.addEventListener('click', () => {
        const on = !this.value(name);
        this.pending.set(name, { on, at: Date.now() });
        onToggle(name, on);
        this.paint(true);
      });
      this.buttons.set(name, button);
      root.append(button);
    }
  }

  /** The steered screen's layers (undefined until it has said), and whether it is there to steer. */
  render(layers: LayerState | undefined, enabled: boolean): void {
    this.shown = layers;
    for (const [name, wish] of this.pending) {
      if (layers?.[name] === wish.on || Date.now() - wish.at > PENDING_MS) this.pending.delete(name);
    }
    this.paint(enabled);
  }

  private value(name: LayerName): boolean | undefined {
    return this.pending.get(name)?.on ?? this.shown?.[name];
  }

  private paint(enabled: boolean): void {
    for (const [name, button] of this.buttons) {
      const on = this.value(name);
      button.setAttribute('aria-checked', String(on === true));
      button.disabled = !enabled || on === undefined;
    }
  }
}
