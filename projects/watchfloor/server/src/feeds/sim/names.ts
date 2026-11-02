import type { Rng } from './rng';

// All names are invented. Airline prefixes are deliberately fictional.
const AIRLINES = ['VXA', 'HLX', 'ORN', 'KTE', 'BLV', 'SKR', 'MRD', 'TNX'];
const SHIP_FIRST = [
  'NORDIC', 'ATLANTIC', 'BALTIC', 'SILVER', 'NORTHERN', 'OCEAN',
  'CELTIC', 'POLAR', 'EASTERN', 'GOLDEN', 'IRON', 'CORAL', 'AMBER', 'STELLAR',
];
const SHIP_SECOND = [
  'STAR', 'SPIRIT', 'PIONEER', 'HARMONY', 'TRADER', 'VOYAGER',
  'HORIZON', 'DAWN', 'CROWN', 'ARROW', 'BREEZE', 'PRIDE', 'GRACE', 'VENTURE',
];
const FISHING = ['GOOD INTENT', 'BOY JAMES', 'MARY ROSE', 'GUIDING LIGHT', 'OCEAN REAPER', 'STAR OF HOPE', 'PROVIDER', 'KINGFISHER'];
const FISHING_PORTS = ['PZ', 'BM', 'PL', 'DH', 'LT', 'NN', 'SM'];
const YACHTS = ['WINDSONG', 'SEA GYPSY', 'BLUE MOON', 'SERENITY', 'OSPREY', 'ZEPHYR', 'MISTRAL', 'SALT SPRAY', 'HALCYON', 'TERN'];
const FERRY_FIRST = ['CHANNEL', 'STRAIT', 'COASTAL', 'SEAWAY'];
const NAVAL = ['SENTINEL', 'WARDEN', 'RAMPART', 'BASTION'];
const AIR_MIL = ['NOMAD', 'TALON', 'ROVER', 'PALADIN'];

const letters = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => String.fromCharCode(65 + rng.int(0, 25))).join('');

export const names = {
  airliner: (rng: Rng) => `${rng.pick(AIRLINES)}${rng.int(12, 2899)}`,
  registration: (rng: Rng) => `G-${letters(rng, 4)}`,
  militaryAir: (rng: Rng) => `${rng.pick(AIR_MIL)} ${rng.int(1, 4)}${rng.int(1, 9)}`,
  merchant: (rng: Rng) => `${rng.pick(SHIP_FIRST)} ${rng.pick(SHIP_SECOND)}`,
  ferry: (rng: Rng) => `${rng.pick(FERRY_FIRST)} ${rng.pick(SHIP_SECOND)}`,
  fishing: (rng: Rng) => `${rng.pick(FISHING)} ${rng.pick(FISHING_PORTS)}${rng.int(10, 999)}`,
  yacht: (rng: Rng) => rng.pick(YACHTS),
  naval: (rng: Rng) => `${rng.pick(NAVAL)} F${rng.int(201, 299)}`,
};

const NUMERALS = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * Draw a callsign that no active entity is using.
 *
 * Duplicate names on screen make the track list and labels ambiguous, so
 * redraw a few times first. Some pools are small (there are only ten yacht
 * names), so if they run out, add a numeral the way real vessel registers
 * do: SALT SPRAY, SALT SPRAY II, and so on.
 */
export function uniqueName(
  draw: () => string | undefined,
  taken: ReadonlySet<string>,
  attempts = 20,
): string | undefined {
  let name = draw();
  for (let i = 1; i < attempts && name !== undefined && taken.has(name); i++) name = draw();
  if (name === undefined || !taken.has(name)) return name;
  for (let n = 0; ; n++) {
    const candidate = `${name} ${NUMERALS[n] ?? n + 2}`;
    if (!taken.has(candidate)) return candidate;
  }
}
