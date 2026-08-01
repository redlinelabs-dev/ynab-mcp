---
title: Quick start (PAT)
description: Get ynab-mcp running against your own budget in about five minutes, with a Personal Access Token.
---

This is the fastest way to try ynab-mcp: one person (you), one YNAB account, no server to run or
maintain. If you want other people to connect too, see [Host your own](/host-your-own/) instead —
that's the setup built for more than one person.

## 1. Get a YNAB Personal Access Token

In the YNAB web app: **Account Settings → Developer Settings → New Token**. Copy it somewhere
safe — YNAB only shows it once, and it's the only credential this mode needs.

## 2. Run the server

You don't install anything permanently — `npx` downloads and runs it on demand:

```bash
YNAB_TOKEN=<your personal access token> npx @redlinelabs/ynab-mcp
```

That's the whole server. It talks to your AI agent over **stdio** (standard input/output) — there's
no port, no network listener, nothing else running on your machine because of this.

## 3. Point your agent at it

Every agent needs slightly different config to launch a stdio command. Pick yours:

- [Claude Desktop](/connect/claude-desktop/)
- [Claude Code](/connect/claude-code/)
- [Codex app](/connect/codex-app/)
- [Codex CLI](/connect/codex-cli/)
- [hermes-agent](/connect/hermes-agent/)
- [Any other MCP client](/connect/generic-mcp-client/)

Each of those pages gives you the exact config for `npx @redlinelabs/ynab-mcp` with your token.

## What you get, honestly

- **Read-only by default is not automatic here** — the PAT mode trusts the token's own YNAB
  permissions. If you want ynab-mcp itself to refuse write calls regardless, set
  `YNAB_READ_ONLY=true` alongside `YNAB_TOKEN`. See [Trust](/trust/) for what read-only actually
  changes.
- **YNAB's API allows 200 requests per hour**, per token. Browsing a budget and categorizing a
  handful of transactions won't come close; importing hundreds of transactions one call at a time
  might. See [How it works](/how-it-works/) if that number is unfamiliar.
- **This mode can't link a bank account**, and neither can any other mode — see
  [Trust](/trust/) for why that's a hard limit of the YNAB API, not a missing feature here.

## Optional: narrow what the agent can see

By default every tool is available. Two environment variables narrow that:

```bash
YNAB_TOOLSETS=budgets,accounts,transactions   # only these toolsets are exposed
YNAB_READ_ONLY=true                           # drop every mutating tool
```

See [How it works](/how-it-works/) for what a toolset is, or the [Reference](/reference/budgets/)
for the full tool list by group.
