---
title: Generic MCP client
description: What any MCP client needs to reach ynab-mcp, in whatever config format it uses — a server URL for OAuth (dynamic client registration, RFC 7591), a bearer header if it can't do a browser login, or a launch command and a token.
---

Not using one of the harnesses with its own page? Every MCP client needs the same information,
just phrased in whatever config format that client uses.

## Connect to a server (OAuth) — recommended

If someone — you, or someone in your household — is running the
[self-hosted server](/host-your-own/), and your client supports **remote MCP servers with OAuth**
(sometimes called "Streamable HTTP" transport), this is the recommended way to connect: you log
into YNAB with your own account instead of sharing a token. Give the client the server's URL:

```json
{
  "mcpServers": {
    "ynab": { "type": "http", "url": "https://<your-hostname>/mcp" }
  }
}
```

The client should walk you through a browser login to YNAB and a read-only/full-access choice, then
stay connected. The server supports dynamic client registration (RFC 7591), so most OAuth-capable
MCP clients need nothing beyond the URL.

### If your client can't do a browser login

Some clients only support a static bearer header, not a full OAuth flow. If the operator running
the server has enabled `YNAB_PAT_PASSTHROUGH` (see [Host your own](/host-your-own/)), send a YNAB
Personal Access Token as the bearer token instead of going through OAuth:

```
Authorization: Bearer your-personal-access-token
```

## Alternate: stdio + Personal Access Token

No server to run, but a single token stands in for your own login — the right trade when you're
the only person using this. Give the client a **command to launch** and an **environment
variable**. In the common `mcpServers`-style JSON config used by several clients:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "npx",
      "args": ["-y", "@redlinelabs/ynab-mcp"],
      "env": {
        "YNAB_TOKEN": "your-personal-access-token",
        "YNAB_BUDGET_ID": "last-used"
      }
    }
  }
}
```

If your client instead wants a bare command line, it's `npx -y @redlinelabs/ynab-mcp` with
`YNAB_TOKEN` (and optionally `YNAB_BUDGET_ID`, `YNAB_TOOLSETS`, `YNAB_READ_ONLY`) set in its
environment. See the [Quick start](/start-here/quick-start/) for where to get a token.
