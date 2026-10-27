import type { Platform } from '@watchfloor/shared';

/**
 * ADS-B emitter categories, shared by every ADS-B provider so the same
 * aircraft gets the same platform whoever reports it.
 *
 * The standard (DO-260B) groups them into sets A to C. OpenSky sends a number
 * (2 = light ... 20 = line obstacle); readsb-based providers such as adsb.lol
 * send the code ('A1' ... 'C5'). Both describe the same categories, so codes
 * are converted to OpenSky's numbers and one rule picks the platform.
 */
const CODE_TO_NUMBER: Record<string, number> = {
  A0: 1, B0: 1, C0: 1, // set present, no category information
  A1: 2, A2: 3, A3: 4, A4: 5, A5: 6, A6: 7, A7: 8,
  B1: 9, B2: 10, B3: 11, B4: 12, B6: 14, B7: 15,
  C1: 16, C2: 17, C3: 18, C4: 19, C5: 20,
};

/** 'A3' to 4, and so on. Unknown or missing codes give 0 (no information). */
export function categoryFromCode(code: unknown): number {
  return typeof code === 'string' ? (CODE_TO_NUMBER[code.trim().toUpperCase()] ?? 0) : 0;
}

/**
 * ADS-B emitter category to our closed platform list. Null means "not an
 * aircraft" (ground vehicles and obstacles), which we leave off the air picture.
 *
 * Deliberately conservative: a category describes weight or airframe, not
 * role, so we never infer military platforms. A UAV (14) maps to plain
 * 'aircraft' because our 'uav' symbol is a military drone. In practice most
 * aircraft send 0 or 1 (no information) and show as 'aircraft'.
 */
export function platformFor(category: unknown): Platform | null {
  switch (category) {
    case 2: // light, under 15,500 lb
    case 9: // glider
    case 12: // ultralight, hang glider, paraglider
      return 'light-aircraft';
    case 4: // large
    case 5: // high-vortex large (e.g. B757)
    case 6: // heavy, over 300,000 lb
      return 'airliner';
    case 8:
      return 'helicopter';
    case 16: // emergency surface vehicle
    case 17: // service surface vehicle
    case 18: // point obstacle
    case 19: // cluster obstacle
    case 20: // line obstacle
      return null;
    default:
      return 'aircraft';
  }
}
