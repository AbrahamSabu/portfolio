import './sky.css';
import { deadReckon, metresToFeet, parseSkyResponse, type SkyAircraft } from '@watchfloor/shared';
import airportsUrl from '../data/airports.json?url';
import { parseAirports } from '../map/airports';
import { issAsSeen, IssWatch, ISS_SKY_ID } from './iss';
import {
  anglesOf,
  blend,
  compassPoint,
  deviceDirection,
  directionOf,
  guidance,
  nearestTo,
  skyPosition,
  type SkyPosition,
  type Vec3,
} from './skyMath';

/** The server refreshes its picture every few seconds; asking faster buys nothing. */
const POLL_MS = 5_000;
/** Within this of a plane, you're pointing at it. */
const LOCK_DEG = 12;
/** A plane tapped on the scope stays chosen this long, unless pointing locks onto another. */
const PICK_HOLD_MS = 20_000;
/** Compass readings jitter: each new one moves the aim this fraction of the way. */
const SMOOTHING = 0.2;
/** No absolute orientation by then: this device has no usable compass. */
const COMPASS_WAIT_MS = 2_500;
/** The card's text changes at most this often, so the page isn't relaid out every frame. */
const CARD_MS = 250;

const AIRCRAFT = '#ffff80';
const ACCENT = '#c9a0ff';
const HUD = '#3fb6ff';

interface Seen {
  plane: SkyAircraft;
  pos: SkyPosition;
  dir: Vec3;
}

type CardState = 'searching' | 'empty' | 'locked' | 'nearest' | 'picked' | 'overhead';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const field = (name: string) => document.querySelector<HTMLElement>(`[data-field="${name}"]`)!;

let observer: { lat: number; lon: number; altM: number } | null = null;
let planes: SkyAircraft[] = [];
let polled = false;
let clockOffset = 0;
let pointing: Vec3 | null = null;
let compass = false;
let picked: { id: string; at: number } | null = null;
let lockedId: string | null = null;
let lastCardAt = 0;
let lastCardKey = '';
let seenNow: Seen[] = [];
const airportCity = new Map<string, string>();
/** Type and route looked up from hexdb.io, once per aircraft. */
const extras = new Map<string, { type?: string; route?: string } | 'pending'>();
/** The ISS joins the sky whenever it can be seen from here. */
const iss = new IssWatch(
  () => observer,
  () => Date.now() + clockOffset,
);
const SATELLITE = '#e6f0fa';

$('go').addEventListener('click', () => void start());

async function start(): Promise<void> {
  const error = $('start-error');
  // Phones only hand location and compass to secure pages.
  if (!window.isSecureContext) {
    error.textContent = 'Phones only share location and compass with secure pages. Open this from an https:// address.';
    error.hidden = false;
    return;
  }
  if (!navigator.geolocation) {
    error.textContent = "This browser can't share your location.";
    error.hidden = false;
    return;
  }
  // iOS asks for motion access, and only from a tap.
  const permission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
  if (typeof permission === 'function') {
    try {
      await permission();
    } catch {
      // Refused or unavailable: the scope still works north-up, by tapping.
    }
  }
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', (e) => onOrientation(e as DeviceOrientationEvent, true));
  }
  window.addEventListener('deviceorientation', (e) => onOrientation(e, false));

  navigator.geolocation.watchPosition(
    (p) => {
      const first = !observer;
      observer = { lat: p.coords.latitude, lon: p.coords.longitude, altM: p.coords.altitude ?? 0 };
      if (first) void poll();
    },
    (e) => {
      $('hint').textContent =
        e.code === e.PERMISSION_DENIED ? 'Location is blocked for this page. Allow it in your browser settings, then reload.' : 'Still waiting for your location…';
    },
    { enableHighAccuracy: true, maximumAge: 10_000 },
  );

  $('start').hidden = true;
  $('live').hidden = false;
  void keepAwake();
  void loadAirports();
  iss.start();
  window.setInterval(() => void poll(), POLL_MS);
  window.setTimeout(() => {
    if (!compass) $('hint').textContent = 'No compass on this device: tap a plane on the scope to see what it is.';
  }, COMPASS_WAIT_MS);
  $<HTMLCanvasElement>('scope').addEventListener('click', onTap);
  requestAnimationFrame(frame);
}

function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }, absoluteEvent: boolean): void {
  if (e.beta === null || e.gamma === null) return;
  let alpha: number | null = null;
  // iOS gives a true compass heading beside a relative alpha; W3C alpha counts the other way.
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) alpha = 360 - e.webkitCompassHeading;
  else if ((absoluteEvent || e.absolute) && e.alpha !== null) alpha = e.alpha;
  // A relative alpha says nothing about which way is north: no use for aiming.
  if (alpha === null) return;
  compass = true;
  pointing = blend(pointing, deviceDirection(alpha, e.beta, e.gamma), SMOOTHING);
}

async function poll(): Promise<void> {
  if (!observer || document.hidden) return;
  try {
    const res = await fetch(`/api/sky?lat=${observer.lat.toFixed(3)}&lon=${observer.lon.toFixed(3)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseSkyResponse(await res.json());
    if (!data) throw new Error('unreadable reply');
    clockOffset = data.serverTime - Date.now();
    planes = data.aircraft;
    polled = true;
  } catch {
    // Keep the last picture; the next poll tries again.
  }
}

function frame(): void {
  requestAnimationFrame(frame);
  const now = Date.now();
  seenNow = [];
  if (observer) {
    const serverNow = now + clockOffset;
    for (const p of planes) {
      // Glide between polls on course and speed, as the main map does.
      const at = deadReckon(p, p.courseDeg, p.speedMps, Math.min(Math.max(0, serverNow - p.observedAt), 60_000));
      const pos = skyPosition(observer, { lat: at.lat, lon: at.lon, altitudeM: p.altitudeM }, observer.altM);
      if (pos.elevationDeg >= 0) seenNow.push({ plane: p, pos, dir: directionOf(pos) });
    }
    const station = iss.sighting;
    if (station?.visible) {
      const seen = issAsSeen(station, serverNow);
      seenNow.push({ ...seen, dir: directionOf(seen.pos) });
    }
  }

  let target: Seen | undefined;
  let state: CardState = !observer || !polled ? 'searching' : seenNow.length === 0 ? 'empty' : 'overhead';
  const hit = compass && pointing ? nearestTo(pointing, seenNow) : null;
  const pick = picked && now - picked.at < PICK_HOLD_MS ? seenNow.find((s) => s.plane.id === picked!.id) : undefined;
  if (hit && hit.offDeg <= LOCK_DEG) {
    target = hit.item;
    state = 'locked';
    picked = null;
  } else if (pick) {
    target = pick;
    state = 'picked';
  } else if (hit) {
    target = hit.item;
    state = 'nearest';
  } else if (seenNow.length > 0) {
    // No compass: the highest in the sky is the easiest one to find.
    target = seenNow.reduce((a, b) => (b.pos.elevationDeg > a.pos.elevationDeg ? b : a));
  }

  const nowLocked = state === 'locked' ? target!.plane.id : null;
  if (nowLocked && nowLocked !== lockedId) navigator.vibrate?.(30);
  lockedId = nowLocked;

  drawScope(target);
  if (now - lastCardAt >= CARD_MS) {
    lastCardAt = now;
    renderCard(state, target);
  }
}

const TAG: Record<CardState, string> = {
  searching: 'Looking for aircraft near you…',
  empty: 'No aircraft within 60 km right now',
  locked: 'Locked on',
  nearest: 'Nearest to where you’re pointing',
  picked: 'Selected',
  overhead: 'Highest in your sky',
};

function renderCard(state: CardState, target: Seen | undefined): void {
  const p = target?.plane;
  const station = p?.id === ISS_SKY_ID;
  const extra = p && !station ? extrasOf(p) : undefined;
  const what = p ? [p.airline, p.model ?? extra?.type, p.military ? 'Military' : undefined].filter(Boolean).join(' · ') : '';
  const route = station
    ? 'Lit by the sun in a dark sky: a steady light, no blinking, crossing in minutes'
    : extra?.route
      ? extra.route.split('-').map((code) => airportCity.get(code) ?? code).join(' → ')
      : '';
  const card = {
    tag: TAG[state],
    name: p ? (p.callsign?.trim() ?? 'No callsign') : '',
    what,
    route,
    alt: p ? (station ? `${Math.round(p.altitudeM / 1000)} km` : feet(p.altitudeM)) : '—',
    speed: p ? `${Math.round(p.speedMps * 3.6).toLocaleString('en-GB')} km/h` : '—',
    dist: target ? km(target.pos.groundM) : '—',
    where: target ? `${Math.round(target.pos.elevationDeg)}° up, ${compassPoint(target.pos.azimuthDeg)}` : '—',
  };
  let hint = '';
  if (state === 'nearest' && target && pointing) {
    const g = guidance(anglesOf(pointing), target.pos);
    const parts = [];
    if (Math.abs(g.turnDeg) > 3) parts.push(`turn ${g.turnDeg > 0 ? 'right' : 'left'} ${Math.round(Math.abs(g.turnDeg))}°`);
    if (Math.abs(g.tiltDeg) > 3) parts.push(`tilt ${g.tiltDeg > 0 ? 'up' : 'down'} ${Math.round(Math.abs(g.tiltDeg))}°`);
    hint = parts.length ? `To point at it: ${parts.join(' and ')}.` : '';
  } else if (state === 'locked') {
    hint = 'That’s the one you’re pointing at.';
  } else if (!compass && seenNow.length > 0) {
    hint = 'No compass on this device: tap a plane on the scope to see what it is.';
  }
  const key = JSON.stringify([card, hint, state]);
  if (key === lastCardKey) return;
  lastCardKey = key;
  $('card').dataset.state = state;
  for (const [name, value] of Object.entries(card)) field(name).textContent = value;
  $('hint').textContent = hint;
}

/** Type and route from hexdb.io, fetched once for an aircraft when it's first shown. */
function extrasOf(p: SkyAircraft): { type?: string; route?: string } | undefined {
  const known = extras.get(p.id);
  if (known) return known === 'pending' ? undefined : known;
  extras.set(p.id, 'pending');
  const hex = p.id.startsWith('adsb:') ? p.id.slice(5) : null;
  void (async () => {
    const out: { type?: string; route?: string } = {};
    try {
      if (!p.model && hex) {
        const res = await fetch(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(hex)}`);
        if (res.ok) {
          const j = (await res.json()) as Record<string, unknown>;
          // Only what the aircraft is: hexdb also knows owners, which this page never shows.
          const type = [j.Manufacturer, j.Type].filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length < 60).join(' ');
          if (type) out.type = type;
        }
      }
      if (p.callsign) {
        const res = await fetch(`https://hexdb.io/api/v1/route/icao/${encodeURIComponent(p.callsign.trim())}`);
        if (res.ok) {
          const j = (await res.json()) as Record<string, unknown>;
          if (typeof j.route === 'string' && /^[A-Z0-9]{3,4}(-[A-Z0-9]{3,4})+$/.test(j.route)) out.route = j.route;
        }
      }
    } catch {
      // Unavailable: the card shows what Watchfloor knows.
    }
    extras.set(p.id, out);
  })();
  return undefined;
}

async function loadAirports(): Promise<void> {
  try {
    const res = await fetch(airportsUrl);
    // Airports are known by name, not by town ("Milan Malpensa", not Ferno):
    // the name without "International Airport", and before any hyphen
    // ("Málaga-Costa del Sol" reads as Málaga).
    for (const a of parseAirports(await res.json())) {
      const name = a.name.replace(/\s+(International\s+)?(Airport|Airfield|Aerodrome)\b.*$/i, '').split('-')[0]!.trim();
      airportCity.set(a.code, name || a.city);
    }
  } catch {
    // Routes then show as ICAO codes.
  }
}

/** The sky as a disc: the centre is straight up, the edge the horizon, turned so where you face is at the top. */
function drawScope(target: Seen | undefined): void {
  const canvas = $<HTMLCanvasElement>('scope');
  const size = canvas.clientWidth;
  if (size === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = canvas.height = Math.round(size * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const R = c - 22;
  const aim = compass && pointing ? anglesOf(pointing) : null;
  const up = aim?.azimuthDeg ?? 0;
  const xy = (az: number, el: number): [number, number] => {
    const r = (R * (90 - Math.max(0, el))) / 90;
    const a = ((az - up) * Math.PI) / 180;
    return [c + r * Math.sin(a), c - r * Math.cos(a)];
  };

  ctx.lineWidth = 1;
  for (const [el, alpha] of [
    [0, 0.6],
    [30, 0.25],
    [60, 0.25],
  ] as const) {
    ctx.strokeStyle = `rgb(63 182 255 / ${alpha})`;
    ctx.beginPath();
    ctx.arc(c, c, (R * (90 - el)) / 90, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = HUD;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, az] of [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ] as const) {
    const a = ((az - up) * Math.PI) / 180;
    ctx.fillText(label, c + (R + 12) * Math.sin(a), c - (R + 12) * Math.cos(a));
  }

  for (const s of seenNow) {
    const [x, y] = xy(s.pos.azimuthDeg, s.pos.elevationDeg);
    const isTarget = s === target;
    if (s.plane.id === ISS_SKY_ID) {
      // The map's satellite mark, a plus sign, never an aircraft's arrow.
      const k = isTarget ? 1.5 : 1;
      ctx.strokeStyle = isTarget ? ACCENT : SATELLITE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 7 * k, y);
      ctx.lineTo(x + 7 * k, y);
      ctx.moveTo(x, y - 7 * k);
      ctx.lineTo(x, y + 7 * k);
      ctx.stroke();
      ctx.lineWidth = 1;
      if (isTarget) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      continue;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((s.plane.courseDeg - up) * Math.PI) / 180);
    ctx.fillStyle = isTarget ? ACCENT : AIRCRAFT;
    const k = isTarget ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, -7 * k);
    ctx.lineTo(4.5 * k, 5 * k);
    ctx.lineTo(0, 2.5 * k);
    ctx.lineTo(-4.5 * k, 5 * k);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (isTarget) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // Where the phone points: always straight up the disc, since the disc turns with you.
  if (aim) {
    if (aim.elevationDeg >= 0) {
      const [x, y] = xy(up, aim.elevationDeg);
      const r = (R * LOCK_DEG) / 90;
      ctx.strokeStyle = 'rgb(230 241 250 / 0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - r - 6, y);
      ctx.lineTo(x - r + 4, y);
      ctx.moveTo(x + r - 4, y);
      ctx.lineTo(x + r + 6, y);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgb(230 241 250 / 0.8)';
      ctx.fillText('Tilt up: you’re pointing below the horizon', c, c + R * 0.5);
    }
  }
}

function onTap(event: MouseEvent): void {
  const canvas = event.currentTarget as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const size = rect.width;
  const c = size / 2;
  const R = c - 22;
  const up = compass && pointing ? anglesOf(pointing).azimuthDeg : 0;
  let best: { id: string; d: number } | null = null;
  for (const s of seenNow) {
    const r = (R * (90 - s.pos.elevationDeg)) / 90;
    const a = ((s.pos.azimuthDeg - up) * Math.PI) / 180;
    const d = Math.hypot(event.clientX - rect.left - (c + r * Math.sin(a)), event.clientY - rect.top - (c - r * Math.cos(a)));
    if (d < 32 && (!best || d < best.d)) best = { id: s.plane.id, d };
  }
  if (best) picked = { id: best.id, at: Date.now() };
}

/** Pointing at the sky for a while shouldn't let the screen sleep. */
async function keepAwake(): Promise<void> {
  const lock = async () => {
    try {
      await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }).wakeLock?.request('screen');
    } catch {
      // Not supported or refused: the screen just follows its own timeout.
    }
  };
  await lock();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void lock();
  });
}

function feet(m: number): string {
  return `${(Math.round(metresToFeet(m) / 100) * 100).toLocaleString('en-GB')} ft`;
}

function km(m: number): string {
  return m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}
