"""Look and feel for the web app: CSS, the live rocket drawing and chart helpers."""
import math
import altair as alt
import pandas as pd

GOLD = "#D8C48A"; INK = "#ECEEEF"; DIM = "#8F9398"; PANEL = "#1C1F22"; LINE = "#2E3338"; BG = "#141618"
FONT = "Barlow, Helvetica Neue, Arial, sans-serif"; FONT_HEAD = "Barlow Condensed, Helvetica Neue, Arial, sans-serif"
ENGINE_DASH = {"helix": [1, 0], "rocketpy": [6, 4], "openrocket": [2, 3]}
ENGINE_COLORS = {"helix": "#D8C48A", "rocketpy": "#6FA8B8", "openrocket": "#C77D8E", "mean": "#ECEEEF"}

CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500&family=Barlow+Condensed:wght@600;700&display=swap');
html, body, [class*="css"], .stMarkdown, .stText, label, p, li {{ font-family: 'Barlow', system-ui, sans-serif; }}
h1, h2, h3, .hs-title {{ font-family: 'Barlow Condensed', 'Barlow', sans-serif !important; letter-spacing: .01em; }}
.block-container {{ padding-top: 1.6rem; max-width: 1400px; }}
[data-testid="stSidebar"] {{ background: #111315; border-right: 1px solid {LINE}; }}
[data-testid="stMetric"] {{ background: {PANEL}; border: 1px solid {LINE}; border-radius: 12px; padding: 14px 16px; }}
[data-testid="stMetricLabel"] p {{ color: {DIM}; font-size: .85rem; }}
[data-testid="stMetricValue"] {{ font-family: 'Barlow Condensed', sans-serif; font-weight: 700; }}
.stTabs [data-baseweb="tab-list"] {{ gap: 6px; border-bottom: 1px solid {LINE}; }}
.stTabs [data-baseweb="tab"] {{ background: transparent; border-radius: 8px 8px 0 0; padding: 8px 16px; }}
.stTabs [aria-selected="true"] {{ background: {PANEL}; }}
.hs-hero {{ display:flex; align-items:baseline; gap:16px; margin-bottom:.2rem; }}
.hs-hero .hs-title {{ font-size: 2.6rem; font-weight: 700; color: {INK}; margin:0; }}
.hs-hero .hs-ver {{ color: {DIM}; font-size: .95rem; }}
.hs-sub {{ color: {DIM}; margin: 0 0 1rem; }}
.hs-legend {{ display:flex; flex-wrap:wrap; gap: 6px 18px; color:{DIM}; font-size:.85rem; margin: 6px 4px 12px; }}
.hs-legend b {{ color:{INK}; font-weight:500; }}
@media (max-width: 640px) {{
  .hs-hero {{ display:block; }} .hs-hero .hs-title {{ font-size: 2rem; }} .hs-hero .hs-ver {{ display:block; font-size:.8rem; }}
  .block-container {{ padding-left: .8rem; padding-right: .8rem; }}
  .hs-cards {{ grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }}
  .hs-cardm .v {{ font-size: 1.5rem; }}
}}
.hs-chip {{ display:inline-block; padding: 3px 10px; border-radius: 999px; font-size: .8rem; margin-right: 6px; border: 1px solid {LINE}; color:{INK}; }}
.hs-chip.ok {{ border-color: #3d6b52; color: #9fd3b2; }}
.hs-chip.off {{ color: {DIM}; }}
.hs-chip.warn {{ border-color: #7a5a2a; color: {GOLD}; }}
.hs-card {{ background:{PANEL}; border:1px solid {LINE}; border-radius:14px; padding: 10px 14px 4px; margin-bottom: 12px; }}
.hs-cards {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 6px 0 14px; }}
.hs-cardm {{ background:{PANEL}; border:1px solid {LINE}; border-radius:12px; padding: 12px 14px; min-width:0; }}
.hs-cardm .l {{ color:{DIM}; font-size:.82rem; }}
.hs-cardm .v {{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:1.9rem; line-height:1.15; color:{INK}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
.hs-cardm .v small {{ font-size:1.05rem; color:{DIM}; font-weight:600; margin-left:3px; }}
.hs-cardm .s {{ color:{DIM}; font-size:.8rem; margin-top:2px; }}
.hs-cardm.gold .v {{ color:{GOLD}; }}
.hs-cardm .v.long {{ font-size:1.35rem; padding-top:.35rem; }}
.hs-section {{ font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:1.25rem; margin: .6rem 0 .3rem; color:{INK}; }}
</style>
"""


def cards(items):
    """items: list of (label, value, unit, sub, highlight)."""
    h = ["<div class='hs-cards'>"]
    for it in items:
        label, value, unit, sub, hi = (list(it) + [None, None, None])[:5]
        h.append(f"<div class='hs-cardm{' gold' if hi else ''}'><div class='l'>{label}</div><div class='v{' long' if len(str(value)) > 8 else ''}'>{value}<small>{unit or ''}</small></div>"
                 + (f"<div class='s'>{sub}</div>" if sub else "") + "</div>")
    h.append("</div>")
    return "".join(h)


def chips(engines, available):
    out = []
    for e in engines:
        cls = "ok" if e in available else "off"
        out.append(f"<span class='hs-chip {cls}'>{'●' if e in available else '○'} {e}</span>")
    return "".join(out)


def _nose_profile(shape, L, R, n=40):
    pts = []
    for i in range(n + 1):
        x = L * i / n; u = x / L
        if shape == "conical": y = R * u
        elif shape == "ogive":
            rho = (R * R + L * L) / (2 * R); y = math.sqrt(max(rho * rho - (L - x) ** 2, 0)) + R - rho
        elif shape == "vonkarman":
            th = math.acos(max(-1, min(1, 1 - 2 * u))); y = R / math.sqrt(math.pi) * math.sqrt(max(th - math.sin(2 * th) / 2, 0))
        elif shape == "ellipsoid": y = R * math.sqrt(max(1 - (1 - u) ** 2, 0))
        else: y = R * (2 * u - u * u)
        pts.append((x, max(y, 0)))
    return pts


def rocket_svg(r, motor=None, cg=None, cp=None, width=1100):
    """Side view of the rocket at true proportions, with motor, CG and CP marked."""
    Lt = r.length; R = r.radius; f = r.fins
    span_max = R + f.span
    extent = max(Lt + r.motor.overhang, r.fin_le_x + f.sweep + f.tip)  # fins can sweep past the tail
    pad = 30; s = (width - 2 * pad) / extent
    H = max(110, int(2 * span_max * s + 40)); cy = H / 2
    X = lambda x: pad + x * s; Y = lambda y: cy - y * s
    nose = _nose_profile(r.nose.shape, r.nose.length, R)
    top = " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in nose); bot = " ".join(f"{X(x):.1f},{Y(-y):.1f}" for x, y in reversed(nose))
    g = [f"<svg viewBox='0 0 {width} {H}' width='100%' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='Rocket side view'>"]
    g.append(f"<rect x='0' y='0' width='{width}' height='{H}' rx='14' fill='{PANEL}'/>")
    # fins (upper and lower)
    xle = r.fin_le_x
    for sgn in (1, -1):
        pts = [(xle, R), (xle + f.sweep, R + f.span), (xle + f.sweep + f.tip, R + f.span), (xle + f.root, R)]
        g.append("<polygon points='" + " ".join(f"{X(x):.1f},{Y(sgn*y):.1f}" for x, y in pts) + f"' fill='#0f1012' stroke='{DIM}' stroke-width='1'/>")
    # body and nose
    g.append(f"<rect x='{X(r.nose.length):.1f}' y='{Y(R):.1f}' width='{r.body.length*s:.1f}' height='{2*R*s:.1f}' fill='#2b2f34' stroke='{DIM}' stroke-width='1'/>")
    g.append(f"<polygon points='{top} {bot}' fill='#24282c' stroke='{DIM}' stroke-width='1'/>")
    # motor
    if motor is not None:
        mx0 = Lt + r.motor.overhang - motor.length; mr = min(motor.diameter / 2, R * 0.95)
        g.append(f"<rect x='{X(mx0):.1f}' y='{Y(mr):.1f}' width='{motor.length*s:.1f}' height='{2*mr*s:.1f}' fill='none' stroke='{GOLD}' stroke-dasharray='5 4' stroke-width='1.2'/>")
    # CG / CP markers
    def mark(x, label, col, kind):
        cx, yy = X(x), cy
        if kind == "cg":
            g.append(f"<circle cx='{cx:.1f}' cy='{yy:.1f}' r='9' fill='{BG}' stroke='{col}' stroke-width='2'/><path d='M{cx-9:.1f},{yy:.1f} H{cx+9:.1f} M{cx:.1f},{yy-9:.1f} V{yy+9:.1f}' stroke='{col}' stroke-width='2'/>")
        else:
            g.append(f"<circle cx='{cx:.1f}' cy='{yy:.1f}' r='9' fill='{BG}' stroke='{col}' stroke-width='2'/><circle cx='{cx:.1f}' cy='{yy:.1f}' r='3.5' fill='{col}'/>")
    if cg is not None: mark(cg, f"CG {cg*1000:.0f} mm", INK, "cg")
    if cp is not None: mark(cp, f"CP {cp*1000:.0f} mm", "#C77D8E", "cp")
    g.append("</svg>")
    leg = [f"<b>{Lt*1000:.0f} mm</b> long, {2*R*1000:.0f} mm across (true proportions)"]
    if motor is not None: leg.append(f"<span style='color:{GOLD}'>┅</span> motor <b>{motor.designation}</b>")
    if cg is not None: leg.append(f"⊕ CG <b>{cg*1000:.0f} mm</b>")
    if cp is not None: leg.append(f"<span style='color:#C77D8E'>◉</span> CP <b>{cp*1000:.0f} mm</b>")
    return "".join(g) + "<div class='hs-legend'>" + "".join(f"<span>{x}</span>" for x in leg) + "</div>"


def _base(chart):
    return (chart.configure(background=PANEL)
            .configure_view(stroke=None)
            .configure_axis(labelColor=DIM, titleColor=DIM, gridColor=LINE, domainColor=LINE, tickColor=LINE, labelFont=FONT, titleFont=FONT)
            .configure_legend(labelColor=INK, titleColor=DIM, labelFont=FONT, orient="top")
            .configure_title(color=INK, font=FONT_HEAD, fontSize=17, anchor="start"))


def _scale(df):
    present = [e for e in ENGINE_COLORS if e in set(df["engine"])] or list(ENGINE_COLORS)
    return alt.Scale(domain=present, range=[ENGINE_COLORS[e] for e in present]), present


def line_chart(df, x, y, title, rule=None, rule_label=None, height=280):
    eng, present = _scale(df)
    dash = alt.Scale(domain=present, range=[ENGINE_DASH.get(e, [1, 0]) for e in present])
    c = alt.Chart(df).mark_line(strokeWidth=2.2).encode(
        x=alt.X(x, title=x), y=alt.Y(y, title=y), color=alt.Color("engine:N", scale=eng, title=None, legend=alt.Legend(orient="top", symbolType="stroke")),
        strokeDash=alt.StrokeDash("engine:N", scale=dash, title=None, legend=alt.Legend(orient="top", symbolType="stroke")),
        tooltip=["engine", alt.Tooltip(x, format=".2f"), alt.Tooltip(y, format=".3f")])
    layers = [c]
    if rule is not None:
        layers.append(alt.Chart(pd.DataFrame({"v": [rule]})).mark_rule(strokeDash=[5, 5], color=DIM).encode(y="v:Q"))
        layers.append(alt.Chart(pd.DataFrame({"v": [rule], "t": [rule_label or ""]})).mark_text(align="left", dx=4, dy=-8, color=DIM, font=FONT)
                      .encode(y="v:Q", x=alt.value(4), text="t:N"))
    return _base(alt.layer(*layers).properties(title=title, height=height))


def hist(df, field, title, rule=None, rule_label=None, height=260):
    eng, _ = _scale(df)
    c = alt.Chart(df).mark_bar(opacity=0.75, binSpacing=1).encode(
        x=alt.X(f"{field}:Q", bin=alt.Bin(maxbins=40), title=title), y=alt.Y("count():Q", stack=None, title="Flights"),
        color=alt.Color("engine:N", scale=eng, title=None), tooltip=["engine", "count()"])
    layers = [c]
    if rule:
        layers.append(alt.Chart(pd.DataFrame({"v": [rule]})).mark_rule(strokeDash=[5, 5], color=INK, strokeWidth=1.5).encode(x="v:Q"))
        layers.append(alt.Chart(pd.DataFrame({"v": [rule], "t": [rule_label or ""]})).mark_text(align="left", dx=4, y=10, color=INK, font=FONT).encode(x="v:Q", text="t:N"))
    return _base(alt.layer(*layers).properties(title=title, height=height))


def scatter(df, x, y, title, height=320):
    eng, _ = _scale(df)
    c = alt.Chart(df).mark_circle(size=34, opacity=0.65).encode(
        x=alt.X(f"{x}:Q", title=x), y=alt.Y(f"{y}:Q", title=y, scale=alt.Scale(zero=False)),
        color=alt.Color("engine:N", scale=eng, title=None), tooltip=["engine", alt.Tooltip(x, format=".3g"), alt.Tooltip(y, format=".4g")])
    return _base(c.properties(title=title, height=height).interactive())


def stacked_drag(df, title, height=300):
    c = alt.Chart(df).mark_area(opacity=0.85).encode(
        x=alt.X("Mach:Q"), y=alt.Y("Cd:Q", stack="zero", title="Drag coefficient"),
        color=alt.Color("component:N", scale=alt.Scale(range=[GOLD, "#6FA8B8", "#C77D8E", "#8F9398", "#5d6670"]), title=None),
        tooltip=["component", alt.Tooltip("Mach", format=".2f"), alt.Tooltip("Cd", format=".3f")])
    return _base(c.properties(title=title, height=height))
