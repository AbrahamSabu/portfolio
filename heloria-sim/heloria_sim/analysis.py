"""Run several engines, combine them, run Monte Carlo dispersions and export the data."""
from __future__ import annotations
import csv, json, math, os, random, time
from dataclasses import dataclass, field
import numpy as np
from .engines import ENGINES, SUPPORTS, available_engines
from .engines.result import SUMMARY_KEYS

AGREE_TOL = {"max_mach": 0.05, "apogee": 0.10, "stability_off_rail": 0.25, "landing_speed": 0.15}
ABS_FLOOR = {"drift": 50.0, "time_above_m12": 0.2, "rail_exit_speed": 5.0}


# ------------------------------------------------------------------ ensemble
def run_ensemble(rocket, engines=None, **kw):
    engines = engines or available_engines()
    results, errors = {}, {}
    for name in engines:
        try:
            t0 = time.time(); res = ENGINES[name].run(rocket.copy(), **kw); res.summary["runtime_s"] = time.time() - t0
            if not res.summary.get("apogee") or res.summary["apogee"] <= 1.0:  # an engine that silently failed must not drag the mean down
                raise RuntimeError("engine returned no flight (apogee 0)")
            results[name] = res
        except Exception as e:  # keep going with the engines that work
            errors[name] = f"{type(e).__name__}: {e}"
    return Ensemble(results, errors)


@dataclass
class Ensemble:
    results: dict
    errors: dict = field(default_factory=dict)

    def table(self):
        rows = []
        for key, label in SUMMARY_KEYS:
            vals = {n: r.summary.get(key) for n, r in self.results.items()}
            nums = [v for v in vals.values() if isinstance(v, (int, float)) and v == v]
            mean = float(np.mean(nums)) if nums else None
            spread = (max(nums) - min(nums)) if len(nums) > 1 else 0.0
            rel = spread / abs(mean) if mean else 0.0
            agree = (rel <= AGREE_TOL.get(key, 0.15) or spread <= ABS_FLOOR.get(key, 0.0)) if len(nums) > 1 else None
            rows.append(dict(key=key, label=label, **vals, mean=mean, spread=spread, agree=agree))
        return rows

    def mean(self, key):
        nums = [r.summary.get(key) for r in self.results.values() if isinstance(r.summary.get(key), (int, float))]
        return float(np.mean(nums)) if nums else None


# ------------------------------------------------------------------ Monte Carlo
DEFAULT_DISPERSION = dict(
    wind_speed=(0.0, 6.0), wind_from=(0.0, 360.0), wind_aloft_factor=(1.0, 2.5), turbulence=(0.05, 0.3),
    rail_angle=(0.0, 5.0), temperature_c=(-2.0, 18.0), pressure_sigma_hpa=12.0,
    mass_sigma_kg=0.015, thrust_sigma=0.03, drag_range=(0.9, 1.15), cold_motor_prob=0.0,
)


def sample_case(rocket, disp, rng):
    r = rocket.copy(); L = r.launch
    u = lambda k: rng.uniform(*disp[k])
    L.wind_speed = u("wind_speed"); L.wind_from = u("wind_from"); L.wind_aloft_factor = u("wind_aloft_factor")
    L.turbulence = u("turbulence"); L.rail_angle = u("rail_angle"); L.rail_heading = (L.wind_from) % 360  # lean into wind
    L.temperature_c = u("temperature_c"); L.pressure_hpa = rocket.launch.pressure_hpa + rng.gauss(0, disp["pressure_sigma_hpa"])
    cold = rng.random() < disp.get("cold_motor_prob", 0.0)
    kw = dict(extra_mass=rng.gauss(0, disp["mass_sigma_kg"]),
              thrust_scale=(1 + rng.gauss(0, disp["thrust_sigma"])) * (0.94 if cold else 1.0),
              time_scale=1.05 if cold else 1.0, drag_scale=rng.uniform(*disp["drag_range"]), seed=rng.randint(0, 10 ** 6))
    inputs = dict(wind_speed=L.wind_speed, wind_from=L.wind_from, wind_aloft_factor=L.wind_aloft_factor, turbulence=L.turbulence,
                  rail_angle=L.rail_angle, temperature_c=L.temperature_c, pressure_hpa=L.pressure_hpa, cold_motor=cold, **kw)
    return r, kw, inputs


def _mc_worker(args):
    name, rocket, kw = args
    sup = SUPPORTS[name]
    use = {k: v for k, v in kw.items() if k in sup or k == "seed"}
    try:
        s = ENGINES[name].run(rocket, **use).summary
        if not s.get("apogee") or s["apogee"] <= 1.0: return None, "engine returned no flight"
        return s, None
    except Exception as e:
        return None, str(e)


def run_monte_carlo(rocket, n=200, engines=None, dispersion=None, seed=1, workers=None, progress=None):
    """Returns a list of rows: one per (flight, engine), with sampled inputs and outputs."""
    disp = {**DEFAULT_DISPERSION, **(dispersion or {})}
    engines = engines or available_engines()
    rng = random.Random(seed)
    cases = [sample_case(rocket, disp, rng) for _ in range(n)]
    rows = []
    for name in engines:
        jobs = [(name, r, kw) for r, kw, _ in cases]
        if name == "openrocket" or workers == 1:
            outs = []
            for i, j in enumerate(jobs):
                outs.append(_mc_worker(j))
                if progress: progress(name, i + 1, n)
        else:
            from concurrent.futures import ProcessPoolExecutor
            outs = []
            with ProcessPoolExecutor(max_workers=workers) as ex:
                for i, o in enumerate(ex.map(_mc_worker, jobs, chunksize=4)):
                    outs.append(o)
                    if progress: progress(name, i + 1, n)
        for i, ((_, _, inp), (summ, err)) in enumerate(zip(cases, outs)):
            row = dict(flight=i, engine=name, **{f"in_{k}": v for k, v in inp.items()})
            if summ: row.update(summ)
            else: row["error"] = err
            rows.append(row)
    return rows


def mc_summary(rows, keys=("max_mach", "apogee", "stability_off_rail", "landing_speed", "drift", "time_above_m12")):
    out = {}
    for eng in sorted({r["engine"] for r in rows}) + ["all"]:
        sel = [r for r in rows if (eng == "all" or r["engine"] == eng) and "error" not in r]
        d = {"n": len(sel)}
        for k in keys:
            v = np.array([r[k] for r in sel if isinstance(r.get(k), (int, float)) and r.get(k) == r.get(k)])
            if v.size:
                d[k] = dict(min=float(v.min()), p5=float(np.percentile(v, 5)), median=float(np.median(v)), p95=float(np.percentile(v, 95)), max=float(v.max()))
        out[eng] = d
    return out


# ------------------------------------------------------------------ export
def export(outdir, rocket, ensemble=None, mc_rows=None, mach_floor=1.2, ceiling=None):
    os.makedirs(outdir, exist_ok=True)
    rocket.save(os.path.join(outdir, "rocket.yaml"))
    report = {"rocket": rocket.name, "dry_mass_kg": rocket.dry_mass(), "dry_cg_m": rocket.dry_cg()}
    if ensemble:
        tab = ensemble.table()
        with open(os.path.join(outdir, "ensemble_summary.csv"), "w", newline="") as fh:
            cols = ["label"] + list(ensemble.results) + ["mean", "spread", "agree"]
            w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore"); w.writeheader(); [w.writerow(r) for r in tab]
        for name, res in ensemble.results.items():
            keys = list(res.series)
            with open(os.path.join(outdir, f"timeseries_{name}.csv"), "w", newline="") as fh:
                w = csv.writer(fh); w.writerow(keys)
                for i in range(len(res.series["t"])): w.writerow([res.series[k][i] if i < len(res.series[k]) else "" for k in keys])
        report["ensemble"] = tab; report["errors"] = ensemble.errors
    if mc_rows:
        keys = sorted({k for r in mc_rows for k in r}, key=lambda k: (not k.startswith(("flight", "engine")), k))
        with open(os.path.join(outdir, "monte_carlo.csv"), "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=keys); w.writeheader(); [w.writerow(r) for r in mc_rows]
        summ = mc_summary(mc_rows); report["monte_carlo"] = summ
        ok = [r for r in mc_rows if "error" not in r]
        report["monte_carlo_checks"] = {
            "below_mach_floor": sum(1 for r in ok if r.get("max_mach", 9) < mach_floor),
            "above_ceiling": sum(1 for r in ok if ceiling and r.get("apogee", 0) > ceiling) if ceiling else None,
            "flights": len(ok)}
    with open(os.path.join(outdir, "report.json"), "w") as fh: json.dump(report, fh, indent=2, default=str)
    try:
        _plots(outdir, ensemble, mc_rows, mach_floor, ceiling)
    except Exception as e:
        report["plot_error"] = str(e)
    _html(outdir, rocket, report)
    return report


def _plots(outdir, ens, rows, floor, ceiling):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    if ens:
        for key, lab, fn in (("alt", "Altitude (m)", "altitude.png"), ("mach", "Mach", "mach.png")):
            fig, ax = plt.subplots(figsize=(8, 4))
            for n, r in ens.results.items():
                t = np.array(r.series["t"]); y = np.array(r.series[key]); m = t < (60 if key == "mach" else t.max())
                if key == "mach": m = t < 25
                ax.plot(t[m], y[m], label=n)
            if key == "mach": ax.axhline(floor, ls="--", c="grey")
            ax.set_xlabel("Time (s)"); ax.set_ylabel(lab); ax.legend(); fig.tight_layout(); fig.savefig(os.path.join(outdir, fn), dpi=110); plt.close(fig)
    if rows:
        ok = [r for r in rows if "error" not in r]
        for key, lab, line in (("max_mach", "Top speed (Mach)", floor), ("apogee", "Apogee (m)", ceiling)):
            fig, ax = plt.subplots(figsize=(8, 4))
            for eng in sorted({r["engine"] for r in ok}):
                ax.hist([r[key] for r in ok if r["engine"] == eng], bins=30, alpha=0.5, label=eng)
            if line: ax.axvline(line, ls="--", c="k")
            ax.set_xlabel(lab); ax.set_ylabel("Flights"); ax.legend(); fig.tight_layout(); fig.savefig(os.path.join(outdir, f"hist_{key}.png"), dpi=110); plt.close(fig)


def _html(outdir, rocket, rep):
    def fmt(v):
        return "" if v is None else (f"{v:.3g}" if isinstance(v, float) else str(v))
    h = [f"<html><head><meta charset='utf-8'><title>{rocket.name}</title><style>body{{font-family:sans-serif;max-width:900px;margin:2em auto}}td,th{{padding:4px 10px;border-bottom:1px solid #ddd}}</style></head><body><h1>{rocket.name}</h1>"]
    h.append(f"<p>Dry mass {rocket.dry_mass()*1000:.0f} g, dry CG {rocket.dry_cg()*1000:.0f} mm from the nose tip.</p>")
    if "ensemble" in rep:
        engs = [k for k in rep["ensemble"][0] if k not in ("key", "label", "mean", "spread", "agree")]
        h.append("<h2>Engines compared</h2><table><tr><th>Quantity</th>" + "".join(f"<th>{e}</th>" for e in engs) + "<th>Mean</th><th>Spread</th></tr>")
        for r in rep["ensemble"]:
            h.append("<tr><td>" + r["label"] + "</td>" + "".join(f"<td>{fmt(r.get(e))}</td>" for e in engs) + f"<td><b>{fmt(r['mean'])}</b></td><td>{fmt(r['spread'])}</td></tr>")
        h.append("</table><img src='altitude.png' width='100%'><img src='mach.png' width='100%'>")
    if "monte_carlo" in rep:
        h.append("<h2>Monte Carlo</h2><pre>" + json.dumps(rep["monte_carlo_checks"], indent=1) + "</pre><img src='hist_max_mach.png' width='100%'><img src='hist_apogee.png' width='100%'>")
    h.append("<p>Generated by Heloria Sim. Simulations are estimates; check designs with your club's safety officer.</p></body></html>")
    open(os.path.join(outdir, "report.html"), "w").write("".join(h))
