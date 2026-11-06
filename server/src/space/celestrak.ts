import { elementsFromOmm, MAX_ELEMENT_AGE_MS, type SatelliteElements, type SatelliteGroup } from '@watchfloor/shared';

/**
 * CelesTrak's GP (general perturbations) element sets, as OMM JSON.
 * The `.org` host matters: `.com` answers with a 301, and CelesTrak counts
 * redirects towards the error limit that puts an address on its firewall.
 */
export const CELESTRAK_URL = 'https://celestrak.org';

export function celestrakUrl(base: string, group: SatelliteGroup): string {
  return `${base}/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
}

export interface ParsedGroup {
  satellites: SatelliteElements[];
  /** Records dropped: malformed, or with elements too old to trust. */
  skipped: number;
}

/**
 * A group's JSON (an array of OMM records) as validated elements. Records
 * whose epoch is more than `MAX_ELEMENT_AGE_MS` before `now` are dropped,
 * and so is a second record for the same catalogue number.
 */
export function parseCelestrak(body: unknown, now: number): ParsedGroup | null {
  if (!Array.isArray(body)) return null;
  const satellites: SatelliteElements[] = [];
  const seen = new Set<number>();
  let skipped = 0;
  for (const record of body) {
    const e = elementsFromOmm(record);
    if (!e || now - e.epoch > MAX_ELEMENT_AGE_MS || seen.has(e.id)) {
      skipped++;
      continue;
    }
    seen.add(e.id);
    satellites.push(e);
  }
  return { satellites, skipped };
}
