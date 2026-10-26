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
}
