[← Portfolio](https://abrahamsabu.github.io/portfolio/) · [All projects](../../README.md)

# Kríos blog agent

Operating instructions for an AI agent that writes one blog post a week for the Kríos
marketing site and opens a pull request for it. The agent never publishes: a human
reviews and merges.

This folder contains no code. The agent reads these files and does the work.

## Files

| File | What it is |
|---|---|
| [AGENT.md](AGENT.md) | What the agent reads first on every run: scope, voice, topic choice, hero image, internal links, the git sequence, and the pre-PR checklist |
| [PLAN.md](PLAN.md) | Project plan and design decisions |
| [PR-DESCRIPTION.md](PR-DESCRIPTION.md) | Template for the pull request the agent opens |

## How it runs

Each week a scheduled Claude Code run starts in the Kríos site repository and reads
`AGENT.md`. It picks a topic, writes the post on a new branch, and opens a pull request.
Publishing happens only when a person merges that pull request.
