"""Command line: heloria-sim run rocket.yaml --engines helix,rocketpy,openrocket --mc 500 --out results/"""
import argparse, json, sys
from .spec import Rocket
from .analysis import run_ensemble, run_monte_carlo, export, mc_summary
from .engines import available_engines, DESCRIPTIONS
from .physics import list_motors


def main(argv=None):
    p = argparse.ArgumentParser(prog="heloria-sim", description="Multi-engine rocket flight simulator")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="simulate a rocket file")
    r.add_argument("rocket"); r.add_argument("--engines", default=None, help="comma list; default: all available")
    r.add_argument("--mc", type=int, default=0, help="Monte Carlo flights per engine")
    r.add_argument("--out", default="results"); r.add_argument("--seed", type=int, default=1)
    r.add_argument("--mach-floor", type=float, default=1.2); r.add_argument("--ceiling", type=float, default=None)
    r.add_argument("--workers", type=int, default=None)
    sub.add_parser("engines", help="list engines and whether they are available")
    sub.add_parser("motors", help="list motors in the built-in library")
    sub.add_parser("app", help="open the web app in your browser")
    a = p.parse_args(argv)
    if a.cmd == "engines":
        av = available_engines()
        for n, d in DESCRIPTIONS.items(): print(f"{'✓' if n in av else '✗'} {n:11} {d}")
        return
    if a.cmd == "app":
        import os, subprocess
        subprocess.run([sys.executable, "-m", "streamlit", "run", os.path.join(os.path.dirname(__file__), "app.py")]); return
    if a.cmd == "motors":
        print("\n".join(list_motors())); return
    rocket = Rocket.load(a.rocket)
    engines = a.engines.split(",") if a.engines else available_engines()
    print(f"{rocket.name}: dry {rocket.dry_mass()*1000:.0f} g; engines: {', '.join(engines)}")
    ens = run_ensemble(rocket, engines)
    for row in ens.table():
        vals = "  ".join(f"{e}={row[e]:.4g}" for e in ens.results if isinstance(row.get(e), float))
        mean = f"mean={row['mean']:.4g}" if row["mean"] is not None else ""
        print(f"{row['label']:30} {vals}  {mean}{'' if row['agree'] in (None, True) else '  (engines disagree)'}")
    for n, e in ens.errors.items(): print(f"! {n} failed: {e}", file=sys.stderr)
    rows = None
    if a.mc:
        def prog(name, i, n):
            if i % max(1, n // 10) == 0 or i == n: print(f"  {name}: {i}/{n}", flush=True)
        rows = run_monte_carlo(rocket, a.mc, engines, seed=a.seed, workers=a.workers, progress=prog)
        print(json.dumps(mc_summary(rows), indent=1))
    rep = export(a.out, rocket, ens, rows, a.mach_floor, a.ceiling)
    print(f"Wrote {a.out}/ (report.html, report.json, CSVs, plots)")


if __name__ == "__main__":
    main()
