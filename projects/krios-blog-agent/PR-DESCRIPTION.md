> ## ⚠️ Merging this publishes the new post immediately
>
> The post is set `draft: false` so it renders on the Vercel preview for
> review. That is the same flag that controls the live site, so **merging
> puts it on krios.ie straight away** with no further step. Read it before
> you merge, or set `draft: true` first if you want the images without the
> post.

Adds one blog post, and switches every blog hero image from Wikimedia Commons
photographs to generated illustrations.

## The post

**"Sure, leave it with me": how to read the Irish soft no** — about 2,300 words,
category *Ireland field sales*.

It picks up a thread [the Ireland market piece](/blog/door-to-door-sales-in-ireland)
left open: that post calls disambiguation without pressure the hardest skill in
the job, says it is "mostly a question technique", and then never explains the
technique. This is that explanation. What the standard phrases actually mean,
why booking a follow-up on a soft no makes things worse, and the one question
that makes the real answer cheap to give.

No invented statistics. No em-dashes or en-dashes. House style per `SEO-PLAN.md`.

## The images

`scripts/gen-hero.mjs` draws a flat illustration on the cream canvas using the
tokens already in `src/styles/global.css`. It chooses a motif from the post's own
subject, matching slug, title and tags against an ordered rule list and falling
back to the category. Ten motifs (terrace street, speech bubbles, territory from
above, voice waveform, a climb in stages, solar roof, signal mast, shield,
stacked layers, row of people) and five warm accents (ember, moss, brick, ochre,
clay). No blue or purple, per `DESIGN.md`. Deterministic from the slug, so a
hero never changes unless the post does.

Regenerate one with:

```
cd full-prod/marketing
node scripts/gen-hero.mjs <slug> public/img/blog/<slug>.jpg
```

## Why the attribution was removed

`blog-images.json` previously recorded a photographer, licence and Commons URL
for each hero. Those files are now generated illustrations, so the entries had
become false: they credited photographers for images they did not make. Leaving
them would have been worse than removing them.

`[...slug].astro` now renders the credit caption **only when an entry has a
`source` field**. That machinery is kept on purpose even though nothing uses it
today, so that if a real licensed photograph is ever added again the credit line
comes back automatically. Deleting it would make it possible to add a photo with
no attribution, which is a licence violation on a commercial site.
`REPO-CONTEXT.md` has been updated to tell the nightly review agent this, so it
does not report the unused branch as dead code.

## Worth knowing

- **This PR is wider than a normal post.** Future blog PRs touch three files.
  This one carries the one-off switch to generated imagery, so it also changes
  14 existing images, the template and two docs.
- `package.json` has an unrelated local `allowScripts` change. It is
  deliberately **not** included here.
- The build was verified with the Astro dev server: all 14 existing posts render,
  no stale attribution anywhere. A production build was not run locally.

## What to look at

1. Does the post sound right? It goes out under Abraham's byline and makes
   confident claims about what Irish homeowners mean. That is a judgement call
   for someone who has actually worked the doors.
2. Do the illustrations suit the brand? This changes how the blog looks from
   here on.
3. The two AI-roleplay posts share the waveform motif, and the territory image's
   accent is small at card size. Both are easy to adjust.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
