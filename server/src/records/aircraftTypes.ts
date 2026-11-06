/**
 * Names for the commonest and the largest aircraft types, by ICAO type
 * designator, for the leaderboard. A type not listed shows as its code.
 *
 * `mtowT` is the maximum take-off weight in tonnes, rounded, as the
 * manufacturers publish it for the heaviest version of each type: the measure
 * "biggest" ranks by. Only the heavy types carry one; the leaderboard words it
 * as approximate ("~575 t"), because variants and later increases differ by
 * a few tonnes. Rare types are named here as well as in findings/rare.ts so
 * the board needn't know which list a type came from.
 */
export interface AircraftType {
  name: string;
  mtowT?: number;
}

export const AIRCRAFT_TYPES: Readonly<Record<string, AircraftType>> = {
  // The heaviest, heaviest first.
  A225: { name: 'Antonov An-225 Mriya', mtowT: 640 },
  A388: { name: 'Airbus A380', mtowT: 575 },
  B748: { name: 'Boeing 747-8', mtowT: 448 },
  A124: { name: 'Antonov An-124 Ruslan', mtowT: 402 },
  B744: { name: 'Boeing 747-400', mtowT: 397 },
  C5M: { name: 'Lockheed C-5 Galaxy', mtowT: 381 },
  A346: { name: 'Airbus A340-600', mtowT: 380 },
  BLCF: { name: 'Boeing 747 Dreamlifter', mtowT: 364 },
  B77W: { name: 'Boeing 777-300ER', mtowT: 352 },
  B779: { name: 'Boeing 777-9', mtowT: 352 },
  B77L: { name: 'Boeing 777-200LR / 777F', mtowT: 347 },
  A35K: { name: 'Airbus A350-1000', mtowT: 320 },
  B773: { name: 'Boeing 777-300', mtowT: 299 },
  B772: { name: 'Boeing 777-200', mtowT: 298 },
  MD11: { name: 'McDonnell Douglas MD-11', mtowT: 286 },
  A359: { name: 'Airbus A350-900', mtowT: 283 },
  B78X: { name: 'Boeing 787-10', mtowT: 254 },
  B789: { name: 'Boeing 787-9', mtowT: 254 },
  A333: { name: 'Airbus A330-300', mtowT: 251 },
  A339: { name: 'Airbus A330-900', mtowT: 251 },
  A332: { name: 'Airbus A330-200', mtowT: 251 },
  B788: { name: 'Boeing 787-8', mtowT: 228 },
  A337: { name: 'Airbus BelugaXL', mtowT: 227 },
  B764: { name: 'Boeing 767-400ER', mtowT: 204 },
  B763: { name: 'Boeing 767-300', mtowT: 187 },
  A3ST: { name: 'Airbus Beluga', mtowT: 155 },
  // The rest of the rare ones.
  AN22: { name: 'Antonov An-22' },
  AN12: { name: 'Antonov An-12' },
  B52: { name: 'Boeing B-52 Stratofortress' },
  B1: { name: 'Rockwell B-1 Lancer' },
  E3TF: { name: 'Boeing E-3 Sentry' },
  E3CF: { name: 'Boeing E-3 Sentry' },
  E767: { name: 'Boeing E-767' },
  U2: { name: 'Lockheed U-2' },
  Q4: { name: 'Northrop Grumman RQ-4 Global Hawk' },
  B703: { name: 'Boeing 707' },
  // The common ones, for "most common types".
  A20N: { name: 'Airbus A320neo' },
  A21N: { name: 'Airbus A321neo' },
  A319: { name: 'Airbus A319' },
  A320: { name: 'Airbus A320' },
  A321: { name: 'Airbus A321' },
  BCS1: { name: 'Airbus A220-100' },
  BCS3: { name: 'Airbus A220-300' },
  B737: { name: 'Boeing 737-700' },
  B738: { name: 'Boeing 737-800' },
  B739: { name: 'Boeing 737-900' },
  B38M: { name: 'Boeing 737 MAX 8' },
  B39M: { name: 'Boeing 737 MAX 9' },
  B752: { name: 'Boeing 757-200' },
  E170: { name: 'Embraer 170' },
  E75L: { name: 'Embraer 175' },
  E190: { name: 'Embraer 190' },
  E195: { name: 'Embraer 195' },
  E290: { name: 'Embraer E190-E2' },
  E295: { name: 'Embraer E195-E2' },
  CRJ7: { name: 'Bombardier CRJ700' },
  CRJ9: { name: 'Bombardier CRJ900' },
  DH8D: { name: 'De Havilland Dash 8-400' },
  AT72: { name: 'ATR 72' },
  AT76: { name: 'ATR 72-600' },
  C172: { name: 'Cessna 172' },
  C208: { name: 'Cessna Caravan' },
  BE20: { name: 'Beechcraft King Air 200' },
  AT43: { name: 'ATR 42-300' },
  AT45: { name: 'ATR 42-500' },
  // Business jets: usually the highest in the sky.
  GLF5: { name: 'Gulfstream G550' },
  GLF6: { name: 'Gulfstream G650' },
  GA6C: { name: 'Gulfstream G600' },
  GA7C: { name: 'Gulfstream G700' },
  GLEX: { name: 'Bombardier Global Express' },
  GL5T: { name: 'Bombardier Global 5000' },
  GL7T: { name: 'Bombardier Global 7500' },
  CL35: { name: 'Bombardier Challenger 350' },
  CL60: { name: 'Bombardier Challenger 600' },
  FA7X: { name: 'Dassault Falcon 7X' },
  FA8X: { name: 'Dassault Falcon 8X' },
  F900: { name: 'Dassault Falcon 900' },
  C68A: { name: 'Cessna Citation Latitude' },
  C700: { name: 'Cessna Citation Longitude' },
  E55P: { name: 'Embraer Phenom 300' },
  PC12: { name: 'Pilatus PC-12' },
};

export function typeName(code: string): string {
  return AIRCRAFT_TYPES[code]?.name ?? code;
}
