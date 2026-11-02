import { distanceM, parseHazard, type Hazard, type HazardAlert, type HazardKind } from '@watchfloor/shared';

/** Magnitude 2.5 and up, the past day; updated every minute. Public domain. */
export const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
/** GDACS's current events (about 100), all hazard types. Free with credit to GDACS. */
export const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/events4app';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null);
const features = (body: unknown): Json[] => {
  const list = obj(body)?.features;
  return Array.isArray(list) ? list.map(obj).filter((f): f is Json => f !== null) : [];
};
const point = (f: Json): number[] | null => {
  const coords = obj(f.geometry)?.coordinates;
  return Array.isArray(coords) && coords.length >= 2 && coords.every((c) => typeof c === 'number') ? (coords as number[]) : null;
};

/** The USGS feed's earthquakes. Bad features are dropped, not fatal. */
export function parseUsgs(body: unknown): Hazard[] {
  const out: Hazard[] = [];
  for (const f of features(body)) {
    const p = obj(f.properties);
    const c = point(f);
    if (!p || !c || p.type !== 'earthquake' || typeof f.id !== 'string') continue;
    const hazard = parseHazard({
      id: `usgs:${f.id}`,
      kind: 'earthquake',
      source: 'usgs',
      title: p.title,
      lon: c[0],
      lat: c[1],
      depthKm: c[2],
      time: p.time,
      magnitude: p.mag,
      url: typeof p.url === 'string' ? p.url.replace(/^http:/, 'https:') : undefined,
    });
    if (hazard) out.push(hazard);
  }
  return out;
}

const GDACS_KINDS: Record<string, HazardKind> = { EQ: 'earthquake', TC: 'cyclone', FL: 'flood', VO: 'volcano', DR: 'drought', WF: 'wildfire' };

/**
 * GDACS's current events. Dates come without a zone and are UTC. A
 * severity line that says nothing ("Magnitude 0", given for floods) is left
 * out. Earthquakes are kept here only so `mergeHazards` can lend their
 * alert level to the USGS quake they describe.
 */
export function parseGdacs(body: unknown): Hazard[] {
  const out: Hazard[] = [];
  for (const f of features(body)) {
    const p = obj(f.properties);
    const c = point(f);
    const kind = p && GDACS_KINDS[String(p.eventtype)];
    if (!p || !c || !kind || p.iscurrent === 'false') continue;
    const detail = typeof obj(p.severitydata)?.severitytext === 'string' ? String(obj(p.severitydata)!.severitytext).trim() : '';
    const alert = typeof p.alertlevel === 'string' ? p.alertlevel.toLowerCase() : '';
    const hazard = parseHazard({
      id: `gdacs:${String(p.eventtype)}:${String(p.eventid)}`,
      kind,
      source: 'gdacs',
      title: p.name,
      lon: c[0],
      lat: c[1],
      time: typeof p.fromdate === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(p.fromdate) ? p.fromdate : `${p.fromdate}Z`) : NaN,
      alert: alert as HazardAlert,
      detail: detail && !/^magnitude 0\b/i.test(detail) ? detail : undefined,
      url: obj(p.url)?.report,
    });
    if (hazard) out.push(hazard);
  }
  return out;
}

/** The same quake in both lists: within 2 minutes and 100 km. */
const SAME_QUAKE_MS = 2 * 60_000;
const SAME_QUAKE_M = 100_000;

/**
 * One list for the map: USGS's earthquakes (better located, and every one
 * from M2.5) and GDACS's other hazards. A GDACS quake isn't shown twice:
 * its alert level goes onto the matching USGS quake, if there is one.
 */
export function mergeHazards(quakes: readonly Hazard[], gdacs: readonly Hazard[]): Hazard[] {
  const merged = quakes.map((q) => ({ ...q }));
  for (const g of gdacs) {
    if (g.kind !== 'earthquake') {
      merged.push(g);
      continue;
    }
    const match = merged.find(
      (q) => q.source === 'usgs' && Math.abs(q.time - g.time) < SAME_QUAKE_MS && distanceM(q, g) < SAME_QUAKE_M,
    );
    if (match && g.alert) match.alert = g.alert;
  }
  return merged.sort((a, b) => b.time - a.time);
}
