---
title: hermes-agent
description: Add ynab-mcp under mcp_servers in hermes-agent's ~/.hermes/config.yaml — remote MCP over OAuth (unverified against this harness), a static bearer header for headless boxes, or a local stdio launch.
---

hermes-agent has a built-in MCP client configured under the `mcp_servers` key in
`~/.hermes/config.yaml`.

## Connect to a server (OAuth) — recommended, if your build supports it

If someone — you, or someone in your household — is running the
[self-hosted server](/host-your-own/), connecting over OAuth is the generally-recommended way
across harnesses: you log into YNAB with your own account instead of sharing a token. **We haven't
verified hermes-agent's remote-MCP / browser-OAuth support against this server**, so treat the
command below as a starting point, not a confirmed-working recipe:

```bash
hermes mcp add ynab --url "https://<your-hostname>/mcp" --auth oauth
```

If that flag doesn't exist in your build, check hermes-agent's own docs for how it adds a remote
MCP server with OAuth — the server itself supports dynamic client registration (RFC 7591) and a
standard OAuth 2.1 authorization-code flow, so any client that can do a browser-based remote-MCP
login should work once pointed at `https://<your-hostname>/mcp`. If hermes-agent can't do a browser
login at all (a real possibility, and common for headless/CLI agents), use one of the alternates
below instead.

### If hermes-agent is headless, or can't do a browser login

If the operator running the server has enabled `YNAB_PAT_PASSTHROUGH` (see
[Host your own](/host-your-own/)), you can skip OAuth entirely and send a YNAB Personal Access
Token as a static bearer header — this is the well-supported path for a container or headless box:

```yaml
mcp_servers:
  ynab:
    url: "https://<your-hostname>/mcp"
    headers:
      Authorization: "Bearer your-personal-access-token"
```

## Alternate: stdio + Personal Access Token

No server to run, but a single token stands in for your own login — the right trade when you're
the only person using this.

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
