"""Heloria Sim web app.  Run:  streamlit run -m heloria_sim.app   (or: heloria-sim-app)"""
import io, json, math, os, zipfile, tempfile
import numpy as np
import pandas as pd
import streamlit as st
import yaml
from heloria_sim.spec import Rocket, Nose, Body, Fins, MotorRef, Recovery, MassItem, Launch, MATERIALS, NOSE_SHAPES, FINISH_ROUGHNESS
from heloria_sim.catalog import load_catalog, build
from heloria_sim.physics import list_motors, find_motor, Aero
from heloria_sim.engines import available_engines, DESCRIPTIONS, SUPPORTS
from heloria_sim.analysis import run_ensemble, run_monte_carlo, mc_summary, export, DEFAULT_DISPERSION
from heloria_sim import ui, __version__
from heloria_sim.engines.result import SUMMARY_KEYS
NICE = {**dict(SUMMARY_KEYS), 'in_wind_speed': 'Ground wind (m/s)', 'in_wind_from': 'Wind direction (deg)', 'in_wind_aloft_factor': 'Wind aloft factor', 'in_turbulence': 'Gustiness', 'in_rail_angle': 'Rail tilt (deg)', 'in_temperature_c': 'Temperature (°C)', 'in_pressure_hpa': 'Pressure (hPa)', 'in_extra_mass': 'Extra mass (kg)', 'in_thrust_scale': 'Thrust scale', 'in_drag_scale': 'Drag scale', 'in_time_scale': 'Burn time scale'}

st.set_page_config(page_title="Heloria Sim", page_icon="🚀", layout="wide")
st.markdown(ui.CSS, unsafe_allow_html=True)
EXAMPLE = os.path.join(os.path.dirname(__file__), "..", "examples", "heloria_v8.yaml")
cat = load_catalog()

# ------------------------------------------------------------------ sidebar: mode, engines, launch
st.sidebar.markdown("<div class='hs-title' style='font-size:1.6rem;font-weight:700'>Heloria Sim</div>", unsafe_allow_html=True)
mode = st.sidebar.radio("Design mode", ["Simple: swap parts", "Advanced: edit everything", "Load a rocket file"])
avail = available_engines()
engines = st.sidebar.multiselect("Engines", list(DESCRIPTIONS), default=avail,
                                 help="\n".join(f"{k}: {v}" for k, v in DESCRIPTIONS.items()))
missing = [e for e in engines if e not in avail]
if missing: st.sidebar.warning(f"Not available here: {', '.join(missing)} (see README to install)")
from heloria_sim.engines import openrocket_engine as _ore
if "openrocket" not in avail and _ore.java_available() and _ore.jpype_available():
    if st.sidebar.button("Download the OpenRocket engine (about 80 MB, once)"):
        bar = st.sidebar.progress(0.0, "Downloading OpenRocket…")
        _ore.download_jar(lambda f: bar.progress(f, "Downloading OpenRocket…"))
        st.rerun()
st.sidebar.subheader("Launch conditions")
L = Launch(
    wind_speed=st.sidebar.slider("Ground wind (m/s)", 0.0, 12.0, 0.0, 0.5),
    wind_from=st.sidebar.slider("Wind from (deg)", 0, 359, 270),
    wind_aloft_factor=st.sidebar.slider("Wind at 2 km ÷ ground wind", 1.0, 4.0, 1.0, 0.1),
    turbulence=st.sidebar.slider("Gustiness", 0.0, 0.3, 0.0, 0.05),
    rail_length=st.sidebar.slider("Rail length (m)", 1.0, 6.0, 3.0, 0.5),
    rail_angle=st.sidebar.slider("Rail tilt (deg)", 0.0, 15.0, 0.0, 0.5),
    rail_heading=st.sidebar.slider("Rail leans towards (deg)", 0, 359, 270),
    temperature_c=st.sidebar.slider("Temperature (°C)", -10.0, 40.0, 15.0, 1.0),
    pressure_hpa=st.sidebar.slider("Pressure (hPa)", 960.0, 1050.0, 1013.0, 1.0),
    site_elevation=st.sidebar.number_input("Site elevation (m)", 0.0, 4000.0, 50.0, 10.0),
)

# ------------------------------------------------------------------ design
if "rocket" not in st.session_state:
    st.session_state.rocket = Rocket.load(EXAMPLE) if os.path.exists(EXAMPLE) else Rocket()

st.markdown(f"<div class='hs-hero'><p class='hs-title'>Heloria Sim</p><span class='hs-ver'>v{__version__} · open-source multi-engine flight simulator</span></div>", unsafe_allow_html=True)
st.markdown("<p class='hs-sub'>Design a rocket, fly it through several independent engines, and see where they agree.</p>" + ui.chips(list(DESCRIPTIONS), avail), unsafe_allow_html=True)
st.markdown("<div class='hs-section'>Design</div>", unsafe_allow_html=True)
if mode.startswith("Simple"):
    names = lambda g: {x["name"]: x["id"] for x in cat[g]}
    c1, c2, c3 = st.columns(3)
    af = c1.selectbox("Airframe", list(names("airframes")))
    fn = c2.selectbox("Fins", list(names("fins")))
    mo = c3.selectbox("Motor", list_motors(), index=list_motors().index("381I224-15A") if "381I224-15A" in list_motors() else 0)
    c4, c5, c6 = st.columns(3)
    ch = c4.selectbox("Parachute", list(names("chutes")), index=2)
    el = c5.selectbox("Electronics", list(names("electronics")))
    fi = c6.selectbox("Finish", cat["finishes"], index=2)
    try:
        r = build(names("airframes")[af], names("fins")[fn], mo, names("chutes")[ch], names("electronics")[el], finish=fi, catalog=cat)
        st.session_state.rocket = r
    except Exception as e:
        st.error(str(e)); r = st.session_state.rocket
elif mode.startswith("Advanced"):
    r = st.session_state.rocket.copy()
    r.name = st.text_input("Name", r.name)
    t1, t2, t3, t4, t5 = st.tabs(["Nose", "Body tube", "Fins", "Motor and recovery", "Other masses"])
    mats = list(MATERIALS)
    with t1:
        n = r.nose; c = st.columns(3)
        n.shape = c[0].selectbox("Shape", NOSE_SHAPES, NOSE_SHAPES.index(n.shape) if n.shape in NOSE_SHAPES else 0)
        n.length = c[1].number_input("Length (mm)", 20.0, 1000.0, n.length * 1000, 1.0) / 1000
        n.material = c[2].selectbox("Material", mats, mats.index(n.material) if n.material in mats else 0, key="nm")
        n.thickness = c[0].number_input("Wall (mm)", 0.3, 10.0, n.thickness * 1000, 0.1) / 1000
        ov = c[1].number_input("Mass override (g, 0 = calculate)", 0.0, 2000.0, (n.mass or 0) * 1000, 1.0)
        n.mass = ov / 1000 if ov > 0 else None
    with t2:
        b = r.body; c = st.columns(3)
        b.length = c[0].number_input("Length (mm)", 50.0, 3000.0, b.length * 1000, 1.0) / 1000
        b.outer_diameter = c[1].number_input("Outer diameter (mm)", 10.0, 300.0, b.outer_diameter * 1000, 0.1) / 1000
        b.inner_diameter = c[2].number_input("Inner diameter (mm)", 5.0, 299.0, b.inner_diameter * 1000, 0.1) / 1000
        b.material = c[0].selectbox("Material", mats, mats.index(b.material) if b.material in mats else 0, key="bm")
        ov = c[1].number_input("Mass override (g, 0 = calculate)", 0.0, 5000.0, (b.mass or 0) * 1000, 1.0, key="bmo")
        b.mass = ov / 1000 if ov > 0 else None
    with t3:
        f = r.fins; c = st.columns(4)
        f.count = int(c[0].number_input("Count", 2, 8, f.count))
        f.root = c[1].number_input("Root chord (mm)", 5.0, 500.0, f.root * 1000, 1.0) / 1000
        f.tip = c[2].number_input("Tip chord (mm)", 0.0, 500.0, f.tip * 1000, 1.0) / 1000
        f.span = c[3].number_input("Span (mm)", 5.0, 400.0, f.span * 1000, 1.0) / 1000
        f.sweep = c[0].number_input("Leading-edge sweep (mm)", 0.0, 500.0, f.sweep * 1000, 1.0) / 1000
        f.thickness = c[1].number_input("Thickness (mm)", 0.5, 20.0, f.thickness * 1000, 0.1) / 1000
        f.material = c[2].selectbox("Material", mats, mats.index(f.material) if f.material in mats else 0, key="fm")
        f.edge = c[3].selectbox("Edges", ["square", "rounded", "airfoil"], ["square", "rounded", "airfoil"].index(f.edge))
        f.offset_from_aft = c[0].number_input("Distance from tail (mm)", 0.0, 1000.0, f.offset_from_aft * 1000, 1.0) / 1000
    with t4:
        c = st.columns(3)
        ms = list_motors()
        r.motor.designation = c[0].selectbox("Motor", ms, ms.index(r.motor.designation) if r.motor.designation in ms else 0)
        up = c[1].file_uploader("…or upload a .eng thrust curve", type=["eng"])
        if up:
            path = os.path.join(tempfile.gettempdir(), up.name); open(path, "wb").write(up.getvalue()); r.motor.file = path
        r.motor.overhang = c[2].number_input("Motor overhang (mm)", 0.0, 100.0, r.motor.overhang * 1000, 1.0) / 1000
        r.recovery.chute_diameter = c[0].number_input("Chute diameter (cm)", 10.0, 300.0, r.recovery.chute_diameter * 100, 1.0) / 100
        r.recovery.chute_cd = c[1].number_input("Chute Cd", 0.3, 2.0, r.recovery.chute_cd, 0.05)
        r.recovery.deploy_delay = c[2].number_input("Deploy delay after apogee (s)", 0.0, 10.0, r.recovery.deploy_delay, 0.5)
        r.finish = c[0].selectbox("Finish", list(FINISH_ROUGHNESS), list(FINISH_ROUGHNESS).index(r.finish) if r.finish in FINISH_ROUGHNESS else 2)
    with t5:
        df = pd.DataFrame([{"name": m.name, "mass (g)": m.mass * 1000, "position from nose tip (mm)": m.position * 1000} for m in r.masses])
        df = st.data_editor(df, num_rows="dynamic", width='stretch')
        r.masses = [MassItem(str(x["name"]), float(x["mass (g)"]) / 1000, float(x["position from nose tip (mm)"]) / 1000) for _, x in df.dropna().iterrows()]
    st.session_state.rocket = r
else:
    up = st.file_uploader("Rocket file (.yaml)", type=["yaml", "yml"])
    if up: st.session_state.rocket = Rocket.from_dict(yaml.safe_load(up.getvalue()))
    r = st.session_state.rocket

r.launch = L
st.download_button("Download this rocket (.yaml)", yaml.safe_dump(r.to_dict(), sort_keys=False), file_name=f"{r.name[:40].replace(' ', '_')}.yaml")

# ------------------------------------------------------------------ design summary
try:
    motor = find_motor(r.motor.designation, r.motor.file); aero = Aero(r)
    m_dry = r.dry_mass(); x_m = r.length + r.motor.overhang - motor.length / 2
    cg0 = (m_dry * r.dry_cg() + motor.total_mass * x_m) / (m_dry + motor.total_mass)
    cp0 = aero.cna_cp(0.3)[1]
    st.markdown(ui.rocket_svg(r, motor, cg0, cp0), unsafe_allow_html=True)
    st.markdown(ui.cards([
        ("Dry mass", f"{m_dry*1000:.0f}", "g", f"CG {r.dry_cg()*1000:.0f} mm from tip"),
        ("Liftoff mass", f"{(m_dry+motor.total_mass)*1000:.0f}", "g", f"motor {motor.total_mass*1000:.0f} g"),
        ("Static stability", f"{aero.stability(0.3, cg0):.2f}", "cal", f"{(cp0-cg0)/r.length*100:.0f}% of length", True),
        ("Motor", motor.designation, "", f"{motor.impulse:.0f} Ns over {motor.burn_time:.2f} s"),
        ("Thrust to weight", f"{motor.impulse/motor.burn_time/((m_dry+motor.total_mass)*9.81):.0f}", ": 1", "average over the burn"),
    ]), unsafe_allow_html=True)
except Exception as e:
    st.error(f"Design problem: {e}")

# ------------------------------------------------------------------ results
tab_sim, tab_mc, tab_aero = st.tabs(["Compare engines", "Monte Carlo", "Drag and stability"])
with tab_sim:
    if st.button("Simulate with all selected engines", type="primary"):
        with st.spinner("Running engines…"):
            st.session_state.ens = run_ensemble(r, [e for e in engines if e in avail])
    ens = st.session_state.get("ens")
    if ens:
        rows = {x["key"]: x for x in ens.table()}
        def item(key, label, fmt, unit="", hi=False):
            x = rows[key]
            if x["mean"] is None: return (label, "–", "", "")
            sub = (f"± {x['spread']/2:{fmt}} across {len(ens.results)} engines" if len(ens.results) > 1 else "one engine") + ("" if x["agree"] in (None, True) else " · engines differ")
            return (label, f"{x['mean']:{fmt}}", unit, sub, hi)
        st.markdown(ui.cards([item("max_mach", "Top speed", ".2f", "Mach", True), item("apogee", "Apogee", ",.0f", "m"),
                              item("stability_off_rail", "Stability off rail", ".2f", "cal"), item("landing_speed", "Landing speed", ".1f", "m/s"),
                              item("time_above_m12", "Time above Mach 1.2", ".2f", "s")]), unsafe_allow_html=True)
        df = pd.DataFrame([{**{"Quantity": x["label"]}, **{e: x.get(e) for e in ens.results}, "Mean": x["mean"],
                            "Agreement": "✓ agree" if x["agree"] else ("— one engine" if x["agree"] is None else "⚠ differ")} for x in rows.values()])
        st.dataframe(df, width="stretch", hide_index=True, column_config={e: st.column_config.NumberColumn(format="%.4g") for e in list(ens.results) + ["Mean"]})
        for n, e in ens.errors.items(): st.warning(f"{n} failed: {e}")
        ts = pd.concat([pd.DataFrame({"engine": n, "Time (s)": res.series["t"], "Altitude (m)": res.series["alt"], "Mach": res.series["mach"]}) for n, res in ens.results.items()])
        c1, c2 = st.columns(2)
        c1.altair_chart(ui.line_chart(ts, "Time (s)", "Altitude (m)", "Altitude"), width="stretch")
        c2.altair_chart(ui.line_chart(ts[ts["Time (s)"] <= 25], "Time (s)", "Mach", "Mach number, first 25 s", rule=1.2, rule_label="Mach 1.2"), width="stretch")
        buf = io.BytesIO()
        with tempfile.TemporaryDirectory() as d:
            export(d, r, ens, st.session_state.get("mc"))
            with zipfile.ZipFile(buf, "w") as z:
                for fn in os.listdir(d): z.write(os.path.join(d, fn), fn)
        st.download_button("Download all data (CSV, JSON, plots, report)", buf.getvalue(), file_name="heloria_sim_results.zip")

with tab_mc:
    c = st.columns(4)
    n = c[0].number_input("Flights per engine", 10, 5000, 200, 10)
    wmax = c[1].slider("Max ground wind (m/s)", 0.0, 12.0, 6.0, 0.5)
    drag = c[2].slider("Drag range (±%)", 0, 30, 15, 1)
    thr = c[3].slider("Motor thrust σ (%)", 0.0, 8.0, 3.0, 0.5)
    c = st.columns(4)
    tlo, thi = c[0].slider("Temperature range (°C)", -10, 40, (-2, 18))
    msig = c[1].slider("Build mass σ (g)", 0, 50, 15)
    cold = c[2].slider("Cold-motor share (%)", 0, 100, 0)
    floor = c[3].number_input("Mach floor to check", 0.5, 5.0, 1.2, 0.1)
    ceiling = st.number_input("Altitude ceiling to check (m, 0 = none)", 0.0, 20000.0, 0.0, 100.0)
    st.caption("OpenRocket varies weather, rail and mass only; drag and thrust variation apply to the other engines.")
    if st.button("Run Monte Carlo"):
        disp = {**DEFAULT_DISPERSION, "wind_speed": (0.0, wmax), "drag_range": (1 - drag / 100, 1 + drag / 100), "thrust_sigma": thr / 100,
                "temperature_c": (tlo, thi), "mass_sigma_kg": msig / 1000, "cold_motor_prob": cold / 100}
        bar = st.progress(0.0, "Starting")
        sel = [e for e in engines if e in avail]
        def prog(name, i, total): bar.progress(min(1.0, i / total), f"{name}: {i}/{total}")
        st.session_state.mc = run_monte_carlo(r, int(n), sel, disp, progress=prog)
        st.session_state.mc_checks = (floor, ceiling)
    rows = st.session_state.get("mc")
    if rows:
        df = pd.DataFrame(rows); ok = df[df.get("error").isna()] if "error" in df else df
        floor, ceiling = st.session_state.get("mc_checks", (1.2, 0))
        items = [("Flights", f"{len(ok):,}", "", f"{ok.engine.nunique()} engines"), ("Slowest", f"{ok.max_mach.min():.2f}", "Mach", f"median {ok.max_mach.median():.2f}", True),
                 (f"Below Mach {floor}", f"{int((ok.max_mach < floor).sum())}", "", f"{(ok.max_mach < floor).mean()*100:.1f}% of flights"),
                 ("Highest apogee", f"{ok.apogee.max():,.0f}", "m", f"95th percentile {ok.apogee.quantile(.95):,.0f} m")]
        if ceiling: items.append((f"Above {ceiling:,.0f} m", f"{int((ok.apogee > ceiling).sum())}", "", f"{(ok.apogee > ceiling).mean()*100:.1f}% of flights"))
        st.markdown(ui.cards(items), unsafe_allow_html=True)
        summ = mc_summary(rows)
        tbl = pd.DataFrame([{"Engine": e, "Quantity": NICE.get(k, k), "Min": v["min"], "5th pct": v["p5"], "Median": v["median"], "95th pct": v["p95"], "Max": v["max"]}
                            for e, d in summ.items() for k, v in d.items() if isinstance(v, dict)])
        st.dataframe(tbl, hide_index=True, width="stretch", column_config={c: st.column_config.NumberColumn(format="%.4g") for c in ["Min", "5th pct", "Median", "95th pct", "Max"]})
        c1, c2 = st.columns(2)
        c1.altair_chart(ui.hist(ok, "max_mach", "Top speed (Mach)", rule=floor, rule_label=f"Mach {floor}"), width="stretch")
        c2.altair_chart(ui.hist(ok, "apogee", "Apogee (m)", rule=ceiling or None, rule_label=f"{ceiling:.0f} m" if ceiling else None), width="stretch")
        st.markdown("<div class='hs-section'>Explore the data</div>", unsafe_allow_html=True)
        ins = [c for c in ok.columns if c.startswith("in_") and pd.api.types.is_numeric_dtype(ok[c])]
        outs = [c for c in ["max_mach", "apogee", "stability_off_rail", "landing_speed", "drift", "time_above_m12", "rail_exit_speed", "max_accel_g"] if c in ok.columns]
        c = st.columns(2)
        xs = c[0].selectbox("Input (x axis)", ins + outs, index=0, format_func=lambda k: NICE.get(k, k))
        ys = c[1].selectbox("Result (y axis)", outs, index=1 if len(outs) > 1 else 0, format_func=lambda k: NICE.get(k, k))
        st.altair_chart(ui.scatter(ok.rename(columns={xs: NICE.get(xs, xs), ys: NICE.get(ys, ys)}), NICE.get(xs, xs), NICE.get(ys, ys), f"{NICE.get(ys, ys)} against {NICE.get(xs, xs)}"), width="stretch")
        st.download_button("Download every flight (CSV)", df.to_csv(index=False), file_name="monte_carlo.csv")

with tab_aero:
    try:
        aero = Aero(r)
        machs = np.round(np.arange(0.05, 2.55, 0.05), 2)
        cd = [aero.cd(M, 1.2, max(M, 0.01) * 340, 1.8e-5)[0] for M in machs]
        stab = [aero.stability(M, cg0) for M in machs]
        parts = []
        for M in machs:
            _, comp = aero.cd(M, 1.2, max(M, 0.01) * 340, 1.8e-5)
            for k, v in comp.items(): parts.append({"Mach": M, "component": k, "Cd": v})
        c1, c2 = st.columns(2)
        c1.altair_chart(ui.stacked_drag(pd.DataFrame(parts), "Drag build-up, coasting (built-in model)"), width="stretch")
        sdf = pd.DataFrame({"engine": "helix", "Mach": machs, "Stability (cal)": stab})
        c2.altair_chart(ui.line_chart(sdf, "Mach", "Stability (cal)", "Static stability at liftoff CG", rule=1.5, rule_label="1.5 cal guide"), width="stretch")
    except Exception as e:
        st.error(str(e))

st.caption("Heloria Sim is open source (GPL-3.0). Simulations are estimates; have designs checked by your club's safety officer.")
