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

## Planned tools (priority order)

**Phase 1 — the daily driver (categorize / approve / dedupe)**

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
