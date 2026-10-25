"""OpenRocket engine (6-DOF, OpenRocket's own aerodynamics).

Needs Java 17+ and the OpenRocket jar (24.12 or newer). Point HELORIA_OR_JAR at the jar, or pass
jar=... to start(). OpenRocket is GPLv3; it is called at run time, not bundled.
"""
from __future__ import annotations
import math, os, time
from ..physics import find_motor
from .result import FlightResult

NAME = "openrocket"
_JVM = {"ok": False}


OR_VERSION = "24.12"
OR_URL = f"https://github.com/openrocket/openrocket/releases/download/release-{OR_VERSION}/OpenRocket-{OR_VERSION}.jar"
CACHE_JAR = os.path.join(os.path.expanduser("~"), ".cache", "heloria-sim", f"OpenRocket-{OR_VERSION}.jar")


def jar_path(jar=None):
    cands = [jar, os.environ.get("HELORIA_OR_JAR"), "OpenRocket.jar", os.path.expanduser("~/OpenRocket.jar"), CACHE_JAR]
    return next((p for p in cands if p and os.path.exists(p)), None)


def java_available():
    import shutil
    return shutil.which("java") is not None


def jpype_available():
    try:
        import jpype  # noqa
        return True
    except Exception:
        return False


def available(jar=None):
    return jpype_available() and java_available() and jar_path(jar) is not None


def download_jar(progress=None):
    """Fetch the official OpenRocket jar from GitHub into ~/.cache/heloria-sim (about 80 MB, once)."""
    import urllib.request
    os.makedirs(os.path.dirname(CACHE_JAR), exist_ok=True)
    tmp = CACHE_JAR + ".part"
    with urllib.request.urlopen(OR_URL) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0)); done = 0
        while True:
            chunk = resp.read(1 << 20)
            if not chunk: break
            out.write(chunk); done += len(chunk)
            if progress and total: progress(done / total)
    os.replace(tmp, CACHE_JAR)
    return CACHE_JAR


def start(jar=None):
    if _JVM["ok"]: return
    import jpype, jpype.imports  # noqa
    if not jpype.isJVMStarted():
        jpype.startJVM(classpath=[jar_path(jar)], convertStrings=True, *["-Djava.awt.headless=true"])
    from info.openrocket.core.startup import Application
    from info.openrocket.core.plugin import PluginModule
    from info.openrocket.swing.startup import GuiModule
    from com.google.inject import Guice
    gm = GuiModule(); inj = Guice.createInjector(gm, PluginModule()); Application.setInjector(inj); gm.startLoader()
    for _ in range(60):  # the motor database loads in the background; asking too early raises HeadlessException
        time.sleep(0.5)
        try:
            if Application.getMotorSetDatabase().getMotorSets().size() > 100: break
        except Exception:
            continue
    _JVM["ok"] = True


def _load_eng(path):
    from info.openrocket.core.file.motor import GeneralMotorLoader
    import java.io as jio
    stream = jio.FileInputStream(path)
    motors = GeneralMotorLoader().load(stream, os.path.basename(path))
    return motors.get(0).build() if hasattr(motors.get(0), "build") else motors.get(0)


def run(rocket, thrust_scale=1.0, drag_scale=1.0, time_scale=1.0, extra_mass=0.0, seed=None, jar=None):
    """thrust_scale/drag_scale/time_scale are not supported by OpenRocket and are ignored (reported in flags)."""
    start(jar)
    from info.openrocket.core.rocketcomponent import Rocket as ORRocket, AxialStage, NoseCone, BodyTube, TrapezoidFinSet, MassComponent, Parachute, Transition, ExternalComponent, FinSet, DeploymentConfiguration
    from info.openrocket.core.motor import MotorConfiguration
    from info.openrocket.core.document import OpenRocketDocumentFactory, Simulation
    from info.openrocket.core.simulation import FlightDataType as T
    from info.openrocket.core.models.wind import WindModelType
    from info.openrocket.core.startup import Application
    L = rocket.launch
    r = ORRocket(); stage = AxialStage(); r.addChild(stage)
    shape = {"conical": Transition.Shape.CONICAL, "ogive": Transition.Shape.OGIVE, "vonkarman": Transition.Shape.HAACK,
             "ellipsoid": Transition.Shape.ELLIPSOID, "parabolic": Transition.Shape.PARABOLIC}.get(rocket.nose.shape, Transition.Shape.CONICAL)
    nose = NoseCone(shape, rocket.nose.length, rocket.radius); stage.addChild(nose)
    if rocket.nose.shape == "ogive": nose.setShapeParameter(1.0)
    bt = BodyTube(rocket.body.length, rocket.radius, (rocket.body.outer_diameter - rocket.body.inner_diameter) / 2); stage.addChild(bt)
    f = rocket.fins
    fs = TrapezoidFinSet(int(f.count), f.root, f.tip, f.sweep, f.span); fs.setThickness(f.thickness)
    fs.setCrossSection({"square": FinSet.CrossSection.SQUARE, "rounded": FinSet.CrossSection.ROUNDED}.get(f.edge, FinSet.CrossSection.AIRFOIL))
    bt.addChild(fs); fs.setAxialOffset(-f.offset_from_aft)
    fin_ = getattr(ExternalComponent.Finish, {"rough": "ROUGH", "unfinished": "UNFINISHED", "normal": "NORMAL", "smooth": "SMOOTH", "polished": "POLISHED"}.get(rocket.finish, "SMOOTH"))
    for c in (nose, bt, fs): c.setFinish(fin_)
    # masses: override each structural component with the spec's value so every engine flies the same rocket
    comps = {n: (m, x) for n, m, x in rocket.component_masses()}
    nose.setOverrideMass(comps["nose"][0]); nose.setMassOverridden(True)
    bt.setOverrideMass(comps["body tube"][0]); bt.setMassOverridden(True)
    fs.setOverrideMass(comps["fins"][0]); fs.setMassOverridden(True)
    for name, (m, x) in comps.items():
        if name in ("nose", "body tube", "fins", "parachute"): continue
        mc = MassComponent(); mc.setName(name); mc.setComponentMass(m); mc.setLength(0.01); bt.addChild(mc)
        mc.setAxialOffset(x - rocket.nose.length - 0.005 - bt.getLength() / 2 + bt.getLength() / 2)
    if extra_mass:
        mc = MassComponent(); mc.setName("extra"); mc.setComponentMass(extra_mass); mc.setLength(0.01); bt.addChild(mc)
        mc.setAxialOffset(rocket.dry_cg() - rocket.nose.length)
    ch = Parachute(); ch.setDiameter(rocket.recovery.chute_diameter); ch.setCD(rocket.recovery.chute_cd)
    ch.setOverrideMass(comps["parachute"][0]); ch.setMassOverridden(True); bt.addChild(ch)
    ch.setAxialOffset(comps["parachute"][1] - rocket.nose.length)
    # motor
    bt.setMotorMount(True)
    # always give OpenRocket the same .eng thrust curve the other engines use
    try:
        mot = _load_eng(find_motor(rocket.motor.designation, rocket.motor.file).path)
    except Exception:
        mot = None
    if mot is None:
        db = Application.getMotorSetDatabase()
        for st_ in db.getMotorSets():
            for mm in st_.getMotors():
                if str(mm.getDesignation()) == rocket.motor.designation: mot = mm; break
            if mot: break
    if mot is None: raise RuntimeError(f"OpenRocket has no motor '{rocket.motor.designation}'")
    doc = OpenRocketDocumentFactory.createDocumentFromRocket(r)
    from info.openrocket.core.rocketcomponent import FlightConfigurationId
    fcid = FlightConfigurationId(); r.createFlightConfiguration(fcid); r.setSelectedConfiguration(fcid)
    mcfg = MotorConfiguration(bt, fcid); mcfg.setMotor(mot); mcfg.setEjectionDelay(1000.0); bt.setMotorConfig(mcfg, fcid)
    dc = ch.getDeploymentConfigurations().getDefault(); dc.setDeployEvent(DeploymentConfiguration.DeployEvent.APOGEE); dc.setDeployDelay(rocket.recovery.deploy_delay)
    sim = Simulation(doc, r); doc.addSimulation(sim)
    o = sim.getOptions(); o.setTimeStep(0.01); o.setLaunchRodLength(L.rail_length); o.setLaunchRodAngle(math.radians(L.rail_angle))
    o.setLaunchRodDirection(math.radians(L.rail_heading)); o.setLaunchAltitude(L.site_elevation)
    o.setISAAtmosphere(False); o.setLaunchTemperature(273.15 + L.temperature_c); o.setLaunchPressure(L.pressure_hpa * 100)
    o.setRandomSeed(seed if seed is not None else 1)
    if L.wind_aloft_factor != 1.0 and L.wind_speed > 0:
        o.setWindModelType(WindModelType.MULTI_LEVEL); ml = o.getMultiLevelWindModel(); ml.clearLevels()
        for h, k in [(0, 1.0), (300, 1 + (L.wind_aloft_factor - 1) * 0.15), (1000, 1 + (L.wind_aloft_factor - 1) * 0.5), (2000, L.wind_aloft_factor), (4000, L.wind_aloft_factor * 1.1)]:
            ml.addWindLevel(float(h), L.wind_speed * k, math.radians(L.wind_from), L.wind_speed * k * L.turbulence)
    else:
        o.setWindModelType(WindModelType.AVERAGE); o.setWindSpeedAverage(L.wind_speed); o.setWindDirection(math.radians(L.wind_from))
        o.setWindSpeedDeviation(L.wind_speed * L.turbulence); o.setWindTurbulenceIntensity(L.turbulence)
    sim.getOptions().setFlightConfigurationId(fcid) if hasattr(sim.getOptions(), "setFlightConfigurationId") else None
    try:
        sim.setFlightConfigurationId(fcid)
    except Exception:
        pass
    sim.simulate()
    fd = sim.getSimulatedData(); b = fd.getBranch(0)
    ev = [str(e.getType()) for e in b.getEvents()]
    if "SIM_ABORT" in ev: raise RuntimeError("OpenRocket aborted the simulation: " + "; ".join(str(e) for e in b.getEvents()))
    tt = [float(v) for v in b.get(T.TYPE_TIME)]
    def g(k):
        d = b.get(k)
        return [float(v) for v in d] if d is not None else [float('nan')] * len(tt)
    _ = None
    st = g(T.TYPE_STABILITY); vt = g(T.TYPE_VELOCITY_TOTAL)
    rec = dict(t=tt, x=g(T.TYPE_POSITION_X), y=g(T.TYPE_POSITION_Y), alt=g(T.TYPE_ALTITUDE), vz=g(T.TYPE_VELOCITY_Z), speed=vt,
               mach=[v if v == v else 0.0 for v in g(T.TYPE_MACH_NUMBER)], accel=[abs(v) for v in g(T.TYPE_ACCELERATION_TOTAL)],
               thrust=g(T.TYPE_THRUST_FORCE), drag=g(T.TYPE_DRAG_FORCE), cd=[v if v == v else 0.0 for v in g(T.TYPE_DRAG_COEFF)],
               mass=g(T.TYPE_MASS), stability=st)
    j0 = next((j for j in range(len(tt)) if vt[j] > 20 and st[j] == st[j]), 0)
    res = FlightResult.from_series(NAME, rec, rail_exit_speed=fd.getLaunchRodVelocity(), stability_off_rail=st[j0],
                                   flutter_margin=None, dry_mass=rocket.dry_mass() + extra_mass, liftoff_mass=rec["mass"][0])
    return res

