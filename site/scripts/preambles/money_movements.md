Money movements are YNAB's record of transfers and other budget-to-budget or account-to-account
movements, grouped where YNAB groups them. This [toolset](/how-it-works/#toolsets) is read-only —
there's no tool here that creates or edits a movement, only ones that list what already happened,
either across the whole budget or scoped to one month. Nothing here is affected by the read-only
default described in [what ynab-mcp can and cannot do](/trust/#read-only-by-default); creating
the underlying entries is the job of
[the Transactions toolset](/reference/transactions/).

Each movement's `amount` comes back in [milliunits](/how-it-works/#milliunits) — `1000` is one
currency unit — alongside a human-readable `amount_units` sibling.
