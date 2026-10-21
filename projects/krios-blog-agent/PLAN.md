# Krios Weekly Blog Agent — Project Plan

Status: **Technical design mostly resolved — a few decisions left**
Last updated: 2026-08-08

## Business context

Krios (krios.ie) — AI sales coach / doorstep roleplay + coaching product for
door-to-door (D2D) field sales teams (solar, alarms, telecom, energy
switching, fundraising, home improvement). Built by Abraham Kurian (Head of
GTM), Ahroon, and Michael.

Brand: black background + amber accent (`#F5A623`), white wordmark.
Fonts: Bricolage Grotesque (display/headlines), Prompt (body), JetBrains Mono.

Hosting (as far as known): a framework site (likely Next.js) on
Vercel/Netlify, backed by a GitHub repo. Exact repo not yet confirmed —
Abraham is checking with co-founders Ahroon/Michael.

## Existing blog — krios.ie/blog

Already live and actively publishing (not starting from zero). Observed
directly from the site on 2026-08-08:

- Tagline: "Notes from the doorstep."
- Standfirst: "Objection libraries, manager playbooks, and what AI actually
  changes for field sales teams. No theory that has never been tested on a
  real door."
- Categories in rotation: `AI and D2D software`, `Ireland field sales`,
  `Manager playbooks`, `Objection handling`, `Opinion`
- Cadence: roughly weekly, sometimes twice in a week. Observed post dates:
  29 Jun, 1 Jul, 4 Jul, 8 Jul, 11 Jul, 15 Jul, 18 Jul, 21 Jul, 22 Jul,
  27 Jul, 1 Aug, 5 Aug 2026.
- Length: 10–13 minute reads.
- Byline seen: "Abraham Kurian, Head of GTM".
- Voice: practical, specific, field-tested, no filler theory. Titles are
  concrete and often promise a payoff — numbered lists ("The 10 solar
  objections that kill deals at the door, and what to say instead") or
  "why X" / "how to Y" framing tied to a specific vertical or scenario.
- Standard bottom-of-page CTA: "Stop training reps on real customers. Give
  every rep a place to fail safely, and a coach that never clocks off. Book
  a demo and we'll build a plan for your floor." → Book a demo / See
  pricing / "No long contract. Cancel anytime."

Existing post titles for reference (voice/topic calibration):
1. The 10 solar objections that kill deals at the door, and what to say instead
2. What good AI roleplay for door-to-door actually requires
3. Why "I'm happy with my supplier" isn't the real objection
4. Why door-to-door reps quit in the first 90 days
5. The door-to-door software stack in 2026: an honest map
6. How to ramp a new door-to-door rep in 30 days
7. Why AI roleplay built for cold calls fails at the door
8. "We're getting three quotes": how home improvement deals really die
9. GDPR at the door: a practical orientation for Irish field sales teams
10. Face-to-face fundraising objections: earn the story, then make the ask small
11. Door-to-door sales in Ireland: what the market actually looks like
12. Selling alarms without selling fear: the objections and what to say instead
13. Coaching a field team when you cannot do ride-alongs
14. Telecoms objections at the door: nobody switches for megabits

## Decisions locked in

1. **Target site:** krios.ie only (not the restaurant/coffee sites also in
   `D:\Work\Webistes`, which are a separate, unrelated set of projects).
2. **Autonomy:** draft-only to start. The agent writes a weekly post and
   stops — a human (Abraham) reviews before anything goes live. Fully
   autonomous publish-with-no-review is an explicit future goal once output
   quality is proven, not something built now. (Also required by Claude's
   own operating rules: publishing/posting public content needs explicit
   per-action confirmation unless/until a durable standing authorization is
   set up deliberately later.)
3. **Scheduling:** weekly, via a cloud scheduled agent (Claude's built-in
   scheduler, the "schedule" skill) — runs even if this PC is off.
4. **Topics:** anything relevant to Krios / D2D field sales, matching the
   existing blog's verticals and voice above. Abraham is sending sample
   posts/direction separately.

## Repo — resolved (2026-08-08)

Repo: `https://github.com/michaelsheffernan/Duolingo-for-D2D` (owned by
co-founder Michael Sheffernan-Heffernan). Cloned locally to
`D:\Work\Duolingo-for-D2D`. Default branch `main`, tracked by Vercel.

It's a monorepo. Only `full-prod/marketing` matters for this project:

- **Stack:** Astro 5 + Tailwind v4 + React islands + shadcn/ui. Deployed to
  Vercel at `krios.ie` / `www.krios.ie`. `full-prod/marketing/vercel.json`
  scopes rebuilds to changes under `full-prod/marketing` only.
- **Blog = a content collection**, not a CMS. Each post is one Markdown
  file at `full-prod/marketing/src/content/blog/<slug>.md`. Routing
  (`src/pages/blog/index.astro` + `[...slug].astro`) is automatic — adding
  a new post is *only* adding one correctly-formatted `.md` file (plus its
  image, see below). No other code changes needed.
- **Frontmatter schema is Zod-validated** in `src/content.config.ts`:
  `title`, `description` (≤~155 chars), `pubDate`, `updatedDate?`, `author`
  (defaults "Abraham Kurian"), `authorRole` (defaults "Head of GTM"),
  `category` (enum: Objection handling / Manager playbooks / Ireland field
  sales / AI and D2D software / Opinion), `tags[]`, `readingTime?` (mins),
  `featured` (bool), `faqs[]` ({q, a} — emitted as FAQPage structured data,
  fill when the post answers a real question), **`draft` (bool, default
  false) — a post with `draft: true` is excluded from the build.** This is
  the built-in mechanism for "written but not live yet."
- **Images:** each post has one hero/body image sourced as a **real
  Wikimedia Commons photo under CC BY-SA**, saved to
  `full-prod/marketing/public/img/blog/<slug>.jpg`, with a matching entry
  in `full-prod/marketing/src/data/blog-images.json` (`src`, `licence`,
  `author`, `source` URL, `title`). REPO-CONTEXT.md explicitly flags this
  as deliberate, not decoration — the attribution is a CC BY-SA licence
  requirement. New posts should follow the same pattern for consistency
  (no AI-generated or generic stock images).
- **House style rules**, pulled from `marketing/SEO-PLAN.md` and
  `DESIGN.md`: never invent a statistic; every competitor claim is hedged,
  sourced and dated; concede the honest case for a competitor; answer-first
  writing (each key question answered in the first 40-60 words, so it
  survives being quoted out of context); no em-dashes or en-dashes; no
  emojis.
- **14 existing posts** already in `src/content/blog/` — new topics should
  avoid duplicating these (list captured above under "Existing post
  titles").
- **This repo already has its own AI agent conventions** —
  `full-prod/REPO-CONTEXT.md` is a standing context file written for a
  "nightly repo health agent" that reviews the codebase and emails
  findings, read-only, with an explicit scope/do-not-report list. Worth
  mirroring that pattern: a short context file for the blog-writing agent
  specifically, rather than re-deriving all of this each run.

## Decisions confirmed (2026-08-08, round 2)

- **Git access:** Abraham has push access to
  `michaelsheffernan/Duolingo-for-D2D` already. No bot/PAT needed.
- **Review mechanism:** weekly PR against `main`, `draft: true`. Never
  merges, never flips `draft: false`, never pushes to `main` directly.
- **Topic selection:** agent proposes a new topic each week, avoiding the
  14 existing post topics, rotating across the 5 categories.

## Open

- [ ] **Content samples** — Abraham to send examples/direction for topics
      and tone beyond what's inferable from the 14 live posts.
- [ ] Abraham wants a precise walkthrough of exactly what git/file actions
      the agent takes before this gets built, given it's a shared
      production repo. See "Exact weekly action sequence" below.

## Exact weekly action sequence (proposed, not yet built)

Scope boundary: the agent only ever touches these three locations —
`full-prod/marketing/src/content/blog/`, `full-prod/marketing/public/img/blog/`,
and `full-prod/marketing/src/data/blog-images.json`. Never `Backend`,
`krios-app`, `affinity`, or any other part of the monorepo.

1. Pull latest `main` into the local clone at `D:\Work\Duolingo-for-D2D`.
2. Pick a topic not already covered by an existing post.
3. Write the post body + frontmatter (`draft: true`) to a new file under
   `src/content/blog/<slug>.md`, following the house style rules
   (no invented stats, hedged competitor claims, no em/en-dashes, no
   emojis, answer-first).
4. Find one real Wikimedia Commons CC BY-SA photo relevant to the topic,
   save it to `public/img/blog/<slug>.jpg`, add its attribution entry to
   `blog-images.json`.
5. Create a **new branch** (e.g. `blog/<slug>`) — `main` is never touched
   directly.
6. Commit the 2-3 new/changed files to that branch.
7. Push the branch to GitHub and open a **pull request** against `main`.
8. Stop. No merge, no deploy, no further action — the PR sits there for
   Abraham (and optionally Ahroon/Michael) to review, edit, or reject.

Nothing in this sequence force-pushes, rewrites history, touches another
branch, or modifies any file outside the three paths above.

## Next steps (in order)

1. ~~Confirm git access + PR-based review workflow.~~ **Done** — approved
   2026-08-08.
2. ~~Write the agent's operating instructions.~~ **Done** — see
   [`AGENT.md`](./AGENT.md). Derived from all 14 existing posts read in
   full or in part, plus `SEO-PLAN.md`, `DESIGN.md` and `REPO-CONTEXT.md`.
   Covers: product context, scope boundary, the Zod frontmatter schema,
   voice and structural habits, hard style rules, topic selection,
   Wikimedia image + attribution process, internal-link whitelist, the
   exact git sequence, and a pre-PR checklist.
3. **Trial run** — write one post end-to-end by hand using `AGENT.md`, open
   the PR, get Abraham's sign-off on quality and voice match. Nothing gets
   automated until a human has judged a real output.
4. Wire the weekly cloud-scheduled agent to run that same process
   automatically, always stopping at "PR opened, draft: true" — never
   merging or flipping draft itself.
5. After a trial period of manual approval and consistent quality, revisit
   fully-autonomous publish-and-merge as a deliberate, explicit decision.

## Voice notes (derived from the 14 existing posts)

Captured in full in `AGENT.md` section 4. The load-bearing observations:

- Every post opens on a concrete recognisable situation, never a
  definition or a statistic.
- Enumerated posts use `###` numbered subsections with bolded
  **Why the standard rebuttal fails.** / **What works better.** or
  **What good looks like.** pairs.
- Exact rep dialogue goes in blockquotes, in Irish idiom.
- Every post closes the same way: a section conceding the article alone
  will not fix anything ("The gap between knowing this and doing it at a
  door"), naming retrieval-under-pressure as the real constraint, noting
  why colleague roleplay / ride-alongs / live doors all fail as practice,
  then a short Kríos paragraph with links, then one final imperative line.
- Frontmatter patterns: 3-4 tags always including `Door to door`, often
  `Ireland`; `readingTime` 7-13; exactly 3 `faqs` with self-contained
  answers.
- House style: no invented statistics, no em/en-dashes, no emojis,
  answer-first, concede the competitor's honest case.
