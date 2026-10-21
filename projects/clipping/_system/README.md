# clipper-mvp

A local Opus-Clip-style tool. Long video in, short vertical captioned clips out.
Runs on your laptop. **No AI API keys** — the smart step goes through Claude Code
on your subscription.

## How it works

```
video ──▶ transcribe (Whisper, local, free)
            │
            ▼
        work/transcript.txt
            │
            ▼   you open Claude Code here, it reads the brief
        Claude Code ──▶ work/clips.json      ← uses your subscription, no API key
            │
            ▼
        render (ffmpeg) ──▶ out/clip_01_*.mp4  (9:16, captions burned in)
```

The Python pipeline never contacts any AI service. Clip selection is you
running Claude Code interactively in this folder.

## Setup (once)

You need **ffmpeg** installed system-wide:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`

Then:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## The no-API-key rule (important)

Claude Code will silently bill you at API rates if an `ANTHROPIC_API_KEY` is set
in the environment. Before doing the clip step:

```bash
echo $ANTHROPIC_API_KEY     # should be empty
```

If it prints a key, unset it (`unset ANTHROPIC_API_KEY`) or run `claude logout`
then log back in with your subscription. With no key set, Claude Code draws from
your Pro/Max subscription, not a separate bill.

## Run

**1. Transcribe** (slow part, a few minutes for an hour of audio):

```bash
python run.py transcribe /path/to/video.mp4
# or a URL:
python run.py transcribe "https://youtube.com/watch?v=..."
# bigger/better model, slower:
python run.py transcribe video.mp4 --model small
```

**2. Pick clips with Claude Code.** Open Claude Code in this folder and say:

> Follow CLIPPING_BRIEF.md and write work/clips.json

It reads `work/transcript.txt`, picks the best moments, writes `work/clips.json`.
You can eyeball that file and tweak start/end numbers by hand if you want.

**3. Render:**

```bash
python run.py render
```

Clips land in `./out/`.

Or do it in one flow (pauses for the Claude Code step):

```bash
python run.py all video.mp4
```

## What's MVP vs later

- **Reframe** is a static face-centred 9:16 crop per clip. Good for single-speaker
  talking-head video. Multi-person podcasts where the crop should follow whoever's
  talking is the phase-2 upgrade — the hook is `reframe.compute_crop`.
- **Captions** are word-by-word yellow highlight (edit colours/font in `captions.py`).
- No thumbnail/title generation, no B-roll, no music. On purpose — this is the
  smallest thing that produces real clips.

## Tuning

- Caption look: `BASE_COLOUR`, `HIGHLIGHT_COLOUR`, font size in `captions.py`.
- Words per caption line: `max_words` in `captions.py`.
- Transcription accuracy vs speed: `--model` (tiny → large-v3).
