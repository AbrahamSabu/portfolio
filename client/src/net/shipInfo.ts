import type { Photo } from './photos';

/**
 * What Wikidata knows about a ship, found by its IMO number (or, failing
 * that, its MMSI), with a photo from Wikimedia Commons. Wikidata's facts are
 * CC0; a Commons photo carries its author and licence, which the panel shows
 * beside it with a link to the file's page. Measured (Oct 2026): about a
 * quarter of ships with static data are on Wikidata, mostly ferries, cruise
 * ships and larger merchant ships, and about half of those have a photo.
 * Asked from the browser, only for the selected ship, once each.
 */
export interface ShipInfo {
  /** Wikidata's name for it, for the photo's alt text. */
  name?: string;
  operator?: string;
  /** Its class, e.g. "Arleigh Burke-class destroyer". */
  shipClass?: string;
  /** Year built or entered service. */
  built?: number;
  /** A Commons file name, e.g. "AIDAnova (2018).jpg". */
  image?: string;
}

const SPARQL = 'https://query.wikidata.org/sparql?format=json&query=';
const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*';

/**
 * The query: a ship by IMO number or MMSI, its photo, operator (never a
 * person: a private yacht's owner stays private), class and the year it was
 * built or entered service. Both identifiers are digits only, checked here.
 */
export function shipQuery(mmsi: string, imo?: number): string | null {
  if (!/^\d{9}$/.test(mmsi) || (imo !== undefined && !/^\d{7}$/.test(String(imo)))) return null;
  const byImo = imo !== undefined ? `{ ?item wdt:P458 "${imo}" BIND("imo" AS ?how) } UNION ` : '';
  return `SELECT ?item ?itemLabel ?how ?image ?operatorLabel ?classLabel ?inception ?service WHERE {
  ${byImo}{ ?item wdt:P587 "${mmsi}" BIND("mmsi" AS ?how) }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P137 ?operator FILTER NOT EXISTS { ?operator wdt:P31 wd:Q5 } }
  OPTIONAL { ?item wdt:P289 ?class }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P729 ?service }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 20`;
}

/** Names compared loosely: "MV Doc Maynard" and "DOC MAYNARD" are one ship. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/^(MV|MS|M\/V|M\/S|MY|M\/Y|SS|RMS|HMS|USS|USNS|HMCS|HMAS|FS|RV|R\/V)\s+/, '')
      .replace(/[^A-Z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && (x === y || x.includes(y) || y.includes(x));
}

type Binding = Record<string, { value: string } | undefined>;

/**
 * The ship in a query answer. An IMO number is for life, so its match is
 * trusted; an MMSI can pass to another ship, so that match must also carry
 * the name the ship broadcasts.
 */
export function parseShipAnswer(data: unknown, aisName: string | undefined): ShipInfo | null {
  const rows = ((data as { results?: { bindings?: Binding[] } } | null)?.results?.bindings ?? []).filter(
    (r) => r.item && (r.how?.value === 'imo' || (r.how?.value === 'mmsi' && aisName && sameName(r.itemLabel?.value ?? '', aisName))),
  );
  if (rows.length === 0) return null;
  rows.sort((a, b) => (a.how?.value === 'imo' ? 0 : 1) - (b.how?.value === 'imo' ? 0 : 1));
  const item = rows[0]!.item!.value;
  const mine = rows.filter((r) => r.item?.value === item);
  const first = (key: string) => mine.find((r) => r[key])?.[key]?.value;
  const info: ShipInfo = {};
  const label = first('itemLabel');
  // An item without an English label comes back labelled with its id (Q11706864).
  if (label && !/^Q\d+$/.test(label)) info.name = label;
  const operator = first('operatorLabel');
  if (operator && !/^Q\d+$/.test(operator)) info.operator = operator;
  const shipClass = first('classLabel');
  if (shipClass && !/^Q\d+$/.test(shipClass)) info.shipClass = shipClass;
  const years = mine
    .flatMap((r) => [r.inception?.value, r.service?.value])
    .map((v) => (v ? Number(/^(\d{4})-/.exec(v)?.[1]) : NaN))
    .filter((y) => y > 1800 && y < 2100);
  if (years.length) info.built = Math.min(...years);
  const image = first('image');
  const file = image && /\/Special:FilePath\/(.+)$/.exec(image)?.[1];
  if (file) info.image = decodeURIComponent(file);
  return info;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Commons gives the author as HTML (often a link to their user page): we want the words. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e]!)
    .replace(/\s+/g, ' ')
    .trim();
}

/** A Commons file's thumbnail, page, author and licence; strict about URLs, as they go into the page. */
export function parseCommonsAnswer(data: unknown): Photo | null {
  const pages = (data as { query?: { pages?: Record<string, unknown> } } | null)?.query?.pages;
  const page = pages ? (Object.values(pages)[0] as { imageinfo?: unknown[] } | undefined) : undefined;
  const info = page?.imageinfo?.[0] as
    | { thumburl?: unknown; thumbwidth?: unknown; thumbheight?: unknown; descriptionurl?: unknown; extmetadata?: Record<string, { value?: unknown }> }
    | undefined;
  if (!info) return null;
  const { thumburl, descriptionurl, extmetadata: meta } = info;
  // Commons serves thumbnails from thumb.wikimedia.org now (upload.wikimedia.org before).
  if (typeof thumburl !== 'string' || !/^https:\/\/(thumb|upload)\.wikimedia\.org\//.test(thumburl)) return null;
  if (typeof descriptionurl !== 'string' || !descriptionurl.startsWith('https://commons.wikimedia.org/')) return null;
  const artist = typeof meta?.Artist?.value === 'string' ? plainText(meta.Artist.value) : '';
  const licence = typeof meta?.LicenseShortName?.value === 'string' ? plainText(meta.LicenseShortName.value) : '';
  return {
    src: thumburl,
    width: typeof info.thumbwidth === 'number' ? info.thumbwidth : 420,
    height: typeof info.thumbheight === 'number' ? info.thumbheight : 280,
    link: descriptionurl,
    credit: [artist || 'Unknown author', licence].filter(Boolean).join(', '),
    source: 'Wikimedia Commons',
  };
}

const infoCache = new Map<string, Promise<ShipInfo | null>>();
const photoCache = new Map<string, Promise<Photo | null>>();

export function shipInfo(mmsi: string, imo: number | undefined, aisName: string | undefined): Promise<ShipInfo | null> {
  const query = shipQuery(mmsi, imo);
  if (!query) return Promise.resolve(null);
  let pending = infoCache.get(mmsi);
  if (!pending) {
    pending = fetch(SPARQL + encodeURIComponent(query), {
      headers: { Accept: 'application/sparql-results+json' },
      signal: AbortSignal.timeout(15_000),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => parseShipAnswer(data, aisName))
      .catch(() => null);
    infoCache.set(mmsi, pending);
  }
  return pending;
}

export function commonsPhoto(file: string): Promise<Photo | null> {
  let pending = photoCache.get(file);
  if (!pending) {
    const url = `${COMMONS}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=420&titles=${encodeURIComponent(`File:${file}`)}`;
    pending = fetch(url, { signal: AbortSignal.timeout(10_000) })
      .then((res) => (res.ok ? res.json() : null))
      .then(parseCommonsAnswer)
      .catch(() => null);
    photoCache.set(file, pending);
  }
  return pending;
}
