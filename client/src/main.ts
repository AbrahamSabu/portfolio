// MapLibre's stylesheet first, so ours can override it.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './hud.css';
import { AirportLayer } from './map/airportLayer';
import { describeAirport } from './map/airports';
import { ChokepointLayer } from './map/chokepointLayer';
import { createMap } from './map/createMap';
import { DataCredits } from './map/dataCredits';
import { FilterControl } from './map/filterControl';
import { HazardLayer } from './map/hazardLayer';
import { NewsLayer } from './map/newsLayer';
import { NewsHotspots } from './map/newsHotspots';
import { NightLayer } from './map/nightLayer';
import { Reticle } from './map/reticle';
import { TrackLayer } from './map/trackLayer';
import { PathLayer } from './map/pathLayer';
import { StyleControl } from './map/styleControl';
import { loadTrailMode, TrailControl } from './map/trailControl';
import { TrailLayer } from './map/trailLayer';
import { viewForServer } from './map/viewBox';
import { Connection, defaultSocketUrl } from './net/connection';
import { ServerClock } from './state/clock';
import { HazardStore } from './state/hazards';
import { loadNewsSettings, NewsSettings, NewsStore } from './state/newsStore';
import { loadFilterState, PictureFilter, saveFilterState } from './state/pictureFilter';
import { SelectedDetails } from './state/selectedDetails';
import { SelectedPath } from './state/selectedPath';
import { loadSymbolStyle, SymbolStyleSetting } from './state/symbolStyle';
import { Selection } from './state/selection';
import { StoredToggle } from './state/storedToggle';
import { TrackStore } from './state/trackStore';
import { AirportPanel } from './ui/airportPanel';
import { BriefingPanel } from './ui/briefingPanel';
import { DetailsPanel } from './ui/detailsPanel';
import { EmergencyAlerts } from './ui/emergencyAlerts';
import { HazardAlerts } from './ui/hazardAlerts';
import { FilterPanel } from './ui/filterPanel';
import { HoverCard } from './ui/hoverCard';
import { KeyDialog } from './ui/keyDialog';
import { NewsCards } from './ui/newsCards';
import { NewsTicker } from './ui/newsTicker';
import { formatDtg, trafficLabel } from './ui/format';
import { StatusBar } from './ui/statusBar';
import { TrackList } from './ui/trackList';

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
  endBootSequence();
  const store = new TrackStore();
  const clock = new ServerClock();
  const selection = new Selection();

  const { map, userHasMoved } = createMap(el('map'));
  await waitForFonts();

  // What the operator has chosen to see, remembered per browser.
  const filter = new PictureFilter(loadFilterState());
  filter.subscribe(() => saveFilterState(filter.state));

  const style = new SymbolStyleSetting(loadSymbolStyle());

  // Political news: markers, hotspots, pop-up cards, ticker and briefing share one store.
  const news = new NewsStore();
  const newsSettings = new NewsSettings(loadNewsSettings());

  // Night, under the basemap's labels and everything of ours.
  new NightLayer(map, () => clock.now());
  // News hotspots next: a glow under airports, tracks and markers.
  new NewsHotspots(map, news, newsSettings, () => clock.now());
  // First, so its layers sit under trails, tracks and news.
  const airportsShown = new StoredToggle('watchfloor.airports', true);
  const airports = new AirportLayer(map, airportsShown);

  const layer = new TrackLayer(map, store, clock, selection, filter, style);
  const trailControl = new TrailControl(new TrailLayer(map, store, layer, selection, filter, loadTrailMode()));
  map.addControl(trailControl, 'top-left');
  // After the trails, so the selected path draws above them (and below the tracks).
  const path = new SelectedPath();
  const pathLayer = new PathLayer(map, store, path);
  map.addControl(new StyleControl(style), 'top-left');
  const filterPanel = new FilterPanel(el('filter-panel'), filter, store, clock, () => filterControl.update());
  const filterControl = new FilterControl(filterPanel, filter);
  map.addControl(filterControl, 'top-left');
  const reticle = new Reticle(map);
  new HoverCard(map, store, clock, layer, (point) => {
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
  map.on('click', (event) => {
    if (layer.trackAt(event.point)) return;
    const airport = airports.airportAt(event.point);
    if (airport) airportPanel.open(airport);
  });
  new EmergencyAlerts(el('alerts-emergency'), map, store, clock, selection, newsSettings);
  new HazardAlerts(el('alerts-hazard'), map, hazards, hazardsShown, newsSettings, (id) => hazardLayer.open(id));
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

  // Reticle and follow mode track the dead-reckoned position, not the last report.
  selection.subscribe((id, previous) => {
    const pos = id ? layer.positionOf(id) : undefined;
    if (!id || !pos) {
      reticle.hide();
      return;
    }
    reticle.show(pos.lon, pos.lat, id !== previous);
    if (selection.follow) map.easeTo({ center: [pos.lon, pos.lat], duration: 400 });
  });
  layer.onFrame(() => {
    const pos = selection.id ? layer.positionOf(selection.id) : undefined;
    if (!pos) return;
    reticle.move(pos.lon, pos.lat);
    reticle.setStale(pos.stale);
    if (selection.follow && !map.isMoving()) map.jumpTo({ center: [pos.lon, pos.lat] });
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
    if (event.key === 'Escape') {
      // Close the filter first if it's open, then an airport; a further Escape clears the selection.
      if (filterPanel.open) filterPanel.setOpen(false);
      else if (airportPanel.isOpen) airportPanel.close();
      else selection.select(null);
    }
    // Single-letter shortcuts must not fire while the operator is typing.
    if (isTyping(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 't' || event.key === 'T') trailControl.cycle();
    if (event.key === 'l' || event.key === 'L') list.setOpen(!list.open);
    if (event.key === 'f' || event.key === 'F') filterControl.toggle();
    if (event.key === 's' || event.key === 'S') style.toggle();
    if (event.key === 'n' || event.key === 'N') newsSettings.set({ shown: !newsSettings.shown });
    if (event.key === 'a' || event.key === 'A') airportsShown.toggle();
    if (event.key === 'b' || event.key === 'B') briefingToggle.click();
    if (event.key === 'h' || event.key === 'H') hazardsShown.toggle();
    if (event.key === 'c' || event.key === 'C') chokepointsShown.toggle();
    if (event.key === '?') keyDialog.toggle();
    if (event.key === '/') {
      event.preventDefault(); // otherwise the slash lands in the search box
      list.focusSearch();
    }
  });

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
  let viewTimer: number | undefined;
  map.on('moveend', () => {
    window.clearTimeout(viewTimer);
    viewTimer = window.setTimeout(sendView, 300);
  });

  const credits = new DataCredits(map);
  const connection = new Connection(defaultSocketUrl(), {
    onMessage(message, receivedAt) {
      clock.update(message.serverTime, receivedAt);
      switch (message.type) {
        case 'hello':
          store.setStaleness(message.staleness);
          scenarioName.textContent = trafficLabel(message.traffic, message.scenario?.name);
          if (message.scenario && !framed && !userHasMoved()) {
            const { center, zoom } = message.scenario;
            map.jumpTo({ center: [center.lon, center.lat], zoom });
          }
          framed = true;
          status.setFeeds(message.feeds);
          // A feed that can't run (no API key) shows no data, so it gets no credit.
          credits.set(message.feeds.filter((f) => f.state !== 'unconfigured').map((f) => f.feed));
          sendView(); // on every (re)connect, so the server always knows what we're looking at
          if (selection.id) connection.send({ type: 'track', id: selection.id }); // a fresh answer after reconnecting
          break;
        case 'snapshot': {
          const applyStart = performance.now();
          store.applySnapshot(message.tracks, message.trails);
          performance.measure('wf:snapshot-apply', { start: applyStart });
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
      }
    },
    onState(state) {
      status.setConnection(state);
    },
  });

  const status = new StatusBar(el('statusbar'), map, store, clock, filter, () => connection.retryNow());
  connection.start();
}

void main();
