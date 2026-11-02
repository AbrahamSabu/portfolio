import type { AirportWeather } from '@watchfloor/shared';

const COVER: Record<string, string> = {
  FEW: 'Few',
  SCT: 'Scattered',
  BKN: 'Broken',
  OVC: 'Overcast',
  VV: 'Sky obscured',
  // aviationweather.gov's code for a vertical visibility group (VV002): fog or similar.
  OVX: 'Sky obscured',
  CLR: 'Clear',
  SKC: 'Clear',
  NSC: 'No significant cloud',
  NCD: 'No cloud detected',
  CAVOK: 'No significant cloud',
};

export const CATEGORY_MEANING: Record<NonNullable<AirportWeather['category']>, string> = {
  VFR: 'Visual flight rules: good visibility and high cloud',
  MVFR: 'Marginal VFR: visibility or cloud getting low',
  IFR: 'Instrument flight rules: low cloud or poor visibility',
  LIFR: 'Low IFR: very low cloud or very poor visibility',
};

/** "180° at 4 kt", "Variable at 3 kt, gusting 18 kt", "Calm". */
export function formatWind(w: Pick<AirportWeather, 'windDir' | 'windKt' | 'gustKt'>): string | null {
  if (w.windKt === undefined) return null;
  if (w.windKt === 0) return 'Calm';
  const from = w.windDir === 'VRB' ? 'Variable' : w.windDir === undefined ? 'Unknown direction' : `${String(Math.round(w.windDir)).padStart(3, '0')}°`;
  return `${from} at ${w.windKt} kt${w.gustKt ? `, gusting ${w.gustKt} kt` : ''}`;
}

/**
 * aviationweather.gov gives visibility in statute miles, "6+" meaning 6 or
 * more (a European "9999", 10 km or more, arrives as "6+"). Shown in km.
 */
export function formatVisibility(v: string | undefined): string | null {
  if (v === undefined) return null;
  if (v.endsWith('+')) return '10 km or more';
  const miles = Number(v);
  if (!Number.isFinite(miles)) return null;
  const km = miles * 1.609;
  // Reports outside the US are in metres (0700) and arrive converted to miles: round back to the 50 m they were.
  return km < 1 ? `${Math.round(km * 20) * 50} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** "Few at 200 ft, scattered at 1,500 ft"; "Clear". */
export function formatClouds(clouds: AirportWeather['clouds']): string | null {
  if (clouds.length === 0) return null;
  return clouds
    .map((c, i) => {
      const name = COVER[c.cover] ?? c.cover;
      const text = i === 0 ? name : name.toLowerCase();
      if (c.baseFt === undefined) return text;
      const height = `${c.baseFt.toLocaleString('en-GB')} ft`;
      return name === 'Sky obscured' ? `${text}, vertical visibility ${height}` : `${text} at ${height}`;
    })
    .join(', ');
}
