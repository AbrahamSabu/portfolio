import { SATELLITE_GROUPS, type SatelliteCatalog, type SatelliteElements, type SatelliteGroup } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { paceScaleNow } from '../map/renderRate';
import { LOWEST_TRACK_LAYER } from '../map/trackLayer';
import type { HoverText } from '../ui/hoverCard';
import { CatalogClient, type CatalogSource } from './catalogClient';
import { GroundTrackLayer, type TrackLine } from './groundTrackLayer';
import { Keyframes, type KeyframePair } from './keyframes';
import { dockedStacks, EARTH_RADIUS_KM, mercatorY, periodMinutes, semiMajorAxisKm, SHELL_MAX_ALTITUDE_KM } from './orbit';
import { projectSatellite } from './projection';
import { SatelliteFilterSection, type SatelliteFilter } from './satelliteFilter';
import { CREWED_STATIONS, describePass, displayName, formatKm, formatKmPerS, formatPlace, GROUP_LABEL } from './satelliteFormat';
import { SatelliteLayer } from './satelliteLayer';
import { SatellitePanel } from './satellitePanel';
import type { WorkerReply, WorkerRequest } from './workerProtocol';

/**
 * Keyframes this far apart; the GPU blends between them. Over 5 s a low orbit
 * covers 38 km, and the straight line between two positions strays 26 m from
 * the true arc: invisible at any zoom, for a fifth of the work of 1 s steps.
 */
const STEP_MS = 5_000;
/** Ground tracks are redrawn this often, so "now" on them keeps up with the satellite. */
const TRACK_REFRESH_MS = 5_000;
/** The next pass is worked out again after this long, or after the map moves. */
const PASS_REFRESH_MS = 60_000;
/** How close a click must be to a satellite's mark, CSS pixels. */
const PICK_RADIUS_PX = 9;
const MU = 398_600.4418;
/** Satellites aren't ours to draw when their group index is this: craft docked to a station. */
const DOCKED = 255;

export interface SatellitesDeps {
  /** On or off: the O key and the Layers menu. */
  shown: { readonly value: boolean; subscribe(listener: () => void): unknown };
  filter: SatelliteFilter;
  /** Server time, ms. */
  now: () => number;
  /** The track details panel: the satellite card takes its place, beside it in the page. */
  detailsPanel: HTMLElement;
  /** The picture filter's panel: satellites get their own group in it. */
  filterPanel: HTMLElement;
  /** The track selection: picking a satellite clears it, and picking a track closes the satellite card. */
  selection: { select(id: string | null): void; subscribe(listener: (id: string | null) => void): unknown };
  /** A satellite was picked: close what else uses the right side (airport, country). */
  onOpen: () => void;
  /** Where the catalogue comes from, when not our server (the static demo has none). */
  catalog?: (onCatalog: (catalog: SatelliteCatalog) => void, onStatus: () => void) => CatalogSource;
}

/** What the timeline shows: a fixed moment in the past, or now plus an offset. */
export type SatelliteTime = { at: number } | { offsetMs: number } | null;

interface Sat {
  e: SatelliteElements;
  group: SatelliteGroup;
}

/**
 * The space domain: catalogue in, satellites on the map. Owns the SGP4
 * worker and its keyframes, the WebGL layer, the ground tracks, the card and
 * the filter's group; main.ts only wires keys and panels to it.
 */
export class Satellites {
  private sats: Sat[] = [];
  private groupOf = new Uint8Array(0);
  /** Representative's index -> the indexes of the craft docked to it. */
  private readonly dockedTo = new Map<number, number[]>();
  private counts: Partial<Record<SatelliteGroup, number>> = {};
  private readonly fetchedAt = new Map<SatelliteGroup, number | null>();
  private worker: Worker | null = null;
  /** Bumped on every new catalogue: answers about an older one are dropped. */
  private generation = 0;
  private seq = 0;
  private readonly asked = new Map<number, { generation: number; t: number }>();
  private readonly keyframes: Keyframes;
  private time: SatelliteTime = null;
  private selectedId: number | null = null;
  private readonly layer: SatelliteLayer;
  private readonly tracks: GroundTrackLayer;
  private readonly panel: SatellitePanel;
  private readonly section: SatelliteFilterSection;
  private readonly catalog: CatalogSource;
  private readonly lines = new Map<number, TrackLine>();
  private readonly listeners = new Set<() => void>();
  private tracksAt = 0;
  private passAt = 0;
  private passTimer: ReturnType<typeof setTimeout> | undefined;
  private styleReady = false;
  /** Out of the picture for a while (see setHidden), whatever the switch says. */
  private hidden = false;

  constructor(
    private readonly map: MapLibreMap,
    private readonly deps: SatellitesDeps,
  ) {
    // Under the screensaver's slowdown, keyframes twice as far apart: half the worker's work,
    // and over 10 s the blend still keeps within about 100 m of the true arc.
    this.keyframes = new Keyframes(STEP_MS * paceScaleNow(), (t) => this.post({ type: 'positions', seq: this.ask(t), t }));
    this.layer = new SatelliteLayer({ now: () => this.now(), pairAt: (t) => this.pairAt(t) });
    this.layer.setHiddenMask(deps.filter.mask);
    // Ground tracks first, so on a style load they go in under the satellites.
    this.tracks = new GroundTrackLayer(map);
    this.panel = new SatellitePanel(deps.detailsPanel, () => this.selectIndex(null));
    this.section = new SatelliteFilterSection(deps.filterPanel, deps.filter);
    // The catalogue (half a megabyte) and the worker wait until the layer is first shown:
    // someone who has turned satellites off pays nothing for them.
    this.catalog = (deps.catalog ?? ((onCatalog, onStatus) => new CatalogClient(onCatalog, onStatus)))(
      (catalog) => this.load(catalog),
      () => this.notify(),
    );
    // Readiness tracked here, not with isStyleLoaded(), which reads false while tiles load.
    map.on('style.load', () => {
      this.styleReady = true;
      this.install();
    });
    map.on('styledataloading', () => (this.styleReady = false));
    this.styleReady = map.isStyleLoaded() === true;
    deps.shown.subscribe(() => this.applyShown());
    deps.filter.subscribe(() => {
      this.layer.setHiddenMask(deps.filter.mask);
      this.refreshTracks();
    });
    deps.selection.subscribe((id) => {
      if (id !== null) this.selectIndex(null);
    });
    map.on('moveend', () => this.schedulePass(800));
    window.setInterval(() => this.tick(), 1_000);
    this.applyShown();
  }

  /** True while a satellite's card is open (Escape closes it). */
  get selected(): boolean {
    return this.selectedId !== null;
  }

  /** For the Layers menu: how many, or why none. */
  detail(): string {
    if (this.catalog.status === 'unavailable') return this.catalog.unavailableText;
    if (this.hidden && this.deps.shown.value) return 'hidden while you ride along';
    const total = this.sats.length - [...this.dockedTo.values()].reduce((n, m) => n + m.length, 0);
    if (total === 0) return 'loading';
    return `${total.toLocaleString('en')} from CelesTrak, positions computed here`;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The timeline's moment: satellites are arithmetic, so they can be shown at any time without a recording. */
  setTimeline(time: SatelliteTime): void {
    this.time = time;
    this.tracksAt = 0;
    this.passAt = 0;
    this.map.triggerRepaint();
  }

  private now(): number {
    const time = this.time;
    if (time && 'at' in time) return time.at;
    return this.deps.now() + (time ? time.offsetMs : 0);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Out of the picture for a while, without touching the switch: a ride
   * (rideAlong.ts) flattens the map, where satellites and their ground tracks
   * would lie on the ground like decals in the pilot's view.
   */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.applyShown(); // notifies, so the Layers menu says why they've gone
  }

  private get visible(): boolean {
    return this.deps.shown.value && !this.hidden;
  }

  private install(): void {
    const map = this.map;
    if (!this.styleReady || !this.visible || map.getLayer(this.layer.id)) return;
    map.addLayer(this.layer, map.getLayer(LOWEST_TRACK_LAYER) ? LOWEST_TRACK_LAYER : undefined);
  }

  private applyShown(): void {
    const on = this.deps.shown.value;
    // Off means off: no re-checks of the catalogue either (back on, one cheap re-check catches up).
    // Hidden for a ride keeps the catalogue: the satellites come back the moment it ends.
    if (on) this.catalog.start();
    else this.catalog.stop();
    const visible = this.visible;
    if (visible) this.install();
    else if (this.map.getLayer(this.layer.id)) this.map.removeLayer(this.layer.id);
    this.tracks.setVisible(visible);
    if (!visible) this.selectIndex(null);
    this.refreshTracks();
    this.notify();
  }

  /** Started on first use, which only comes once the layer is shown and a catalogue has arrived. */
  private post(message: WorkerRequest): void {
    if (!this.worker) {
      this.worker = new Worker(new URL('./satWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerReply>) => this.onReply(event.data);
    }
    this.worker.postMessage(message);
  }

  private ask(t: number): number {
    const seq = ++this.seq;
    this.asked.set(seq, { generation: this.generation, t });
    return seq;
  }

  /** A new catalogue: every group in a fixed order, each satellite once. */
  private load(catalog: SatelliteCatalog): void {
    const seen = new Set<number>();
    const sats: Sat[] = [];
    this.counts = {};
    for (const group of SATELLITE_GROUPS) {
      const data = catalog.groups.find((g) => g.group === group);
      if (!data) continue;
      this.fetchedAt.set(group, data.fetchedAt);
      this.counts[group] = data.satellites.length;
      for (const e of data.satellites) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        sats.push({ e, group });
      }
    }
    this.sats = sats;
    this.groupOf = Uint8Array.from(sats, (s) => SATELLITE_GROUPS.indexOf(s.group));
    this.dockedTo.clear();
    this.generation++;
    this.keyframes.clear();
    this.lines.clear();
    this.post({ type: 'load', satellites: sats.map((s) => s.e) });
    this.layer.setGroups(this.groupOf);
    // Which station craft are docked together, from where they are now.
    const stations = sats.flatMap((s, i) => (s.group === 'stations' ? [i] : []));
    if (stations.length > 0) this.post({ type: 'ecf', seq: this.ask(this.now()), t: this.now(), indexes: stations });
    this.section.setCounts(this.counts);
    const index = this.selectedIndex();
    if (this.selectedId !== null && index < 0) this.selectIndex(null);
    else if (index >= 0) {
      this.layer.setSelected(index);
      this.showCard(index);
    }
    this.tracksAt = 0;
    this.refreshTracks();
    this.map.triggerRepaint();
    this.notify();
  }

  private selectedIndex(): number {
    return this.selectedId === null ? -1 : this.sats.findIndex((s) => s.e.id === this.selectedId);
  }

  /** The keyframes either side of `t` (see keyframes.ts): on a grid when live or projected, exact for a replayed moment. */
  private pairAt(t: number): KeyframePair | null {
    if (this.sats.length === 0) return null;
    return this.time && 'at' in this.time ? this.keyframes.exactAt(t) : this.keyframes.pairAt(t);
  }

  private onReply(reply: WorkerReply): void {
    if (reply.type === 'loaded') {
      // Frames computed while the catalogue was still being set up lack its later satellites: fill them in.
      this.keyframes.refresh();
      return;
    }
    const asked = this.asked.get(reply.seq);
    this.asked.delete(reply.seq);
    if (!asked || asked.generation !== this.generation) return;
    switch (reply.type) {
      case 'positions':
        if (reply.data.length !== this.sats.length * 3) return;
        this.keyframes.add(reply.t, reply.data);
        this.map.triggerRepaint();
        break;
      case 'ecf': {
        const indexes = this.sats.flatMap((s, i) => (s.group === 'stations' ? [i] : []));
        const stacks = dockedStacks(
          indexes.map((i) => this.sats[i]!.e.id),
          (k) => reply.positions[k] ?? null,
        );
        for (const [rep, members] of stacks) {
          const docked = members.map((k) => indexes[k]!);
          this.dockedTo.set(indexes[rep]!, docked);
          for (const i of docked) this.groupOf[i] = DOCKED;
        }
        this.layer.setGroups(this.groupOf);
        // A docked craft that was selected hands over to its station.
        const selected = this.selectedIndex();
        if (selected >= 0 && this.groupOf[selected] === DOCKED) {
          const rep = [...this.dockedTo].find(([, members]) => members.includes(selected))?.[0];
          this.selectedId = null;
          this.selectIndex(rep ?? null);
        } else if (selected >= 0) this.showCard(selected);
        this.notify();
        break;
      }
      case 'track':
        // An answer for a satellite deselected meanwhile would bring its line back.
        if (!this.trackWanted(reply.index)) break;
        this.lines.set(reply.index, { track: reply.track, now: asked.t, selected: reply.index === this.selectedIndex() });
        this.tracks.set([...this.lines.values()]);
        break;
      case 'now':
        if (reply.index === this.selectedIndex()) this.panel.live(reply.now);
        break;
      case 'pass':
        if (reply.index === this.selectedIndex()) this.panel.pass(this.passLabel(), describePass(reply.pass, asked.t));
        break;
    }
  }

  private observer(): { lat: number; lon: number } {
    const c = this.map.getCenter().wrap();
    return { lat: c.lat, lon: c.lng };
  }

  private passLabel(): string {
    const o = this.observer();
    return `Next pass over ${formatPlace(o.lat, o.lon)} (map centre)`;
  }

  /** Once a second: the card's live numbers; every few seconds the ground tracks; every minute the next pass. */
  private tick(): void {
    if (document.hidden || !this.visible || this.sats.length === 0) return;
    const index = this.selectedIndex();
    const now = this.now();
    if (index >= 0) this.post({ type: 'now', seq: this.ask(now), index, t: now });
    if (Date.now() - this.tracksAt >= TRACK_REFRESH_MS) this.refreshTracks();
    if (index >= 0 && Date.now() - this.passAt >= PASS_REFRESH_MS) this.schedulePass(0);
  }

  private schedulePass(delayMs: number): void {
    clearTimeout(this.passTimer);
    if (this.selectedId === null) return;
    this.passTimer = setTimeout(() => {
      const index = this.selectedIndex();
      if (index < 0) return;
      this.passAt = Date.now();
      const now = this.now();
      this.post({ type: 'pass', seq: this.ask(now), index, t: now, observer: this.observer() });
    }, delayMs);
  }

  /** The crewed stations' tracks always (unless their group is filtered out), and the selected satellite's. */
  private trackWanted(index: number): boolean {
    if (!this.visible) return false;
    if (index === this.selectedIndex()) return true;
    const sat = this.sats[index];
    return !!sat && CREWED_STATIONS.has(sat.e.id) && this.groupOf[index] !== DOCKED && !this.deps.filter.isHidden('stations');
  }

  private refreshTracks(): void {
    this.tracksAt = Date.now();
    const wanted = new Set<number>();
    const selected = this.selectedIndex();
    if (selected >= 0 && this.trackWanted(selected)) wanted.add(selected);
    this.sats.forEach((s, i) => {
      if (CREWED_STATIONS.has(s.e.id) && this.trackWanted(i)) wanted.add(i);
    });
    for (const index of [...this.lines.keys()]) if (!wanted.has(index)) this.lines.delete(index);
    if (wanted.size === 0) {
      this.tracks.set([]);
      return;
    }
    const now = this.now();
    for (const index of wanted) {
      const periodMs = periodMinutes(this.sats[index]!.e.meanMotion) * 60_000;
      this.post({ type: 'track', seq: this.ask(now), index, t: now, beforeMs: periodMs / 2, afterMs: periodMs });
    }
  }

  /** Select by catalogue position; null closes the card. */
  selectIndex(index: number | null): void {
    const id = index === null ? null : (this.sats[index]?.e.id ?? null);
    if (id === this.selectedId) return;
    this.selectedId = id;
    if (index === null || id === null) {
      this.layer.setSelected(-1);
      this.panel.hide();
      this.refreshTracks();
      return;
    }
    // One selection at a time across the domains, and one card on the right.
    this.deps.selection.select(null);
    this.deps.onOpen();
    this.layer.setSelected(index);
    this.showCard(index);
    this.refreshTracks();
    const now = this.now();
    this.post({ type: 'now', seq: this.ask(now), index, t: now });
    this.schedulePass(0);
  }

  private showCard(index: number): void {
    const sat = this.sats[index]!;
    const docked = (this.dockedTo.get(index) ?? []).map((i) => this.sats[i]!.e.name);
    this.panel.show(sat.e, sat.group, docked, this.fetchedAt.get(sat.group) ?? null, this.deps.now());
    this.panel.pass(this.passLabel(), 'Working it out…');
  }

  /** A click: picks the satellite under the pointer (true), or leaves it to the next handler (false). */
  pick(point: { x: number; y: number }): boolean {
    const index = this.satelliteAt(point);
    if (index < 0) return false;
    this.selectIndex(index);
    return true;
  }

  /** For the hover card: name, group, height and speed. */
  describeAt(point: { x: number; y: number }): HoverText | undefined {
    const index = this.satelliteAt(point);
    if (index < 0) return undefined;
    const { e, group } = this.sats[index]!;
    const alt = this.altitudeOf(index);
    // Speed from the orbit's energy (vis-viva): exact enough for a hover, and no worker round trip.
    const r = EARTH_RADIUS_KM + (alt ?? 0);
    const speed = Math.sqrt(MU * (2 / r - 1 / semiMajorAxisKm(e.meanMotion)));
    return {
      title: displayName(e),
      kind: GROUP_LABEL[group],
      facts: alt === null ? 'Predicted position' : `${formatKm(alt)} up · ${formatKmPerS(speed)}`,
    };
  }

  private altitudeOf(index: number): number | null {
    const frame = this.layer.lastFrame;
    if (!frame || frame.pair.a.length !== this.sats.length * 3) return null;
    return frame.pair.a[index * 3 + 2] ?? null;
  }

  /**
   * The satellite drawn nearest a screen point, within a few pixels, or -1.
   * Uses the same positions, blend and projection as the frame on screen.
   */
  satelliteAt(point: { x: number; y: number }): number {
    const frame = this.layer.lastFrame;
    if (!this.visible || !frame || frame.pair.a.length !== this.groupOf.length * 3) return -1;
    const { pair, projection, elevationScale, t } = frame;
    const u = pair.tb > pair.ta ? Math.min(2, Math.max(0, (t - pair.ta) / (pair.tb - pair.ta))) : 0;
    const centerX = (this.map.getCenter().wrap().lng + 180) / 360;
    const wrap = (x: number) => x + Math.floor(centerX - x + 0.5);
    // Zoomed in, satellites sit on their ground points: a box round the pointer in
    // Mercator rules out nearly all of them before the projection maths.
    let box: { x0: number; x1: number; y0: number; y1: number } | null = null;
    if (elevationScale === 0) {
      const r = PICK_RADIUS_PX * 2;
      const corners = [this.map.unproject([point.x - r, point.y - r]), this.map.unproject([point.x + r, point.y + r])];
      const xs = corners.map((c) => wrap((c.lng + 180) / 360));
      const ys = corners.map((c) => mercatorY(c.lat));
      box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      if (box.x1 - box.x0 > 0.5) box = null; // straddling the antimeridian at a wide view: just check them all
    }
    const mask = this.deps.filter.mask;
    const selected = this.selectedIndex();
    let best = -1;
    let bestD = PICK_RADIUS_PX ** 2;
    for (let i = 0; i < this.groupOf.length; i++) {
      const group = this.groupOf[i]!;
      if (group > 2 || ((mask >> group) & 1 && i !== selected)) continue;
      const o = i * 3;
      const ax = pair.a[o]!;
      if (ax < -10) continue;
      let bx = pair.b[o]!;
      if (bx - ax > 0.5) bx -= 1;
      else if (bx - ax < -0.5) bx += 1;
      const x = wrap(ax + (bx - ax) * u);
      const y = pair.a[o + 1]! + (pair.b[o + 1]! - pair.a[o + 1]!) * u;
      if (box && (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1)) continue;
      const alt = pair.a[o + 2]! + (pair.b[o + 2]! - pair.a[o + 2]!) * u;
      const elevation = alt <= SHELL_MAX_ALTITUDE_KM ? alt * 1000 * elevationScale : 0;
      const s = projectSatellite(x, y, elevation, projection);
      if (!s) continue;
      const d = (s.x - point.x) ** 2 + (s.y - point.y) ** 2;
      // A station beats a Starlink under the same pixel.
      if (d < bestD || (d === bestD && best >= 0 && group < this.groupOf[best]!)) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }
}
