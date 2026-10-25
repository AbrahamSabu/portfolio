"""Simulation engines. Each exposes NAME, available() and run(rocket, ...) -> FlightResult."""
from . import helix, rocketpy_engine, openrocket_engine

helix.available = lambda: True
ENGINES = {"helix": helix, "rocketpy": rocketpy_engine, "openrocket": openrocket_engine}
# what each engine can vary in a Monte Carlo run
SUPPORTS = {
    "helix": {"thrust_scale", "drag_scale", "time_scale", "extra_mass"},
    "rocketpy": {"thrust_scale", "drag_scale", "time_scale", "extra_mass"},
    "openrocket": {"extra_mass"},
}
DESCRIPTIONS = {
    "helix": "Built-in 3-DOF, independent textbook aerodynamics (fast)",
    "rocketpy": "RocketPy 6-DOF dynamics and stability, drag from the built-in model",
    "openrocket": "OpenRocket 6-DOF with its own aerodynamics (needs Java + OpenRocket jar)",
}


def available_engines():
    return [n for n, e in ENGINES.items() if e.available()]
