import os
from heloria_sim import Rocket
from heloria_sim.engines import helix
from heloria_sim.catalog import build
from heloria_sim.analysis import run_monte_carlo

EX = os.path.join(os.path.dirname(__file__), "..", "examples", "heloria_v8.yaml")


def test_v8_helix_is_supersonic():
    s = helix.run(Rocket.load(EX)).summary
    assert 1.3 < s["max_mach"] < 1.7
    assert 2000 < s["apogee"] < 4000
    assert s["stability_off_rail"] > 1.5


def test_simple_mode_build():
    r = build("blackhawk29_710", "v8_swept", "381I224-15A", "c45", "dual_tracker")
    assert 0.25 < r.dry_mass() < 0.45


def test_monte_carlo_rows():
    rows = run_monte_carlo(Rocket.load(EX), n=5, engines=["helix"], workers=1)
    assert len(rows) == 5 and all("max_mach" in r for r in rows)


def test_motor_files_match_their_names():
    """The number at the start of a CTI designation is the total impulse in Ns."""
    import re
    from heloria_sim.physics import list_motors, find_motor
    for m in list_motors():
        named = float(re.match(r"(\d+)", m).group(1))
        assert abs(find_motor(m).impulse - named) / named < 0.05, m


def test_rocketpy_lifts_off_with_every_motor():
    from heloria_sim.engines import rocketpy_engine as rpe
    from heloria_sim.physics import list_motors
    if not rpe.available(): return
    r = Rocket.load(EX)
    for m in list_motors():
        r.motor.designation = m
        assert rpe.run(r).summary["apogee"] > 100, m
