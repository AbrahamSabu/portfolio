"""Ingest: resolve an input (local path or URL) to a local video file, and
extract a clean 16kHz mono WAV for transcription.

No network calls to any AI service. yt-dlp only runs if you pass a URL.
"""
import os
import subprocess
import shutil


def resolve_input(source: str, work_dir: str) -> str:
    """Return a path to a local video file.

    If `source` is a local file, it's used as-is.
    If it looks like a URL, yt-dlp downloads it into work_dir.
    """
    if os.path.isfile(source):
        return source

    if source.startswith("http://") or source.startswith("https://"):
        if shutil.which("yt-dlp") is None:
            raise RuntimeError(
                "yt-dlp not found. Install it: pip install yt-dlp"
            )
        out_tmpl = os.path.join(work_dir, "source.%(ext)s")
        # Prefer mp4 so ffmpeg downstream is happy.
        subprocess.run(
            [
                "yt-dlp",
                "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
                "--merge-output-format", "mp4",
                "-o", out_tmpl,
                source,
            ],
            check=True,
        )
        # Find whatever it produced.
        for name in os.listdir(work_dir):
            if name.startswith("source."):
                return os.path.join(work_dir, name)
        raise RuntimeError("yt-dlp finished but no output file was found.")

    raise FileNotFoundError(f"Not a file and not a URL: {source}")


def extract_audio(video_path: str, work_dir: str) -> str:
    """Extract 16kHz mono WAV. Robust input for faster-whisper."""
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found. Install it (e.g. `brew install ffmpeg` or `apt install ffmpeg`).")
    audio_path = os.path.join(work_dir, "audio.wav")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le",
            audio_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return audio_path
