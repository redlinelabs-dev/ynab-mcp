YNAB calls the top-level thing you're working in a **Budget** — its own accounts, categories,
and transactions, addressable by id or the aliases `last-used` / `default`. (The YNAB API itself
has since renamed this resource "Plan"; this server and its docs keep calling it a Budget, and the
API still accepts the older `/budgets/...` paths these tools use.) Most other tools take an
optional `budget_id` — leave it out and the server falls back to `YNAB_BUDGET_ID` (default
`last-used`).

`get_user` lives in this group too: it just confirms which YNAB account the server is
authenticated as.

Every tool below is a read — nothing in this
[toolset changes a budget](/how-it-works/#toolsets), so it survives the read-only default
described in [what ynab-mcp can and cannot do](/trust/#read-only-by-default).
