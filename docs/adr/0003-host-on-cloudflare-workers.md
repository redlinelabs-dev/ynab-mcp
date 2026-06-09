# Host on Cloudflare Workers (free tier); homelab docker-compose as fallback

Status: accepted (supersedes the scaffold's npm-publish / npx distribution)

The remote server (ADR-0002) runs on **Cloudflare Workers**, using the Agents SDK **`McpAgent`**
(Durable Objects for per-session state) and **`@cloudflare/workers-oauth-provider`** (Workers KV for
OAuth grants and encrypted per-user props), served on **`ynab.bennettcircle.com`** via a Workers
custom domain (which doubles as the OAuth callback URL). We chose Workers because it is **free at
our scale**, spares the homelab, and Cloudflare maintains the exact "MCP server + third-party OAuth
proxy" pattern we need. A **Node / docker-compose** deployment behind a Cloudflare Tunnel (with
Tailscale for private-only access) is retained as a **documented fallback** if we outgrow or want to
leave Workers.

## Considered options

- **Cloudflare Workers (chosen).** Verified free-plan-sufficient at ≤25 users: SQLite Durable
  Objects, `McpAgent`, KV, secrets, and a custom domain are all free-tier. Trade-off: Workers
  runtime, not Node.
- **Homelab Node + docker-compose behind a Cloudflare Tunnel, Tailscale backup.** Viable and the
  user's existing setup, but spends homelab resources and means hand-running the OAuth-proxy/token
  store. Kept as the fallback.

## Consequences

- **Workers runtime, not Node** — code must avoid Node-only APIs. The ADR-0001 core already uses
  only global `fetch` + `zod`, so it ports cleanly; only the bootstrap + transport + auth are
  Workers-specific. `dotenv`/stdio bits from the scaffold drop out.
- Two free-tier ceilings to engineer within (not blockers at ≤25 users): **10 ms CPU per request**
  (keep the Worker I/O-bound — no heavy in-Worker crypto loops) and **1,000 KV writes/day**
  (~300/day used by token refresh).
- **The npm `bin` / `npx` distribution from the scaffold is no longer the deploy path.**
  release-please can stay for versioning, but deployment becomes `wrangler deploy`.
