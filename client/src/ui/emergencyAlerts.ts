import { deadReckon } from '@watchfloor/shared';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { ServerClock } from '../state/clock';
import { EmergencyWatch, type Emergency } from '../state/emergencies';
import type { NewsSettings } from '../state/newsStore';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatAltitude, formatNewsTime, formatSpeed, PLATFORM_LABEL } from './format';
import { speak } from './voice';

/** Emergencies are checked each second: the store changes about that often. */
const CHECK_MS = 1_000;

/**
 * Emergency squawks: an alert card under the top bar for each aircraft
 * squawking 7500, 7600 or 7700, and an amber ring round it on the map. The
 * card says the code is as broadcast (codes get set by mistake), offers to
 * show the aircraft, and can be dismissed; the ring stays while the code
 * does. Read aloud when read-aloud is on. Amber, never an identity colour:
 * an emergency says nothing about friend or foe.
 */
export class EmergencyAlerts {
  private readonly watch = new EmergencyWatch();
  private readonly dismissed = new Set<string>();
  private readonly rings = new Map<string, Marker>();
  private signature = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly selection: Selection,
    private readonly voice: NewsSettings,
  ) {
    root.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-id]');
      if (!button?.dataset.id) return;
      if (button.dataset.action === 'dismiss') {
        this.dismissed.add(button.dataset.id);
        this.render();
      } else this.show(button.dataset.id);
    });
    window.setInterval(() => this.check(), CHECK_MS);
  }

  private check(): void {
    const now = this.clock.now();
    for (const emergency of this.watch.update(this.store.all(), now)) {
      this.dismissed.delete(emergency.id);
      if (this.voice.voice) this.announce(emergency);
    }
    this.render();
    this.moveRings(now);
  }

  private show(id: string): void {
    const track = this.store.get(id);
    if (!track) return;
    this.selection.select(id);
    this.map.easeTo({ center: [track.lon, track.lat], zoom: Math.max(this.map.getZoom(), 7), duration: 900 });
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
      if (track && facts) facts.textContent = [formatAltitude(track.altitudeM), formatSpeed(track.speedMps)].filter(Boolean).join(' · ');
    }
  }

  /** Text only via textContent: callsigns and models come from the feeds. */
  private card(e: Emergency): HTMLElement {
    const track = this.store.get(e.id)!;
    const card = document.createElement('article');
    card.className = 'alert-card';
    card.dataset.track = e.id;
    card.setAttribute('role', 'alert');

    const head = document.createElement('div');
    head.className = 'alert-head';
    const code = document.createElement('span');
    code.className = 'alert-code';
    code.textContent = `SQUAWK ${e.squawk}`;
    const meaning = document.createElement('span');
    meaning.className = 'alert-meaning';
    meaning.textContent = e.meaning;
    const since = document.createElement('span');
    since.className = 'alert-since';
    since.textContent = `since ${formatNewsTime(e.since)}`;
    head.append(code, meaning, since);

    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = track.callsign ?? 'No callsign';
    const kind = document.createElement('div');
    kind.className = 'alert-kind';
    kind.textContent = track.model ?? PLATFORM_LABEL[track.platform];
    const facts = document.createElement('div');
    facts.className = 'alert-facts';
    facts.dataset.facts = '';
    const note = document.createElement('p');
    note.className = 'alert-note';
    note.textContent = 'As broadcast by its transponder: a code can be set by mistake.';

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
    dismiss.setAttribute('aria-label', 'Dismiss alert');
    dismiss.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
    actions.append(show, dismiss);

    card.append(head, title, kind, facts, note, actions);
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
        const el = document.createElement('div');
        el.className = 'emergency-ring';
        el.dataset.code = e.squawk;
        ring = new Marker({ element: el }).setLngLat([at.lon, at.lat]).addTo(this.map);
        this.rings.set(e.id, ring);
      } else ring.setLngLat([at.lon, at.lat]);
    }
  }
}
