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

Phases 1–3 of the **tool** work are **implemented and tested** (Vitest, network-free via injected
fetch): 23 tools across 7 toolsets. Shipped: `bulk_update_transactions`, `delete_transaction`,
`find_duplicate_transactions`, `import_transactions`, `create_account`, `spending_summary`,
`payee_transactions`, `category_transactions`, `list_scheduled_transactions`.

## Direction shift: remote OAuth server (decided, not yet built)

The product is moving from a local **stdio + Personal Access Token** tool to a **remote, multi-tenant
MCP server authenticated via OAuth**, with YNAB as the upstream identity provider, hosted on
Cloudflare Workers. Each user logs in through a browser, connects their own YNAB account, and is
read-only by default. See the ADRs for the decisions and trade-offs:

- [ADR-0001](docs/adr/0001-modular-architecture-injected-fetch-vitest.md) — modular, injected-fetch,
  Vitest (what makes the runtime move cheap).
- [ADR-0002](docs/adr/0002-remote-oauth-multi-tenant-ynab-upstream.md) — remote OAuth, multi-tenant,
  YNAB upstream, read-only default.
- [ADR-0003](docs/adr/0003-host-on-cloudflare-workers.md) — Cloudflare Workers (free), homelab
  docker-compose fallback.

## Not yet built

- **The OAuth server itself** — Streamable-HTTP transport, `McpAgent`, `workers-oauth-provider`
  brokering YNAB OAuth, per-user encrypted token store, refresh handling, the read-only→write
  scope-elevation flow. This is the next major body of work (ADR-0002 / ADR-0003).
- **Scheduled-transaction mutations** — only `list_scheduled_transactions` ships. `create`/`update`/
  `delete` (the API supports full CRUD) are not wired yet.
- **Delta-sync _cache_** — the client passes filters but does not thread `server_knowledge` or
  persist a store. Biggest lever against the 200/hr limit; needs the persistence layer that the
  remote server will introduce, so it's deferred until then rather than half-built.

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
