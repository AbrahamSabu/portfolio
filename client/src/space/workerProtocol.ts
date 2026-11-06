import type { SatelliteElements } from '@watchfloor/shared';
import type { GroundTrack, Look, Observer, PassInfo, SatelliteNow } from './propagate';

/** What the page asks the SGP4 worker. Every request but `load` carries a `seq` its answer repeats. */
export type WorkerRequest =
  | { type: 'load'; satellites: SatelliteElements[] }
  | { type: 'positions'; seq: number; t: number }
  /** Earth-fixed positions (km) of some satellites, to find what is docked together. */
  | { type: 'ecf'; seq: number; t: number; indexes: number[] }
  | { type: 'track'; seq: number; index: number; t: number; beforeMs: number; afterMs: number }
  | { type: 'now'; seq: number; index: number; t: number }
  | { type: 'pass'; seq: number; index: number; t: number; observer: Observer }
  /** Where it is in one observer's sky (the phone spotter). */
  | { type: 'look'; seq: number; index: number; t: number; observer: Observer };

export type WorkerReply =
  | { type: 'loaded'; usable: number }
  /**
   * Three floats per satellite: Mercator x, y and height in km (see propagate.ts).
   * `complete` is false while the catalogue is still being set up: the rest come later.
   */
  | { type: 'positions'; seq: number; t: number; data: Float32Array; complete: boolean }
  | { type: 'ecf'; seq: number; positions: ([number, number, number] | null)[] }
  | { type: 'track'; seq: number; index: number; track: GroundTrack }
  | { type: 'now'; seq: number; index: number; now: SatelliteNow | null }
  | { type: 'pass'; seq: number; index: number; pass: PassInfo }
  | { type: 'look'; seq: number; index: number; t: number; look: Look | null };
