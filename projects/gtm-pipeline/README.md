[← Portfolio](https://abrahamsabu.github.io/portfolio/) · [All projects](../../README.md)

# GTM pipeline

**Job ads → ranked shortlist → crawled briefs → one Claude research session per company → prospect board. 197 companies profiled, 90 researched in depth.**

A go-to-market pipeline that finds companies running door-to-door and field-sales teams,
which are Kríos's target customers. It pulls their job listings, ranks them, researches
the best ones, and produces a prospect board.

The company data it produced is not included, because it describes real businesses.
Running the pipeline creates it again locally, and `.gitignore` keeps it out of git.

## Steps

| Step | Script | What it does |
|---|---|---|
| 1 | `collect.js` | Pulls door-to-door / field-sales job listings from the Adzuna API across several countries, dedupes by employer, and merges them into a master list that grows over time |
| 2 | `triage.js` | Scores, dedupes and classifies that list into a ranked shortlist. No network calls |
| 3 | `enrich.js` | Finds each shortlisted company's real website, crawls it, and writes a short brief. No API keys |
| 4 | `research-pipeline.cjs` | Opens one Claude Code session per company for deeper research and writes a brief for each |
| 5 | `report.js` | Combines everything into `report.html`, a prospect board driven by the research verdicts |

## How to run

Needs Node 18 or later (no `npm install`). For step 4 you also need the `claude` CLI,
signed in.

1. Get a free app ID and key at https://developer.adzuna.com.
2. Create a `.env` file in this folder:
   ```
   ADZUNA_APP_ID=your_id
   ADZUNA_APP_KEY=your_key
   ```
3. Run the steps in order:
   ```bash
   node collect.js
   node triage.js
   node enrich.js
   node research-pipeline.cjs
   node report.js
   ```
4. Open `report.html`.
