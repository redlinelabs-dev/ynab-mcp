---
title: How it works
description: The jargon, in one place — MCP, transports, toolsets, tenants, milliunits.
---

Every other page on this site sticks to plain English and links back here whenever it would
otherwise need a technical term. This is the one page that carries the jargon, so the rest don't
have to.

## MCP (Model Context Protocol)

MCP is an open protocol that lets an AI agent — Claude, Codex, or anything else that speaks it —
discover and call a set of **tools** exposed by a server. ynab-mcp is one such server: it exposes
46 tools that read and write a YNAB budget. The agent decides when to call a tool; the server just
answers. Nothing here gives the agent standing access to act on its own — a tool call only happens
when the agent's conversation calls for it.

## stdio vs. Streamable HTTP (the two transports)

MCP servers can talk to a client over one of two transports. ynab-mcp supports both, and which one
you use is really a question of "am I connecting to a running server, or launching my own process":

- **Streamable HTTP** — the server runs continuously and clients connect to it over HTTPS,
  authenticating via OAuth. This is what [Host your own](/host-your-own/) sets up, and the
  recommended way to connect once a server exists: one server, reachable by anyone who can reach
  the network it's on, each person authenticating with their own YNAB login.
- **stdio** — the client launches the server as a local subprocess and talks to it over
  standard input/output. No network, no port, no auth handshake beyond the environment variable
  you set. This is what the [Quick start](/start-here/quick-start/)'s demo mode and Personal
  Access Token (PAT) alternate both use: one person, one process, no server required.

## OAuth, in this server's specific shape

When you connect an MCP client to a self-hosted ynab-mcp server, you go through an OAuth flow: the
client redirects you to the server, the server redirects you to YNAB, you log into YNAB (not into
ynab-mcp — it never sees your YNAB password), and YNAB redirects back with your consent. The server
then holds a YNAB **refresh token** for you, sealed at rest, and uses it to mint short-lived YNAB
access tokens as needed. See [Trust](/trust/) for exactly what's stored and how.

## Toolsets

The 46 tools are organized into 8 **toolsets** — `budgets`, `accounts`, `categories`,
`transactions`, `months`, `payees`, `scheduled`, `money_movements` — matching the groups in the
[Reference](/reference/budgets/). An operator can enable only the toolsets a given agent needs
(`YNAB_TOOLSETS`), which keeps the tool list — and therefore the model's context window — smaller.
A separate switch, `YNAB_READ_ONLY`, drops every mutating tool regardless of toolset.

## Tenants and grants

On the self-hosted server, a **Tenant** is one authenticated connection between an MCP client and
a YNAB account — concretely, one OAuth grant. Two MCP clients connecting with the same human's YNAB
login are two separate Tenants: each gets its own stored refresh token, and revoking one never
touches the other. A **grant** is the persisted record of a Tenant's authorization: the encrypted
YNAB tokens plus the chosen scope (read-only or full). Isolation and revocation both happen at the
grant, not at the human.

## Milliunits

Every monetary amount that crosses the YNAB API — and therefore every amount this server's tools
read or write — is a **milliunit**: an integer where `1000` = one currency unit (so $12.34 is
`12340`). Read tools return both the raw milliunit value and a human-friendly `*_units` sibling;
write tools take milliunits. The [Reference](/reference/budgets/) marks every field that carries
one.
