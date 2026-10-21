"""Transcribe with faster-whisper (local, free, CPU-friendly).

Produces two artifacts in work_dir:
  transcript.json  -> structured, has global word-level timings (used for captions)
  transcript.txt   -> human/Claude-readable, segment timings in seconds + mm:ss
                      (this is what Claude Code reads to pick clips)
"""
import json
import os


def _mmss(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


def transcribe(audio_path: str, work_dir: str, model_size: str = "base") -> dict:
    """Run Whisper. `model_size`: tiny/base/small/medium/large-v3.
    base is a good speed/quality tradeoff on CPU. Bump to small if you have time.
    """
    from faster_whisper import WhisperModel  # imported lazily so --help is fast

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(audio_path, word_timestamps=True)

    segments = []
    words = []
    for seg in segments_iter:
        segments.append(
            {"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()}
        )
        for w in (seg.words or []):
            words.append(
                {"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip()}
            )

    data = {
        "duration": round(info.duration, 2),
        "language": info.language,
        "segments": segments,
        "words": words,
    }

    with open(os.path.join(work_dir, "transcript.json"), "w") as f:
        json.dump(data, f, indent=2)

    # Readable version for Claude Code. Precise seconds so it can copy exact numbers.
    lines = [
        "# Transcript",
        f"# duration: {data['duration']}s   language: {data['language']}",
        "# Format:  [start_sec -> end_sec] (mm:ss)  text",
        "",
    ]
    for s in segments:
        lines.append(f"[{s['start']:.2f} -> {s['end']:.2f}] ({_mmss(s['start'])}) {s['text']}")
    with open(os.path.join(work_dir, "transcript.txt"), "w") as f:
        f.write("\n".join(lines))

    return data
