from __future__ import annotations
import math
from dataclasses import dataclass, field
import numpy as np

SUMMARY_KEYS = [
    ("max_mach", "Top speed (Mach)"), ("max_speed", "Top speed (m/s)"), ("apogee", "Apogee (m above site)"),
    ("time_to_apogee", "Time to apogee (s)"), ("time_above_m12", "Time above Mach 1.2 (s)"),
    ("rail_exit_speed", "Rail exit speed (m/s)"), ("stability_off_rail", "Stability off the rail (cal)"),
    ("max_accel_g", "Peak acceleration (g)"), ("landing_speed", "Landing speed (m/s)"),
    ("drift", "Landing distance (m)"), ("flight_time", "Flight time (s)"), ("flutter_margin", "Fin flutter margin (x)"),
    ("dry_mass", "Dry mass (kg)"), ("liftoff_mass", "Liftoff mass (kg)"),
]


@dataclass
class FlightResult:
    engine: str
    summary: dict
    series: dict = field(default_factory=dict)

    @classmethod
    def from_series(cls, engine, rec, **extra):
        alt = np.asarray(rec["alt"], float); ia = int(np.argmax(alt))
        hit = np.nonzero(alt[ia:] <= 0)[0]
        if hit.size:  # cut everything after first ground contact (some engines keep integrating)
            n = ia + int(hit[0]) + 1
            rec = {k: list(v)[:n] for k, v in rec.items()}
        t = np.asarray(rec["t"], float); alt = np.asarray(rec["alt"], float); M = np.asarray(rec["mach"], float)
        above = t[M >= 1.2]
        s = dict(
            max_mach=float(np.nanmax(M)), max_speed=float(np.nanmax(rec["speed"])), apogee=float(alt[ia]),
            time_to_apogee=float(t[ia]), time_above_m12=float(above.max() - above.min()) if above.size else 0.0,
            max_accel_g=float(np.nanmax(rec["accel"][:max(1, ia)])) / 9.80665 if "accel" in rec else None,
            landing_speed=float(abs(rec["vz"][-1])) if "vz" in rec else None,
            drift=float(math.hypot(rec["x"][-1], rec["y"][-1])) if "x" in rec else None,
            flight_time=float(t[-1]),
        )
        s.update({k: (None if v is None else float(v)) for k, v in extra.items()})
        return cls(engine, s, {k: list(map(float, v)) for k, v in rec.items()})

    def row(self):
        return {"engine": self.engine, **self.summary}
