# Roadmap

The goal: **manage the day-to-day budget entirely through this MCP**, so the YNAB app is only
needed for things the API genuinely can't do. Once the budget is maintained, the same tools feed
transaction history and spending patterns back to an AI assistant for behavioral guidance.

This file maps that vision to concrete tools and records what the YNAB API can and cannot do
(verified against the official OpenAPI spec, 2026-06). The major API constraints — **no bank
linking** and a **200 requests/hour** rate limit — drive most of the design decisions below.

## Hard API limits (design around these)

- **Bank/account linking is NOT possible via the API.** `POST /accounts` (`SaveAccount`) accepts
  only `name`, `type`, `balance` — it creates _manual_ accounts only. Connecting a bank for direct
  import is strictly a YNAB web/app feature. **You will still open the app to link a bank.** After
  that, the API _can_ refresh it (see `import_transactions`).
- **200 requests/hour per token**, rolling window, `429` over limit. Favor: delta sync via
  `server_knowledge`/`last_knowledge_of_server`, bulk operations over per-item calls, and
  server-side aggregation tools over pulling full transaction lists repeatedly.

## Goal → capability map

| Goal                              | Status today                                                   | Needs                                                           |
| --------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Categorize uncategorized txns     | `list_transactions(type=uncategorized)` + `update_transaction` | **bulk** categorize (one PATCH) — `bulk_update_transactions`    |
| Approve transactions              | `list_transactions(type=unapproved)` + `update_transaction`    | **bulk** approve — same `bulk_update_transactions`              |
| Remove duplicates                 | _nothing_ — no delete tool yet                                 | `delete_transaction` + `find_duplicate_transactions` (detector) |
| Pull new txns without the app     | _nothing_                                                      | `import_transactions` (refreshes already-linked accounts)       |
| Recurring bills / upcoming        | _nothing_                                                      | `scheduled` toolset (list, and optionally CRUD)                 |
| Spending history & habit analysis | `list_transactions(since_date)`, `list_months`, `get_month`    | `spending_summary` aggregator; per-payee/category history       |

## Status (2026-06)

The **tool** work is **implemented and tested** (Vitest, network-free via injected fetch): **40 tools
across 7 toolsets** — near-complete YNAB API coverage (see Shipped below for the full breakdown).

## Direction shift: remote OAuth server (decided, not yet built)

The product is moving from a local **stdio + Personal Access Token** tool to a **remote, multi-tenant
MCP server authenticated via OAuth**, with YNAB as the upstream identity provider, hosted on
Cloudflare Workers. Each user logs in through a browser, connects their own YNAB account, and is
read-only by default. See the ADRs for the decisions and trade-offs:

- [ADR-0001](docs/adr/0001-modular-architecture-injected-fetch-vitest.md) — modular, injected-fetch,
  Vitest (what makes the runtime move cheap).
- [ADR-0002](docs/adr/0002-remote-oauth-multi-tenant-ynab-upstream.md) — remote OAuth, multi-tenant,
  YNAB upstream, read-only default.
- [ADR-0003](docs/adr/0003-host-on-cloudflare-workers.md) — Cloudflare Workers (superseded by 0004).
- [ADR-0004](docs/adr/0004-self-host-node-docker-private.md) — self-host on Node + Docker (private),
  dropping Cloudflare Workers.

### Auth architecture (shipped 2026-06 — self-hosted Node/Docker per ADR-0004)

The product is a **multi-tenant OAuth MCP server as a self-hosted Node 24 + Express + Docker
process** (ADR-0004 supersedes the Cloudflare Workers build of ADR-0003, which is gone). It is
reachable on a private HTTPS front (Tailscale `serve` / reverse proxy); anyone who can reach it logs
in with their own YNAB account and gets their own isolated, read-only-by-default grant.

- **OAuth server to MCP clients** — the MCP SDK's Express `mcpAuthRouter` (`/authorize`, `/token`,
  `/register`, `/revoke`, `.well-known` metadata) + a custom `OAuthServerProvider`
  (`src/oauth-server.ts`): DCR, PKCE validation, our own code/token issuance. `requireBearerAuth`
  guards `/mcp` (stateless `StreamableHTTPServerTransport`, one per request).
- **Persistence** — `src/store.ts` over built-in `node:sqlite` (single file on a volume): clients,
  in-flight authorize/login state, issued codes/tokens (by SHA-256 hash), and per-tenant grants.
- **Encryption at rest** — `src/encryption.ts` AES-256-GCM seals the YNAB tokens in each grant
  (`ENCRYPTION_KEY` env); our own issued tokens are stored only as hashes.
- **YNAB upstream leg** — `provider.authorize` renders the consent screen and stashes a `pending_auth`
  row; `POST /ynab/consent` starts the YNAB PKCE leg (`src/pkce.ts`) with DB-backed `login_state`;
  `GET /callback` exchanges the code (`src/ynab-oauth.ts`), creates the sealed grant keyed by YNAB
  user id, and mints our authorization code.
- **Scope via consent screen** — read-only default; opt into write at login (one auth).
- **Token longevity** — on MCP-client refresh the provider refreshes the upstream YNAB token under
  the grant; YNAB refresh tokens never expire → "connect once, forever".

The Node server (`src/server.ts`) and all core modules are `tsgo`-checked and unit-tested
network-free; the Express + SDK-router wiring is validated by a boot smoke-test (health, OAuth
metadata, DCR, consent render, 401 on unauthenticated `/mcp`).

**Verified YNAB OAuth facts (2026-06, official docs):** access tokens last **2 hours**; **refresh
tokens have no stated expiry and no inactivity timeout** — they persist until manually revoked, so a
connection authenticated once survives indefinitely (the "connect once, forever" property). A
`read-only` scope exists and returns `403` on POST/PATCH/DELETE.

### npm / stdio distribution: demoted (done 2026-06)

The self-hosted Docker server is **the** product; the deploy artifact is a container image, not an
npm package. Done: `package.json` is `private` with `bin`/`files` removed, the release workflow's
`npm publish` job is gone (release-please stays for versioning/CHANGELOG), and the README's `npx`
story now points at the local stdio build + `docs/DEPLOY.md`. `src/index.ts` (stdio + Personal Access
Token) remains a local developer/single-user escape hatch (`npm run start:stdio`); the shared core
(`tools.ts`, `client.ts`, …) backs both entry points.

## Not yet built

- **Delta-sync _cache_** — the read tools pass filters but don't thread `server_knowledge` or persist
  a transaction store. Biggest lever against the 200/hr limit; the SQLite store (`src/store.ts`) is
  now the persistence layer it was waiting on, so it can finally be built.
- **Deployment** (user-gated — needs your hardware + YNAB credentials): see `docs/DEPLOY.md`. In
  short: `openssl rand -base64 32` for `ENCRYPTION_KEY`, create a YNAB OAuth app with redirect URI
  `${PUBLIC_URL}/callback`, fill `.env`, `docker compose up -d`, front it with Tailscale `serve` (or
  a reverse proxy), then add `${PUBLIC_URL}/mcp` as a remote MCP server in the client.
- **Docker image not built here** — `npm run build` + a boot smoke-test pass, and the `Dockerfile`
  is written, but `docker build` was not run in this environment (no Docker). Validate it on a host
  with Docker before relying on the image.

## Shipped

- **Tool layer** — **40 tools across 7 toolsets**, fully tested (Vitest, network-free). Near-complete
  YNAB API coverage: budgets/settings/user, accounts, categories (incl. `create_category`,
  `update_category` to rename/move-between-groups, `create_category_group`, `update_category_group`,
  `get_month_category`), transactions (browse, get, create incl. splits, update, **bulk create** +
  bulk update, delete, find-duplicates, import, by account/category/payee/month, spending summary),
  months, payees (incl. `update_payee` rename, `get_payee`, payee **locations**), and scheduled CRUD.
- **Known API gaps (YNAB doesn't expose these):**
  - **Reordering categories/category groups** — no `sort_order` field or endpoint in the YNAB API.
    You can rename and **move a category to another group** (`update_category` `category_group_id`),
    but not reorder within a group. (Category create/group endpoints are newer; verify on your plan.)
  - **`money_movements`** — newer read-only endpoints exist in YNAB's spec but the response schema
    isn't published clearly; not yet exposed as a tool.
- **Scheduled-transaction CRUD** — `list`, `get`, `create`, `update`, `delete_scheduled_transaction`.
- **Split transactions** — `create_transaction` accepts `subtransactions[]` (+ a `null` parent
  `category_id` and an optional `import_id`) to allocate one purchase across multiple categories in a
  single call — e.g. a mixed Walmart/Target/Amazon receipt entered before the bank import arrives.
  Leg amounts are validated to sum to the parent. **Upstream limit:** the YNAB API does not support
  editing the subtransaction breakdown of an _existing_ split, so this is create-only (a split can be
  recreated, not re-split in place). Splits are surfaced in read output too (`list_transactions`,
  `get_transaction`, …).
- **Multi-tenant remote OAuth server (self-hosted Node/Docker, ADR-0004)** — the MCP SDK's Express
  `mcpAuthRouter` + a custom `OAuthServerProvider` (DCR, PKCE, our own code/token issuance), YNAB as
  upstream IdP over a PKCE authorization-code flow, a consent screen for read-only/write scope,
  `node:sqlite` persistence, AES-256-GCM sealing of YNAB tokens at rest, stateless Streamable-HTTP
  `/mcp` behind `requireBearerAuth`, and transparent YNAB token refresh on MCP-client refresh.
  Shipped with a `Dockerfile`, `docker-compose.yml` (+ optional Tailscale sidecar), and
  `docs/DEPLOY.md`. 114 network-free Vitest tests; Express/SDK wiring validated by a boot smoke-test.

## Known limitations / constraints

- **Bank linking is impossible via the YNAB API** (app-only). The server creates only manual
  accounts; `import_transactions` only refreshes accounts a user already linked in the app.
- **YNAB Restricted Mode**: a new OAuth app can issue tokens to **only 25 users** until YNAB reviews
  it (~2–4 weeks). Fine for personal/small use; a gate before opening it widely.
- **Rate limit: 200 requests/hour per token** (per-user under OAuth, not pooled). Favors bulk ops
  and `spending_summary` over many single calls.
- **Cloudflare free-tier ceilings** (not blockers at ≤25 users): 10 ms CPU/request, 1,000 KV
  writes/day.

## Planned tools (priority order)

**Phase 1 — the daily driver (categorize / approve / dedupe)** ✅ shipped

- `bulk_update_transactions` ✏️ — `PATCH /budgets/{id}/transactions`, body `{transactions:[{id,
category_id?, approved?, …}]}`. The workhorse: categorize and approve many txns in a single call
  (critical for the rate limit). Each item needs `id` or `import_id`.
- `delete_transaction` ✏️ — `DELETE /budgets/{id}/transactions/{id}`. Removes a duplicate.
- `find_duplicate_transactions` (read) — _logic, not an endpoint._ Pull txns, group by
  `account_id + amount + date` (and/or repeated `import_id`), return candidate clusters for review
  before deletion. Never auto-delete; surface and confirm.

**Phase 2 — "don't open the app"**

- `import_transactions` ✏️ — `POST /budgets/{id}/transactions/import`. Triggers direct import on
  accounts the user has _already_ linked in the YNAB app. Returns newly imported txn ids. This is
  the "pull my latest bank activity" button.
- `create_account` ✏️ — `POST /budgets/{id}/accounts` (manual accounts only; note the linking
  caveat in the description so the model never promises bank connection).
- `scheduled` toolset: `list_scheduled_transactions` (read) over
  `GET /budgets/{id}/scheduled_transactions`; optionally `create/update/delete_scheduled_transaction`
  ✏️ for managing recurring bills.

**Phase 3 — spending intelligence**

- `spending_summary` (read) — aggregate spend by category and/or payee over a date range
  (`since_date`/`until_date`), returning totals/counts/averages instead of raw rows. Keeps analysis
  cheap on tokens and on the rate limit.
- `payee_transactions` / `category_transactions` (read) —
  `GET /budgets/{id}/payees/{id}/transactions` and `…/categories/{id}/transactions` for drill-down.
- **Delta sync layer** — thread `server_knowledge` through the read tools and cache a local
  transaction store so habit analysis doesn't re-pull history every session. Biggest lever against
  the 200/hr limit; design once, benefits every read tool.

## Workflow notes (how the tools compose)

- **Daily tidy:** `list_transactions(type=unapproved)` → AI proposes categories →
  `bulk_update_transactions` (set `category_id` + `approved:true` in one call).
- **Dedup pass:** `find_duplicate_transactions` → present clusters → `delete_transaction` on
  confirmed dupes only.
- **Refresh:** `import_transactions` first (if accounts are bank-linked), then the daily tidy.
- **Guidance:** `spending_summary` over trailing N months → AI compares against budgeted amounts
  (`get_month`) and flags drift.

## Out of scope (API can't do it)

- Linking a bank / setting up Direct Import — YNAB app/web only.
- Anything requiring credentials to a financial institution.
