# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP (Model Context Protocol) server for **YNAB** (You Need A Budget), published to npm as
`@redlinelabs/ynab-mcp`. It exposes tools across the budget lifecycle — budgets, accounts,
categories (incl. setting budgeted amounts), transactions (browse, create incl. **splits**, update,
bulk-update, delete, find-duplicates, import, spending analysis), months, payees, and scheduled
transactions.
Tools are grouped into **toolsets** (`budgets`, `accounts`, `categories`, `transactions`, `months`,
`payees`, `scheduled`) that operators enable/disable via env to keep the model's context lean. It
talks to the YNAB REST API (`https://api.ynab.com/v1`) over stdio via `@modelcontextprotocol/sdk`.

> **Bank linking is impossible via the YNAB API** (app-only); `create_account` makes manual
> accounts, `import_transactions` only refreshes already-linked ones. Rate limit: **200 req/hr** —
> prefer `bulk_update_transactions` and `spending_summary` over many single calls. See `ROADMAP.md`.

> **Milliunits.** Every monetary amount in the YNAB API is in milliunits (`1000` = one currency
> unit). The `units()` helper converts for display; read formatters emit both the raw value and a
> `*_units` sibling, and write tools accept milliunits. Keep this in mind for every amount field.

## Commands

```bash
npm run dev        # tsgo --watch (incremental compile)
npm run build      # rm -rf dist && tsgo  → dist/index.js (the published bin)
npm start          # node dist/index.js
npm test           # vitest run (the Vitest suite)
npm run check      # tsgo --noEmit && oxlint && oxfmt --check && vitest run  ← the full gate
npm run fix        # oxlint --fix && oxfmt   (auto-fix lint + format)
npm run lint       # oxlint           (lint:fix to auto-fix)
npm run fmt        # oxfmt            (fmt:check to verify only)
```

`npm run check` is the source of truth for "is this correct" — it is what the pre-commit hook and
CI both run, and it now includes the Vitest suite. See **Testing** below.

## Toolchain (non-standard — read this before reaching for familiar tools)

This repo uses the **oxc** toolchain, not the usual ones. Don't run `tsc`, `eslint`, or `prettier`:

- **`tsgo`** (`@typescript/native-preview`) is the compiler — used for both build and typecheck.
- **`oxlint`** is the linter (config: `.oxlintrc.json`).
- **`oxfmt`** is the formatter (config: `.oxfmtrc.json`, sorts imports into typed groups).

Lint rules are strict and shape the code style:

- `typescript/no-explicit-any: error` — no `any`.
- `consistent-type-assertions: never` — **type assertions (`as`) are banned entirely** (`as const`
  is allowed). This is why the code uses Zod parsing + conditional object spreads / explicit field
  copies (see `buildSaveTransaction` in `src/transactions.ts`) instead of casts.

Other constraints: **ESM only** (`"type": "module"`, `module: NodeNext`) — local/SDK imports use
explicit `.js` extensions and `verbatimModuleSyntax` requires `import type` for type-only imports.
`tsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`). Engine is
`node >= 24`; uses the native global `fetch`, no HTTP client dependency.

## Architecture

The code is split into small, single-purpose modules so the logic is unit-testable without the
network. `src/index.ts` is a **thin bootstrap**; everything else is importable and side-effect-free
on load (no env reads, no `process.exit`, no server start outside `index.ts`):

- **`src/index.ts`** — bootstrap only. Reads env (`YNAB_TOKEN`, `YNAB_BUDGET_ID`, `YNAB_TOOLSETS`,
  `YNAB_READ_ONLY`), exits if the token is missing, builds a `ToolContext`, and wires the MCP
  `ListTools`/`CallTool` handlers over stdio (errors incl. `ZodError` caught → `isError` text).
- **`src/client.ts`** — `YnabClient`, the single HTTP seam. **`fetch` is injected** (defaults to
  global) so tests run network-free. `rawFetch` throws on non-2xx; `getTyped`/`sendTyped` validate
  every response through a Zod schema. One typed method per endpoint.
- **`src/schemas.ts`** — Zod schemas + inferred types. YNAB wraps responses in `{ data: … }`;
  `dataEnvelope()` unwraps. **Resilience is deliberate:** `.passthrough()` on every object,
  `.catch(...)` on fields. Keep this defensive style.
- **`src/tools.ts`** — `TOOLS` (the definition array, tagged `group`/`write`) + `handleTool(ctx,
name, args)` dispatch. Parses args with Zod input schemas, calls the client, folds in pure logic.
- **`src/toolsets.ts`** — pure gating: `parseToolsets`, `parseReadOnly`, `isToolEnabled`, the
  `ToolGroup` union + `ALL_GROUPS`.
- **`src/duplicates.ts`** — `findDuplicateTransactions` (pure dedup detection).
- **`src/summary.ts`** — `summarizeSpending` (pure aggregation).
- **`src/transactions.ts`** — `buildSaveTransaction` / `buildBulkTransactionsBody` (pure body
  builders; omit `undefined`, preserve explicit `null`).
- **`src/format.ts`** + **`src/money.ts`** — token-efficient output shaping + milliunit→`units`.

### Adding or changing a tool

1. Add a typed **method** to `YnabClient` (`src/client.ts`) + any **response schema** in
   `src/schemas.ts`.
2. Add a Zod **input schema** + a **`TOOLS`** entry + a **`case`** in `handleTool` (all in
   `src/tools.ts`). Each `TOOLS` entry's `group`/`write` tags drive toolset gating.
3. Usually a **`formatX`** in `src/format.ts` for compact output.
4. New domain = a new `ToolGroup` literal in `src/toolsets.ts` (`ALL_GROUPS` + the union).

## Testing

Vitest (`npm test`, folded into `npm run check`). Tests live in `test/` and exercise public module
interfaces — pure logic directly, and the client/dispatch through an **injected fake `fetch`** so
they never hit the live API or the 200 req/hr limit. Build excludes `test/` (it's outside `src`).
Follow TDD for new behavior: one failing test → minimal code → repeat. The lint rules still apply
to tests (no `any`, no `as` — type the fake `fetch` with an annotation, not an assertion).

## Auth & environment

Auth is a YNAB **Personal Access Token** sent as a Bearer header. Env vars (loaded via `dotenv`):

- `YNAB_TOKEN` — Personal Access Token (**required**; process exits without it)
- `YNAB_BUDGET_ID` — default budget id or alias (`last-used`, `default`); defaults to `last-used`
- `YNAB_TOOLSETS` — optional comma-separated toolset groups to expose (default: all)
- `YNAB_READ_ONLY` — optional; `true`/`1` exposes only non-mutating tools

## Commits & releases

- **Conventional Commits are mandatory** and enforced by git hooks (husky): `pre-commit` runs
  `npm run check`, `commit-msg` runs commitlint. A failing check or non-conventional message
  blocks the commit. Use `!` for breaking changes (e.g. `feat!:`).
- **Releases are automated** via release-please: merging conventional commits to `main` opens a
  Release PR (version bump + CHANGELOG); merging that PR publishes to npm via the Release workflow.
- **Versioning is 0ver** (zero-based): major stays `0`. Breaking changes bump the minor; features
  and fixes bump the patch.
