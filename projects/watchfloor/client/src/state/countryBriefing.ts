import { flagCountry, registrationCountry, type Hazard, type NewsItem, type Track } from '@watchfloor/shared';
import { briefing, type BriefingEntry } from './briefing';

/**
 * Sources name countries differently: the basemap's labels, GDELT's places,
 * the ICAO and ITU tables. Names are compared by a key: lower case, accents
 * dropped, and these spellings folded to one.
 */
const ALIASES: Record<string, string> = {
  'czechia': 'czech republic',
  'russian federation': 'russia',
  'iran, islamic republic of': 'iran',
  'turkiye': 'turkey',
  'united states of america': 'united states',
  'usa': 'united states',
  'uk': 'united kingdom',
  'great britain': 'united kingdom',
  "cote d'ivoire": 'ivory coast',
  'viet nam': 'vietnam',
  'syrian arab republic': 'syria',
  'republic of korea': 'south korea',
  'korea, republic of': 'south korea',
  "democratic people's republic of korea": 'north korea',
  'united republic of tanzania': 'tanzania',
  'democratic republic of the congo': 'dr congo',
  'dem. rep. congo': 'dr congo',
  'congo, democratic republic of the': 'dr congo',
  'myanmar (burma)': 'myanmar',
  'burma': 'myanmar',
  'eswatini': 'swaziland',
  'north macedonia': 'macedonia',
  'the netherlands': 'netherlands',
  'the bahamas': 'bahamas',
};

export function countryKey(name: string): string {
  const key = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return ALIASES[key] ?? key;
}

/** A GDELT place's country: its last part ("Kyiv, Kyiv, Ukraine" is Ukraine). */
function placeCountry(place: string): string {
  return countryKey(place.split(',').at(-1) ?? '');
}

export interface CountryBriefing {
  name: string;
  /** The day's stories placed there, most important first (as many as `size`). */
  stories: BriefingEntry[];
  storyCount: number;
  aircraft: number;
  militaryAircraft: number;
  ships: number;
  hazards: Hazard[];
}

const DAY_MS = 24 * 3_600_000;

/**
 * One country at a glance: its news (placed there), its aircraft
 * (registered there, by transponder address) and ships (flying its flag, by
 * MMSI) on the map now, and hazards that name it. Registration and flag
 * say whose an aircraft or ship is, not where it is.
 */
export function countryBriefing(
  name: string,
  sources: { news: readonly NewsItem[]; tracks: Iterable<Track>; hazards: readonly Hazard[]; now: number },
  size = 6,
): CountryBriefing {
  const key = countryKey(name);
  const theirs = sources.news.filter((s) => placeCountry(s.place) === key);
  let aircraft = 0;
  let militaryAircraft = 0;
  let ships = 0;
  for (const t of sources.tracks) {
    const native = t.id.slice(t.id.indexOf(':') + 1);
    if (t.source === 'adsb') {
      const country = registrationCountry(native);
      if (country && countryKey(country) === key) {
        aircraft++;
        if (t.platform === 'military-aircraft' || t.platform === 'maritime-patrol' || t.platform === 'military-helicopter') militaryAircraft++;
      }
    } else if (t.source === 'ais') {
      const country = flagCountry(native);
      if (country && countryKey(country) === key) ships++;
    }
  }
  // Hazard titles name the country at the end ("Flood in Bhutan", "M 4.9 - 236 km NW of Port-Olry, Vanuatu").
  const hazards = sources.hazards.filter((h) => {
    const title = countryKey(h.title);
    return title.endsWith(` ${key}`) || title.endsWith(`, ${key}`) || title.includes(` ${key},`);
  });
  return {
    name,
    stories: briefing(theirs, sources.now, size, DAY_MS),
    storyCount: theirs.filter((s) => sources.now - s.publishedAt <= DAY_MS).length,
    aircraft,
    militaryAircraft,
    ships,
    hazards,
  };
}
