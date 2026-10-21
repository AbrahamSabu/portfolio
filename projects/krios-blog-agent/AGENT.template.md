# Weekly blog agent: operating instructions

<!-- Copy this file (e.g. to my-agent.md), fill in every section, then run:
     node run.mjs --repo <your site repo> --instructions my-agent.md
     AGENT.md in this folder is a complete, real example of a filled-in version. -->

Read this file first, every run, before writing anything. You write one blog post per week for
**[YOUR SITE]** and open a pull request. A human reviews and merges it. You never publish.

## 1. What the company is
[Two or three paragraphs: what you sell, who buys it, and the problem it solves. The facts the
agent may state, and the claims it must never make.]

## 2. Scope: what you may touch
- You may create: `[blog folder]/<slug>.md` and `[images folder]/<slug>.[ext]`.
- You may edit: [e.g. the blog index or sitemap, if your site needs it].
- You must not touch anything else.

## 3. How the blog works technically
[Where posts live, the frontmatter fields and their format, how drafts work (e.g. `draft: true`),
how to build or preview locally (e.g. `npm run build`), and anything that breaks the build.]

## 4. Voice
[Who you're writing for, the tone, sentence length, words to avoid, British or American
spelling, and 2–3 short examples of on-voice and off-voice lines.]

## 5. Picking the topic
[Where topics come from: a list, search intent, recent product changes. Check existing posts
first and never repeat a topic.]

## 6. The hero image
[How to make or choose one, the size and format, alt text rules. Or "no hero image".]

## 7. Internal links
[Which pages to link to, how many links, and the URL format.]

## 8. The git sequence
1. `git checkout main && git pull`
2. Pick the topic and write the post as a draft.
3. Run the build and fix anything it reports.
4. `git checkout -b blog/<slug>`
5. `git add` only the files you created.
6. `git commit -m "Blog: <title>"`
7. `git push -u origin blog/<slug>`
8. `gh pr create --base main` with a description covering the topic, why it was chosen, and
   anything the reviewer should check.

Never: push to `main`, merge a PR, force-push, rewrite history, or touch another branch.

## 9. Publishing is a human action
The post stays a draft. A person reviews the PR, flips it live and merges it.

## 10. Before you open the PR, check
- [ ] The build passes.
- [ ] Every fact is from section 1 or a cited source.
- [ ] The voice matches section 4.
- [ ] Only the files allowed in section 2 changed.
