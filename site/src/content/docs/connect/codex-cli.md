---
title: Codex CLI
description: Connect OpenAI Codex CLI to ynab-mcp — with a Personal Access Token, or to a self-hosted instance over OAuth.
---

Codex stores MCP server config in `~/.codex/config.toml` (or a project-scoped `.codex/config.toml`
for trusted projects).

## stdio + Personal Access Token

```bash
codex mcp add ynab \
  --env YNAB_TOKEN=your-personal-access-token \
  --env YNAB_BUDGET_ID=last-used \
  -- npx -y @redlinelabs/ynab-mcp
```

Or add it to `config.toml` directly:

```toml
[mcp_servers.ynab]
command = "npx"
args = ["-y", "@redlinelabs/ynab-mcp"]

[mcp_servers.ynab.env]
YNAB_TOKEN = "your-personal-access-token"
YNAB_BUDGET_ID = "last-used"
```

See the [Quick start](/start-here/quick-start/) for where to get a token.

## Connect to a hosted instance (OAuth)

If someone else — or a past you — is running the [self-hosted server](/host-your-own/), point Codex
at its URL instead of a command:

```toml
[mcp_servers.ynab]
url = "https://<your-hostname>/mcp"
```

Then start the login:

```bash
codex mcp login ynab
```

This opens the browser OAuth flow — you'll log into YNAB and choose read-only or full access.
