import { ALERT_LIFE_MS } from '../state/alertLife';
import type { RegionEvent, RegionStore } from '../state/regions';
import type { NewsSettings } from '../state/newsStore';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatNewsTime, PLATFORM_LABEL } from './format';
import { AlertTimer } from './alertTimer';
import { EVENT_WORD } from './regionPanel';
import { speak } from './voice';

/** A busy area could flood the screen: the newest few show, the log has the rest. */
const MAX_CARDS = 2;

/**
 * Cards in the alert stack when a track enters or leaves a watched area
 * (as that area asks; lost contact goes to the log only, as it's usually a
 * receiver gap rather than news). In the display's blue, apart from the
 * squawks' amber and the hazards' apricot. Show selects the track. Cards
 * leave by themselves; the watch area's log keeps every event.
 */
export class RegionAlerts {
  private readonly timer: AlertTimer;
  /** Cards are numbered: one track can cross several areas, or one twice. */
  private seq = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly regions: RegionStore,
    private readonly store: TrackStore,
    private readonly selection: Selection,
    private readonly voice: NewsSettings,
    private readonly ping: () => void = () => {},
  ) {
    this.timer = new AlertTimer(root, ALERT_LIFE_MS, (id) => root.querySelector(`[data-life="${CSS.escape(id)}"]`)?.remove());
    root.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-id]');
      if (!button) return;
      if (button.dataset.action !== 'dismiss' && store.get(button.dataset.id!)) selection.select(button.dataset.id!);
      this.drop(button.closest<HTMLElement>('.alert-card'));
    });
  }

  show(events: readonly RegionEvent[]): void {
    for (const event of events) {
      const region = this.regions.get(event.regionId);
      if (!region) continue;
      if ((event.type === 'enter' && !region.onEnter) || (event.type === 'exit' && !region.onExit) || event.type === 'lost') continue;
      const name = event.callsign ?? 'No name';
      this.root.prepend(this.card(event, region.name, name, PLATFORM_LABEL[event.platform]));
      this.ping();
      if (this.voice.voice) speak(`${name} ${event.type === 'enter' ? 'entered' : 'left'} ${region.name}.`);
    }
    while (this.root.children.length > MAX_CARDS) this.drop(this.root.lastElementChild as HTMLElement | null);
  }

  private drop(card: HTMLElement | null): void {
    if (card?.dataset.life) this.timer.forget(card.dataset.life);
    card?.remove();
  }

  private card(event: RegionEvent, area: string, name: string, kind: string): HTMLElement {
    const card = document.createElement('article');
    card.className = 'alert-card region-alert';
    const life = `area-${++this.seq}`;
    card.dataset.life = life;
    card.setAttribute('role', 'status');
    const head = document.createElement('div');
    head.className = 'alert-head';
    const what = document.createElement('span');
    what.className = 'alert-code';
    what.textContent = EVENT_WORD[event.type].toUpperCase();
    const where = document.createElement('span');
    where.className = 'alert-meaning';
    where.textContent = area;
    const time = document.createElement('span');
    time.className = 'alert-since';
    time.textContent = formatNewsTime(event.at);
    head.append(what, where, time);
    const title = document.createElement('div');
    title.className = 'alert-line';
    const who = document.createElement('span');
    who.className = 'alert-title';
    who.textContent = name;
    const sub = document.createElement('span');
    sub.className = 'alert-kind';
    sub.textContent = ` · ${kind}`;
    title.append(who, sub);
    const actions = document.createElement('div');
    actions.className = 'alert-actions';
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'alert-show';
    show.dataset.id = event.trackId;
    show.textContent = 'Show';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'icon-button alert-dismiss';
    dismiss.dataset.id = event.trackId;
    dismiss.dataset.action = 'dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss alert');
    dismiss.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
    actions.append(show);
    // On the card itself: the actions row is positioned here, and would take the × with it.
    card.append(head, title, actions, dismiss);
    this.timer.start(life);
    return card;
  }
}
