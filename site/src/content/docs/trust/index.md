---
title: Trust
description: What ynab-mcp stores, what it can and cannot do, and its limits — every claim here is checked against the code.
---

This page exists because handing an AI agent access to your budget is a real decision, not a
formality. Every claim below is checked against this repo's source by an automated test
(`test/docs.test.ts`) — if the code changes in a way that breaks a claim, that test fails.

## What's stored, and how

**If you use the [PAT quick start](/start-here/quick-start/):** nothing is stored by ynab-mcp at
all. Your YNAB Personal Access Token lives in an environment variable you set, is sent straight to
YNAB's API on every call, and is never written to disk by this server.

**If you connect through a [self-hosted server](/host-your-own/):** the server persists two kinds
of secret, and they're handled differently on purpose:

- **Your upstream YNAB tokens** (the ones that let the server act as you against the real YNAB
  API) are **encrypted at rest with AES-256-GCM**, using a key you generate and hold
  (`ENCRYPTION_KEY`) — the server never hardcodes it. The server needs to be able to decrypt these,
  because it uses them to call YNAB on your behalf.
- **The tokens the server issues to your MCP client** (the ones your client sends back on every
  request) are **stored as SHA-256 hashes, never in the clear**. The server only ever needs to
  check "does this match a hash I have," not read the token back — so it doesn't keep a copy it
  could leak.

Losing `ENCRYPTION_KEY` invalidates every stored grant; nothing is silently exposed, and everyone
just logs in again.

## Read-only by default

Every connection starts **read-only**. On the self-hosted server, the OAuth consent screen defaults
to "Read-only (recommended)" — write access ("Allow write access") is a choice you make
explicitly, not a checkbox you have to remember to uncheck. On the stdio quick start, the same idea
is a flag: set `YNAB_READ_ONLY=true` and every mutating tool (anything that creates, updates, or
deletes) disappears from the tool list and is rejected if called directly.

## What this server cannot do

**It cannot link a bank account to YNAB.** That capability doesn't exist anywhere in the YNAB API —
it's implemented only inside YNAB's own web and mobile apps. Concretely:

- `create_account` can only create a **manual** account — one you maintain by hand, exactly like
  choosing "I'll add transactions myself" in the YNAB app.
- `import_transactions` can only **refresh** an account that's already bank-linked through the
  YNAB app; it cannot create that link.

So the worst case for a misbehaving agent is a wrong or unwanted entry in your budget — never a new
connection to your actual bank.

## The rate limit is real, and shared

YNAB's API enforces **200 requests per hour** per access token. This server doesn't relax or work
around that — an agent making one tool call per transaction on a large import can hit it. The
`bulk_update_transactions`, `bulk_create_transactions`, and `spending_summary` tools exist
specifically to do the work of many calls in one, which is the practical way to stay under the
limit.

## Not affiliated with YNAB

ynab-mcp is an independent, MIT-licensed project. It is not built, reviewed, or endorsed by YNAB /
You Need A Budget LLC. It talks to YNAB only through YNAB's own public API, using credentials you
provide.

We are not affiliated, associated, or in any way officially connected with YNAB or any of its
subsidiaries or affiliates. The official YNAB website can be found at
[https://www.ynab.com](https://www.ynab.com). The names YNAB and You Need A Budget, as well as
related names, tradenames, marks, trademarks, emblems, and images are registered trademarks of
YNAB.
