# clipping

A local tool in the style of Opus Clip: you put a long video in and get short, vertical,
captioned clips out. It runs on your own computer with no AI API keys. Transcription
uses faster-whisper locally. Claude Code, on your subscription, picks the clips.
OpenCV reframes them to vertical.

No videos are included. Both folders below start empty.

## How to run (Windows)

1. Double-click `SETUP.bat` once. It creates the Python environment and folders.
2. Put a video in `1 Drop videos here`.
3. Double-click `CLIP.bat`. The clips appear in `2 Clips`.

`WATCH.bat` keeps running instead and clips each new video as it lands in the drop folder.

## More

[_system/README.md](_system/README.md) covers how the pipeline works, the no-API-key
rule, and tuning. [_system/CLIPPING_BRIEF.md](_system/CLIPPING_BRIEF.md) is the brief
Claude Code reads when it chooses clips.
