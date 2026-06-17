# @redlinelabs/ynab-mcp

MCP server for [YNAB](https://www.ynab.com/) (You Need A Budget). Gives AI assistants (Claude
Desktop, Claude Code, etc.) tools to browse budgets, accounts, categories, transactions, and
months, and to make targeted edits (set a category's budgeted amount, create/update transactions).

> All monetary amounts in YNAB are **milliunits** — `1000` = one currency unit. Read tools return
> both the raw milliunit value and a human-friendly `*_units` sibling; write tools take milliunits.

> **Bank linking is not possible via the YNAB API** — it's a YNAB web/app-only feature. This server
> creates only _manual_ accounts; once you've linked a bank in the app, `import_transactions` can
> pull its latest activity. The API rate limit is **200 requests/hour** per token.

## Tools

Tools are organized into **toolsets** (groups) you can enable/disable — see
[Toolsets](#toolsets). `✏️` marks mutating (write) tools, which can be disabled all at once with
`YNAB_READ_ONLY`.

### `budgets`

| Tool              | Description                                  |
| ----------------- | -------------------------------------------- |
| `list_budgets`    | All budgets on the account                   |
| `budget_settings` | Currency + date-format settings for a budget |

### `accounts`

| Tool                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `list_accounts`     | Accounts in a budget, with balances                           |
| `get_account`       | One account by id                                             |
| `create_account` ✏️ | Create a **manual** account (API can't bank-link — see below) |

### `categories`

| Tool                        | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `list_categories`           | Category groups and their categories             |
| `get_category`              | One category by id                               |
| `update_category_budget` ✏️ | Set the budgeted amount (milliunits) for a month |

### `transactions`

| Tool                          | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| `list_transactions`           | Transactions (filter by account/date/`uncategorized`/`unapproved`) |
| `get_transaction`             | One transaction by id                                              |
| `create_transaction` ✏️       | Create a transaction                                               |
| `update_transaction` ✏️       | Update fields on an existing transaction                           |
| `bulk_update_transactions` ✏️ | Categorize and/or approve **many** transactions in one call        |
| `delete_transaction` ✏️       | Delete a transaction (e.g. a confirmed duplicate)                  |
| `find_duplicate_transactions` | Find duplicate clusters (same account+amount+date) for review      |
| `import_transactions` ✏️      | Pull latest activity on already bank-linked accounts               |
| `spending_summary`            | Aggregate spend by category/payee over a date range                |
| `payee_transactions`          | Transaction history for one payee                                  |
| `category_transactions`       | Transaction history for one category                               |

### `scheduled`

| Tool                          | Description                                   |
| ----------------------------- | --------------------------------------------- |
| `list_scheduled_transactions` | Recurring/upcoming transactions with next due |

### `months`

| Tool          | Description                                         |
| ------------- | --------------------------------------------------- |
| `list_months` | Budget months with income/budgeted/activity summary |
| `get_month`   | One month (default `current`) with category detail  |

### `payees`

| Tool          | Description        |
| ------------- | ------------------ |
| `list_payees` | Payees in a budget |

## Self-hosting the remote server (Docker)

The **primary** way to run this: a remote, multi-tenant OAuth server you host yourself. Anyone who
can reach it logs in with **their own** YNAB account (browser OAuth) and gets their own isolated,
read-only-by-default data — connect once and it stays connected (YNAB refresh tokens don't expire).
Reach it over Tailscale or your LAN. Full reference: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

OAuth needs HTTPS, so the server sits behind a stable HTTPS front (Tailscale `serve` is easiest).

```bash
# 1. Get the code and a secret key for sealing tokens at rest
git clone https://github.com/redlinelabs-dev/ynab-mcp.git && cd ynab-mcp
openssl rand -base64 32          # copy this into ENCRYPTION_KEY below

# 2. Create a YNAB OAuth app (YNAB > Account Settings > Developer Settings >
#    New OAuth Application) and set its redirect URI to ${PUBLIC_URL}/callback.

# 3. Configure
cp .env.example .env
#   edit .env → PUBLIC_URL, YNAB_CLIENT_ID, YNAB_CLIENT_SECRET, ENCRYPTION_KEY

# 4. Run (builds the image from the included Dockerfile)
docker compose up -d
curl http://localhost:8080/health        # {"status":"ok"}
```

Then put HTTPS in front and set `PUBLIC_URL` to it. With Tailscale:

```bash
# on the Docker host (or the optional sidecar in docker-compose.yml)
tailscale serve --bg --https=443 http://127.0.0.1:8080
#   → https://<host>.<tailnet>.ts.net   (use this as PUBLIC_URL, then: docker compose up -d)
```

Finally, add `${PUBLIC_URL}/mcp` as a remote MCP server in your client (e.g. its dashboard). A
reverse-proxy (Caddy) alternative and backup/key-rotation notes are in
[docs/DEPLOY.md](docs/DEPLOY.md). Requires Docker, or Node ≥ 24 for a bare `npm run build && npm start`.

## Setup (local stdio server)

This runs the server locally over stdio with a Personal Access Token — for single-user/dev use, or
clients that launch the process directly. (The remote Docker server above is the multi-user path.)

### 1. Create a YNAB Personal Access Token

In YNAB, go to **Account Settings → Developer Settings → New Token**.

### 2. Configure environment

Create a `.env` file (or pass env vars directly):

```env
YNAB_TOKEN=your-personal-access-token
YNAB_BUDGET_ID=last-used
```

- `YNAB_TOKEN` — your Personal Access Token (**required**)
- `YNAB_BUDGET_ID` — default budget for tools that omit `budget_id`. Accepts a budget UUID or an
  alias (`last-used`, `default`). Defaults to `last-used`.
- `YNAB_TOOLSETS` — optional comma-separated [toolsets](#toolsets) to expose (default: all)
- `YNAB_READ_ONLY` — optional; set to `true` to expose only read tools

> **Two ways to run this.** The instructions below are the **local, single-user stdio** server (a
> Personal Access Token on your own machine). For a **remote, multi-user OAuth** server you self-host
> (Docker on your homelab, reachable over Tailscale/LAN, each person logging in with their own YNAB
> account), see **[docs/DEPLOY.md](docs/DEPLOY.md)** — that is the primary deployment. This package is
> not published to npm; build it locally first with `npm install && npm run build`.

### 3. Add to Claude Code

After `npm run build`, point the client at the built stdio entry (`dist/index.js`):

```bash
claude mcp add --transport stdio \
  --env YNAB_TOKEN=your-personal-access-token \
  --env YNAB_BUDGET_ID=last-used \
  ynab -- node /absolute/path/to/ynab-mcp/dist/index.js
```

Env vars are scoped to the server process — no global environment setup needed.

### 4. Add to Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/absolute/path/to/ynab-mcp/dist/index.js"],
      "env": {
        "YNAB_TOKEN": "your-personal-access-token",
        "YNAB_BUDGET_ID": "last-used"
      }
    }
  }
}
```

## Toolsets

To avoid bloating the model's context window, you can expose only the tool groups you need. Two
independent controls:

- **`YNAB_TOOLSETS`** — comma-separated group names, or `all` (default). Groups: `budgets`,
  `accounts`, `categories`, `transactions`, `months`, `payees`, `scheduled`.
- **`YNAB_READ_ONLY`** — `true`/`1` exposes only non-mutating tools (drops every `✏️` tool).

```env
# Only read budgets, accounts, and transactions — never write:
YNAB_TOOLSETS=budgets,accounts,transactions
YNAB_READ_ONLY=true
```

Disabled tools are hidden from `tools/list` and rejected if called directly.

## Development

```bash
npm install
npm run dev        # watch mode
npm test           # run the Vitest suite
npm run check      # typecheck + lint + format check + tests
npm run build      # production build
```

Tests are unit/integration style against the public module interfaces, using an injected fake
`fetch` — they never touch the live YNAB API or the rate limit.

## Versioning

This project uses [0ver](https://0ver.org/) (zero-based versioning). The major version will remain
at `0` indefinitely. Breaking changes bump the minor version; features and fixes bump the patch
version.

Releases are automated via [release-please](https://github.com/googleapis/release-please). Commits
must follow [Conventional Commits](https://www.conventionalcommits.org/).
