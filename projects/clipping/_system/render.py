"""Render clips with ffmpeg, handling per-shot crops."""
import os
import shutil
import subprocess
import tempfile


def _escape_for_filter(path):
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def _run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)


def _crop_filter(crop):
    return ("crop=%d:%d:%d:%d,scale=%d:%d"
            % (crop["cw"], crop["ch"], crop["cx"], crop["cy"],
               crop["target_w"], crop["target_h"]))


def render_clip(video_path, clip, crop, ass_path, out_path):
    vf = _crop_filter(crop) + ",ass='" + _escape_for_filter(ass_path) + "'"
    _run([
        "ffmpeg", "-y",
        "-ss", "%.3f" % clip["start"],
        "-to", "%.3f" % clip["end"],
        "-i", video_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        out_path,
    ])
    return out_path


def render_clip_path(video_path, clip, crop_path, ass_path, out_path):
    if len(crop_path) == 1:
        return render_clip(video_path, clip, crop_path[0]["crop"],
                           ass_path, out_path)

    tmp = tempfile.mkdtemp(prefix="clipseg_")
    try:
        pieces = []
        for i, seg in enumerate(crop_path):
            seg_out = os.path.join(tmp, "seg%03d.mp4" % i)
            abs_start = clip["start"] + seg["t0"]
            abs_end = clip["start"] + seg["t1"]
            if abs_end - abs_start < 0.05:
                continue
            _run([
                "ffmpeg", "-y",
                "-ss", "%.3f" % abs_start,
                "-to", "%.3f" % abs_end,
                "-i", video_path,
                "-vf", _crop_filter(seg["crop"]),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-c:a", "aac", "-b:a", "160k",
                "-avoid_negative_ts", "make_zero",
                seg_out,
            ])
            pieces.append(seg_out)

        if not pieces:
            raise RuntimeError("No renderable segments for clip.")

        list_path = os.path.join(tmp, "list.txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in pieces:
                f.write("file '" + p.replace("\\", "/") + "'\n")

        joined = os.path.join(tmp, "joined.mp4")
        _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
              "-i", list_path, "-c", "copy", joined])

        _run([
            "ffmpeg", "-y", "-i", joined,
            "-vf", "ass='" + _escape_for_filter(ass_path) + "'",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            out_path,
        ])
        return out_path
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
