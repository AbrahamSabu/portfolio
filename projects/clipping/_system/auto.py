#!/usr/bin/env python3
"""Automatic clip pipeline."""
import argparse
import json
import os
import shutil
import time
import traceback

import ingest
import transcribe as transcribe_mod
import select_clips
import clips_schema
import captions
import reframe
import render
import settings

_SYS = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(_SYS)

INBOX = os.path.join(BASE, "1 Drop videos here")
OUT = os.path.join(BASE, "2 Clips")

WORKROOT = os.path.join(_SYS, "temp")
DONE = os.path.join(_SYS, "processed videos")
FAILED = os.path.join(_SYS, "failed")

ALL_DIRS = (INBOX, OUT, _SYS, WORKROOT, DONE, FAILED)

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


def _ensure_dirs():
    for d in ALL_DIRS:
        os.makedirs(d, exist_ok=True)


def _stem(filename):
    return os.path.splitext(os.path.basename(filename))[0]


def _safe(name):
    return "".join(ch for ch in name if ch not in '<>:"/\\|?*').strip()


def _is_stable(path, wait=2.0):
    try:
        s1 = os.path.getsize(path)
        time.sleep(wait)
        return s1 == os.path.getsize(path) and s1 > 0
    except OSError:
        return False


def _tidy(work_dir):
    for name in os.listdir(work_dir):
        if name.endswith(".wav") or name.endswith(".ass"):
            try:
                os.remove(os.path.join(work_dir, name))
            except OSError:
                pass


def process_one(video_path, model_size="base"):
    name = _stem(video_path)
    work_dir = os.path.join(WORKROOT, _safe(name))
    out_dir = os.path.join(OUT, _safe(name))
    os.makedirs(work_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    print("\n  " + name)

    transcript_json = os.path.join(work_dir, "transcript.json")
    if os.path.isfile(transcript_json):
        print("    reusing existing transcript")
    else:
        print("    extracting audio...")
        audio = ingest.extract_audio(video_path, work_dir)
        print("    transcribing (this is the slow bit)...")
        transcribe_mod.transcribe(audio, work_dir, model_size=model_size)

    print("    choosing clips...")
    select_clips.select_clips(work_dir)

    with open(transcript_json, encoding="utf-8") as f:
        words = json.load(f)["words"]
    clips = clips_schema.load_clips(work_dir)

    print("    rendering " + str(len(clips)) + " clips...")
    ass_path = os.path.join(WORKROOT, "current.ass")

    for c in clips:
        base = _safe(str(c["index"]).zfill(2) + " " + c["title"]).replace("'", "")
        out_path = os.path.join(out_dir, base + ".mp4")
        print("      [" + str(c["score"]).rjust(3) + "] " + c["title"])
        captions.build_ass(words, c["start"], c["end"], ass_path)
        crop_path = reframe.compute_crop_path(video_path, c["start"], c["end"])
        if len(crop_path) > 1:
            print("        following " + str(len(crop_path)) + " shots")
        render.render_clip_path(video_path, c, crop_path, ass_path, out_path)

    try:
        os.remove(ass_path)
    except OSError:
        pass
    _tidy(work_dir)
    print("    done -> 2 Clips\\" + os.path.basename(out_dir))
    return len(clips)


def scan_once(model_size="base"):
    _ensure_dirs()
    videos = [
        os.path.join(INBOX, f)
        for f in sorted(os.listdir(INBOX))
        if os.path.splitext(f)[1].lower() in VIDEO_EXTS
    ]
    if not videos:
        return 0

    processed = 0
    for v in videos:
        if not _is_stable(v):
            print("  " + os.path.basename(v) + " still copying, skipping for now")
            continue
        try:
            process_one(v, model_size=model_size)
            shutil.move(v, os.path.join(DONE, os.path.basename(v)))
            processed += 1
        except Exception:
            print("\n  PROBLEM with " + os.path.basename(v) + " - details below.")
            traceback.print_exc()
            try:
                shutil.move(v, os.path.join(FAILED, os.path.basename(v)))
            except Exception:
                pass
    return processed


def process_file(path, model_size):
    """Process one file from the inbox and file it under processed/failed."""
    try:
        process_one(path, model_size=model_size)
        shutil.move(path, os.path.join(DONE, os.path.basename(path)))
        return True
    except Exception:
        print("\n  PROBLEM with " + os.path.basename(path) + " - details below.")
        traceback.print_exc()
        try:
            shutil.move(path, os.path.join(FAILED, os.path.basename(path)))
        except Exception:
            pass
        return False


def download(url):
    """Download a video URL into the inbox with yt-dlp and return its path."""
    work = os.path.join(WORKROOT, "download-" + str(int(time.time())))
    os.makedirs(work, exist_ok=True)
    print("  downloading " + url)
    src = ingest.resolve_input(url, work)
    dest = os.path.join(INBOX, "download-" + time.strftime("%Y%m%d-%H%M%S") + os.path.splitext(src)[1])
    shutil.move(src, dest)
    shutil.rmtree(work, ignore_errors=True)
    print("  saved as " + os.path.basename(dest))
    return dest


def main():
    p = argparse.ArgumentParser(description="Automatic clip pipeline.")
    p.add_argument("--watch", action="store_true")
    p.add_argument("--interval", type=int, default=15)
    p.add_argument("--model", default=None, help="whisper size (default: from settings)")
    p.add_argument("--file", help="process just this file from the inbox")
    p.add_argument("--url", help="download this video URL first, then process it")
    args = p.parse_args()
    args.model = args.model or settings.load()["model"]

    _ensure_dirs()

    if args.url or args.file:
        path = download(args.url) if args.url else args.file
        raise SystemExit(0 if process_file(path, args.model) else 1)

    if not args.watch:
        n = scan_once(args.model)
        if n == 0:
            print('Nothing waiting. Put videos in "1 Drop videos here" and run again.')
        else:
            print("\nFinished " + str(n) + ' video(s). Clips are in "2 Clips".')
        return

    print('Watching "1 Drop videos here" - drop videos in any time.')
    print("Close this window to stop.\n")
    try:
        while True:
            n = scan_once(args.model)
            if n:
                print("\nFinished " + str(n) + ' video(s). Clips are in "2 Clips".\n')
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
