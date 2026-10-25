"""Simple mode: build a rocket by picking parts from data/catalog.yaml."""
import os, yaml
from .spec import Rocket, Nose, Body, Fins, MotorRef, Recovery, MassItem, Launch
from .physics import find_motor, list_motors

PATH = os.path.join(os.path.dirname(__file__), "data", "catalog.yaml")


def load_catalog(path=PATH):
    with open(path) as fh: return yaml.safe_load(fh)


def build(airframe, fins, motor, chute, electronics, finish="smooth", site="coast", catalog=None, **launch):
    cat = catalog or load_catalog()
    pick = lambda group, id_: next(x for x in cat[group] if x["id"] == id_)
    a, f, c, e, s = pick("airframes", airframe), pick("fins", fins), pick("chutes", chute), pick("electronics", electronics), pick("sites", site)
    r = Rocket(name=f"{a['name']} / {motor}")
    r.nose = Nose(**a["nose"]); r.body = Body(**a["body"]); r.fins = Fins(**f["fins"])
    r.motor = MotorRef(designation=motor); r.recovery = Recovery(chute_diameter=c["diameter"]); r.finish = finish
    L = r.length
    for m in e["masses"] + cat.get("extras", []):
        r.masses.append(MassItem(name=m["name"], mass=m["mass"], position=m["position_frac"] * L))
    mot = find_motor(motor)
    if mot.length > r.body.length - 0.2:
        raise ValueError(f"{motor} ({mot.length*1000:.0f} mm) is too long for a {r.body.length*1000:.0f} mm tube")
    r.launch = Launch(site_elevation=s["site_elevation"], **launch)
    return r
