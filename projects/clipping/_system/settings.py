"""Settings shared by the app and the pipeline, stored in _system/settings.json."""
import json
import os

_SYS = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(_SYS, "settings.json")

DEFAULTS = {
    "model": "base",      # whisper size: tiny / base / small / medium / large-v3
    "min_secs": 15,       # shortest clip allowed
    "max_secs": 60,       # longest clip allowed
    "max_clips": 0,       # 0 = keep every clip that clears the bar
}
MODELS = ["tiny", "base", "small", "medium", "large-v3"]


def load():
    s = dict(DEFAULTS)
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            s.update(json.load(f))
    except (OSError, ValueError):
        pass
    return s


def save(patch):
    s = load()
    s.update({k: v for k, v in patch.items() if k in DEFAULTS})
    if s["model"] not in MODELS:
        s["model"] = DEFAULTS["model"]
    for k, lo, hi in (("min_secs", 5, 170), ("max_secs", 10, 180), ("max_clips", 0, 50)):
        try:
            s[k] = max(lo, min(hi, int(s[k])))
        except (TypeError, ValueError):
            s[k] = DEFAULTS[k]
    if s["max_secs"] <= s["min_secs"]:
        s["max_secs"] = s["min_secs"] + 10
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=2)
    return s
