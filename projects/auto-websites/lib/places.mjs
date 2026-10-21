// Google Places (New) API: find businesses, filter, and download their photos.
import fs from "node:fs";

const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.websiteUri", "places.regularOpeningHours.weekdayDescriptions", "places.googleMapsUri",
  "places.photos", "places.location", "places.rating", "places.userRatingCount",
].join(",");

async function searchText(key, body, fieldMask = FIELDS) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).error.message; } catch {}
    throw new Error(`Google Places ${res.status}: ${msg}`);
  }
  return (await res.json()).places || [];
}

// Turn "Cork, Ireland" into coordinates by asking Places for the place itself.
export async function geocode(key, location) {
  const [p] = await searchText(key, { textQuery: location }, "places.location,places.formattedAddress");
  if (!p || !p.location) throw new Error(`Couldn't find "${location}" on Google Maps.`);
  return { lat: p.location.latitude, lng: p.location.longitude, label: p.formattedAddress || location };
}

export async function testKey(key) {
  await geocode(key, "Dublin, Ireland");
  return true;
}

export function kmBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function slugify(name) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
}
const clean = (t) => (t || "").replace(/[\r\n]+/g, " ").trim();

// Run every (type x area) search and return de-duplicated leads.
export async function findLeads(settings, { onProgress = () => {}, isStopped = () => false, builtSlugs = new Set() } = {}) {
  const key = settings.googleKey;
  const center = await geocode(key, settings.location);
  const areas = settings.areas.length ? settings.areas.map((a) => `${a}, ${settings.location}`) : [settings.location];
  const queries = [];
  for (const area of areas) for (const type of settings.types) queries.push({ q: `${type} in ${area}`, type });

  const seen = new Map();
  let done = 0, withSite = 0, tooFar = 0;
  for (const { q, type } of queries) {
    if (isStopped()) break;
    let places = [];
    try {
      places = await searchText(key, {
        textQuery: q,
        locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50000, settings.radiusKm * 1000) } },
      });
    } catch (e) {
      onProgress({ done: ++done, total: queries.length, query: q, error: e.message });
      if (/40[13]/.test(e.message)) throw e; // bad key: stop instead of failing 100 times
      continue;
    }
    for (const p of places) {
      const name = clean(p.displayName && p.displayName.text);
      if (!name) continue;
      const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
      const km = kmBetween(center, loc);
      if (km > settings.radiusKm) { tooFar++; continue; }
      if (settings.onlyNoWebsite && p.websiteUri) { withSite++; continue; }
      const id = p.id || (name + clean(p.formattedAddress)).toLowerCase();
      if (seen.has(id)) continue;
      const slug = slugify(name);
      seen.set(id, {
        id, slug, name, type,
        address: clean(p.formattedAddress),
        phone: clean(p.nationalPhoneNumber),
        hours: p.regularOpeningHours?.weekdayDescriptions?.join("; ") || "",
        mapsUrl: clean(p.googleMapsUri),
        website: p.websiteUri || "",
        rating: p.rating || null,
        reviews: p.userRatingCount || 0,
        km: Math.round(km * 10) / 10,
        photoNames: (p.photos || []).map((ph) => ph.name),
        alreadyBuilt: builtSlugs.has(slug),
      });
    }
    onProgress({ done: ++done, total: queries.length, query: q, found: seen.size });
  }
  const leads = [...seen.values()]
    .filter((l) => !(settings.skipBuilt && l.alreadyBuilt))
    // More photos and more reviews make for a better demo site.
    .sort((a, b) => Math.min(b.photoNames.length, 6) - Math.min(a.photoNames.length, 6) || b.reviews - a.reviews);
  return { center, leads, stats: { searches: done, withSite, tooFar } };
}

export async function downloadPhotos(key, lead, destDir, max) {
  fs.mkdirSync(destDir, { recursive: true });
  let got = 0;
  for (const [i, name] of lead.photoNames.slice(0, max).entries()) {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=1600&key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(String(res.status));
      fs.writeFileSync(`${destDir}/photo-${i + 1}.jpg`, Buffer.from(await res.arrayBuffer()));
      got++;
    } catch {}
  }
  return got;
}
