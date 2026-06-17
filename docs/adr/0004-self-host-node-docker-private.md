# Self-host on Node + Docker (private), dropping Cloudflare Workers

Status: accepted (supersedes ADR-0003's "host on Cloudflare Workers")

The remote, multi-tenant OAuth server of ADR-0002 will run as a **Node ≥24 process, packaged as a
Docker container** that the operator self-hosts (homelab), reachable on a private address — a LAN IP
or a Tailscale MagicDNS name — rather than the public internet. The multi-tenant OAuth model is
**unchanged**: anyone who can reach the server logs in with **their own** YNAB account and gets their
own isolated grant (see [[CONTEXT.md]] — Tenant, Grant). "Private" describes _network exposure_, not a
reduction in auth. ADR-0003's Cloudflare Workers deployment is **dropped** (kept only in git history).

The earlier Workers build is re-platformed onto Node primitives:

- **OAuth server to MCP clients:** the MCP SDK's Express `mcpAuthRouter` + a **custom
  `OAuthServerProvider`** we implement (client/code/token/grant stores + token issuance), replacing
  `@cloudflare/workers-oauth-provider`. The SDK's `ProxyOAuthServerProvider` does **not** fit — it
  assumes the upstream IdP does DCR and verifies our clients' tokens, which YNAB does not.
- **Transport:** `StreamableHTTPServerTransport` (Node `IncomingMessage`/`ServerResponse`), replacing
  the `agents` `McpAgent` Durable Object.
- **Persistence:** built-in **`node:sqlite`** (single file on a mounted volume), replacing Workers KV.
  Also the persistence layer the delta-sync cache was waiting on (ROADMAP).
- **Encryption at rest:** Workers KV encrypted props for free; on Node we encrypt the upstream YNAB
  tokens ourselves (AES-256-GCM, key from an env secret) and store our own issued tokens as hashes.
- **HTTP framework:** **Express**, because `mcpAuthRouter` is Express-native and must mount at the app
  root; the transport is framework-agnostic, so Express buys the auth layer for free.

The **pure core is reused unchanged**: `pkce`, `ynab-oauth`, `worker-config` (token/props refresh),
`tools`, `client`, `schemas`. The Workers upstream-login leg (`login-core`, `login-state`,
`cookie-crypto`) is **removed** — its signed-cookie state is superseded by DB-backed state in the
SQLite store (`pending_auth`, `login_state`), so the YNAB round-trip needs no browser cookie.

## Considered options

- **Self-host Node + Docker (chosen).** Full data locality and control on the operator's own metal;
  no Cloudflare account, no Workers runtime constraints, no 25-user Restricted-Mode framing for a
  private instance. Trade-off: the operator runs and exposes the process (TLS, uptime, backups) — work
  Cloudflare did for free. The MCP-client OAuth storage/issuance that `workers-oauth-provider` gave us
  must be re-implemented behind the SDK's provider interface.
- **Stay on Cloudflare Workers (ADR-0003).** Free, managed, always-on. Rejected: the operator wants a
  private, self-hosted deployment; nothing about a private instance benefits from Cloudflare, and the
  Workers code couples us to a non-Node runtime.
- **Keep both (dual-target).** Rejected: two OAuth-server implementations (`workers-oauth-provider`
  _and_ the SDK router) and two storage backends behind one core — too much surface for a personal
  project with no public-hosting requirement.

## Consequences

- **The operator owns TLS, uptime, and backups.** OAuth requires HTTPS and YNAB requires a registered
  redirect URI, so the deployment needs a stable HTTPS front. The recommended path is **Tailscale
  `serve`** (stable `https://<host>.<tailnet>.ts.net` with automatic certs) or a reverse proxy
  (Caddy/Traefik). A configurable `PUBLIC_URL` sets the OAuth issuer and the `${PUBLIC_URL}/callback`
  redirect registered with YNAB. The `ENCRYPTION_KEY` and the SQLite volume must be backed up; losing
  the key invalidates sealed grants (users simply re-authenticate).
- **Deletes** `src/worker.ts`, `src/mcp-agent.ts`, `wrangler.toml`, and the `@cloudflare/workers-oauth-provider`
  - `agents` dependencies. Adds `express` and the SQLite-backed stores.
- **New deploy surface:** a `Dockerfile` (multi-stage tsgo build → `node dist/server.js`, non-root,
  volume for the `.db`), `docker-compose` with an optional Tailscale sidecar, and bare-`node` as an
  alternative. Secrets (`YNAB_CLIENT_ID/SECRET`, `ENCRYPTION_KEY`, `PUBLIC_URL`) via env.
- **The Node server is `tsgo`-checkable** (unlike the excluded Workers files): Express + the SDK +
  `node:sqlite` are all Node-typed, so the new entrypoint rejoins the type-checked, testable core.
- `release-please` can stay for versioning; the deploy artifact is a container image, not an npm
  package (reinforces the npm-demotion decision).
