/**
 * An airport's latest weather report (METAR), as the airport panel shows
 * it: decoded fields plus the raw report. From aviationweather.gov (NOAA's
 * Aviation Weather Center).
 */
export interface AirportWeather {
  station: string;
  /** When the report was observed (ms). */
  observedAt: number;
  /** The report as issued: "METAR EICK 311130Z 18004KT ...". */
  raw: string;
  tempC?: number;
  dewpointC?: number;
  /** Degrees true, or 'VRB' for variable. */
  windDir?: number | 'VRB';
  windKt?: number;
  gustKt?: number;
  /** As reported: "6+" (statute miles, 6 or more) or a number. */
  visibility?: string;
  pressureHpa?: number;
  clouds: { cover: string; baseFt?: number }[];
  /** Flight category: VFR, MVFR, IFR or LIFR. */
  category?: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
}
