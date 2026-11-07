import { deadReckon } from '@watchfloor/shared';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import { SQUAWK_LIFE_MS } from '../state/alertLife';
import type { ServerClock } from '../state/clock';
import { EmergencyWatch, type Emergency } from '../state/emergencies';
import type { NewsSettings } from '../state/newsStore';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { AlertTimer } from './alertTimer';
import { formatAltitude, formatNewsTime, formatSpeed, PLATFORM_LABEL } from './format';
import { speak } from './voice';

/** Emergencies are checked each second: the store changes about that often. */
const CHECK_MS = 1_000;

/**
 * Emergency squawks: an alert card under the top bar for each aircraft
 * squawking 7500, 7600 or 7700, and an amber ring round it on the map. The
 * card says the code is as broadcast (codes get set by mistake), offers to
 * show the aircraft, and can be hidden; after half a minute it hides itself.
 * Nothing is lost by hiding it: while
 * any code is broadcast a chip in the top bar says so (click: the cards come
 * back, or with one squawk the aircraft is shown), the ring can be clicked,
 * and the aircraft's details say it too. Read aloud when read-aloud is on.
 * Amber, never an identity colour: an emergency says nothing about friend
 * or foe.
 */
export class EmergencyAlerts {
  private readonly watch = new EmergencyWatch();
  private readonly dismissed = new Set<string>();
  private readonly rings = new Map<string, Marker>();
  private readonly timer: AlertTimer;
  private signature = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly selection: Selection,
    private readonly voice: NewsSettings,
    private readonly chip: HTMLButtonElement,
    private readonly ping: () => void = () => {},
  ) {
    // Its time up, a card folds into the chip, exactly as if hidden.
    this.timer = new AlertTimer(root, SQUAWK_LIFE_MS, (id) => {
      this.dismissed.add(id);
      this.render();
      this.updateChip();
    });
    chip.addEventListener('click', () => {
      const active = this.watch.active.filter((e) => this.store.get(e.id));
      this.dismissed.clear();
      for (const e of active) this.timer.start(e.id);
      this.render();
      if (active.length === 1) this.show(active[0]!.id);
    });
    root.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-id]');
      if (!button?.dataset.id) return;
      if (button.dataset.action === 'dismiss') {
        this.timer.forget(button.dataset.id);
        this.dismissed.add(button.dataset.id);
        this.render();
      } else this.show(button.dataset.id);
    });
    window.setInterval(() => this.check(), CHECK_MS);
  }

  /** The squawks being broadcast right now, for the tour. */
  get active(): readonly Emergency[] {
    return this.watch.active.filter((e) => this.store.get(e.id));
  }

  private check(): void {
    const now = this.clock.now();
    for (const emergency of this.watch.update(this.store.all(), now)) {
      this.ping();
      this.dismissed.delete(emergency.id);
      this.timer.start(emergency.id);
      if (this.voice.voice) this.announce(emergency);
    }
    this.render();
    this.moveRings(now);
    this.updateChip();
  }

  /** The top bar chip: there while any aircraft squawks, whether or not its card is showing. */
  private updateChip(): void {
    const active = this.watch.active.filter((e) => this.store.get(e.id));
    this.chip.hidden = active.length === 0;
    if (active.length === 0) return;
    const codes = [...new Set(active.map((e) => e.squawk))].join(', ');
    this.chip.textContent = active.length === 1 ? `Squawk ${codes}` : `${active.length} squawks · ${codes}`;
    const hidden = active.filter((e) => this.dismissed.has(e.id)).length;
    this.chip.title = active.length === 1 ? 'Show the aircraft squawking an emergency code' : hidden ? 'Bring back the hidden alerts' : 'Aircraft squawking emergency codes';
  }

  private show(id: string): void {
    const track = this.store.get(id);
    if (!track) return;
    this.selection.select(id);
    fly(this.map, { center: [track.lon, track.lat], zoom: Math.max(this.map.getZoom(), 7) });
  }

  private announce(e: Emergency): void {
    const track = this.store.get(e.id);
    const who = track?.callsign ?? 'An aircraft';
    speak(`Emergency squawk. ${who}, squawking ${e.squawk.split('').join(' ')}: ${e.meaning.toLowerCase()}.`);
  }

  private render(): void {
    const shown = this.watch.active.filter((e) => !this.dismissed.has(e.id) && this.store.get(e.id));
    // Rebuilt when the set of alerts changes; their facts refresh each check.
    const signature = shown.map((e) => `${e.id}:${e.squawk}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.root.replaceChildren(...shown.map((e) => this.card(e)));
    }
    for (const card of this.root.querySelectorAll<HTMLElement>('[data-track]')) {
      const track = this.store.get(card.dataset.track!);
      const facts = card.querySelector('[data-facts]');
      if (track && facts) facts.textContent = [formatAltitude(track.altitudeM), formatSpeed(track.speedMps)].map((f) => (f ? ` · ${f}` : '')).join('');
    }
  }

  /** Text only via textContent: callsigns and models come from the feeds. */
  private card(e: Emergency): HTMLElement {
    const track = this.store.get(e.id)!;
    const card = document.createElement('article');
    card.className = 'alert-card';
    card.dataset.track = e.id;
    card.dataset.life = e.id;
    card.setAttribute('role', 'alert');

    const head = document.createElement('div');
    head.className = 'alert-head';
    const code = document.createElement('span');
    code.className = 'alert-code';
    code.textContent = `SQUAWK ${e.squawk}`;
    // The card is two lines now; the caveat is a tooltip here and a line in the details panel.
    code.title = 'As broadcast by its transponder: a code can be set by mistake.';
    const meaning = document.createElement('span');
    meaning.className = 'alert-meaning';
    meaning.textContent = e.meaning;
    const since = document.createElement('span');
    since.className = 'alert-since';
    since.textContent = formatNewsTime(e.since);
    since.title = `Squawking since ${formatNewsTime(e.since)}`;
    head.append(code, meaning, since);

    // One line: callsign, then type and the facts (refreshed each check).
    const line = document.createElement('div');
    line.className = 'alert-line';
    const title = document.createElement('span');
    title.className = 'alert-title';
    title.textContent = track.callsign ?? 'No callsign';
    const kind = document.createElement('span');
    kind.className = 'alert-kind';
    kind.textContent = ` · ${track.model ?? PLATFORM_LABEL[track.platform]}`;
    const facts = document.createElement('span');
    facts.className = 'alert-facts';
    facts.dataset.facts = '';
    line.append(title, kind, facts);

    const actions = document.createElement('div');
    actions.className = 'alert-actions';
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'alert-show';
    show.dataset.id = e.id;
    show.textContent = 'Show';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'icon-button alert-dismiss';
    dismiss.dataset.id = e.id;
    dismiss.dataset.action = 'dismiss';
    dismiss.setAttribute('aria-label', 'Hide alert (it stays in the top bar while the code is broadcast)');
    dismiss.title = 'Hide (it stays in the top bar)';
    dismiss.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
    actions.append(show);

    // On the card itself: the actions row is positioned, and would take the × with it.
    card.append(head, line, actions, dismiss);
    return card;
  }

  /** A ring on each aircraft still squawking, dead-reckoned like the track itself. */
  private moveRings(now: number): void {
    const active = new Set(this.watch.active.map((e) => e.id));
    for (const [id, ring] of this.rings) {
      if (active.has(id)) continue;
      ring.remove();
      this.rings.delete(id);
    }
    for (const e of this.watch.active) {
      const track = this.store.get(e.id);
      if (!track) continue;
      const at = deadReckon(track, track.courseDeg, track.speedMps, Math.min(now - track.observedAt, 60_000));
      let ring = this.rings.get(e.id);
      if (!ring) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'emergency-ring';
        el.dataset.code = e.squawk;
        el.title = `Squawking ${e.squawk}: ${e.meaning.toLowerCase()}. Click for the aircraft.`;
        el.setAttribute('aria-label', el.title);
        const id = e.id;
        el.addEventListener('click', (event) => {
          event.stopPropagation(); // not a click on the map underneath
          this.show(id);
        });
        ring = new Marker({ element: el, opacityWhenCovered: '0' }).setLngLat([at.lon, at.lat]).addTo(this.map);
        this.rings.set(e.id, ring);
      } else ring.setLngLat([at.lon, at.lat]);
    }
  }
}
