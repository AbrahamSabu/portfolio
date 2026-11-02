import type { Hazard } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import { HAZARD_KIND_LABEL } from '../map/hazardIcons';
import { isSignificant, type HazardStore } from '../state/hazards';
import type { NewsSettings } from '../state/newsStore';
import type { StoredToggle } from '../state/storedToggle';
import { formatNewsTime } from './format';
import { speak } from './voice';

/** A hazard alert goes away by itself after this long; the marker stays. */
const SHOW_MS = 5 * 60_000;

/**
 * An alert card (the emergency squawks' style, in the same stack) when a
 * significant hazard appears while the page is open: an M6+ quake, or a
 * GDACS orange or red alert. Ones already on the map when the page opened
 * don't interrupt. Show flies there and opens its card.
 */
export class HazardAlerts {
  private readonly timers = new Map<string, number>();

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    hazards: HazardStore,
    shown: StoredToggle,
    voice: NewsSettings,
    private readonly open: (id: string) => void,
  ) {
    hazards.subscribe((added) => {
      if (!shown.value) return;
      for (const h of added.filter(isSignificant)) {
        this.add(h);
        if (voice.voice) speak(`${HAZARD_KIND_LABEL[h.kind]}. ${h.title}.`);
      }
    });
    root.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-id]');
      const id = button?.dataset.id;
      if (!id) return;
      if (button.dataset.action !== 'dismiss') {
        const h = hazards.get(id);
        if (h) {
          fly(this.map, { center: [h.lon, h.lat], zoom: Math.max(this.map.getZoom(), 4) });
          this.open(id);
        }
      }
      this.remove(id);
    });
  }

  private add(h: Hazard): void {
    if (this.timers.has(h.id)) return;
    const card = document.createElement('article');
    card.className = 'alert-card hazard-alert';
    card.dataset.hazard = h.id;
    card.setAttribute('role', 'alert');
    const head = document.createElement('div');
    head.className = 'alert-head';
    const what = document.createElement('span');
    what.className = 'alert-code';
    what.textContent = HAZARD_KIND_LABEL[h.kind].toUpperCase();
    const level = document.createElement('span');
    level.className = 'alert-meaning';
    level.textContent = h.magnitude !== undefined ? `M ${h.magnitude.toFixed(1)}` : `GDACS ${h.alert ?? ''}`;
    const since = document.createElement('span');
    since.className = 'alert-since';
    since.textContent = formatNewsTime(h.time);
    head.append(what, level, since);
    const title = document.createElement('div');
    title.className = 'alert-kind';
    title.textContent = h.title;
    const actions = document.createElement('div');
    actions.className = 'alert-actions';
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'alert-show';
    show.dataset.id = h.id;
    show.textContent = 'Show';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'icon-button alert-dismiss';
    dismiss.dataset.id = h.id;
    dismiss.dataset.action = 'dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss alert');
    dismiss.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
    actions.append(show, dismiss);
    card.append(head, title, actions);
    this.root.append(card);
    this.timers.set(h.id, window.setTimeout(() => this.remove(h.id), SHOW_MS));
  }

  private remove(id: string): void {
    window.clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.root.querySelector(`[data-hazard="${CSS.escape(id)}"]`)?.remove();
  }
}
