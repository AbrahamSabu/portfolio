import type { Hazard } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import { HAZARD_KIND_LABEL } from '../map/hazardIcons';
import { ALERT_LIFE_MS } from '../state/alertLife';
import { isSignificant, type HazardStore } from '../state/hazards';
import type { NewsSettings } from '../state/newsStore';
import type { StoredToggle } from '../state/storedToggle';
import { AlertTimer } from './alertTimer';
import { formatNewsTime } from './format';
import { speak } from './voice';

/**
 * An alert card (the emergency squawks' style, in the same stack) when a
 * significant hazard appears while the page is open: an M6+ quake, or a
 * GDACS orange or red alert. Ones already on the map when the page opened
 * don't interrupt. Show flies there and opens its card. Cards leave by
 * themselves; the marker stays.
 */
export class HazardAlerts {
  /** The ids of the cards up. */
  private readonly cards = new Set<string>();
  private readonly timer: AlertTimer;

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    hazards: HazardStore,
    shown: StoredToggle,
    voice: NewsSettings,
    private readonly open: (id: string) => void,
  ) {
    this.timer = new AlertTimer(root, ALERT_LIFE_MS, (id) => this.remove(id));
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
    if (this.cards.has(h.id)) return;
    const card = document.createElement('article');
    card.className = 'alert-card hazard-alert';
    card.dataset.hazard = h.id;
    card.dataset.life = h.id;
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
    title.className = 'alert-line';
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
    actions.append(show);
    // On the card itself: the actions row is positioned, and would take the × with it.
    card.append(head, title, actions, dismiss);
    this.root.append(card);
    this.cards.add(h.id);
    this.timer.start(h.id);
  }

  private remove(id: string): void {
    this.timer.forget(id);
    this.cards.delete(id);
    this.root.querySelector(`[data-hazard="${CSS.escape(id)}"]`)?.remove();
  }
}
