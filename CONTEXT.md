# ynab-mcp

An MCP server that exposes one user's YNAB (You Need A Budget) data and day-to-day budget
operations to an AI assistant. This glossary fixes the vocabulary; design decisions live in
`docs/adr/`, scope in `ROADMAP.md`.

## Budgeting domain

**Budget**:
A self-contained YNAB plan with its own accounts, categories, and transactions. Addressable by id
or the aliases `last-used` / `default`.
_Avoid_: plan (YNAB's newer internal name), workspace.

**Account**:
A place money sits within a Budget. A **manual account** is created and maintained by hand (the only
kind this server can create). A **linked account** is connected to a bank for direct import — only
the YNAB app can establish that link.
_Avoid_: wallet.

**Category**:
An envelope you assign money to within a Budget, holding a budgeted amount, activity, and balance
for a Month. Categories live inside a **category group**.

**Transaction**:
A single money movement on an Account. **Cleared** means it has settled at the bank; **approved**
means the user has confirmed it (imported transactions arrive unapproved). A **duplicate** is two or
more transactions on the same account with the same amount and date — a candidate for review, never
auto-removed.
_Avoid_: entry, line item.

**Payee**:
Who a Transaction was paid to or received from.
_Avoid_: merchant, vendor.

**Scheduled transaction**:
A recurring or future-dated Transaction template with a next date and frequency.
_Avoid_: recurring, subscription.

**Milliunits**:
The integer money unit of the YNAB API: 1000 milliunits = one currency unit. All amounts cross the
API as milliunits; human-facing values are the `*_units` siblings.
_Avoid_: cents, minor units.

## System

**Tenant**:
One authenticated connection between an MCP client and a YNAB account — concretely, one OAuth
**grant**. Isolation is per grant, not per human: the same person connecting from two MCP clients
holds two independent Tenants, each with its own stored refresh token, and revoking one never
touches the other. One Tenant's tokens and data are never visible to another.
_Avoid_: customer, client (those are budgeting-ambiguous here); user (one human ≠ one Tenant).

**Grant**:
The persisted record of one Tenant's authorization — the encrypted YNAB tokens plus the chosen
scope (read-only or full), keyed by the OAuth flow rather than by human identity. The unit of
isolation and of revocation.

**Toolset**:
A named group of tools (`budgets`, `accounts`, `categories`, `transactions`, `months`, `payees`,
`scheduled`) that an operator can enable or disable to keep the model's context lean.

**Read-only scope**:
A YNAB OAuth grant that permits reads but rejects every mutation with `403`. The secure-by-default
posture: a Tenant is read-only unless they explicitly elevate to allow writes.
_Avoid_: read access, view-only.
