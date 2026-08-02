---
title: Host your own
description: Run ynab-mcp as a self-hosted server so more than one person can connect, each with their own YNAB login.
---

The [Personal Access Token path](/start-here/quick-start/) is one person, one token, nothing to
run. This page is for when you want **more than one person** connecting — a household, a few
people you trust with an assistant — and each of them logging in with **their own** YNAB account
instead of sharing a token. It's also what makes the recommended OAuth connection method possible
in the first place: OAuth needs a server to connect *to*, and this is how you stand one up.

## What you're setting up

A single long-running server, packaged as a Docker container, that speaks MCP over HTTPS and
handles the OAuth login for anyone who connects. It's not a cloud service — you run it, on your own
hardware.

## Recommended exposure: `tailscale serve`

OAuth needs HTTPS with a certificate a browser and an MCP client will actually trust — a
self-signed cert means telling every device to trust it by hand, and a real one from a public CA
means running a public-facing service or paying someone to. The recommended way to get HTTPS
without either is
[`tailscale serve`](https://tailscale.com/kb/1312/serve): it terminates HTTPS with a certificate
trusted by every device on your [Tailscale](https://tailscale.com/) tailnet, on your node's stable
MagicDNS name (`https://<host>.<tailnet>.ts.net`), by proxying to the plain-HTTP app running
locally — no certificate to generate, renew, or distribute yourself. That's exactly what the
bundled `docker-compose.yml` sets up out of the box: a Tailscale sidecar with an inline `serve`
config that proxies `https://${TS_HOSTNAME}` to the app on `127.0.0.1:8080`.

`serve` only makes the server reachable from devices signed into your tailnet — not the open
internet. (Tailscale's other tool, `funnel`, does that, and this setup deliberately doesn't use
it — the bundled config sets `"AllowFunnel": false`.) "Private" describes where the server sits on
the network, not a reduction in login security: anyone who reaches it still has to log into YNAB
with their own account to get anything.

One prerequisite: your tailnet needs **HTTPS certificates** enabled (Tailscale's admin console, or
the interactive `tailscale serve` CLI will prompt you to turn it on) — the bundled deploy assumes
it's already on. See [How it works](/how-it-works/) if "OAuth requires HTTPS" isn't obvious why.

If you'd rather not run Tailscale at all, a conventional reverse proxy (e.g. Caddy) in front of the
app works too — see the alternatives in
[`docs/DEPLOY.md`](https://github.com/redlinelabs-dev/ynab-mcp/blob/main/docs/DEPLOY.md) — but
you're then responsible for getting your own trusted certificate onto it.

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
   running `tailscale serve` — no separate reverse proxy, no certificate to manage.

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
