# Clip selection brief

You are picking short vertical clips from a long video. Read
`work/transcript.txt` and write `work/clips.json`.

## What makes a good clip
- **Self-contained.** It makes sense to someone who hasn't seen the rest.
- **Strong hook in the first ~3 seconds.** A question, a bold claim, a number,
  a "here's the thing" moment. If the opening is a throat-clear, move the start
  later to where it actually kicks off.
- **Complete thought with a payoff.** Setup then resolution. Don't cut before
  the point lands.
- **20-60 seconds.** 30-45s is the sweet spot. Never under 15s.
- Prefer moments with emotion, contrast, a story, a strong opinion, or a
  practical takeaway.

## Timing rules
- `start` and `end` are in **seconds** (floats), copied from the `[start -> end]`
  markers in the transcript. You can start/end mid-segment if the exact words
  justify it, but keep boundaries on natural pauses.
- Clips must not overlap.
- Aim for the 5-10 best moments. Quality over quantity. If the video only has
  three good moments, return three.

## Score
`score` is 0-100, your honest read of how well it would perform as a short.
Weight the hook heavily. Be discerning: reserve 85+ for genuinely strong clips.

## Output
Write **only** this file at `work/clips.json` (no prose, valid JSON):

```json
{
  "clips": [
    {
      "start": 132.4,
      "end": 171.9,
      "title": "why cold outreach fails",
      "score": 88,
      "reason": "opens with a sharp claim, one clean story, clear takeaway"
    }
  ]
}
```

`title` becomes the output filename, so keep it short and plain.
