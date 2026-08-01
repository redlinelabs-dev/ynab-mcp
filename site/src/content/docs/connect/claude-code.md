---
title: Claude Code
description: Connect Claude Code to ynab-mcp — with a Personal Access Token, or to a self-hosted instance over OAuth.
---

## stdio + Personal Access Token

```bash
claude mcp add --transport stdio \
  --env YNAB_TOKEN=your-personal-access-token \
  --env YNAB_BUDGET_ID=last-used \
  ynab -- npx -y @redlinelabs/ynab-mcp
```

Add `-s user` before `ynab` to make it available in every project instead of just the current one.
Env vars are scoped to the server process. See the [Quick start](/start-here/quick-start/) for
where to get a token.

## Connect to a hosted instance (OAuth)

If someone else — or a past you — is running the [self-hosted server](/host-your-own/):

```bash
claude mcp add --transport http ynab https://<your-hostname>/mcp
```

Then, in a session, run `/mcp` → **Authenticate** to do the browser OAuth login — you'll log into
YNAB and choose read-only or full access. Re-run `/mcp` anytime to check status or re-authenticate.
