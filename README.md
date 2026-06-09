# @redlinelabs/ynab-mcp

MCP server for [YNAB](https://www.ynab.com/) (You Need A Budget). Gives AI assistants (Claude
Desktop, Claude Code, etc.) tools to browse budgets, accounts, categories, transactions, and
months, and to make targeted edits (set a category's budgeted amount, create/update transactions).

> All monetary amounts in YNAB are **milliunits** — `1000` = one currency unit. Read tools return
> both the raw milliunit value and a human-friendly `*_units` sibling; write tools take milliunits.

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

| Tool            | Description                         |
| --------------- | ----------------------------------- |
| `list_accounts` | Accounts in a budget, with balances |
| `get_account`   | One account by id                   |

### `categories`

| Tool                        | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `list_categories`           | Category groups and their categories             |
| `get_category`              | One category by id                               |
| `update_category_budget` ✏️ | Set the budgeted amount (milliunits) for a month |

### `transactions`

| Tool                    | Description                                |
| ----------------------- | ------------------------------------------ |
| `list_transactions`     | Transactions (filter by account/date/type) |
| `get_transaction`       | One transaction by id                      |
| `create_transaction` ✏️ | Create a transaction                       |
| `update_transaction` ✏️ | Update fields on an existing transaction   |

### `months`

| Tool          | Description                                         |
| ------------- | --------------------------------------------------- |
| `list_months` | Budget months with income/budgeted/activity summary |
| `get_month`   | One month (default `current`) with category detail  |

### `payees`

| Tool          | Description        |
| ------------- | ------------------ |
| `list_payees` | Payees in a budget |

## Setup

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

### 3. Add to Claude Code

```bash
claude mcp add --transport stdio \
  --env YNAB_TOKEN=your-personal-access-token \
  --env YNAB_BUDGET_ID=last-used \
  ynab -- npx -y @redlinelabs/ynab-mcp
```

Env vars are scoped to the server process — no global environment setup needed.

### 4. Add to Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "ynab": {
      "command": "npx",
      "args": ["-y", "@redlinelabs/ynab-mcp"],
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
  `accounts`, `categories`, `transactions`, `months`, `payees`.
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
npm run dev       # watch mode
npm run check     # typecheck + lint + format check
npm run build     # production build
```

## Versioning

This project uses [0ver](https://0ver.org/) (zero-based versioning). The major version will remain
at `0` indefinitely. Breaking changes bump the minor version; features and fixes bump the patch
version.

Releases are automated via [release-please](https://github.com/googleapis/release-please). Commits
must follow [Conventional Commits](https://www.conventionalcommits.org/).
