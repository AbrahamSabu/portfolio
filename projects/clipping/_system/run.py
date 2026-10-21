#!/usr/bin/env python3
"""Local clip generator. No AI API keys anywhere.

Three steps, two of them here:

  1. python run.py transcribe <video-or-url>
        ingest + Whisper -> work/transcript.txt (+ .json)

  2. (you) open Claude Code in this folder, tell it to follow CLIPPING_BRIEF.md
        Claude Code reads work/transcript.txt and writes work/clips.json
        This uses your Claude subscription. No API key is involved.

  3. python run.py render
        reads work/clips.json -> out/clip_*.mp4 (9:16, captions burned in)

Run `python run.py all <video>` to do steps 1 and 3 with a pause in between
for the Claude Code step.
"""
import argparse
import os
import sys

WORK = "work"
OUT = "out"


def cmd_transcribe(source, model_size):
    import ingest
    import transcribe

    os.makedirs(WORK, exist_ok=True)
    print(f"[1/2] Resolving input: {source}")
    video = ingest.resolve_input(source, WORK)
    # Remember which video the clips belong to.
    with open(os.path.join(WORK, "source_path.txt"), "w") as f:
        f.write(video)

    print("[2/2] Extracting audio + transcribing (this is the slow part)...")
    audio = ingest.extract_audio(video, WORK)
    transcribe.transcribe(audio, WORK, model_size=model_size)

    print()
    print("Transcript ready: work/transcript.txt")
    print("-" * 60)
    print("NEXT: open Claude Code in this folder and say:")
    print('  "Follow CLIPPING_BRIEF.md and write work/clips.json"')
    print("Then run:  python run.py render")
    print("-" * 60)


def cmd_render():
    import clips_schema
    import captions
    import reframe
    import render
    import json

    if not os.path.isfile(os.path.join(WORK, "source_path.txt")):
        sys.exit("No source video recorded. Run `transcribe` first.")
    with open(os.path.join(WORK, "source_path.txt")) as f:
        video = f.read().strip()
    with open(os.path.join(WORK, "transcript.json")) as f:
        words = json.load(f)["words"]

    clips = clips_schema.load_clips(WORK)
    os.makedirs(OUT, exist_ok=True)
    print(f"Rendering {len(clips)} clip(s) from {video}")

    for c in clips:
        name = f"clip_{c['index']:02d}_{c['slug']}"
        ass_path = os.path.join(WORK, name + ".ass")
        out_path = os.path.join(OUT, name + ".mp4")
        print(f"  -> [{c['score']:>3}] {c['title']}  ({c['start']:.1f}-{c['end']:.1f}s)")
        captions.build_ass(words, c["start"], c["end"], ass_path)
        crop = reframe.compute_crop(video, c["start"], c["end"])
        render.render_clip(video, c, crop, ass_path, out_path)

    print(f"\nDone. Clips in ./{OUT}/")


def main():
    p = argparse.ArgumentParser(description="Local clip generator (no API keys).")
    sub = p.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("transcribe", help="ingest + transcribe")
    t.add_argument("source", help="local video path or a URL")
    t.add_argument("--model", default="base", help="whisper size: tiny/base/small/medium/large-v3")

    sub.add_parser("render", help="render clips from work/clips.json")

    a = sub.add_parser("all", help="transcribe, pause for Claude Code, then render")
    a.add_argument("source")
    a.add_argument("--model", default="base")

    args = p.parse_args()

    if args.cmd == "transcribe":
        cmd_transcribe(args.source, args.model)
    elif args.cmd == "render":
        cmd_render()
    elif args.cmd == "all":
        cmd_transcribe(args.source, args.model)
        input("\nDo the Claude Code step now, then press Enter to render... ")
        cmd_render()


if __name__ == "__main__":
    main()
