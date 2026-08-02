An account is a place money sits inside a Budget — checking, savings, a credit card. This server
can only create and read **manual** accounts: ones you maintain by hand, with no bank connection.
Linking a bank account for automatic import is only possible from the YNAB app itself — the API
has no endpoint for it, so no MCP tool can do it either (see
[why bank linking is a hard limit of the YNAB API](/trust/#what-this-server-cannot-do)).

`create_account` is the one write tool in this
[toolset](/how-it-works/#toolsets); the read-only default drops it, along with every other
mutating tool — see [what read-only actually changes](/trust/#read-only-by-default).
