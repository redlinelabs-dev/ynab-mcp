# Deploying the YNAB MCP server (self-hosted)

This is the remote, multi-tenant OAuth server (ADR-0004): a Docker container you run
on your own hardware. Anyone who can reach it logs in with **their own** YNAB account
and gets their own isolated, read-only-by-default grant. "Private" means _you control
the network exposure_ — not that auth is removed.

The preferred deploy is the bundled `docker-compose.yml`: the prebuilt GHCR image
(`ghcr.io/redlinelabs-dev/ynab-mcp`) behind a **Tailscale sidecar** that terminates
HTTPS (which OAuth requires) and serves it at `https://${TS_HOSTNAME}`. One directory
per app, holding `docker-compose.yml` + `.env`.

## 1. Generate an encryption key

YNAB refresh tokens are sealed at rest (AES-256-GCM) with this key. Keep it secret;
losing it invalidates stored grants (users just re-authenticate).

```bash
openssl rand -base64 32
```

## 2. Create a YNAB OAuth application

YNAB → Account Settings → Developer Settings → New OAuth Application. Set the
**redirect URI** to `https://${TS_HOSTNAME}/callback` (e.g.
`https://ynab.your-tailnet.ts.net/callback`). Note the client id and secret.

> New OAuth apps run in **Restricted Mode** (max 25 users) until YNAB reviews them
> (~2–4 weeks). Fine for personal/small use.

## 3. Set up the directory

```bash
mkdir ynab-mcp && cd ynab-mcp
curl -O https://raw.githubusercontent.com/redlinelabs-dev/ynab-mcp/main/docker-compose.yml

cat > .env <<'ENV'
TS_HOSTNAME=ynab.your-tailnet.ts.net
TS_AUTHKEY=tskey-auth-xxxxxxxxxxxx
YNAB_CLIENT_ID=your-ynab-oauth-client-id
YNAB_CLIENT_SECRET=your-ynab-oauth-client-secret
ENCRYPTION_KEY=base64-of-32-random-bytes
DATA_DIR=/mnt/HomeServer/Vault/Apps/ynab-mcp
PUID=1000
PGID=1000
ENV
```

- `TS_HOSTNAME` must match the `hostname:` in the compose (`ynab`) + your tailnet.
- `TS_AUTHKEY` — https://login.tailscale.com/admin/settings/keys.
- `DATA_DIR` — host dir for the SQLite db (`${DATA_DIR}/data`) and tailscale state
  (`${DATA_DIR}/tailscale`); both bind-mounted, so they land on your own dataset
  (snapshot-friendly).
- `PUID`/`PGID` — the uid:gid the app runs as; it **must own `${DATA_DIR}/data`**, or
  the server can't create its SQLite file (`SQLITE_CANTOPEN`, errcode 14). Default
  `1000` (the image's `node` user). Either set these to your dataset's owner
  (`ls -n ${DATA_DIR}`) **or** make the dir match the default:
  ```bash
  sudo mkdir -p ${DATA_DIR}/data ${DATA_DIR}/tailscale
  sudo chown -R 1000:1000 ${DATA_DIR}/data
  ```
  The tailscale sidecar runs as root, so `${DATA_DIR}/tailscale` needs no chown.

## 4. Pull access (GHCR)

The image is published by `.github/workflows/docker-publish.yml` to
`ghcr.io/redlinelabs-dev/ynab-mcp:latest` (plus `:vX.Y.Z` on tags). **GHCR packages are
private by default**, so a fresh host gets `unauthorized` on pull until you do one of:

**A. Make the package public** (one-time; safe — the image holds no secrets, only
compiled code that's already in the public repo, and all runtime secrets come from
`.env`). Org package settings →
`https://github.com/orgs/redlinelabs-dev/packages/container/ynab-mcp/settings` → Danger
Zone → **Change visibility → Public**. After that any host pulls with no login.

**B. Keep it private and authenticate the host.** Create a token with `read:packages`
(<https://github.com/settings/tokens>), then — use `sudo` if you run `sudo docker`, so
the credential lands in root's `~/.docker/config.json`:

```bash
echo "$GHCR_PAT" | sudo docker login ghcr.io -u <github-username> --password-stdin
```

For reproducible deploys, pin a version: `image: ghcr.io/redlinelabs-dev/ynab-mcp:v0.1.0`.

## 5. Start it

```bash
docker compose up -d
docker compose logs -f tailscale-ynab    # waits healthy, then ynab-mcp starts
curl -s https://${TS_HOSTNAME}/health     # {"status":"ok"}
```

The Tailscale sidecar joins your tailnet as `ynab` and serves HTTPS at
`https://${TS_HOSTNAME}` via the inline `serve` config (proxying to the app on
`127.0.0.1:8080`). The app shares the sidecar's network namespace
(`network_mode: service:tailscale-ynab`) and starts once the sidecar is healthy.

## 6. Connect an MCP client

Add `https://${TS_HOSTNAME}/mcp` as a remote MCP server (e.g. in your client's
dashboard, or `claude mcp add --transport http ynab https://${TS_HOSTNAME}/mcp`). The
client runs the OAuth flow, you pick read-only or write on the consent screen, log into
YNAB once, and the connection persists — the server refreshes the YNAB token
transparently (YNAB refresh tokens do not expire until revoked).

## Alternatives

- **Build instead of pull** — in `docker-compose.yml`, replace the `image:` line with
  `build: https://github.com/redlinelabs-dev/ynab-mcp.git#main` (from GitHub; pin a tag
  or commit SHA for integrity) or `build: .` (from a checkout).
- **Reverse proxy instead of Tailscale** — drop the `tailscale-ynab` service and the
  `network_mode`/`depends_on` lines, add `ports: ["8080:8080"]` to `ynab-mcp`, set
  `PUBLIC_URL` in `.env`, and front it with e.g. Caddy:
  ```caddy
  ynab.example.com {
      reverse_proxy 127.0.0.1:8080
  }
  ```
- **No Docker** — `npm run build && npm start` on Node ≥ 24 (`node:sqlite` is built in),
  env from your shell or `.env`. Still needs an HTTPS front for OAuth.

## Backups & key rotation

- Back up `${DATA_DIR}` (the SQLite db) and your `ENCRYPTION_KEY`.
- Rotating `ENCRYPTION_KEY` invalidates sealed tokens; users simply re-authenticate.
