A scheduled transaction is a template for a recurring or future-dated transaction — rent due on
the 1st, a subscription every month — with a next date and a frequency. These tools create, read,
update, and delete the template itself; they don't control whether YNAB has posted an occurrence
of it yet — once one has been posted, it is an ordinary transaction in
[the Transactions toolset](/reference/transactions/).

`amount` is in [milliunits](/how-it-works/#milliunits), negative for an outflow. Three of the
five tools write, so the read-only default leaves only the two reads — see
[what read-only actually changes](/trust/#read-only-by-default).
