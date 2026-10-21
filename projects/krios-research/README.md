[← Portfolio](https://abrahamsabu.github.io/portfolio/) · [All projects](../../README.md) · [Read the report](https://abrahamsabu.github.io/portfolio/projects/krios-research/report.html)

# Kríos market research

Market and competitive research for Kríos, an AI sales-practice product for
door-to-door field sales teams. Covers the AI sales-roleplay and field-sales coaching
vendors, pricing, and positioning. Research conducted 9 to 10 August 2026.

**View:** [report.html](report.html), the rendered report.

![Rendered report](screenshots/report.jpg)

## Files

| File | What it is |
|---|---|
| [SUMMARY.md](SUMMARY.md) | Short version |
| [FULL-REPORT.md](FULL-REPORT.md) | Full version with sources and methodology |
| [render.mjs](render.mjs) | Dependency-free renderer that turns both into `report.html` |
| [report.html](report.html) | The rendered page |

## How to run

```bash
node render.mjs
```

Rebuilds `report.html` from the two Markdown files. Needs Node only, no `npm install`.
