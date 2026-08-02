A category is an envelope you assign money to — rent, groceries, the vacation fund — with a
budgeted amount, activity, and balance for a given month. Categories live inside category groups.
Two tools here operate on a specific month (`update_category_budget`, `get_month_category`); the
rest operate on the category's own record. Note: the YNAB API has no endpoint for reordering
categories within a group, so no tool here can do that either.

`update_category_budget` takes its `budgeted` amount in
[milliunits](/how-it-works/#milliunits) — `1000` is one currency unit, so budgeting $250 means
sending `250000`. Five of the eight tools here write; all five disappear under the read-only
default — see [what read-only actually changes](/trust/#read-only-by-default).
