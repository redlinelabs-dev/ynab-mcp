# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP (Model Context Protocol) server for **YNAB** (You Need A Budget), published to npm as
`@redlinelabs/ynab-mcp`. It exposes tools across the budget lifecycle — budgets, accounts,
categories (incl. setting budgeted amounts), transactions (browse/create/update), months, and
payees. Tools are grouped into **toolsets** (`budgets`, `accounts`, `categories`, `transactions`,
`months`, `payees`) that operators enable/disable via env to keep the model's context lean. It
talks to the YNAB REST API (`https://api.ynab.com/v1`) over stdio via `@modelcontextprotocol/sdk`.

> **Milliunits.** Every monetary amount in the YNAB API is in milliunits (`1000` = one currency
> unit). The `units()` helper converts for display; read formatters emit both the raw value and a
> `*_units` sibling, and write tools accept milliunits. Keep this in mind for every amount field.

## Commands

```bash
npm run dev        # tsgo --watch (incremental compile)
npm run build      # rm -rf dist && tsgo  → dist/index.js (the published bin)
npm start          # node dist/index.js
npm run check      # tsgo --noEmit && oxlint && oxfmt --check  ← the full gate
npm run fix        # oxlint --fix && oxfmt   (auto-fix lint + format)
npm run lint       # oxlint           (lint:fix to auto-fix)
npm run fmt        # oxfmt            (fmt:check to verify only)
```

`npm run check` is the source of truth for "is this correct" — it is what the pre-commit hook and
CI both run. **There is no test runner / test suite** in this project; do not invent `npm test`.

## Toolchain (non-standard — read this before reaching for familiar tools)

This repo uses the **oxc** toolchain, not the usual ones. Don't run `tsc`, `eslint`, or `prettier`:

- **`tsgo`** (`@typescript/native-preview`) is the compiler — used for both build and typecheck.
- **`oxlint`** is the linter (config: `.oxlintrc.json`).
- **`oxfmt`** is the formatter (config: `.oxfmtrc.json`, sorts imports into typed groups).

Lint rules are strict and shape the code style:

- `typescript/no-explicit-any: error` — no `any`.
- `consistent-type-assertions: never` — **type assertions (`as`) are banned entirely** (`as const`
  is allowed). This is why the code uses Zod parsing + conditional object spreads / explicit field
  copies (see `transactionBody`) instead of casts.

Other constraints: **ESM only** (`"type": "module"`, `module: NodeNext`) — local/SDK imports use
explicit `.js` extensions and `verbatimModuleSyntax` requires `import type` for type-only imports.
`tsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`). Engine is
`node >= 24`; uses the native global `fetch`, no HTTP client dependency.

## Architecture

Everything lives in one file: **`src/index.ts`**, organized top-to-bottom into clearly-bannered
layers. Understanding the layering is the key to navigating it:

1. **Config** — reads env vars; exits if `YNAB_TOKEN` is missing; builds the Bearer
   `Authorization` header once at startup. `DEFAULT_BUDGET` falls back to the `last-used` alias.
2. **Toolset gating** — `ENABLED_GROUPS` (from `YNAB_TOOLSETS`, default all) + `READ_ONLY` (from
   `YNAB_READ_ONLY`); `isToolEnabled(group, write)` is the single predicate.
3. **Zod schemas** — the contract for YNAB's API responses. YNAB wraps everything in `{ data: … }`;
   `dataEnvelope()` unwraps it. **Resilience is deliberate:** every object uses `.passthrough()`
   and fields use `.catch(...)` liberally. Keep this defensive style when adding schemas.
4. **Inferred types** — `type X = z.infer<typeof XSchema>`; never hand-write these.
5. **HTTP helpers** — `rawFetch` is the single fetch chokepoint (throws on non-2xx with a sliced
   error body). `getTyped` parses GET responses; `sendTyped` handles POST/PUT/PATCH.
6. **Formatters** — `formatAccount`, `formatCategory`, `formatTransaction`, etc. reshape validated
   API objects into **compact, token-efficient JSON**, converting milliunits to `*_units`.
7. **Tool input schemas** — Zod schemas validated at handler entry; `budget_id` is optional
   everywhere (`resolveBudget` falls back to `DEFAULT_BUDGET`).
8. **`TOOLS`** — the `const` array of MCP tool definitions returned by `ListTools`.
9. **`handleTool(name, args)`** — a `switch` mapping each tool name to its logic; returns a string.
10. **Server bootstrap** — wires `ListTools`/`CallTool` (errors, incl. `ZodError`, are caught and
    returned as `isError` text) and connects the stdio transport.

### Adding or changing a tool

A new tool touches **four** places — keep them in sync or the tool won't work:

1. A Zod **input schema** (or reuse/`.extend()` an existing one like `BudgetArg`).
2. An entry in the **`TOOLS`** array. Each entry has `name`, **`group`** (a `ToolGroup` toolset),
   **`write`** (true if it mutates), `description`, and JSON `inputSchema`. The `group`/`write`
   tags are what `YNAB_TOOLSETS` / `YNAB_READ_ONLY` filter on.
3. A **`case`** in the `handleTool` switch.
4. Usually a **response Zod schema + a `formatX` formatter** for token-efficient output.

Adding a new domain = a new `ToolGroup` literal (update the type + `ALL_GROUPS`) — no other
framework change.

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
