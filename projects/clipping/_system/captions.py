"""ASS subtitle generation with word-by-word highlight."""

BASE_COLOUR = "&H00FFFFFF"
HIGHLIGHT_COLOUR = "&H0000FFFF"

CAPTION_X = 540
CAPTION_Y = 1560

_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,Arial,80,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,6,3,2,90,90,320,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _fmt_time(seconds):
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:
        cs = 99
    return "%d:%02d:%02d.%02d" % (h, m, s, cs)


def _clean(word):
    return word.replace("{", "").replace("}", "").replace("\n", " ").strip()


def _phrases(words, max_words=3, max_chars=20, gap_break=0.6):
    phrases = []
    cur = []
    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            width = sum(len(x["word"]) for x in cur) + len(cur) - 1
            would_be = width + 1 + len(w["word"])
            if len(cur) >= max_words or would_be > max_chars or gap > gap_break:
                phrases.append(cur)
                cur = []
        cur.append(w)
    if cur:
        phrases.append(cur)
    return phrases


def build_ass(all_words, clip_start, clip_end, out_path):
    words = [
        {"start": w["start"] - clip_start, "end": w["end"] - clip_start,
         "word": _clean(w["word"])}
        for w in all_words
        if w["start"] >= clip_start and w["start"] < clip_end and _clean(w["word"])
    ]

    phrases = _phrases(words)

    events = []
    for p_idx, phrase in enumerate(phrases):
        if p_idx + 1 < len(phrases):
            next_phrase_start = phrases[p_idx + 1][0]["start"]
        else:
            next_phrase_start = float("inf")

        for i, w in enumerate(phrase):
            start = w["start"]
            if i + 1 < len(phrase):
                end = phrase[i + 1]["start"]
            else:
                end = min(w["end"] + 0.15, next_phrase_start)
            if end <= start:
                continue

            parts = []
            for j, pw in enumerate(phrase):
                colour = HIGHLIGHT_COLOUR if j == i else BASE_COLOUR
                parts.append("{\\c" + colour + "}" + pw["word"])
            text = "{\\an2\\pos(%d,%d)}" % (CAPTION_X, CAPTION_Y) + " ".join(parts)

            events.append(
                "Dialogue: 0,%s,%s,Base,,0,0,0,,%s"
                % (_fmt_time(start), _fmt_time(end), text)
            )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(_HEADER)
        f.write("\n".join(events))
        f.write("\n")
    return out_path
