---
title: hermes-agent
description: Connect hermes-agent to ynab-mcp — with a Personal Access Token, or to a self-hosted instance over OAuth.
---

hermes-agent has a built-in MCP client configured under the `mcp_servers` key in
`~/.hermes/config.yaml`.

## stdio + Personal Access Token

```bash
hermes mcp add ynab \
  --command npx --args -y @redlinelabs/ynab-mcp \
  --env YNAB_TOKEN=your-personal-access-token \
  --env YNAB_BUDGET_ID=last-used
```

Or edit `config.yaml` directly:

```yaml
mcp_servers:
  ynab:
    command: "npx"
    args: ["-y", "@redlinelabs/ynab-mcp"]
    env:
      YNAB_TOKEN: "your-personal-access-token"
      YNAB_BUDGET_ID: "last-used"
```

Restart hermes-agent — its tools appear as `mcp_ynab_*`. See the
[Quick start](/start-here/quick-start/) for where to get a token.

## Connect to a hosted instance (OAuth)

If someone else — or a past you — is running the [self-hosted server](/host-your-own/):

```bash
hermes mcp add ynab --url "https://<your-hostname>/mcp" --auth oauth
```

This starts the browser OAuth flow and stores the resulting tokens for hermes-agent to use — you'll
log into YNAB and choose read-only or full access.

### Headless alternative: PAT over HTTP

If hermes-agent is running somewhere without a browser (a container, a headless box), OAuth isn't
practical. If the operator running the server has enabled `YNAB_PAT_PASSTHROUGH` (see
[Host your own](/host-your-own/)), you can skip OAuth and send a YNAB Personal Access Token as a
static bearer header instead:

```yaml
mcp_servers:
  ynab:
    url: "https://<your-hostname>/mcp"
    headers:
      Authorization: "Bearer your-personal-access-token"
```
