import type { SatelliteElements, SatelliteGroup } from '@watchfloor/shared';
import type { SatelliteNow } from './propagate';
import { describeApsides, describeOrbit, displayName, formatElementAge, formatKm, formatKmPerS, formatPlace, GROUP_LABEL } from './satelliteFormat';

/** The map's satellite mark, for the card's header (the same plus sign the layer draws). */
const MARK_SVG =
  '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="#D9E8F7" stroke-width="2.2" stroke-linecap="round"/></svg>';

/**
 * The selected satellite's card, in the details panel's place on the right
 * (it reuses that panel's classes, so it looks the same). Text only through
 * textContent: names come from CelesTrak.
 */
export class SatellitePanel {
  readonly root: HTMLElement;
  private readonly field: (name: string) => HTMLElement;

  constructor(host: HTMLElement, onClose: () => void) {
    const root = document.createElement('aside');
    root.className = 'details sat-details';
    root.hidden = true;
    root.setAttribute('aria-labelledby', 'sat-title');
    root.innerHTML = `
      <header class="details-head">
        <div class="details-symbol" aria-hidden="true">${MARK_SVG}</div>
        <div class="details-heading">
          <p class="details-identity" data-sat="group"></p>
          <h2 class="details-title" id="sat-title" data-sat="title"></h2>
        </div>
        <button class="icon-button details-close" type="button" data-close aria-label="Close satellite details">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <dl class="readout">
        <div class="readout-row"><dt>Altitude</dt><dd data-sat="alt">—</dd></div>
        <div class="readout-row"><dt>Speed</dt><dd data-sat="speed">—</dd></div>
        <div class="readout-row readout-wide"><dt>Orbit</dt><dd data-sat="orbit"></dd></div>
        <div class="readout-row readout-wide"><dt>Overhead at</dt><dd data-sat="over">—</dd></div>
        <div class="readout-row"><dt>NORAD number</dt><dd data-sat="norad"></dd></div>
        <div class="readout-row"><dt>Launch designator</dt><dd data-sat="intl"></dd></div>
        <div class="readout-row readout-wide" data-sat-row="docked" hidden><dt>Docked</dt><dd data-sat="docked"></dd></div>
        <div class="readout-row readout-wide"><dt data-sat="pass-label">Next pass</dt><dd data-sat="pass">Working it out…</dd></div>
      </dl>
      <p class="details-note" data-sat="note"></p>`;
    host.after(root);
    this.root = root;
    this.field = (name) => root.querySelector<HTMLElement>(`[data-sat="${name}"]`)!;
    root.querySelector('[data-close]')?.addEventListener('click', onClose);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(e: SatelliteElements, group: SatelliteGroup, docked: string[], fetchedAt: number | null, now: number): void {
    const wasOpen = this.open;
    this.field('group').textContent = GROUP_LABEL[group];
    const name = displayName(e);
    this.field('title').textContent = name;
    const apsides = describeApsides(e);
    this.field('orbit').textContent = apsides ? `${describeOrbit(e)} · ${apsides}` : describeOrbit(e);
    this.field('norad').textContent = String(e.id);
    // CelesTrak's own name too, when the card shows an everyday one.
    this.field('intl').textContent = name === e.name ? e.intl || '—' : `${e.intl} · ${e.name}`;
    this.root.querySelector<HTMLElement>('[data-sat-row="docked"]')!.hidden = docked.length === 0;
    this.field('docked').textContent = docked.join(', ');
    this.field('pass').textContent = 'Working it out…';
    this.field('alt').textContent = '—';
    this.field('speed').textContent = '—';
    this.field('over').textContent = '—';
    const age = formatElementAge(now - e.epoch);
    this.field('note').textContent =
      `A real satellite. Its position is predicted from orbital elements (CelesTrak, SGP4), not observed; the elements are ${age} old` +
      (fetchedAt === null ? '.' : `, downloaded ${formatElementAge(now - fetchedAt)} ago.`);
    this.root.hidden = false;
    document.querySelector('.app')?.classList.add('sat-open');
    if (!wasOpen) {
      this.root.classList.remove('details-enter');
      void this.root.offsetWidth; // restart the slide-in
      this.root.classList.add('details-enter');
    }
  }

  /** Height, speed and the ground point, refreshed each second while open. */
  live(now: SatelliteNow | null): void {
    if (!now) {
      this.field('alt').textContent = '—';
      this.field('speed').textContent = '—';
      this.field('over').textContent = 'Cannot be placed: it may have re-entered';
      return;
    }
    this.field('alt').textContent = formatKm(now.altKm);
    this.field('speed').textContent = formatKmPerS(now.speedKmS);
    this.field('over').textContent = `${formatPlace(now.lat, now.lon)} · ${now.sunlit ? 'in sunlight' : "in Earth's shadow"}`;
  }

  pass(label: string, text: string): void {
    this.field('pass-label').textContent = label;
    this.field('pass').textContent = text;
  }

  hide(): void {
    this.root.hidden = true;
    document.querySelector('.app')?.classList.remove('sat-open');
  }
}
