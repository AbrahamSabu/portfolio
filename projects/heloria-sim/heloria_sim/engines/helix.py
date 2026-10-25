"""Built-in engine: 3-DOF point-mass trajectory with the independent aero model.

The airframe follows the air-relative velocity with a short first-order lag (weathercocking),
so angle of attack is not modelled; stability is reported as static margin.
"""
from __future__ import annotations
import math
import numpy as np
from ..physics import Aero, atmosphere, find_motor, fin_flutter_margin, G0
from .result import FlightResult

NAME = "helix"


def wind_vec(launch, h_agl):
    w = launch.wind_speed * (1 + (launch.wind_aloft_factor - 1) * min(max(h_agl, 0) / 2000.0, 1.5))
    toward = math.radians((launch.wind_from + 180) % 360)
    return np.array([w * math.sin(toward), w * math.cos(toward), 0.0])


def run(rocket, thrust_scale=1.0, drag_scale=1.0, time_scale=1.0, extra_mass=0.0, seed=None, dt=0.005):
    L = rocket.launch
    motor = find_motor(rocket.motor.designation, rocket.motor.file)
    aero = Aero(rocket)
    rng = np.random.default_rng(seed)
    m_dry = rocket.dry_mass() + extra_mass
    cg_dry = rocket.dry_cg()
    x_motor = rocket.length + rocket.motor.overhang - motor.length / 2
    tilt = math.radians(L.rail_angle); hd = math.radians(L.rail_heading)
    rail_dir = np.array([math.sin(tilt) * math.sin(hd), math.sin(tilt) * math.cos(hd), math.cos(tilt)])
    pos = np.zeros(3); vel = np.zeros(3); axis = rail_dir.copy()
    t = 0.0; chute = False; t_apo = None; deploy_t = None
    rec = {k: [] for k in ("t", "x", "y", "alt", "vz", "speed", "mach", "accel", "thrust", "drag", "cd", "mass", "stability")}
    off_rail_v = None; off_rail_stab = None; max_q = 0.0; flutter_min = 1e9
    gust = 0.0
    while t < 1500:
        h_agl = pos[2]
        rho, a, T, p, mu = atmosphere(L.site_elevation + h_agl, L.temperature_c, L.pressure_hpa, L.site_elevation)
        w = wind_vec(L, h_agl)
        if L.turbulence > 0:
            gust += (-gust / 1.0 + L.turbulence * np.linalg.norm(w) * rng.normal() * 1.4) * dt
            w = w * (1 + gust / max(np.linalg.norm(w), 0.1)) if np.linalg.norm(w) > 0 else w
        v_rel = vel - w; s_rel = float(np.linalg.norm(v_rel)); M = s_rel / a
        mm = motor.mass(t, time_scale)
        m = m_dry + mm
        cg = (m_dry * cg_dry + mm * x_motor) / m
        F = motor.thrust(t, thrust_scale, time_scale)
        on_rail = np.dot(pos, rail_dir) < L.rail_length and t_apo is None and not chute
        if chute:
            cd_area = rocket.recovery.chute_cd * math.pi * (rocket.recovery.chute_diameter / 2) ** 2 + 0.6 * aero.Aref
            Fd = -0.5 * rho * s_rel * v_rel * cd_area; cdv = 0.0
        else:
            cdv, _ = aero.cd(M, rho, s_rel, mu, motor_on=F > 0, drag_scale=drag_scale)
            Fd = -0.5 * rho * s_rel * v_rel * cdv * aero.Aref
        acc = (F * axis + Fd) / m + np.array([0, 0, -G0])
        if on_rail:
            acc = max(np.dot(acc, rail_dir), 0.0) * rail_dir if F > 0 or np.dot(vel, rail_dir) > 0 else np.zeros(3)
        vel = vel + acc * dt; pos = pos + vel * dt
        if not on_rail and not chute and s_rel > 1:
            tau = 0.04
            axis = axis + (v_rel / s_rel - axis) * min(1.0, dt / tau); axis /= np.linalg.norm(axis)
        if off_rail_v is None and not on_rail and t > 0.01:
            off_rail_v = float(np.linalg.norm(vel)); off_rail_stab = aero.stability(M, cg)
        q = 0.5 * rho * s_rel ** 2; max_q = max(max_q, q)
        if not chute and M > 0.3: flutter_min = min(flutter_min, fin_flutter_margin(rocket, s_rel, p, a))
        if t_apo is None and t > motor.burn_time * time_scale and vel[2] <= 0:
            t_apo = t
            deploy_t = t + rocket.recovery.deploy_delay
        if not chute and deploy_t is not None and t >= deploy_t: chute = True
        if len(rec["t"]) == 0 or t - rec["t"][-1] >= (0.02 if t < 30 else 0.25):
            rec["t"].append(t); rec["x"].append(pos[0]); rec["y"].append(pos[1]); rec["alt"].append(pos[2])
            rec["vz"].append(vel[2]); rec["speed"].append(float(np.linalg.norm(vel))); rec["mach"].append(M)
            rec["accel"].append(float(np.linalg.norm(acc + np.array([0, 0, G0])))); rec["thrust"].append(F)
            rec["drag"].append(float(np.linalg.norm(Fd))); rec["cd"].append(cdv); rec["mass"].append(m)
            rec["stability"].append(aero.stability(M, cg) if not chute else float("nan"))
        if t > 1 and pos[2] < 0: break
        t += dt if not chute else 0.05
        if chute: dt = 0.05
    return FlightResult.from_series(NAME, rec, rail_exit_speed=off_rail_v, stability_off_rail=off_rail_stab,
                                    max_q=max_q, flutter_margin=flutter_min if flutter_min < 1e8 else None,
                                    dry_mass=m_dry, liftoff_mass=m_dry + motor.total_mass)
