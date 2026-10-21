[← Portfolio](https://abrahamsabu.github.io/portfolio/) · [All projects](../../README.md)

# Kríos blog agent

**An AI agent that writes one blog post a week for your website and opens a pull request. It never publishes: you review and merge.**

It was built for the Kríos marketing site, and anyone can point it at their own blog with one command.

## Quick start

You need [Node.js 18+](https://nodejs.org), [Claude Code](https://claude.com/claude-code) (signed in),
the [GitHub CLI](https://cli.github.com) (`gh auth login`), and a local clone of your website's repo.

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/AbrahamSabu/portfolio.git blog-agent
cd blog-agent
git sparse-checkout set projects/krios-blog-agent
cd projects/krios-blog-agent

cp AGENT.template.md my-agent.md       # describe your company, blog setup and voice
node run.mjs --repo ../path/to/your-site --instructions my-agent.md --check
node run.mjs --repo ../path/to/your-site --instructions my-agent.md
```

`--check` confirms everything is ready without writing anything. The real run shows what the agent is doing as
it works, then prints the link to the pull request it opened.

## Run it every week

**Windows** (every Monday at 9am):

```bash
schtasks /create /tn "Weekly blog post" /sc weekly /d MON /st 09:00 /tr "node C:\path\to\run.mjs --repo C:\path\to\your-site --instructions C:\path\to\my-agent.md"
```

**Mac / Linux** (`crontab -e`):

```
0 9 * * 1  cd /path/to/krios-blog-agent && node run.mjs --repo /path/to/your-site --instructions my-agent.md
```

## Safe by design

- The agent can only read and edit files, search the web, and run `git`, `gh pr create`, and `npm`. Everything else is refused.
- The instructions forbid pushing to `main`, merging, force-pushing and touching other branches.
- Posts are opened as drafts on their own branch. Going live is always a person merging the PR.
- Every run's full log is saved in `runs/`, which is gitignored.

## Files

| File | What it is |
|---|---|
| [AGENT.template.md](AGENT.template.md) | Fill-in-the-blanks instructions for your own site |
| [AGENT.md](AGENT.md) | The real, filled-in instructions used for Kríos: scope, voice, topic choice, hero image, internal links, git sequence, pre-PR checklist |
| [run.mjs](run.mjs) | One-command runner with setup checks and live progress |
| [PLAN.md](PLAN.md) | Project plan and design decisions |
| [PR-DESCRIPTION.md](PR-DESCRIPTION.md) | Template for the pull request the agent opens |

## License

[MIT](LICENSE)
