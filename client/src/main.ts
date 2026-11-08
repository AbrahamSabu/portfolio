// MapLibre's stylesheet first, so ours can override it.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './hud.css';
import './skins.css';
import type { Finding } from '@watchfloor/shared';
import { AirportLayer } from './map/airportLayer';
import { describeAirport } from './map/airports';
import { ChokepointLayer } from './map/chokepointLayer';
import { fly } from './map/camera';
import { createMap } from './map/createMap';
import { Crosshair } from './map/crosshair';
import { DataBlock } from './map/dataBlock';
import { GhostLayer } from './map/ghostLayer';
import { Graticule } from './map/graticule';
import { ReplayLayer } from './map/replayLayer';
import { DataCredits } from './map/dataCredits';
import { HookTool } from './map/hook';
import { ExposureLayer } from './map/exposureLayer';
import { StackMode } from './map/stackMode';
import { RideAlong } from './map/rideAlong';
import { addRideButton } from './ui/rideButton';
import { FilterControl } from './map/filterControl';
import { FindingLayer } from './map/findingLayer';
import { FlowLayer } from './map/flowLayer';
import { HazardLayer } from './map/hazardLayer';
import { NewsLayer } from './map/newsLayer';
import { NewsHotspots } from './map/newsHotspots';
import { isDrawing, RegionDraw } from './map/regionDraw';
import { RegionLayer } from './map/regionLayer';
import { NightLayer } from './map/nightLayer';
import { NightLights } from './map/nightLights';
import { SpaceBackdrop } from './map/space';
import { RadarLayer } from './map/radarLayer';
import { SatelliteFilter } from './space/satelliteFilter';
import { Satellites } from './space/satellites';
import { Reticle } from './map/reticle';
import { TrackLayer } from './map/trackLayer';
import { PathLayer } from './map/pathLayer';
import { setPaceScale } from './map/renderRate';
import { loadTrailMode, loadTrailStyle, TrailSetting } from './map/trailControl';
import { TrailLayer } from './map/trailLayer';
import { viewForServer } from './map/viewBox';
import { Connection, defaultSocketUrl, type ConnectionHandlers, type Link } from './net/connection';
import { showFirstHint } from './ui/firstHint';
import { mapSource, SkyScore, type CueKind } from './sound/skyScore';
import { RoomHost } from './room/roomHost';
import { ServerClock } from './state/clock';
import { chokepointCounts } from './state/chokepoints';
import { FindingStore } from './state/findings';
import { HazardStore } from './state/hazards';
import { tourStops } from './state/tourStops';
import { loadNewsSettings, NewsSettings, NewsStore } from './state/newsStore';
import { loadFilterState, PictureFilter, saveFilterState } from './state/pictureFilter';
import { SelectedDetails } from './state/selectedDetails';
import { SelectedPath } from './state/selectedPath';
import { loadSymbolStyle, saveSymbolStyle, SymbolStyleSetting } from './state/symbolStyle';
import { Selection } from './state/selection';
import { RegionStore, RegionWatch } from './state/regions';
import { StoredToggle } from './state/storedToggle';
import { positionAt } from './state/timeline';
import { TrackStore } from './state/trackStore';
import { AirportPanel } from './ui/airportPanel';
import { AlertSound } from './ui/alertSound';
import { BriefingPanel } from './ui/briefingPanel';
import { CountryPanel } from './ui/countryPanel';
import { DetailsPanel } from './ui/detailsPanel';
import { EmergencyAlerts } from './ui/emergencyAlerts';
import { FindingAlerts } from './ui/findingAlerts';
import { HazardAlerts } from './ui/hazardAlerts';
import { RegionAlerts } from './ui/regionAlerts';
import { RegionControl, RegionPanel } from './ui/regionPanel';
import { FilterPanel } from './ui/filterPanel';
import { HandoverPanel } from './ui/handoverPanel';
import { RarePanel } from './ui/rarePanel';
import { RecordsPanel } from './ui/recordsPanel';
import { HoverCard } from './ui/hoverCard';
import { KeyDialog } from './ui/keyDialog';
import { Timeline } from './ui/timeline';
import { layerSections, type LayerDeps } from './ui/layerSections';
import { LayersControl, LayersPanel } from './ui/layersMenu';
import { NewsCards } from './ui/newsCards';
import { NewsTicker } from './ui/newsTicker';
import { Palette } from './ui/palette';
import { Tour } from './ui/tour';
import { formatDtg, formatNewsTime, trafficLabel } from './ui/format';
import { StatusBar } from './ui/statusBar';
import { TrackList } from './ui/trackList';
import { loadSkin, saveSkin, SKIN_LOOKS, SkinSetting } from './state/skins';
import { wearSkin } from './ui/wearSkin';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** "Ireland" for "IE"; undefined for a code the browser doesn't know. */
function countryName(iso: string): string | undefined {
  try {
    return regionNames.of(iso);
  } catch {
    return undefined;
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node;
}

/**
 * A panel opened from the keyboard gets the keyboard: its first control (the
 * list's search box, a menu's first row, the timeline's handle). Opened by
 * key, every panel used to leave focus on the body, twenty to thirty Tabs
 * from its controls.
 */
function focusInto(panel: HTMLElement): void {
  const first = panel.querySelector<HTMLElement>('input:not([type="hidden"]), [role="slider"], [role="radio"][tabindex="0"], button:not([hidden]), [tabindex="0"]');
  first?.focus({ preventScroll: true });
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

/** Symbol labels are drawn onto canvases, so give the web font a moment to arrive first. */
async function waitForFonts(): Promise<void> {
  const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    await Promise.race([document.fonts.load('500 14px "IBM Plex Sans Condensed"'), timeout]);
  } catch {
    // Fall back to system fonts.
  }
}

/** The opening sequence (hud.css) runs once; afterwards its overlay goes, so nothing is left over the map. */
function endBootSequence(): void {
  window.setTimeout(() => {
    document.getElementById('boot')?.remove();
    document.querySelector('.app')?.classList.remove('booting');
  }, 2600);
}

async function main(): Promise<void> {
  // The static demo build runs the server inside the page. Loaded first, before
  // anything can reach for the connection, and absent from the normal build.
  const demo = import.meta.env.VITE_DEMO === 'sim' ? await import('./demo/localServer') : null;
  endBootSequence();
  const store = new TrackStore();
  const clock = new ServerClock();
  const selection = new Selection();

  // Screensaver mode asks everything to be cheap: it is watched from across
  // the room, often for hours. Native-resolution pixels and half-pixel
  // redraw steps buy nothing there, so render at 1:1 and take whole-pixel
  // steps (the inline script in index.html also caps the page at 30 fps).
  const screensaver = new URLSearchParams(location.search).has('screensaver');
  // The skin (state/skins.ts): index.html's inline script already put it on <html> for the first
  // paint; createMap paints the basemap in it, and wearSkin below does the rest.
  const skin = new SkinSetting(loadSkin(location.search));
  const { map, userHasMoved } = createMap(el('map'), {
    ...(screensaver ? { pixelRatio: 1 } : {}),
    palette: () => SKIN_LOOKS[skin.value].basemap,
  });
  // Space around the globe, behind the map's transparent canvas: it drifts as the globe turns.
  new SpaceBackdrop(el('space'), map);
  if (screensaver) setPaceScale(2);
  await waitForFonts();

  // What the operator has chosen to see, remembered per browser.
  const filter = new PictureFilter(loadFilterState());
  filter.subscribe(() => saveFilterState(filter.state));

  const style = new SymbolStyleSetting(loadSymbolStyle());

  // Political news: markers, hotspots, pop-up cards, ticker and briefing share one store.
  const news = new NewsStore();
  // The demo has news too: the stories published beside it (demo/localServer.ts).
  const newsSettings = new NewsSettings(loadNewsSettings());

  // The plotting surface: a faint graticule under everything, and hairlines under the pointer.
  const graticule = new Graticule(map);
  skin.subscribe(() => {
    saveSkin(skin.value);
    wearSkin(skin.value, map, graticule);
  });
  wearSkin(skin.value, map, graticule);
  new Crosshair(map);
  // Night, under the basemap's labels and everything of ours, and city lights on it.
  new NightLayer(map, () => clock.now());
  new NightLights(map, () => clock.now());
  // News hotspots next: a glow under airports, tracks and markers.
  new NewsHotspots(map, news, newsSettings, () => clock.now());
  // First, so its layers sit under trails, tracks and news.
  const airportsShown = new StoredToggle('watchfloor.airports', true);
  const airports = new AirportLayer(map, airportsShown);
  // Watch areas, under the tracks too.
  const regions = new RegionStore();
  const regionsShown = new StoredToggle('watchfloor.regionsShown', true);
  const regionLayer = new RegionLayer(map, regions, regionsShown);

  const layer = new TrackLayer(map, store, clock, selection, filter, style);
  const trailLayer = new TrailLayer(map, store, layer, selection, filter, loadTrailMode(), loadTrailStyle(), () => clock.now());
  const trails = new TrailSetting(trailLayer);
  style.subscribe(() => saveSymbolStyle(style.value));
  // After the trails, so the selected path draws above them (and below the tracks).
  const path = new SelectedPath();
  const pathLayer = new PathLayer(map, store, path);
  // Layers: every map toggle in one labelled menu, right under the zoom buttons. Its rows are built on
  // first opening, from settings made further down.
  const layersPanel = new LayersPanel(el('layers-panel'), () => layerSections(layerDeps()), () => keyDialog.toggle());
  map.addControl(new LayersControl(layersPanel), 'top-left');
  // The layers menu, the filter and the watch areas share a place on the left: one at a time.
  const leftPanels = () => [layersPanel, filterPanel, regionPanel];
  const onlyThis = (panel: { open: boolean }) => {
    if (panel.open) for (const other of leftPanels()) if (other !== panel && other.open) other.setOpen(false);
  };
  layersPanel.onOpenChange(() => onlyThis(layersPanel));
  const filterPanel = new FilterPanel(el('filter-panel'), filter, store, clock, () => {
    filterControl.update();
    onlyThis(filterPanel);
  });
  const filterControl = new FilterControl(filterPanel, filter);
  map.addControl(filterControl, 'top-left');
  const regionDraw = new RegionDraw(map);
  const regionWatch = new RegionWatch();
  const regionPanel = new RegionPanel(el('region-panel'), regions, regionWatch, regionDraw, regionLayer, store, selection);
  regionPanel.onOpenChange(() => onlyThis(regionPanel));
  map.addControl(new RegionControl(regionPanel), 'top-left');
  // Weather radar, off until asked for: R or the Layers menu.
  const radarShown = new StoredToggle('watchfloor.radar', false);
  const radar = new RadarLayer(map, radarShown);
  // Satellites, the third domain: CelesTrak's elements from our server (in the static
  // demo, from CelesTrak in the visitor's browser), positions computed in a worker
  // (space/). O or the Layers menu; their own group in the filter.
  const satellitesShown = new StoredToggle('watchfloor.satellites', true);
  const satellites = new Satellites(map, {
    shown: satellitesShown,
    filter: new SatelliteFilter(),
    now: () => clock.now(),
    detailsPanel: el('details'),
    filterPanel: el('filter-panel'),
    selection,
    onOpen: () => {
      airportPanel.close();
      countryPanel.close();
    },
    ...(demo ? { catalog: (onCatalog, onStatus) => new demo.DemoCatalog(onCatalog, onStatus) } : {}),
  });
  const reticle = new Reticle(map);
  // The selected track's ATC-style data block, riding the same dead-reckoned position.
  new DataBlock(map, store, clock, layer, selection);
  // The hook (X): range, bearing and closest approach between the selection and a second track.
  const hook = new HookTool(map, store, clock, layer, selection);
  new HoverCard(map, store, clock, layer, (point) => {
    const satellite = satellites.describeAt(point);
    if (satellite) return satellite;
    const airport = airports.airportAt(point);
    return airport && describeAirport(airport, countryName);
  });
  const keyDialog = new KeyDialog(el('key-dialog') as HTMLDialogElement, el('key-toggle') as HTMLButtonElement, style);
  const details = new SelectedDetails();
  new DetailsPanel(el('details'), store, clock, layer, selection, style, path, details, () => pathLayer.fit());
  // News on the map: pop-up cards and markers.
  const cards = new NewsCards(map, news, newsSettings, () => clock.now());
  // Earthquakes and disasters: above the tracks, under the news.
  const hazards = new HazardStore();
  const hazardsShown = new StoredToggle('watchfloor.hazards', true);
  const hazardLayer = new HazardLayer(map, hazards, hazardsShown, layer, () => clock.now());
  new NewsLayer(map, news, newsSettings, layer, () => clock.now(), (id) => cards.open(id));
  new NewsTicker(el('news-ticker'), news, newsSettings, (id) => cards.open(id));
  // Top stories, open by default where there's room for it beside the map.
  const briefingOpen = new StoredToggle('watchfloor.briefing', window.matchMedia('(min-width: 900px)').matches);
  new BriefingPanel(el('briefing'), map, news, newsSettings, briefingOpen, selection, () => clock.now(), (id) => cards.open(id));
  const briefingToggle = el('briefing-toggle');
  briefingToggle.addEventListener('click', () => {
    // Closed or not, news off means nothing to show: turning it on is what the operator wants.
    if (!newsSettings.shown) {
      newsSettings.set({ shown: true });
      briefingOpen.set(true);
    } else briefingOpen.toggle();
  });
  const showBriefingToggle = () => briefingToggle.setAttribute('aria-pressed', String(briefingOpen.value && newsSettings.shown));
  briefingOpen.subscribe(showBriefingToggle);
  newsSettings.subscribe(showBriefingToggle);
  showBriefingToggle();
  // Shipping chokepoints: ship counts at the narrows.
  const chokepointsShown = new StoredToggle('watchfloor.chokepoints', true);
  new ChokepointLayer(map, store, clock, chokepointsShown);
  // An airport's weather and traffic, on a click (a track under the pointer wins: it was selected).
  const airportPanel = new AirportPanel(el('airport-panel'), store, clock, selection, countryName);
  // A country's briefing, on a click on its name.
  const countryPanel = new CountryPanel(el('country-panel'), map, store, news, hazards, clock, selection, (id) => cards.open(id), (id) => hazardLayer.open(id));
  map.on('click', (event) => {
    if (isDrawing() || layer.trackAt(event.point)) return;
    if (!hook.armed && satellites.pick(event.point)) return;
    const airport = airports.airportAt(event.point);
    const country = airport ? undefined : countryPanel.countryAt(event.point);
    if (airport) {
      countryPanel.close();
      airportPanel.open(airport);
    } else if (country) {
      airportPanel.close();
      countryPanel.open(country);
    }
  });
  for (const label of ['place_country_1', 'place_country_2']) {
    map.on('mouseenter', label, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', label, () => (map.getCanvas().style.cursor = ''));
  }
  // The alert ping is off by default; its switch is in the Layers menu.
  const soundOn = new StoredToggle('watchfloor.sound', false);
  const sound = new AlertSound(soundOn);
  // The sky score (Y, Layers menu): ambient music played by the traffic on
  // screen. While it plays, alerts are calls within it instead of the ping:
  // one sound per alert, in the same key.
  const score = new SkyScore(mapSource(map, store, filter, clock), { eager: screensaver });
  const alertCue = (kind: CueKind) => {
    if (!score.cue(kind)) sound.ping();
  };
  const emergencyAlerts = new EmergencyAlerts(el('alerts-emergency'), map, store, clock, selection, newsSettings, el('alert-chip') as HTMLButtonElement, () => alertCue('emergency'));
  // Watch areas: who crossed in or out, checked each second.
  const regionAlerts = new RegionAlerts(el('alerts-region'), regions, store, selection, newsSettings, () => alertCue('area'));
  window.setInterval(() => {
    // Mid-reconnect the store is empty: that's not every track leaving at once.
    // And with no areas drawn there's nothing to watch: don't copy 30k
    // tracks a second for nothing.
    if (store.size === 0 || regions.regions.length === 0) return;
    const now = clock.now();
    const events = regionWatch.update(regions.regions, store.all(), (t) => store.status(t, now) === 'live', now);
    regionPanel.record(events);
    regionAlerts.show(events);
    regionLayer.setCounts((id) => regionWatch.insideOf(id).length);
    regionPanel.refreshCounts();
  }, 1_000);
  new HazardAlerts(el('alerts-hazard'), map, hazards, hazardsShown, newsSettings, (id) => hazardLayer.open(id));

  // The server's watchers: circling aircraft, converging military pairs, ships
  // gone silent under way. HUD-blue rings and cards: observations, not threats.
  const findings = new FindingStore();
  const findingsShown = new StoredToggle('watchfloor.findings', true);
  const showFinding = (f: Finding) => {
    const involved = f.tracks.find((id) => store.get(id));
    if (involved) selection.select(involved);
    fly(map, { center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 8) });
  };
  new FindingLayer(map, findings, findingsShown, layer, () => clock.now(), showFinding);
  new FindingAlerts(el('alerts-finding'), findings, newsSettings, showFinding, () => alertCue('finding'));
  // The Rare aircraft tab: what's flying now and the last day's, whenever you want them.
  const rarePanel = new RarePanel(el('rare-panel'), el('rare-toggle') as HTMLButtonElement, findings, map, () => clock.now(), showFinding);
  // The Leaderboard tab: the server's boards of who's highest, fastest, biggest. It shares the Rare tab's place.
  const recordsPanel = new RecordsPanel(
    el('records-panel'),
    el('records-toggle') as HTMLButtonElement,
    map,
    (id) => {
      if (!store.get(id)) return false;
      selection.select(id);
      return true;
    },
    () => rarePanel.setOpen(false),
  );
  el('rare-toggle').addEventListener('click', () => recordsPanel.setOpen(false));

  // The alert corner fades its oldest cards when it's full. A bottom-anchored
  // stack overflows upward, which scrollHeight doesn't count, so the cards are measured.
  const alertCorner = document.querySelector<HTMLElement>('.alerts')!;
  const markOverflow = () => {
    // Each kind of alert is a group; the stack's gap sits between the groups shown.
    const groups = [...alertCorner.children].filter((g): g is HTMLElement => g instanceof HTMLElement && g.offsetHeight > 0);
    const gap = parseFloat(getComputedStyle(alertCorner).rowGap) || 0;
    const content = groups.reduce((sum, g) => sum + g.offsetHeight, 0) + gap * Math.max(0, groups.length - 1);
    alertCorner.classList.toggle('alerts-overflow', content > alertCorner.clientHeight + 1);
  };
  new MutationObserver(markOverflow).observe(alertCorner, { childList: true, subtree: true });
  window.addEventListener('resize', markOverflow);

  // Display theatre, both opt-in: the phosphor scope (one green, the CSS does
  // it) and the long exposure (movement burns into a canvas over the map).
  const phosphor = new StoredToggle('watchfloor.phosphor', false);
  const applyPhosphor = () => el('map').classList.toggle('phosphor', phosphor.value);
  phosphor.subscribe(applyPhosphor);
  applyPhosphor();
  // Traffic currents (I): particles drift with the average flow of the tracks on the map.
  const currentsShown = new StoredToggle('watchfloor.currents', false);
  const currents = new FlowLayer(map, layer, () => {
    const now = clock.now();
    return [...store.all()].filter((t) => store.status(t, now) === 'live' && filter.passes(t, false));
  }, currentsShown);
  const exposureShown = new StoredToggle('watchfloor.exposure', false);
  const exposure = new ExposureLayer(map, layer, () => {
    const now = clock.now();
    return [...store.all()].filter((t) => store.status(t, now) === 'live');
  }, exposureShown);
  // The Stack (E): aircraft at their real altitude on a tilted map.
  const stack = new StackMode(map, store, clock, layer, selection, filter, trails);
  // Ride Along (J): the view from the selected aircraft. One camera mode at a time.
  const ride = new RideAlong(map, store, clock, layer, selection, filter, details);
  addRideButton(el('details'), store, selection, ride);
  ride.beforeStart = () => stack.leaveNow();
  stack.beforeEnter = () => ride.stop();
  // What a ride and the timeline's replay hide that the flat layers' own hiding can't reach:
  // canvases of their own (currents, long exposure), and the satellites' layer, which the
  // ride's flat map would draw on the ground. Decided here, so the two never undo each other.
  let timelineReplaying = false;
  const hideOverlays = () => {
    currents.setHidden(timelineReplaying || ride.value);
    exposure.setHidden(timelineReplaying || ride.value);
    satellites.setHidden(ride.value);
  };
  ride.subscribe(hideOverlays);

  // The search palette: everything with a place on the map, one box, camera there.
  const palette = new Palette(
    el('palette'),
    () => ({ tracks: store.all(), airports: airports.all, areas: regions.regions }),
    (match) => {
      switch (match.kind) {
        case 'track': {
          const track = match.track;
          selection.select(track.id);
          const pos = layer.positionOf(track.id) ?? { lon: track.lon, lat: track.lat };
          fly(map, { center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 7) });
          break;
        }
        case 'airport': {
          const airport = match.airport;
          countryPanel.close();
          airportPanel.open(airport);
          fly(map, { center: [airport.lon, airport.lat], zoom: Math.max(map.getZoom(), 9) });
          break;
        }
        case 'chokepoint': {
          const { south, west, north, east } = match.chokepoint.box;
          map.fitBounds([[west, south], [east, north]], { padding: 80, maxZoom: 10, duration: 900 });
          break;
        }
        case 'area':
          regionLayer.show(match.area);
          break;
      }
    },
  );

  // The cinematic tour: the camera rides between what's happening until any input stops it.
  const tour = new Tour(
    map,
    el('tour'),
    () => {
      const now = clock.now();
      const live = [...store.all()].filter((t) => store.status(t, now) === 'live');
      return tourStops({
        emergencies: emergencyAlerts.active,
        trackOf: (id) => store.get(id),
        tracks: live,
        hazards: hazards.items,
        findings: findings.items,
        news: news.items,
        shipsIn: chokepointCounts(live, () => true),
        now,
      });
    },
    {
      // Ride along using the selection's own follow mode, so the reticle
      // locks on and the details panel tells the story of what we're with.
      engage: (id) => {
        selection.setFollow(false); // or selecting would ease flatly, cancelling the flight
        selection.select(id);
        selection.setFollow(true);
      },
      release: () => selection.setFollow(false),
      clear: () => {
        selection.setFollow(false);
        selection.select(null);
      },
    },
  );
  // The top bar's Tour button: a way in for anyone who doesn't know G, lit while the tour runs.
  const tourButton = el('tour-toggle');
  tourButton.addEventListener('click', () => (tour.active ? tour.stop() : tour.start()));
  tour.onChange = () => tourButton.setAttribute('aria-pressed', String(tour.active));
  // A first visit's one-time hint; not for a kiosk, or a screen joined to a room (nobody is at its mouse).
  // Shown once the first picture is in (the demo's can take ten seconds): a hint to click aircraft on an empty globe helped nobody.
  let hintArmed = !screensaver && !new URLSearchParams(location.search).has('screen');

  // Screensaver mode (?screensaver, for a kiosk window or an idle trigger):
  // opening this URL is the consent the motion rule asks for, so the tour
  // starts itself once the picture is in, and any input only pauses it — a
  // quiet minute later it rides on.
  if (screensaver) {
    const IDLE_MS = 60_000;
    let idleTimer: number | undefined;
    const armed = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => tour.start(), IDLE_MS);
    };
    for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
      document.addEventListener(type, armed, { capture: true, passive: true });
    armed();
    // The tour stops itself when the page is hidden (nothing is seen, so
    // nothing should burn); the moment the screensaver shows again, ride on.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tour.start();
    });
    const unsubscribe = store.subscribe(() => {
      if (store.size === 0) return;
      tour.start();
      unsubscribe();
    });
  }
  const newsToggle = el('news-toggle');
  newsToggle.addEventListener('click', () => newsSettings.set({ shown: !newsSettings.shown }));
  const showNewsToggle = () => newsToggle.setAttribute('aria-checked', String(newsSettings.shown));
  newsSettings.subscribe(showNewsToggle);
  showNewsToggle();

  const list = new TrackList(
    el('track-list'),
    el('list-toggle') as HTMLButtonElement,
    store,
    clock,
    layer,
    selection,
    map,
    filter,
  );

  // A newly selected track's path and details come from the server: it holds
  // hours of history and reference data the browser doesn't.
  selection.subscribe((id) => {
    if (id === path.id) return;
    path.select(id);
    details.select(id);
    if (id) connection.send({ type: 'track', id });
  });

  // Checking a track: the news card makes way, and the rotation waits until nothing is selected.
  selection.subscribe((id, previous) => {
    if (id !== previous) cards.makeWay(id !== null);
  });

  // Reticle and follow mode track the dead-reckoned position, not the last report.
  selection.subscribe((id, previous) => {
    const pos = id ? layer.positionOf(id) : undefined;
    if (!id || !pos) {
      reticle.hide();
      return;
    }
    reticle.show(pos.lon, pos.lat, id !== previous);
    // Not during a flight: the tour engages follow mode as its flight starts, and this ease
    // cancelled the flight (MapLibre stops any camera animation first), so follow stops sat
    // at the previous zoom. Follow's own frame loop recentres once the flight lands.
    if (selection.follow && !map.isMoving()) map.easeTo({ center: [pos.lon, pos.lat], duration: 400 });
  });
  layer.onFrame(() => {
    const pos = selection.id ? layer.positionOf(selection.id) : undefined;
    if (!pos) return;
    reticle.move(pos.lon, pos.lat);
    reticle.setStale(pos.stale);
    if (selection.follow && !map.isMoving()) {
      // Recentre only once the track has drifted a pixel. Every jump fires
      // moveend, which forces a full redraw of both domains, whose frame
      // notification jumps again: without this guard, following redrew the
      // whole picture at 60 Hz (measured: most of the main thread).
      const at = map.project([pos.lon, pos.lat]);
      const container = map.getContainer();
      if (Math.hypot(at.x - container.clientWidth / 2, at.y - container.clientHeight / 2) >= 1) {
        map.jumpTo({ center: [pos.lon, pos.lat] });
      }
    }
  });
  // How long the page took to show the picture (User Timing, for DevTools and measurements).
  const stopFirstDraw = layer.onFrame(() => {
    if (store.size === 0) return;
    performance.mark('wf:first-tracks');
    stopFirstDraw();
  });

  // Dragging the map is a clear sign the operator wants control back.
  map.on('dragstart', () => selection.setFollow(false));

  // If the selected track disappears from the picture, close its panel.
  store.subscribe(() => {
    if (selection.id && !store.get(selection.id)) selection.select(null);
  });

  document.addEventListener('keydown', (event) => {
    // The key is a modal dialog: it handles its own Escape, and nothing behind it should react.
    if (keyDialog.open) return;
    // The score is sound, not camera: Y turns it on or off and leaves the tour
    // riding, so music can start under the screensaver.
    if ((event.key === 'y' || event.key === 'Y') && !isTyping(event) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      score.toggle();
      return;
    }
    // So is the skin: K dresses the display in the next one and leaves the tour riding.
    if ((event.key === 'k' || event.key === 'K') && !isTyping(event) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      skin.cycle();
      return;
    }
    // Any key hands the camera back from the tour, and does nothing else.
    if (tour.active) {
      tour.stop();
      return;
    }
    // Ctrl K reaches the search even from inside an input box.
    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      palette.setOpen(true);
      return;
    }
    if (event.key === 'Escape') {
      // Close the filter first if it's open, then an airport or country; a further Escape clears the selection.
      if (palette.open) palette.setOpen(false);
      else if (list.open) list.setOpen(false);
      else if (filterPanel.open) filterPanel.setOpen(false);
      else if (airportPanel.isOpen) airportPanel.close();
      else if (countryPanel.isOpen) countryPanel.close();
      else if (regionPanel.open) regionPanel.setOpen(false);
      else if (layersPanel.open) layersPanel.setOpen(false);
      else if (handover.open) handover.setOpen(false);
      else if (rarePanel.open) rarePanel.setOpen(false);
      else if (recordsPanel.open) recordsPanel.setOpen(false);
      else if (timeline.open) timeline.setOpen(false);
      else if (hook.armed || hook.active) hook.clear();
      else if (satellites.selected) satellites.selectIndex(null);
      else selection.select(null);
    }
    // Single-letter shortcuts must not fire while the operator is typing.
    if (isTyping(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 't' || event.key === 'T') trails.cycle();
    if (event.key === 'm' || event.key === 'M') {
      layersPanel.setOpen(!layersPanel.open);
      if (layersPanel.open) focusInto(el('layers-panel'));
    }
    if (event.key === 'l' || event.key === 'L') {
      list.setOpen(!list.open);
      if (list.open) focusInto(el('track-list'));
    }
    if (event.key === 'f' || event.key === 'F') {
      filterControl.toggle();
      if (filterPanel.open) focusInto(el('filter-panel'));
    }
    if (event.key === 's' || event.key === 'S') style.toggle();
    if (event.key === 'n' || event.key === 'N') newsSettings.set({ shown: !newsSettings.shown });
    if (event.key === 'a' || event.key === 'A') airportsShown.toggle();
    if (event.key === 'b' || event.key === 'B') briefingToggle.click();
    if (event.key === 'h' || event.key === 'H') hazardsShown.toggle();
    if (event.key === 'd' || event.key === 'D') findingsShown.toggle();
    if (event.key === 'c' || event.key === 'C') chokepointsShown.toggle();
    if (event.key === 'o' || event.key === 'O') satellitesShown.toggle();
    if ((event.key === 'w' || event.key === 'W') && !regionDraw.active) regionPanel.startDrawing();
    if (event.key === 'r' || event.key === 'R') radarShown.toggle();
    if (event.key === 'i' || event.key === 'I') currentsShown.toggle();
    if (event.key === 'g' || event.key === 'G') tour.start();
    if (event.key === 'v' || event.key === 'V') {
      handover.setOpen(!handover.open);
      if (handover.open) focusInto(el('handover'));
    }
    if (event.key === 'u' || event.key === 'U') {
      recordsPanel.setOpen(false);
      rarePanel.setOpen(!rarePanel.open);
      if (rarePanel.open) focusInto(el('rare-panel'));
    }
    if (event.key === 'p' || event.key === 'P') {
      recordsPanel.setOpen(!recordsPanel.open);
      if (recordsPanel.open) focusInto(el('records-panel'));
    }
    if (event.key === 'q' || event.key === 'Q') room.toggle();
    if (event.key === 'z' || event.key === 'Z') {
      timeline.setOpen(!timeline.open);
      if (timeline.open) focusInto(el('timeline'));
    }
    if (event.key === 'x' || event.key === 'X') hook.toggle();
    if (event.key === 'e' || event.key === 'E') stack.toggle();
    if (event.key === 'j' || event.key === 'J') ride.toggle();
    if (event.key === '?') keyDialog.toggle();
    if (event.key === '/') {
      event.preventDefault(); // otherwise the slash lands in the search box
      palette.setOpen(true);
    }
  });

  /** What the Layers menu wires to: the same settings the keys change. */
  function layerDeps(): LayerDeps {
    return {
      style,
      trails,
      news: newsSettings,
      briefing: briefingOpen,
      airports: airportsShown,
      hazards: hazardsShown,
      findings: findingsShown,
      chokepoints: chokepointsShown,
      radar: radarShown,
      radarTime: () => (radar.frameTime ? `picture from ${formatNewsTime(radar.frameTime)}` : 'loading'),
      regions: regionsShown,
      drawArea: () => regionPanel.startDrawing(),
      manageAreas: () => regionPanel.setOpen(true),
      sound: soundOn,
      score,
      search: () => palette.setOpen(true),
      tour: () => tour.start(),
      handover: () => handover.setOpen(true),
      rare: () => rarePanel.setOpen(true),
      records: () => recordsPanel.setOpen(true),
      room: () => room.toggle(),
      timeline: () => timeline.setOpen(true),
      phosphor,
      skin,
      currents: currentsShown,
      exposure: exposureShown,
      satellites: satellitesShown,
      satellitesDetail: () => satellites.detail(),
      stack,
    };
  }

  // Top bar clock, in server time.
  const dtg = el('dtg');
  const dtgRing = el('dtg-ring');
  const tickClock = () => {
    const now = clock.now();
    dtg.textContent = formatDtg(now);
    dtgRing.style.setProperty('--sec', String(new Date(now).getUTCSeconds()));
    dtg.setAttribute('datetime', new Date(now).toISOString());
  };
  tickClock();
  window.setInterval(tickClock, 1000);

  const scenarioName = el('scenario-name');
  let framed = false;

  // Tell the server what's on screen, so a pay-per-area feed can poll just that.
  // Debounced: a pan or zoom sends one view once it settles (300 ms), not one per frame.
  const sendView = () => {
    const b = map.getBounds();
    connection.send({
      type: 'view',
      bbox: viewForServer({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }),
    });
  };
  // 300 ms after the camera settles, but at most 2 s after it started moving: a ride moves
  // the camera every frame, and a pure debounce never fired, so the feeds kept polling where
  // the ride began and a long ride flew out of the polled area.
  let viewTimer: number | undefined;
  let viewDue = 0;
  map.on('moveend', () => {
    const now = Date.now();
    if (viewDue === 0) viewDue = now + 2_000;
    window.clearTimeout(viewTimer);
    viewTimer = window.setTimeout(() => {
      viewDue = 0;
      sendView();
    }, Math.max(0, Math.min(300, viewDue - now)));
  });

  const credits = new DataCredits(map);
  // The watch handover: the server's last-24-hours log, read back on demand.
  const handover = new HandoverPanel(el('handover'), map, () => connection.send({ type: 'brief' }));

  // The timeline: scrub into the last six hours (replay, from the server's
  // paths) or thirty minutes ahead (dead-reckoned ghosts). The live picture
  // hides while replaying, so two moments are never on screen as one.
  const ghosts = new GhostLayer(map, () => {
    const now = clock.now();
    return [...store.all()].filter((t) => store.status(t, now) === 'live');
  });
  const replayLayer = new ReplayLayer(map, positionAt);
  const timeline = new Timeline(el('timeline'), {
    now: () => clock.now(),
    onState: (s) => {
      const replaying = s.mode === 'replay';
      layer.setHidden(replaying);
      trailLayer.setHidden(replaying);
      timelineReplaying = replaying;
      hideOverlays();
      if (replaying) {
        selection.select(null);
        hook.clear();
      }
      ghosts.setOffset(s.mode === 'project' ? s.offsetMs : null);
      replayLayer.setTime(replaying ? s.t : null);
      satellites.setTimeline(replaying ? { at: s.t } : s.mode === 'project' ? { offsetMs: s.offsetMs } : null);
    },
    requestReplay: () => {
      const b = map.getBounds();
      connection.send({
        type: 'replay',
        bbox: viewForServer({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }),
      });
    },
  });
  // The ops room (Q): host a room for phones and other screens, or join one as a screen.
  const room = new RoomHost({
    map,
    store,
    layer,
    selection,
    tour,
    timeline,
    ride,
    layers: layerDeps,
    live: !demo,
    send: (message) => connection.send(message),
  });
  const handlers: ConnectionHandlers = {
    onMessage(message, receivedAt) {
      clock.update(message.serverTime, receivedAt);
      switch (message.type) {
        case 'hello':
          // A new server (a restart, a reconnect) may keep a different clock: take its first sample whole.
          clock.reset();
          clock.update(message.serverTime, receivedAt);
          store.setStaleness(message.staleness);
          scenarioName.textContent = trafficLabel(message.traffic, message.scenario?.name);
          if (message.scenario && !framed && !userHasMoved()) {
            const { center, zoom } = message.scenario;
            map.jumpTo({ center: [center.lon, center.lat], zoom });
          }
          framed = true;
          status.setFeeds(message.feeds);
          status.setTraffic(message.traffic);
          // Phones hide the scenario label, so a chip says the traffic is simulated (never present it as live).
          el('sim-chip').hidden = message.traffic !== 'simulated';
          // A feed that can't run (no API key) shows no data, so it gets no credit.
          credits.set(message.feeds.filter((f) => f.state !== 'unconfigured').map((f) => f.feed));
          sendView(); // on every (re)connect, so the server always knows what we're looking at
          if (selection.id) connection.send({ type: 'track', id: selection.id }); // a fresh answer after reconnecting
          timeline.reconnected();
          room.reconnected(message.scenario);
          break;
        case 'room':
        case 'room-presence':
        case 'room-control':
        case 'room-closed':
          room.handle(message);
          break;
        case 'snapshot': {
          const applyStart = performance.now();
          store.applySnapshot(message.tracks, message.trails);
          performance.measure('wf:snapshot-apply', { start: applyStart });
          if (hintArmed) {
            hintArmed = false;
            showFirstHint(map);
          }
          break;
        }
        case 'delta':
          store.applyDelta(message.upserts, message.removals, message.serverTime);
          path.extend(message.upserts);
          if (message.feeds) status.setFeeds(message.feeds);
          break;
        case 'path':
          path.load(message);
          break;
        case 'details':
          details.load(message);
          break;
        case 'news':
          news.apply(message, clock.now());
          break;
        case 'hazards':
          hazards.apply(message.items);
          break;
        case 'findings':
          findings.apply(message.items, message.recent ?? []);
          break;
        case 'records':
          recordsPanel.load(message.boards);
          break;
        case 'brief':
          handover.load(message);
          break;
        case 'replay':
          replayLayer.setData(message.tracks);
          timeline.loaded(message);
          break;
      }
    },
    onState(state) {
      status.setConnection(state);
      // A page left open across a deploy (the screensaver kiosk) heals itself:
      // one reload fetches the bundle that matches the server's protocol.
      if (state.status === 'incompatible') window.setTimeout(() => location.reload(), 5000);
    },
  };
  const connection: Link = demo ? new demo.LocalServer(handlers) : new Connection(defaultSocketUrl(), handlers);

  const status = new StatusBar(el('statusbar'), map, store, clock, filter, () => connection.retryNow());
  if (demo) {
    // The in-page server runs the last 30 minutes before its first picture: "Connecting" would be a lie.
    status.setTraffic('simulated');
    scenarioName.textContent = 'World, simulating the last 30 minutes';
  }
  // The graphics context can go (a crowded GPU, a long ride loading terrain): MapLibre then throws on
  // every frame and the 3D modes can't be left. End them, and say the one thing that helps.
  map.getCanvas().addEventListener('webglcontextlost', () => {
    ride.stop();
    stack.leaveNow();
    const notice = document.createElement('div');
    notice.className = 'context-lost';
    notice.setAttribute('role', 'alert');
    const text = document.createElement('p');
    text.textContent = 'The graphics stopped (the browser lost its drawing context). Reload the page to carry on.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'alert-show';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => location.reload());
    notice.append(text, reload);
    document.querySelector('.app')?.append(notice);
  });

  // A covered or background tab should cost nothing: after a quiet minute
  // hidden, close the socket entirely (no deltas, no reconnect churn, and the
  // server's feeds can pause if nobody else watches). The moment the page is
  // seen again it reconnects and gets a fresh snapshot. Short alt-tabs stay
  // connected: the grace means switching windows never drops the picture.
  const HIDDEN_STOP_MS = 60_000;
  let hiddenTimer: number | undefined;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenTimer = window.setTimeout(() => connection.stop(), HIDDEN_STOP_MS);
    } else {
      window.clearTimeout(hiddenTimer);
      connection.start();
    }
  });

  connection.start();
}

void main();
