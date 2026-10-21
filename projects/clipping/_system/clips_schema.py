"""Load and validate clips.json, snapping starts to the real hook."""
import json
import os
import re


def _slug(text, maxlen=40):
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return (text or "clip")[:maxlen]


def _norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def snap_start(words, clip_start, clip_end, hook, search_window=20.0, pad=0.15):
    """Move clip_start forward to where the hook actually begins."""
    if not hook:
        return clip_start
    hook_toks = [t for t in (_norm(w) for w in hook.split()) if t]
    if len(hook_toks) < 2:
        return clip_start
    probe = hook_toks[:4]

    cand = [w for w in words
            if clip_start - 1.0 <= w["start"] <= min(clip_start + search_window, clip_end)]
    toks = [_norm(w["word"]) for w in cand]

    for i in range(len(toks) - len(probe) + 1):
        if toks[i:i + len(probe)] == probe:
            return max(0.0, round(cand[i]["start"] - pad, 2))

    if len(probe) > 2:
        p2 = probe[:2]
        for i in range(len(toks) - 1):
            if toks[i:i + 2] == p2:
                return max(0.0, round(cand[i]["start"] - pad, 2))
    return clip_start


def _seconds(v):
    """Accept 132.4, "132.4", "2:12", or "1:02:12"."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    if ":" in s:
        parts = [float(p) for p in s.split(":")]
        total = 0.0
        for p in parts:
            total = total * 60 + p
        return total
    return float(s)


def load_clips(work_dir):
    path = os.path.join(work_dir, "clips.json")
    if not os.path.isfile(path):
        raise FileNotFoundError(path + " not found.")
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)

    words = []
    tj = os.path.join(work_dir, "transcript.json")
    if os.path.isfile(tj):
        with open(tj, encoding="utf-8") as f:
            words = json.load(f).get("words", [])

    clips = raw.get("clips", raw if isinstance(raw, list) else [])
    cleaned = []
    snapped_count = 0
    for i, c in enumerate(clips):
        start = _seconds(c["start"])
        end = _seconds(c["end"])
        if end <= start:
            raise ValueError("Clip " + str(i) + ": end must be after start.")

        hook = c.get("hook", "")
        if words and hook:
            new_start = snap_start(words, start, end, hook)
            if new_start > start + 0.4:
                snapped_count += 1
                start = new_start

        if end - start < 8:
            continue

        cleaned.append({
            "index": i + 1,
            "start": start,
            "end": end,
            "title": str(c.get("title", "clip " + str(i + 1))),
            "slug": _slug(str(c.get("title", "clip-" + str(i + 1)))),
            "score": int(c.get("hook_score", c.get("score", 0)) or 0),
            "reason": str(c.get("reason", "")),
            "hook": hook,
        })

    if snapped_count:
        print("      trimmed preamble on " + str(snapped_count) + " clip(s)")

    cleaned.sort(key=lambda x: x["score"], reverse=True)
    for n, c in enumerate(cleaned, 1):
        c["index"] = n
    return cleaned
