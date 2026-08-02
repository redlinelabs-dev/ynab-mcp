A payee is who a transaction was paid to or received from. This group covers listing, reading, and
renaming payees, plus the GPS locations the YNAB mobile app records for some of them
(`list_payee_locations`, `get_payee_location`, `payee_locations`) — those are read-only; nothing
here can set a location, only read what the app already recorded.

Only `create_payee` and `update_payee` write, so the read-only default leaves the other five
tools in this [toolset](/how-it-works/#toolsets) intact — see
[what read-only actually changes](/trust/#read-only-by-default). To see what was spent at a
payee rather than the payee record itself, use `payee_transactions` in
[the Transactions toolset](/reference/transactions/).
