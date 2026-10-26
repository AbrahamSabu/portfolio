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
