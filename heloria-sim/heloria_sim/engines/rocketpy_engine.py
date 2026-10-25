"""RocketPy engine: 6-DOF trajectory with RocketPy's own stability (Barrowman) and dynamics.

RocketPy needs a drag curve as input. By default it takes the built-in model's curve, so its
contribution to the ensemble is independent dynamics and stability rather than independent drag.
"""
from __future__ import annotations
import math, warnings
import numpy as np
from ..physics import Aero, find_motor, atmosphere
from .result import FlightResult

NAME = "rocketpy"
NOSE_KIND = {"conical": "conical", "ogive": "ogive", "vonkarman": "von karman", "ellipsoid": "elliptical", "parabolic": "parabolic"}


def available():
    try:
        import rocketpy  # noqa
        return True
    except Exception:
        return False


def run(rocket, thrust_scale=1.0, drag_scale=1.0, time_scale=1.0, extra_mass=0.0, seed=None, drag_table=None):
    warnings.filterwarnings("ignore")
    from rocketpy import Environment, Rocket as RPRocket, Flight, GenericMotor
    L = rocket.launch
    m = find_motor(rocket.motor.designation, rocket.motor.file)
    aero = Aero(rocket)
    rho, a, T, p, mu = atmosphere(L.site_elevation, L.temperature_c, L.pressure_hpa, L.site_elevation)
    if drag_table is None:
        machs = [0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.5, 3.0]
        off = [[M, aero.cd(M, rho, max(M, 0.01) * a, mu, False)[0] * drag_scale] for M in machs]
        on = [[M, aero.cd(M, rho, max(M, 0.01) * a, mu, True)[0] * drag_scale] for M in machs]
    else:
        off = [[M, c * drag_scale] for M, c in drag_table["off"]]; on = [[M, c * drag_scale] for M, c in drag_table["on"]]
    # RocketPy treats a curve that starts at zero thrust as 'not lifting off' and can end the flight at once,
    # so start the curve at the first real thrust value
    weight = (rocket.dry_mass() + extra_mass + m.total_mass) * 9.80665
    pts = [(float(t), float(F)) for t, F in zip(m.t, m.F) if t > 0]
    k = next((i for i, (_, F) in enumerate(pts) if F * thrust_scale > 1.05 * weight), 0)
    t0 = pts[k][0]  # skip the igniter ramp below lift-off thrust (well under 1% of the impulse)
    thrust = [[(t - t0) * time_scale, F * thrust_scale] for t, F in pts[k:]]
    thrust[0][0] = 0.0
    mot = GenericMotor(thrust_source=thrust, burn_time=thrust[-1][0], chamber_radius=m.diameter * 0.45,
                       chamber_height=m.length * 0.95, chamber_position=m.length / 2, propellant_initial_mass=m.prop_mass,
                       nozzle_radius=m.diameter * 0.2, dry_mass=m.dry_mass, center_of_dry_mass_position=m.length / 2,
                       dry_inertia=(m.dry_mass * m.length ** 2 / 12, m.dry_mass * m.length ** 2 / 12, m.dry_mass * (m.diameter / 2) ** 2 / 2),
                       nozzle_position=0.0, coordinate_system_orientation="nozzle_to_combustion_chamber")
    dry = rocket.dry_mass() + extra_mass
    I = rocket.dry_inertia() + extra_mass * 0.01
    rk = RPRocket(radius=rocket.radius, mass=dry, inertia=(I, I, dry * rocket.radius ** 2 / 2), power_off_drag=off, power_on_drag=on,
                  center_of_mass_without_motor=rocket.dry_cg(), coordinate_system_orientation="nose_to_tail")
    rk.add_motor(mot, position=rocket.length + rocket.motor.overhang)
    try:
        rk.add_nose(length=rocket.nose.length, kind=NOSE_KIND.get(rocket.nose.shape, "conical"), position=0.0)
    except Exception:
        rk.add_nose(length=rocket.nose.length, kind="conical", position=0.0)
    f = rocket.fins
    rk.add_trapezoidal_fins(n=f.count, root_chord=f.root, tip_chord=f.tip, span=f.span, position=rocket.fin_le_x, sweep_length=f.sweep, cant_angle=0.0)
    rk.set_rail_buttons(upper_button_position=rocket.length - 0.31, lower_button_position=rocket.length - 0.025, angular_position=45)
    rc = rocket.recovery
    rk.add_parachute("main", cd_s=rc.chute_cd * math.pi * (rc.chute_diameter / 2) ** 2, trigger="apogee", sampling_rate=100, lag=rc.deploy_delay)
    env = Environment(latitude=54.3, longitude=-5.6, elevation=L.site_elevation)
    T0 = 273.15 + L.temperature_c
    toward = math.radians((L.wind_from + 180) % 360)
    prof = [(0, 1.0), (300, 1 + (L.wind_aloft_factor - 1) * 0.15), (1000, 1 + (L.wind_aloft_factor - 1) * 0.5), (2000, L.wind_aloft_factor), (4000, L.wind_aloft_factor * 1.1)]
    env.set_atmospheric_model(type="custom_atmosphere", pressure=None, temperature=[(L.site_elevation, T0), (L.site_elevation + 11000, T0 - 71.5)],
                              wind_u=[(h + L.site_elevation, L.wind_speed * k * math.sin(toward)) for h, k in prof],
                              wind_v=[(h + L.site_elevation, L.wind_speed * k * math.cos(toward)) for h, k in prof])
    fl = Flight(rocket=rk, environment=env, rail_length=L.rail_length, inclination=90 - L.rail_angle, heading=L.rail_heading,
                max_time=1500, terminate_on_apogee=False, verbose=False)
    sol = np.array(fl.solution)
    t, x, y, z = sol[:, 0], sol[:, 1], sol[:, 2], sol[:, 3] - L.site_elevation
    vx, vy, vz = sol[:, 4], sol[:, 5], sol[:, 6]
    speed = np.sqrt(vx ** 2 + vy ** 2 + vz ** 2)
    mach = np.array([s / env.speed_of_sound(zz + L.site_elevation) for s, zz in zip(speed, z)])
    acc = np.gradient(speed, t, edge_order=1)
    rec = dict(t=t, x=x, y=y, alt=z, vz=vz, speed=speed, mach=mach, accel=np.abs(acc) + 0 * t)
    res = FlightResult.from_series(NAME, rec, rail_exit_speed=fl.out_of_rail_velocity, stability_off_rail=fl.out_of_rail_stability_margin,
                                   flutter_margin=None, dry_mass=dry, liftoff_mass=dry + m.total_mass)
    res.summary["max_accel_g"] = float(fl.max_acceleration) / 9.80665
    res.summary["landing_speed"] = float(abs(fl.impact_velocity))
    res.summary["drift"] = float(math.hypot(fl.x_impact, fl.y_impact))
    return res
