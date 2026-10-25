"""Rocket and launch description shared by every engine.

All lengths in metres, masses in kilograms, angles in degrees unless noted.
Positions are measured from the nose tip, aft-positive.
"""
from __future__ import annotations
import copy, math
from dataclasses import dataclass, field, asdict
from typing import List, Optional
import yaml

MATERIALS = {
    # name: (density kg/m^3, shear modulus Pa or None)
    "fiberglass": (1850.0, 3.5e9), "carbon": (1550.0, 4.5e9), "carbon_sheet": (1470.0, 4.5e9),
    "g10": (1850.0, 3.0e9), "plywood": (630.0, 0.6e9), "balsa": (160.0, 0.1e9),
    "aluminium": (2700.0, 26e9), "phenolic": (950.0, 1.0e9), "cardboard": (680.0, None),
    "pla": (1240.0, 1.2e9), "petg": (1270.0, 0.8e9), "abs": (1050.0, 0.8e9), "nylon": (1150.0, 0.4e9),
}
FINISH_ROUGHNESS = {"rough": 250e-6, "unfinished": 120e-6, "normal": 60e-6, "smooth": 20e-6, "polished": 2e-6}
NOSE_SHAPES = ("conical", "ogive", "vonkarman", "ellipsoid", "parabolic")


@dataclass
class Nose:
    shape: str = "conical"
    length: float = 0.157
    thickness: float = 0.0015
    shoulder_length: float = 0.03
    material: str = "fiberglass"
    mass: Optional[float] = None          # override


@dataclass
class Body:
    length: float = 0.710
    outer_diameter: float = 0.032
    inner_diameter: float = 0.0291
    material: str = "fiberglass"
    mass: Optional[float] = None


@dataclass
class Fins:
    count: int = 3
    root: float = 0.060
    tip: float = 0.014
    span: float = 0.031
    sweep: float = 0.046                   # leading-edge sweep distance
    thickness: float = 0.0028
    material: str = "carbon_sheet"
    edge: str = "airfoil"                  # square | rounded | airfoil
    offset_from_aft: float = 0.0           # 0 = trailing edge flush with the tail
    mass: Optional[float] = None


@dataclass
class MotorRef:
    designation: str = "381I224-15A"
    file: Optional[str] = None             # path to a .eng file; overrides designation
    overhang: float = 0.0                  # how far the nozzle sticks out of the tail


@dataclass
class Recovery:
    chute_diameter: float = 0.45
    chute_cd: float = 0.8
    chute_mass: Optional[float] = None
    deploy: str = "apogee"                 # apogee | delay
    deploy_delay: float = 0.0              # s after apogee (or after burnout for 'delay')


@dataclass
class MassItem:
    name: str
    mass: float
    position: float                        # CG position from nose tip


@dataclass
class Launch:
    rail_length: float = 3.0
    rail_angle: float = 0.0                # from vertical
    rail_heading: float = 270.0            # direction the rail leans towards (deg from north)
    site_elevation: float = 50.0
    temperature_c: float = 15.0
    pressure_hpa: float = 1013.25
    wind_speed: float = 0.0                # at ground, m/s
    wind_from: float = 270.0               # meteorological direction, deg
    wind_aloft_factor: float = 1.0         # wind at 2 km = factor x ground wind
    turbulence: float = 0.0                # 0..0.3


@dataclass
class Rocket:
    name: str = "Unnamed rocket"
    nose: Nose = field(default_factory=Nose)
    body: Body = field(default_factory=Body)
    fins: Fins = field(default_factory=Fins)
    motor: MotorRef = field(default_factory=MotorRef)
    recovery: Recovery = field(default_factory=Recovery)
    masses: List[MassItem] = field(default_factory=list)
    finish: str = "smooth"
    launch: Launch = field(default_factory=Launch)

    # ------------------------------------------------------------ geometry helpers
    @property
    def radius(self): return self.body.outer_diameter / 2
    @property
    def ref_area(self): return math.pi * self.radius ** 2
    @property
    def length(self): return self.nose.length + self.body.length
    @property
    def fin_le_x(self):  # leading edge of the fin root, from nose tip
        return self.length - self.fins.offset_from_aft - self.fins.root

    def copy(self) -> "Rocket": return copy.deepcopy(self)

    # ------------------------------------------------------------ dry mass model
    def component_masses(self):
        """Return list of (name, mass, cg_x) for the dry rocket (no motor)."""
        out = []
        n, b, f, r = self.nose, self.body, self.fins, self.recovery
        rho = lambda m: MATERIALS.get(m, (1500.0, None))[0]
        # nose: thin shell of revolution, approximated as a cone surface, plus shoulder
        slant = math.hypot(n.length, self.radius)
        shell = math.pi * self.radius * slant * n.thickness * rho(n.material)
        shoulder = math.pi * b.inner_diameter * n.shoulder_length * n.thickness * rho(n.material)
        m_nose = n.mass if n.mass is not None else shell + shoulder
        cg_nose = {"conical": 0.667, "ogive": 0.6, "vonkarman": 0.62, "ellipsoid": 0.55, "parabolic": 0.58}.get(n.shape, 0.65) * n.length
        out.append(("nose", m_nose, cg_nose))
        m_body = b.mass if b.mass is not None else math.pi / 4 * (b.outer_diameter ** 2 - b.inner_diameter ** 2) * b.length * rho(b.material)
        out.append(("body tube", m_body, n.length + b.length / 2))
        area = (f.root + f.tip) / 2 * f.span
        m_fins = f.mass if f.mass is not None else area * f.thickness * rho(f.material) * f.count
        # chordwise centroid of a trapezoid
        cx = (f.root ** 2 + f.root * f.tip + f.tip ** 2 + f.sweep * (f.root + 2 * f.tip)) / (3 * (f.root + f.tip))
        out.append(("fins", m_fins, self.fin_le_x + cx))
        canopy = math.pi * (r.chute_diameter / 2) ** 2
        m_chute = r.chute_mass if r.chute_mass is not None else canopy * 0.06 + 0.003
        out.append(("parachute", m_chute, n.length + 0.25 * b.length))
        for it in self.masses:
            out.append((it.name, it.mass, it.position))
        return out

    def dry_mass(self):
        return sum(m for _, m, _ in self.component_masses())

    def dry_cg(self):
        c = self.component_masses(); m = sum(x[1] for x in c)
        return sum(x[1] * x[2] for x in c) / m

    def dry_inertia(self):
        """Longitudinal moment of inertia about the dry CG (slender-rod approximation)."""
        cg = self.dry_cg(); I = 0.0
        for name, m, x in self.component_masses():
            L = {"body tube": self.body.length, "nose": self.nose.length}.get(name, 0.05)
            I += m * (L ** 2 / 12 + (x - cg) ** 2)
        return I

    # ------------------------------------------------------------ io
    def to_dict(self): return asdict(self)

    @classmethod
    def from_dict(cls, d):
        d = dict(d or {})
        r = cls(name=d.get("name", "Unnamed rocket"), finish=d.get("finish", "smooth"))
        for key, typ in (("nose", Nose), ("body", Body), ("fins", Fins), ("motor", MotorRef), ("recovery", Recovery), ("launch", Launch)):
            if key in d and d[key] is not None:
                setattr(r, key, typ(**d[key]))
        r.masses = [MassItem(**m) for m in d.get("masses", [])]
        return r

    @classmethod
    def load(cls, path):
        with open(path) as fh:
            return cls.from_dict(yaml.safe_load(fh))

    def save(self, path):
        with open(path, "w") as fh:
            yaml.safe_dump(self.to_dict(), fh, sort_keys=False)
