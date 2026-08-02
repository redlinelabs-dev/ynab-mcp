---
title: Quick start
description: Try ynab-mcp instantly in demo mode, then connect for real — OAuth to a server is the recommended path, with a Personal Access Token as the zero-infrastructure alternate.
---

There are three ways to run ynab-mcp. Which one you want depends on how real this needs to be
right now:

1. **Demo mode** — see the tools work, right now, no YNAB account involved.
2. **OAuth against a server (recommended)** — the real setup: your own YNAB login, isolated from
   everyone else who connects to that server.
3. **Personal Access Token (alternate)** — real budget access with no server to run, if you're the
   only person using it and don't want one running.

## Try it instantly (demo mode)

No YNAB account, no token, nothing to configure:

```bash
YNAB_DEMO=1 npx @redlinelabs/ynab-mcp
```

This runs entirely against a fictional, in-memory Demo Budget. Reads and writes both work —
creating a transaction, budgeting a category — but nothing touches a real YNAB account and nothing
persists once the process exits; the budget resets every time you start it again. Point your agent
at it the same way as [below](#point-your-agent-at-it), just skip `YNAB_TOKEN` and use
`YNAB_DEMO=1` instead.

## Recommended: connect to a server over OAuth

For real budget access, connecting to a running ynab-mcp server over OAuth is the recommended
setup — yours, or one someone in your household already runs. You log into **YNAB** with your own
account (never a token you have to generate, hand around, or trust a shared server with), you get
an isolated read-only-or-full grant, and nothing you do is visible to anyone else's connection. See
[Host your own](/host-your-own/) if nobody's running one yet, or jump straight to your harness's
connect page below if someone already has a URL for you.

## Alternate: solo with a Personal Access Token

If you don't want to run a server — one person, one machine, nothing that needs to stay up — a
Personal Access Token is the fastest way to get real budget access without any infrastructure.

### 1. Get a YNAB Personal Access Token

In the YNAB web app: **Account Settings → Developer Settings → New Token**. Copy it somewhere
safe — YNAB only shows it once, and it's the only credential this mode needs.

### 2. Run the server

You don't install anything permanently — `npx` downloads and runs it on demand:

```bash
YNAB_TOKEN=<your personal access token> npx @redlinelabs/ynab-mcp
```

That's the whole server. It talks to your AI agent over **stdio** (standard input/output) — there's
no port, no network listener, nothing else running on your machine because of this.

## Point your agent at it

Every agent needs slightly different config, whether you're connecting over OAuth or launching a
stdio command with a token. Pick yours — each page leads with the OAuth setup and follows with the
Personal Access Token alternate:

- [Claude Desktop](/connect/claude-desktop/)
- [Claude Code](/connect/claude-code/)
- [Codex app](/connect/codex-app/)
- [Codex CLI](/connect/codex-cli/)
- [hermes-agent](/connect/hermes-agent/)
- [Any other MCP client](/connect/generic-mcp-client/)

## What you get, honestly

- **Read-only by default is not automatic with a Personal Access Token** — that mode trusts the
  token's own YNAB permissions. If you want ynab-mcp itself to refuse write calls regardless, set
  `YNAB_READ_ONLY=true` alongside `YNAB_TOKEN`. A self-hosted OAuth server, by contrast, defaults
  every new connection to read-only at the consent screen. See [Trust](/trust/) for what read-only
  actually changes in each mode.
- **YNAB's API allows 200 requests per hour**, per token (PAT mode) or per connection (OAuth mode).
  Browsing a budget and categorizing a handful of transactions won't come close; importing hundreds
  of transactions one call at a time might. See [How it works](/how-it-works/) if that number is
  unfamiliar.
- **No mode can link a bank account** — not demo, not OAuth, not a Personal Access Token — see
  [Trust](/trust/) for why that's a hard limit of the YNAB API, not a missing feature here.

## Optional: narrow what the agent can see

By default every tool is available. Two environment variables narrow that (stdio/PAT mode; a
self-hosted server sets these once for every connection):

```bash
YNAB_TOOLSETS=budgets,accounts,transactions   # only these toolsets are exposed
YNAB_READ_ONLY=true                           # drop every mutating tool
```

See [How it works](/how-it-works/) for what a toolset is, or the [Reference](/reference/budgets/)
for the full tool list by group.
