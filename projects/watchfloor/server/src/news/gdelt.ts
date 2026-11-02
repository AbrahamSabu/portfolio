import type { NewsItem, NewsKind } from '@watchfloor/shared';

/**
 * GDELT 2.0 (gdeltproject.org): every 15 minutes it publishes what it read in
 * the world's news as three zipped tab-separated files. We use two:
 *   - export: events ("who did what to whom, where"), each with the article
 *     it came from, a CAMEO action code, actor types and a geocoded place;
 *   - gkg: one row per article, with its themes and its page title.
 * The article row gives the headline, the places and the themes that say
 * whether a story is political and what kind; the events confirm that a
 * political actor did something, and place a story whose article names no place. Free for any use
 * with a citation and a link (gdeltproject.org/about.html, Oct 2026).
 *
 * Everything here is pure: text in, stories out.
 */

const BASE = 'https://data.gdeltproject.org/gdeltv2/';
export const LAST_UPDATE_URL = `${BASE}lastupdate.txt`;
/** Batches are 15 minutes apart, named by their UTC time. */
export const BATCH_MS = 15 * 60_000;

/** A batch's time stamp, "20261030121500". */
const STAMP = /^\d{14}$/;

/** The newest batch's stamp from lastupdate.txt (its lines end in the file URLs). */
export function parseLastUpdate(text: string): string | null {
  const m = /\/(\d{14})\.export\.CSV\.zip\s*$/m.exec(text);
  return m ? m[1]! : null;
}

export function batchUrls(stamp: string): { events: string; articles: string } {
  if (!STAMP.test(stamp)) throw new Error(`bad GDELT stamp ${stamp}`);
  // lastupdate.txt lists http URLs; the same files are served over https.
  return { events: `${BASE}${stamp}.export.CSV.zip`, articles: `${BASE}${stamp}.gkg.csv.zip` };
}

export function stampTime(stamp: string): number {
  const d = (from: number, to: number) => Number(stamp.slice(from, to));
  return Date.UTC(d(0, 4), d(4, 6) - 1, d(6, 8), d(8, 10), d(10, 12), d(12, 14));
}

export function timeStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\D/g, '').slice(0, 14);
}

/** The stamps of the `count` batches before this one, newest first. */
export function stampsBefore(stamp: string, count: number): string[] {
  const t = stampTime(stamp);
  return Array.from({ length: count }, (_, i) => timeStamp(t - (i + 1) * BATCH_MS));
}

export interface GdeltEvent {
  id: string;
  /** Actor type codes (GOV, MIL, REB...) of both actors. */
  actorTypes: string[];
  mentions: number;
  /** Distinct sources and articles reporting the event in its batch: how widely it's covered. */
  sources: number;
  articles: number;
  /** 1 country, 2 US state, 3 US city, 4 world city, 5 world state. */
  geoType: number;
  /** FIPS 10-4, as GDELT codes countries. */
  geoCountry: string;
  place: string;
  lat: number;
  lon: number;
  url: string;
}

// Column positions in the export file (GDELT Event Codebook V2.0).
const E = { id: 0, a1Types: [12, 13, 14], a2Types: [22, 23, 24], isRoot: 25, mentions: 31, sources: 32, articles: 33, geoType: 51, place: 52, geoCountry: 53, lat: 56, lon: 57, url: 60 } as const;

/** Root events with a place: the ones a story's headline is about. */
export function parseEvents(tsv: string): GdeltEvent[] {
  const out: GdeltEvent[] = [];
  for (const line of tsv.split('\n')) {
    const c = line.split('\t');
    if (c.length < 61 || c[E.isRoot] !== '1') continue;
    const lat = Number(c[E.lat]);
    const lon = Number(c[E.lon]);
    const geoType = Number(c[E.geoType]);
    if (!c[E.lat] || !c[E.lon] || !Number.isFinite(lat) || !Number.isFinite(lon) || geoType < 1) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({
      id: c[E.id]!,
      actorTypes: [...E.a1Types, ...E.a2Types].map((i) => c[i]!).filter(Boolean),
      mentions: Number(c[E.mentions]) || 0,
      sources: Number(c[E.sources]) || 0,
      articles: Number(c[E.articles]) || 0,
      geoType,
      geoCountry: c[E.geoCountry]!,
      place: c[E.place]!,
      lat,
      lon,
      url: c[E.url]!.trim(),
    });
  }
  return out;
}

export interface GdeltArticle {
  url: string;
  title: string;
  /** Each theme with how many times the article mentions it. */
  themes: Map<string, number>;
  /** Places the article mentions, in the order it mentions them. */
  places: GdeltPlace[];
}

export interface GdeltPlace {
  name: string;
  /** Same codes as an event's geoType: 1 country, 3 and 4 cities... */
  type: number;
  /** FIPS 10-4 country code, as GDELT uses. */
  country: string;
  lat: number;
  lon: number;
}

// Column positions in the gkg file (GKG Codebook V2.1).
const G = { url: 4, themes: 7, enhancedThemes: 8, locations: 10, extras: 26 } as const;

/** Articles by URL, with their page title and themes; rows without a title are skipped. */
export function parseArticles(tsv: string): Map<string, GdeltArticle> {
  const out = new Map<string, GdeltArticle>();
  for (const line of tsv.split('\n')) {
    const c = line.split('\t');
    if (c.length <= G.extras) continue;
    const m = /<PAGE_TITLE>(.*?)<\/PAGE_TITLE>/.exec(c[G.extras]!);
    if (!m) continue;
    // Enhanced themes are "THEME,offset", once per mention; the plain list
    // names each theme once, and covers the odd one the other lacks.
    const themes = new Map<string, number>();
    for (const t of c[G.enhancedThemes]!.split(';')) if (t) themes.set(t.split(',')[0]!, (themes.get(t.split(',')[0]!) ?? 0) + 1);
    for (const t of c[G.themes]!.split(';')) if (t && !themes.has(t)) themes.set(t, 1);
    out.set(c[G.url]!.trim(), { url: c[G.url]!.trim(), title: decodeEntities(m[1]!).trim(), themes, places: parsePlaces(c[G.locations]!) });
  }
  return out;
}

/** Enhanced locations: "type#name#country#adm1#adm2#lat#lon#featureId#offset", ordered here by offset. */
function parsePlaces(field: string): GdeltPlace[] {
  const places: (GdeltPlace & { offset: number })[] = [];
  for (const entry of field.split(';')) {
    const f = entry.split('#');
    if (f.length < 9) continue;
    const lat = Number(f[5]);
    const lon = Number(f[6]);
    if (!f[5] || !f[6] || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    places.push({ name: f[1]!, type: Number(f[0]) || 0, country: f[2]!, lat, lon, offset: Number(f[8]) || 0 });
  }
  return places.sort((a, b) => a.offset - b.offset).map(({ offset: _, ...p }) => p);
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Page titles arrive HTML-escaped ("&#x20B9;411 Crore"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}

/**
 * Themes that mark an article as political, and themes that mark it as
 * something else. Tuned on four real batches (Oct 2026, ~4,000 articles):
 * about four in five stories that pass are about government, elections,
 * conflict or diplomacy. GDELT's coding is automatic, so some noise gets
 * through (a story about clocks changing scored high on "government").
 */
const STRONG = new Set([
  'ELECTION', 'LEGISLATION', 'TAX_POLITICAL_PARTY', 'ARMEDCONFLICT', 'MILITARY', 'SANCTIONS', 'PROTEST', 'CEASEFIRE',
  'ALLIANCE', 'NEGOTIATIONS', 'TAX_FNCACT_PRESIDENT', 'TAX_FNCACT_PRIME_MINISTER', 'TAX_FNCACT_MINISTER',
  'EPU_POLICY_POLITICAL', 'EPU_CATS_NATIONAL_SECURITY', 'TAX_FNCACT_CANDIDATE', 'EPU_POLICY_CONGRESS',
  'WB_2470_PEACE_OPERATIONS_AND_CONFLICT_MANAGEMENT', 'REBELLION', 'COUP', 'TERROR', 'TAX_FNCACT_LAWMAKER',
  'TAX_FNCACT_LAWMAKERS', 'TAX_FNCACT_SENATOR', 'TAX_FNCACT_AMBASSADOR', 'TAX_FNCACT_DIPLOMAT', 'TAX_FNCACT_DIPLOMATS',
  'IMPEACHMENT', 'REFUGEES', 'SOVEREIGNTY', 'PEACEKEEPING', 'TAX_FNCACT_OPPOSITION_LEADER', 'TAX_FNCACT_FOREIGN_MINISTER',
  'USPEC_POLITICS_GENERAL1', 'WB_2432_FRAGILITY_CONFLICT_AND_VIOLENCE', 'SECURITY_SERVICES', 'TAX_FNCACT_GOVERNOR',
  'EXTREMISM', 'TAX_TERROR_GROUP', 'WMD', 'BORDER',
]);
const WEAK = new Set(['GENERAL_GOVERNMENT', 'LEADER', 'EPU_POLICY_GOVERNMENT', 'WB_831_GOVERNANCE', 'TAX_MILITARY_TITLE']);
const OTHER = new Set([
  'ECON_STOCKMARKET', 'ECON_EARNINGSREPORT', 'ECON_IPO', 'SOC_GENERALCRIME', 'TAX_FNCACT_ACTOR', 'TAX_FNCACT_ACTRESS',
  'TAX_FNCACT_SINGER', 'TAX_FNCACT_FOOTBALLER', 'TAX_FNCACT_PLAYERS', 'TAX_FNCACT_COACH', 'SPORTS', 'TAX_SPORTS',
  'WB_1921_PRIVATE_SECTOR_DEVELOPMENT', 'CRISISLEX_T03_DEAD', 'TRAFFIC', 'NATURAL_DISASTER', 'ROAD_INCIDENT',
]);

/** Two points per political theme, one per hint of government, minus three per sign of something else. */
export function politicalScore(themes: ReadonlyMap<string, number>): number {
  let score = 0;
  for (const t of themes.keys()) {
    if (STRONG.has(t)) score += 2;
    else if (WEAK.has(t)) score += 1;
    else if (OTHER.has(t)) score -= 3;
  }
  return score;
}

/** Enough to be on the political map. */
export const MIN_SCORE = 8;

/** Actor types that make an event political: governments, militaries, rebels, opposition, international bodies... */
const POLITICAL_ACTORS = new Set(['GOV', 'MIL', 'REB', 'OPP', 'IGO', 'SPY', 'LEG', 'JUD', 'INS', 'SEP', 'UAF', 'NGO']);

/** Themes that say what kind of story it is. */
const KIND_THEMES: [Exclude<NewsKind, 'politics'>, string[]][] = [
  ['conflict', ['ARMEDCONFLICT', 'TERROR', 'REBELLION', 'COUP', 'TAX_TERROR_GROUP', 'WMD']],
  ['protest', ['PROTEST']],
  ['election', ['ELECTION', 'TAX_POLITICAL_PARTY', 'TAX_FNCACT_CANDIDATE']],
  ['diplomacy', ['NEGOTIATIONS', 'ALLIANCE', 'CEASEFIRE', 'TREATY', 'TAX_FNCACT_AMBASSADOR', 'TAX_FNCACT_DIPLOMAT', 'TAX_FNCACT_DIPLOMATS', 'TAX_FNCACT_FOREIGN_MINISTER']],
];

/**
 * The kind whose themes the article mentions most (ties go to the earlier
 * kind in the list). Measured on real batches, the events' CAMEO codes were
 * too noisy for this: a campaign spending story was coded as an assault. A
 * story that mentions none is "politics".
 */
export function kindOf(themes: ReadonlyMap<string, number>): NewsKind {
  let best: NewsKind = 'politics';
  let most = 0;
  for (const [kind, names] of KIND_THEMES) {
    const count = names.reduce((n, t) => n + (themes.get(t) ?? 0), 0);
    if (count > most) {
      best = kind;
      most = count;
    }
  }
  return best;
}

/**
 * Where to put the story: the first place the article names (usually where
 * it happened), or a city in that country named later, rather than the
 * country's middle. Measured against the events' own places, which put an
 * Israeli election in Qatar: the article's first place was right far more often.
 */
export function placeOf(places: readonly GdeltPlace[]): GdeltPlace | null {
  const first = places[0];
  if (!first) return null;
  if (first.type !== 1) return first;
  return places.find((p) => p.country === first.country && (p.type === 3 || p.type === 4)) ?? first;
}

/**
 * Countries' names by code, from the batch's country-level events. An
 * article's place keeps the word it used, so a country can come out as
 * "Russian"; the events name it "Russia".
 */
export function countryNames(events: readonly GdeltEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const e of events) if (e.geoType === 1 && e.geoCountry && !names.has(e.geoCountry)) names.set(e.geoCountry, e.place);
  return names;
}

/** "Warsaw, (Pl67), Poland" -> "Warsaw, Poland"; "Gaza, Israel (General), Israel" -> "Gaza, Israel". */
export function cleanPlace(name: string): string {
  const parts = name
    .replace(/\s*\([^)]*\)/g, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.filter((p, i) => parts.indexOf(p) === i).join(', ');
}

/** "www.bbc.co.uk" -> "bbc.co.uk"; null for anything but http(s). */
export function outletOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * The headline without the outlet's name stuck on the end ("... - DefenceWeb",
 * "... | Opinion" stays), since the card names the outlet anyway. Only a short
 * tail that matches the site's name goes.
 */
export function cleanHeadline(title: string, outlet: string): string {
  const m = /^(.*\S)\s+[|\-–—]\s+([^|\-–—]{2,40})$/.exec(title);
  if (!m) return title;
  const tail = m[2]!.toLowerCase().replace(/[^a-z0-9]/g, '');
  const site = outlet.toLowerCase().replace(/[^a-z0-9]/g, '');
  return tail.length >= 3 && (site.includes(tail) || tail.includes(site.split('.')[0] ?? site)) ? m[1]! : title;
}

/** Most political first. */
export interface Story extends NewsItem {
  score: number;
}

/**
 * How much a story matters, for the briefing's top stories: how widely its
 * event is covered (sources, articles, the same headline on other sites),
 * on a log scale so one huge story can't drown the rest, plus how political
 * the article is. Measured on real batches: most stories score 10-25, wide
 * ones 30-50.
 */
export function importanceOf(score: number, sources: number, articles: number, copies: number): number {
  const coverage = 6 * Math.log2(1 + Math.max(0, sources)) + 3 * Math.log2(1 + Math.max(0, articles)) + 6 * Math.log2(Math.max(1, copies));
  return Math.round(Math.min(score, 30) / 2 + coverage);
}

/**
 * The batch's political stories, one per article, most political first. An
 * article needs a real headline (four words or more), a political score, and
 * at least one event with a political actor (a government, a military, rebels...).
 */
export function selectStories(events: readonly GdeltEvent[], articles: ReadonlyMap<string, GdeltArticle>, publishedAt: number): Story[] {
  const byUrl = new Map<string, GdeltEvent[]>();
  for (const e of events) {
    if (!articles.has(e.url)) continue;
    const list = byUrl.get(e.url);
    if (list) list.push(e);
    else byUrl.set(e.url, [e]);
  }
  const stories: Story[] = [];
  const headlines = new Set<string>();
  const countries = countryNames(events);
  // The same wire story on several sites counts once on the map, and as coverage.
  const copies = new Map<string, number>();
  for (const url of byUrl.keys()) {
    const key = headlineKey(cleanHeadline(articles.get(url)!.title, outletOf(url) ?? ''));
    copies.set(key, (copies.get(key) ?? 0) + 1);
  }
  for (const [url, list] of byUrl) {
    const article = articles.get(url)!;
    const score = politicalScore(article.themes);
    if (score < MIN_SCORE) continue;
    if (!list.some((e) => e.actorTypes.some((t) => POLITICAL_ACTORS.has(t)))) continue;
    const outlet = outletOf(url);
    if (!outlet) continue;
    const headline = cleanHeadline(article.title, outlet);
    if (headline.split(/\s+/).length < 4 || headline.length > 300) continue;
    // The same wire story on several sites: show it once.
    const key = headlineKey(headline);
    if (headlines.has(key)) continue;
    headlines.add(key);
    // The article's own places, else its most mentioned event's.
    const event = [...list].sort((a, b) => b.mentions - a.mentions)[0]!;
    const place = placeOf(article.places);
    const where = place
      ? { ...place, name: place.type === 1 ? (countries.get(place.country) ?? place.name) : place.name }
      : { name: event.place, lat: event.lat, lon: event.lon };
    stories.push({
      id: event.id,
      headline,
      url,
      outlet,
      lat: Math.round(where.lat * 1e4) / 1e4,
      lon: Math.round(where.lon * 1e4) / 1e4,
      place: cleanPlace(where.name),
      kind: kindOf(article.themes),
      publishedAt,
      importance: importanceOf(
        score,
        Math.max(...list.map((e) => e.sources)),
        Math.max(...list.map((e) => e.articles)),
        copies.get(key) ?? 1,
      ),
      score,
    });
  }
  return stories.sort((a, b) => b.score - a.score);
}

function headlineKey(headline: string): string {
  return headline.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
