"""Motors, atmosphere and the independent aerodynamic model used by the built-in engine.

The aero model is a component build-up written from textbook methods, deliberately
separate from OpenRocket's code so the ensemble has two independent drag estimates:
  * normal force and centre of pressure: Barrowman (subsonic), Ackeret-style fin lift
    and a mean-aerodynamic-chord centre of pressure when supersonic;
  * drag: turbulent skin friction with roughness and compressibility corrections,
    nose pressure drag, fin leading-edge and supersonic wave drag, base drag.
"""
from __future__ import annotations
import glob, math, os
import numpy as np
from .spec import FINISH_ROUGHNESS

DATA = os.path.join(os.path.dirname(__file__), "data")
G0 = 9.80665; R_AIR = 287.05; GAMMA = 1.4


# ------------------------------------------------------------------ motors
class Motor:
    def __init__(self, designation, diameter, length, delays, prop_mass, total_mass, maker, t, F):
        self.designation, self.diameter, self.length = designation, diameter, length
        self.delays, self.prop_mass, self.total_mass, self.maker = delays, prop_mass, total_mass, maker
        self.t = np.asarray(t, float); self.F = np.asarray(F, float)
        self.burn_time = float(self.t[-1])
        self.impulse = float(np.trapezoid(self.F, self.t)) if hasattr(np, "trapezoid") else float(np.trapz(self.F, self.t))
        cum = np.concatenate([[0.0], np.cumsum(0.5 * (self.F[1:] + self.F[:-1]) * np.diff(self.t))])
        self._burned = cum / max(cum[-1], 1e-9)

    @property
    def dry_mass(self): return self.total_mass - self.prop_mass

    def thrust(self, t, scale=1.0, time_scale=1.0):
        tt = t / time_scale
        if tt <= 0 or tt >= self.burn_time: return 0.0
        return scale * float(np.interp(tt, self.t, self.F))

    def mass(self, t, time_scale=1.0):
        tt = t / time_scale
        if tt <= 0: return self.total_mass
        if tt >= self.burn_time: return self.dry_mass
        return self.total_mass - self.prop_mass * float(np.interp(tt, self.t, self._burned))

    @classmethod
    def from_eng(cls, path):
        rows = [l.strip() for l in open(path) if l.strip() and not l.strip().startswith(";")]
        h = rows[0].split()
        t, F = [0.0], [0.0]
        for l in rows[1:]:
            a = l.split()
            if len(a) >= 2:
                try: t.append(float(a[0])); F.append(float(a[1]))
                except ValueError: pass
        # keep time strictly increasing (some files repeat t=0 with a non-zero thrust)
        tt, FF = [], []
        for a_, b_ in zip(t, F):
            if tt and a_ <= tt[-1]:
                if a_ == tt[-1]: FF[-1] = max(FF[-1], b_)
                continue
            tt.append(a_); FF.append(b_)
        if FF[0] > 0: tt.insert(0, 0.0); FF.insert(0, 0.0); tt[1] = max(tt[1], 1e-4)
        mot = cls(h[0], float(h[1]) / 1000, float(h[2]) / 1000, h[3], float(h[4]), float(h[5]), h[6] if len(h) > 6 else "", tt, FF)
        mot.path = path
        return mot


def find_motor(designation=None, file=None, extra_dirs=()):
    if file: return Motor.from_eng(file)
    dirs = [os.path.join(DATA, "motors"), *extra_dirs]
    for d in dirs:
        for p in glob.glob(os.path.join(d, "*.eng")):
            if designation and designation.lower() in os.path.basename(p).lower(): return Motor.from_eng(p)
    raise FileNotFoundError(f"No .eng file found for motor '{designation}'. Put one in {dirs[0]} or pass motor.file.")


def list_motors():
    return sorted(os.path.basename(p)[:-4].replace("CTI_", "") for p in glob.glob(os.path.join(DATA, "motors", "*.eng")))


# ------------------------------------------------------------------ atmosphere
def atmosphere(h_asl, t0_c=15.0, p0_hpa=1013.25, site_elev=0.0):
    """ISA lapse from the site's measured temperature and pressure. Returns rho, a, T, p, mu."""
    T0 = 273.15 + t0_c; p0 = p0_hpa * 100; dh = max(h_asl - site_elev, -500.0)
    T = max(T0 - 0.0065 * dh, 180.0)
    p = p0 * (T / T0) ** 5.2559
    rho = p / (R_AIR * T); a = math.sqrt(GAMMA * R_AIR * T)
    mu = 1.458e-6 * T ** 1.5 / (T + 110.4)
    return rho, a, T, p, mu


# ------------------------------------------------------------------ aerodynamics
class Aero:
    def __init__(self, rocket):
        self.r = rocket
        f = rocket.fins
        self.d = rocket.body.outer_diameter; self.rad = self.d / 2; self.Aref = rocket.ref_area
        self.S_fin = (f.root + f.tip) / 2 * f.span
        self.mac = 2 / 3 * (f.root + f.tip - f.root * f.tip / (f.root + f.tip))
        self.y_mac = f.span / 3 * (f.root + 2 * f.tip) / (f.root + f.tip)
        self.x_mac_le = f.sweep * self.y_mac / f.span
        lm = math.hypot(f.span, f.sweep + f.tip / 2 - f.root / 2)
        self.cos_mid = f.span / lm
        self.AR = 2 * f.span ** 2 / (2 * self.S_fin)    # two-panel aspect ratio
        self.K_int = 1 + self.rad / (f.span + self.rad)
        self.nose_half_angle = math.atan(self.rad / rocket.nose.length)

    # --- normal force slope (per rad) and centre of pressure (from nose tip)
    def cna_cp(self, M):
        r, f = self.r, self.r.fins
        cna_nose = 2.0
        xcp_nose = {"conical": 0.667, "ogive": 0.466, "vonkarman": 0.5, "ellipsoid": 0.333, "parabolic": 0.5}.get(r.nose.shape, 0.6) * r.nose.length
        lm = math.hypot(f.span, f.sweep + f.tip / 2 - f.root / 2)
        barrowman = 4 * f.count * (f.span / self.d) ** 2 / (1 + math.sqrt(1 + (2 * lm / (f.root + f.tip)) ** 2))
        per_area = self.S_fin / self.Aref * (f.count / 2)
        def sub(Mx):
            b = math.sqrt(max(1 - Mx * Mx, 0.05))
            return barrowman / b ** 0.5           # mild Prandtl-Glauert growth for low aspect ratio
        def sup(Mx):
            b = math.sqrt(Mx * Mx - 1); arb = self.AR * b
            return 4 / b * (1 - 1 / (2 * arb) if arb > 1 else 0.5 * arb) * per_area
        sstep = lambda a, b, x: 0.0 if x <= a else 1.0 if x >= b else (lambda u: u * u * (3 - 2 * u))((x - a) / (b - a))
        wf = sstep(0.8, 1.3, M)
        fin = (1 - wf) * sub(min(M, 0.8)) + wf * sup(max(M, 1.3))
        cna_fins = fin * self.K_int; c2d = fin
        x_le = r.fin_le_x
        sub = x_le + f.sweep * (f.root + 2 * f.tip) / (3 * (f.root + f.tip)) + (f.root + f.tip - f.root * f.tip / (f.root + f.tip)) / 6
        sup = x_le + self.x_mac_le + 0.5 * self.mac
        w = sstep(0.8, 1.5, M)
        xcp_fins = sub + (sup - sub) * w
        cna = cna_nose + cna_fins
        xcp = (cna_nose * xcp_nose + cna_fins * xcp_fins) / cna
        return cna, xcp, c2d

    def stability(self, M, cg):
        _, xcp, _ = self.cna_cp(M)
        return (xcp - cg) / self.d

    # --- drag coefficient (referenced to body frontal area)
    def cd(self, M, rho, v, mu, motor_on=False, drag_scale=1.0):
        r, f = self.r, self.r.fins
        L = r.length
        Re = max(rho * max(v, 1.0) * L / mu, 1e4)
        k = FINISH_ROUGHNESS.get(r.finish, 60e-6)
        cf_smooth = 1 / (1.50 * math.log(Re) - 5.6) ** 2
        cf_rough = 0.032 * (k / L) ** 0.2
        cf = max(cf_smooth, cf_rough)
        cf *= (1 + 0.15 * M * M) ** -0.58 if M < 1 else (1 + 0.18 * M * M) ** -0.467
        s_nose = math.pi * self.rad * math.hypot(r.nose.length, self.rad) * {"conical": 1.0, "ogive": 1.07, "vonkarman": 1.06}.get(r.nose.shape, 1.04)
        s_body = math.pi * self.d * r.body.length
        s_fins = 2 * self.S_fin * f.count
        fineness = L / self.d
        cd_fric = cf * ((s_nose + s_body) * (1 + 1 / (2 * fineness)) + s_fins * (1 + 2 * f.thickness / f.root)) / self.Aref
        # nose pressure drag
        th = self.nose_half_angle
        shape_k = {"conical": 1.0, "ogive": 0.7, "vonkarman": 0.55, "ellipsoid": 0.9, "parabolic": 0.6}.get(r.nose.shape, 0.8)
        if M < 0.8: cd_nose = 0.0
        elif M < 1.2:
            sup = (2.1 * math.sin(th) ** 2 + 0.5 * math.sin(th) / math.sqrt(1.2 ** 2 - 1))
            cd_nose = sup * ((M - 0.8) / 0.4) ** 1.5
        else:
            cd_nose = 2.1 * math.sin(th) ** 2 + 0.5 * math.sin(th) / math.sqrt(M * M - 1)
        cd_nose *= shape_k
        # fin leading-edge / wave drag, on the fins' frontal area
        a_front = f.count * f.thickness * f.span / self.Aref
        tc = f.thickness / f.root
        if f.edge == "square":
            le = 0.85 * (1 + M * M / 4) if M < 1 else 1.214 - 0.502 / M ** 2 + 0.1095 / M ** 4
            cd_fin = le * a_front + 0.25 * a_front
        else:
            le_sub = 0.12 if f.edge == "rounded" else 0.04
            if M < 0.9: cd_fin = le_sub * (1 + M * M / 4) * a_front
            else:
                wave = 4 * tc ** 2 / math.sqrt(max(M * M - 1, 0.09)) * (2 if f.edge == "rounded" else 1.3)
                cd_fin = (le_sub * a_front) + wave * f.count * self.S_fin / self.Aref * min(1.0, (M - 0.9) / 0.3)
        # base drag
        if M < 1: cd_base = 0.12 + 0.13 * M * M
        else: cd_base = 0.25 / M
        if motor_on: cd_base *= 0.5
        # transonic hump for the body
        hump = 0.08 * math.exp(-((M - 1.02) / 0.12) ** 2)
        total = cd_fric + cd_nose + cd_fin + cd_base + hump + 0.01  # small parasitic allowance
        return drag_scale * total, dict(friction=cd_fric, nose=cd_nose, fins=cd_fin, base=cd_base, transonic=hump)

    def cd_table(self, machs=None, rho=1.2, mu=1.8e-5, a=340.0, motor_on=False):
        machs = machs if machs is not None else [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.5]
        return [(m, self.cd(m, rho, m * a, mu, motor_on)[0]) for m in machs]


def fin_flutter_margin(rocket, v, p, a):
    """NACA TN 4197 flutter-velocity estimate over flight speed (a speed ratio)."""
    from .spec import MATERIALS
    f = rocket.fins
    G = MATERIALS.get(f.material, (0, 4e9))[1] or 4e9
    S = (f.root + f.tip) / 2 * f.span; AR = f.span ** 2 / S; lam = f.tip / f.root; tc = f.thickness / f.root
    if f.edge == "airfoil": tc *= 0.85
    den = 1.337 * AR ** 3 * p * (lam + 1) / (2 * (AR + 2) * tc ** 3)
    return a * math.sqrt(G / den) / max(v, 1.0)
