---
title: Host your own
description: Run ynab-mcp as a self-hosted server so more than one person can connect, each with their own YNAB login.
---

The [PAT quick start](/start-here/quick-start/) is one person, one token, nothing to run. This
page is for when you want **more than one person** connecting — a household, a few people you
trust with an assistant — and each of them logging in with **their own** YNAB account instead of
sharing a token.

## What you're setting up

A single long-running server, packaged as a Docker container, that speaks MCP over HTTPS and
handles the OAuth login for anyone who connects. It's not a cloud service — you run it, on your own
hardware.

## Network posture: private by default

This server is meant to be reachable on a **private network**, not the open internet — a LAN IP or
a [Tailscale](https://tailscale.com/) MagicDNS name (`https://<host>.<tailnet>.ts.net`), which is
what the bundled `docker-compose.yml` sets up out of the box. "Private" describes where the server
sits on the network, not a reduction in login security: anyone who reaches it still has to log into
YNAB with their own account to get anything.

Why private-by-default: OAuth requires HTTPS, and a stable HTTPS front on the open internet means
you're either running a public-facing service (with everything that implies for uptime and attack
surface) or paying a cloud provider to do it for you. Tailscale gives you HTTPS and a stable
hostname without exposing anything publicly — reach it from any device signed into your tailnet,
nothing else can. See [How it works](/how-it-works/) if "OAuth requires HTTPS" isn't obvious why.

## Running it

The short version — full detail, every environment variable, and alternatives (build-from-source,
a reverse proxy instead of Tailscale, no Docker at all) live in
[`docs/DEPLOY.md`](https://github.com/redlinelabs-dev/ynab-mcp/blob/main/docs/DEPLOY.md) in the
repo:

1. **Generate an encryption key**: `openssl rand -base64 32`. This is what seals YNAB tokens at
   rest (see [Trust](/trust/)) — keep it somewhere you won't lose, and treat it as a secret.
2. **Register a YNAB OAuth application** (Account Settings → Developer Settings → New OAuth
   Application), with a redirect URI of `https://<your-hostname>/callback`.
3. **Create a directory with `docker-compose.yml` and a `.env`** holding your Tailscale auth key,
   the YNAB client id/secret, the encryption key, and where you want the data stored.
4. **`docker compose up -d`.** The bundled compose file runs the server behind a Tailscale sidecar
   that terminates HTTPS for you — no separate reverse proxy needed.

## The OAuth login, in plain English

When someone points their MCP client at your server:

1. Their client redirects them to your server, which redirects them to YNAB's own login page.
   They log into **YNAB**, not into ynab-mcp — this server never sees their YNAB password.
2. On the consent screen, they choose **read-only** (the default) or **full access**, then approve.
3. YNAB redirects back to your server with a short-lived authorization code. The server exchanges
   it for YNAB tokens, encrypts them, and stores them under a new grant tied to that person's
   client connection.
4. Their MCP client gets its own token for talking to your server — separate from YNAB's tokens —
   and the connection persists. They don't log in again unless they revoke access or you reset the
   server.

Each person who connects gets an isolated grant: their own encrypted YNAB tokens, their own
read-only-or-full choice, and revoking one connection never touches anyone else's. See
[How it works](/how-it-works/) for the Tenant/grant vocabulary, and [Trust](/trust/) for exactly
what's stored.

## Backups

Everything that matters lives in two places, both of which the bundled `docker-compose.yml` maps
to a host directory (`${DATA_DIR}`) so they survive a container rebuild:

- **The SQLite database** — every grant (encrypted YNAB tokens, issued-token hashes, scope) for
  every person who's connected. Losing this means everyone reconnects and logs in again; it is not
  itself a copy of anyone's budget data.
- **Your `ENCRYPTION_KEY`** — not stored in the database, but without it the database is useless:
  every sealed token becomes unreadable. Keep it wherever you keep other secrets, separately from
  the `${DATA_DIR}` backup.

Back up `${DATA_DIR}` the same way you'd back up any other stateful service on your network (a
snapshot, a periodic copy, whatever your setup already does) — there's nothing ynab-mcp-specific
about it beyond knowing which directory to include.
