import type { Track } from '@watchfloor/shared';
import { AFFILIATION_COLOR } from '../map/colors';
import { formatAltitude, formatCourse, formatSpeed } from './format';

/**
 * A route from hexdb.io's answer ({"route": "EGLL-KJFK"}), as "EGLL → KJFK";
 * anything else is no route. Same check as the plane-spotter's.
 */
export function parseRoute(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const route = (json as Record<string, unknown>).route;
  if (typeof route !== 'string' || !/^[A-Z0-9]{3,4}(-[A-Z0-9]{3,4})+$/.test(route)) return undefined;
  return route.split('-').join(' → ');
}

/** Only a live aircraft's own broadcast callsign is looked up: a simulated one would borrow a real flight's route. */
export function routeLookupFor(track: Track, isPrivate: boolean): string | undefined {
  if (track.source !== 'adsb' || isPrivate || !track.callsign) return undefined;
  return `https://hexdb.io/api/v1/route/icao/${encodeURIComponent(track.callsign.trim())}`;
}

/**
 * Ride Along's small head-up display: who we're with, how high, how fast,
 * which way, and where it's going when that's known. Labels say what the
 * numbers are: course and speed over the ground, as ADS-B reports them.
 */
export class RideHud {
  private readonly root: HTMLElement;
  private readonly callsign: HTMLElement;
  private readonly tag: HTMLElement;
  private readonly altitude: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly course: HTMLElement;
  private readonly route: HTMLElement;
  private readonly routeText: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ride-hud';
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Ride along');
    this.root.innerHTML = `
      <div class="ride-hud-head"><span class="ride-hud-callsign"></span><span class="ride-hud-tag"></span></div>
      <dl class="ride-hud-readouts">
        <div><dt>Altitude</dt><dd data-alt></dd></div>
        <div><dt>Ground speed</dt><dd data-speed></dd></div>
        <div><dt>Course</dt><dd data-course></dd></div>
      </dl>
      <div class="ride-hud-route" hidden><span data-route></span><span class="ride-hud-source"> · listed for this callsign by hexdb.io</span></div>
      <div class="ride-hud-hint">Esc, J or drag the map to leave</div>`;
    const q = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    this.callsign = q('.ride-hud-callsign');
    this.tag = q('.ride-hud-tag');
    this.altitude = q('[data-alt]');
    this.speed = q('[data-speed]');
    this.course = q('[data-course]');
    this.route = q('.ride-hud-route');
    this.routeText = q('[data-route]');
    parent.append(this.root);
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.route.hidden = true;
  }

  /** Text only (callsigns come from feeds). `stale`: no recent report, so the view is an estimate. */
  update(track: Track, stale: boolean, isPrivate: boolean, route: string | undefined): void {
    this.callsign.textContent = isPrivate ? 'Private aircraft' : (track.callsign ?? 'No callsign');
    // Its identity colour, as on the map.
    this.callsign.style.color = AFFILIATION_COLOR[track.affiliation];
    this.tag.textContent = `${track.source === 'sim' ? 'Simulated' : 'Live'}${stale ? ' · estimated' : ''}`;
    this.tag.classList.toggle('stale', stale);
    this.altitude.textContent = formatAltitude(track.altitudeM);
    this.speed.textContent = formatSpeed(track.speedMps);
    this.course.textContent = formatCourse(track.courseDeg);
    // A callsign's listed route, not a claim about this flight: databases
    // like hexdb.io can be stale or list the return leg, so the HUD says whose listing it is.
    this.route.hidden = route === undefined;
    if (route !== undefined) this.routeText.textContent = route;
  }
}
