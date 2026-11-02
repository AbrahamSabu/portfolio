import { AIRCRAFT_ADDRESS_BLOCKS, MID_FLAGS } from './countryTables';

/**
 * Where an aircraft is registered, from its 24-bit ICAO address alone: ICAO
 * gives every state a block of addresses (Annex 10 Vol. III, Table 9-1), and
 * the state assigns them to its aircraft. This is the state of registry, which
 * for a military aircraft is the country whose forces fly it. Undefined for
 * addresses outside any state's block.
 *
 * The table comes from an older edition of the Annex, with names modernised
 * and Yugoslavia's block given to Serbia (Air Serbia flies 4C0xxx); states
 * allocated blocks since that edition aren't in it and come back undefined.
 */
export function registrationCountry(icao24: string): string | undefined {
  if (!/^[0-9a-f]{6}$/i.test(icao24)) return undefined;
  const address = parseInt(icao24, 16);
  for (const [first, bits, state] of AIRCRAFT_ADDRESS_BLOCKS) {
    if (address >>> (24 - bits) === first >>> (24 - bits)) return state;
  }
  return undefined;
}

/**
 * A ship's flag, from the maritime identification digits that start its MMSI
 * (ITU-R M.585). Only MMSIs starting 2-7 belong to ships.
 */
export function flagCountry(mmsi: string): string | undefined {
  if (!/^[2-7]\d{8}$/.test(mmsi)) return undefined;
  return MID_FLAGS[mmsi.slice(0, 3)];
}
