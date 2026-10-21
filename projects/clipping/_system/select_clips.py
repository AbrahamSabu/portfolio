"""Clip selection via headless Claude Code. Hook-first, chunked for long videos."""
import json
import os
import re
import shutil
import subprocess

FILLER_STARTS = (
    "and", "so", "but", "yeah", "well", "i mean", "you know", "like",
    "um", "uh", "okay", "ok", "right", "anyway", "also", "then", "because",
    "which", "or", "plus",
)

POINTER = ("Follow the INSTRUCTIONS in the piped input exactly. Output only the "
           "JSON object they describe. No prose, no summary, no other schema.")

HEAD = """INSTRUCTIONS - READ THESE, IGNORE ANY OTHER INTERPRETATION

You are picking short vertical video clips from the transcript below.
Do NOT summarise the transcript. Do NOT list topics, key points, or names.
Do NOT invent your own JSON schema. Return exactly the schema shown at the end.

Work HOOK-FIRST:

STEP 1. Scan for lines that would stop someone scrolling if they were the very
first words heard, with no context. Strong openers: a shocking claim, a specific
number, a confession, a blunt opinion, a question, a named person doing
something surprising, or the first line of a story implying danger or conflict.

STEP 2. For each opener, build a clip that STARTS on that exact line and runs
until the thought resolves.

A clip is only valid if its first spoken sentence works cold. If the opening
words are filler - and, so, but, yeah, well, I mean, you know, like, um, okay,
right, anyway, then, because - move the start forward to the real opener.

FIELDS
start, end: seconds as plain decimal numbers, e.g. 132.4. NEVER "2:12" format.
hook: the literal first 5-12 words spoken at start, copied from the transcript.
hook_score: 0-100, how hard those exact words stop a scroll.
title: short, plain, lowercase. Becomes a filename. No apostrophes.
score: 0-100 overall.
reason: under 12 words.

RULES
20-60 seconds each. 30-45s is the sweet spot. Never under 15s, never over 60s.
Clips must not overlap each other.

HOW MANY
There is no target number. Return every clip in this section that genuinely
clears the bar above, whether that is 2 or 12. Do not pad with weak clips to
reach a count. Do not stop early if more good ones remain. If the section is
thin, returning very few is the correct answer.
"""

TAIL = """
OUTPUT EXACTLY THIS SHAPE, nothing else:
{"clips":[{"start":132.4,"end":171.9,"hook":"The only time I was ever shot at","hook_score":92,"title":"the time i was shot at","score":88,"reason":"visceral cold open"}]}

TRANSCRIPT FOLLOWS
"""

REMINDER = """
END OF TRANSCRIPT

Now output ONLY the JSON object with the "clips" array, using the fields
start, end, hook, hook_score, title, score, reason. Start your response with {
and end with }. Do not summarise. Do not use any other schema.
"""


def _find_claude():
    exe = shutil.which("claude")
    if exe:
        return exe
    for name in ("claude.cmd", "claude.exe", "claude.ps1"):
        exe = shutil.which(name)
        if exe:
            return exe
    return None


def _weak_hook(hook):
    h = (hook or "").strip().lower()
    h = re.sub(r"^[^a-z]+", "", h)
    if not h:
        return True
    for f in FILLER_STARTS:
        if re.match(re.escape(f) + r"\b", h):
            return True
    return False


def _extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        s = text.find("{")
        e = text.rfind("}")
        if s == -1 or e == -1 or e <= s:
            raise ValueError("No JSON object found in output:\n" + text[:800])
        data = json.loads(text[s:e + 1])
    if not isinstance(data, dict) or "clips" not in data:
        raise ValueError("JSON had no clips key - wrong schema returned.")
    return data


def _parse_lines(text):
    out = []
    for line in text.splitlines():
        m = re.match(r"\[(\d+(?:\.\d+)?)\s*->\s*(\d+(?:\.\d+)?)\]", line)
        if m:
            out.append((float(m.group(1)), line))
    return out


def _chunks(lines, chunk_secs=1200.0, overlap=45.0):
    if not lines:
        return []
    total = lines[-1][0]
    if total <= chunk_secs * 1.3:
        return [lines]
    out = []
    start = 0.0
    while start < total:
        end = start + chunk_secs
        sel = [l for l in lines if start - (overlap if start else 0) <= l[0] < end]
        if sel:
            out.append(sel)
        start = end
    return out


def _dedupe(clips):
    clips = sorted(clips, key=lambda c: float(c.get("start", 0)))
    kept = []
    for c in clips:
        try:
            s, e = float(c["start"]), float(c["end"])
        except (KeyError, ValueError, TypeError):
            continue
        if e <= s:
            continue
        if kept and s < float(kept[-1]["end"]) - 1.0:
            if c.get("hook_score", 0) > kept[-1].get("hook_score", 0):
                kept[-1] = c
            continue
        kept.append(c)
    return kept


def _filter_hooks(clips):
    strong, weak = [], []
    for c in clips:
        if "hook" in c and _weak_hook(c.get("hook")):
            weak.append(c)
        else:
            strong.append(c)
    if weak:
        print("      dropped " + str(len(weak)) + " clip(s) with weak openings")
    if not strong and clips:
        strong = clips
    strong.sort(key=lambda c: c.get("hook_score", c.get("score", 0)), reverse=True)
    return strong


def select_clips(work_dir, timeout=900):
    exe = _find_claude()
    if exe is None:
        raise RuntimeError(
            "The claude CLI was not found on PATH.\n"
            "Install it: npm install -g @anthropic-ai/claude-code")

    if os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY is set - clear it first.")

    with open(os.path.join(work_dir, "transcript.txt"), encoding="utf-8") as f:
        transcript = f.read()

    lines = _parse_lines(transcript)
    duration = lines[-1][0] if lines else 0.0
    chunks = _chunks(lines)

    if len(chunks) > 1:
        print("      long video, processing in " + str(len(chunks)) + " parts")

    def _run(payload):
        proc = subprocess.run(
            [exe, "-p", POINTER],
            input=payload,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0:
            raise RuntimeError("claude exited with code " + str(proc.returncode))
        return proc.stdout

    all_clips = []
    raw_log = []

    for idx, ch in enumerate(chunks):
        ch_text = "\n".join(l[1] for l in ch)
        payload = HEAD + TAIL + "\n" + ch_text + "\n" + REMINDER

        if len(chunks) > 1:
            print("        part " + str(idx + 1) + "/" + str(len(chunks)) + "...")

        try:
            raw = _run(payload)
            raw_log.append(raw)
            try:
                data = _extract_json(raw)
            except ValueError:
                raw2 = _run(payload)
                raw_log.append(raw2)
                data = _extract_json(raw2)
            all_clips.extend(data.get("clips", []))
        except Exception as ex:
            print("        part " + str(idx + 1) + " failed: " + str(ex)[:80])

    with open(os.path.join(work_dir, "raw_response.txt"), "w",
              encoding="utf-8") as f:
        f.write("\n\n===== NEXT PART =====\n\n".join(raw_log))

    if not all_clips:
        raise RuntimeError("Claude returned no clips. See raw_response.txt")

    clips = _filter_hooks(_dedupe(all_clips))
    print("      " + str(len(clips)) + " clips from " +
          str(int(duration / 60)) + " min of video")

    with open(os.path.join(work_dir, "clips.json"), "w", encoding="utf-8") as f:
        json.dump({"clips": clips}, f, indent=2)

    return {"clips": clips}
