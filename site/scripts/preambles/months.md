A budget month is YNAB's monthly summary — income, budgeted, activity, and to-be-budgeted, plus
every category's figures for that month. `month` accepts an ISO month (`"YYYY-MM-01"`) or the
string `"current"`, which is also the default.

Both tools are reads, so this [toolset](/how-it-works/#toolsets) stays available under the
read-only default described in
[what ynab-mcp can and cannot do](/trust/#read-only-by-default). The money figures — income,
budgeted, activity, to-be-budgeted — come back in [milliunits](/how-it-works/#milliunits), each
with a human-readable `*_units` sibling. To change
a month's budgeted amount, use `update_category_budget` in
[the Categories toolset](/reference/categories/).
