import type { BBox } from '@watchfloor/shared';

/**
 * A feed is anything that produces track reports: the simulator today,
 * ADS-B and AIS clients next. Feeds don't know about WebSockets or the store;
 * they just push raw reports into a sink, which validates them.
 */
export interface TrackSink {
  /** Report a position. Input is validated, so feeds can pass loosely typed data. */
  upsert(report: unknown): void;
  /** The feed knows a track has gone (e.g. landed, left coverage). Optional for real feeds. */
  remove(id: string): void;
}

export interface Feed {
  readonly name: string;
  start(sink: TrackSink): void;
  stop(): void;
  /**
   * Whether anyone is watching. A hint for feeds that cost something per
   * request; free feeds ignore it. May be called before start().
   */
  setDemand?(watched: boolean): void;
  /**
   * What each browser is looking at. A hint for feeds that pay by area;
   * others ignore it.
   */
  setAreas?(views: BBox[]): void;
  /** Feed-specific state for /healthz (credits left, last error...). */
  health?(): Record<string, unknown>;
}
