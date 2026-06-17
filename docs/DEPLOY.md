# Deploying the YNAB MCP server (self-hosted)

This is the remote, multi-tenant OAuth server (ADR-0004) as a Docker container you
run on your own hardware. Anyone who can reach it logs in with **their own** YNAB
account and gets their own isolated, read-only-by-default grant. "Private" means
_you control the network exposure_ (Tailscale or LAN) — not that auth is removed.

OAuth and YNAB's redirect URI both require **HTTPS**, so the server must sit behind
a stable HTTPS front. The easiest is Tailscale `serve`; a reverse proxy works too.

## 1. Generate an encryption key

YNAB refresh tokens are sealed at rest (AES-256-GCM) with this key. Keep it secret;
losing it invalidates stored grants (users just re-authenticate).

```bash
openssl rand -base64 32
```

## 2. Create a YNAB OAuth application

In YNAB → Account Settings → Developer Settings → New OAuth Application. Set the
**redirect URI** to `${PUBLIC_URL}/callback` (e.g.
`https://ynab.your-tailnet.ts.net/callback`). Note the client id and secret.

> New OAuth apps run in **Restricted Mode** (max 25 users) until YNAB reviews them
> (~2–4 weeks). Fine for personal/small use.

## 3. Configure `.env`

From a clone, `cp .env.example .env`. Or, **without cloning**, write the four required keys directly
(the bundled `docker-compose.yml` builds the image from GitHub, so you only need the compose file and
this `.env`):

```bash
cat > .env <<'ENV'
PUBLIC_URL=https://ynab.your-tailnet.ts.net
YNAB_CLIENT_ID=your-ynab-oauth-client-id
YNAB_CLIENT_SECRET=your-ynab-oauth-client-secret
ENCRYPTION_KEY=base64-of-32-random-bytes
ENV
```

`PUBLIC_URL` is the external HTTPS URL clients reach (see step 5 for Tailscale).

## 4. Start it

The bundled compose file builds the image straight from this repo
(`build: https://github.com/redlinelabs-dev/ynab-mcp.git#main`) — no clone needed. Pin a tag
(e.g. `#v0.1.0`) for a stable deploy, or comment that line and use `build: .` from a checkout.

```bash
docker compose up -d
docker compose logs -f ynab-mcp     # "listening on :8080"
curl http://localhost:8080/health   # {"status":"ok"}
```

The SQLite database persists in the `ynab-mcp-data` volume.

## 5. Put HTTPS in front

### Option A — Tailscale `serve` (recommended)

Get a stable `https://<host>.<tailnet>.ts.net` name with automatic certs, reachable
only on your tailnet.

- **Sidecar:** uncomment the `tailscale` service in `docker-compose.yml`, set
  `TS_AUTHKEY` in `.env`, `docker compose up -d`, then:
  ```bash
  docker compose exec tailscale tailscale serve --bg --https=443 http://127.0.0.1:8080
  ```
- **Host Tailscale:** if the Docker host is already on your tailnet:
  ```bash
  tailscale serve --bg --https=443 http://127.0.0.1:8080
  ```

Then set `PUBLIC_URL=https://<host>.<tailnet>.ts.net` in `.env`, register
`${PUBLIC_URL}/callback` with YNAB (step 2), and `docker compose up -d` to restart.

### Option B — Reverse proxy (Caddy)

For a LAN/public domain with your own TLS:

```caddy
ynab.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Set `PUBLIC_URL=https://ynab.example.com` and register its `/callback`.

## 6. Connect an MCP client

Add `${PUBLIC_URL}/mcp` as a remote MCP server (e.g. in hermes-agent's dashboard).
The client runs the OAuth flow, you pick read-only or write access on the consent
screen, log into YNAB once, and the connection persists — the server refreshes the
YNAB token transparently (YNAB refresh tokens do not expire until revoked).

## Running without Docker

`npm run build && npm start` (env from your shell or a `.env`). Node ≥ 24 required
(`node:sqlite` is built in). Still needs an HTTPS front for OAuth.

## Backups & key rotation

- Back up the `ynab-mcp-data` volume (the SQLite file) and your `ENCRYPTION_KEY`.
- Rotating `ENCRYPTION_KEY` invalidates sealed tokens; users simply re-authenticate.
