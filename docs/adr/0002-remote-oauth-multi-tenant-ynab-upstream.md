# Remote, multi-tenant server authenticated via OAuth, with YNAB as the upstream identity provider

Status: accepted (supersedes the scaffold's stdio + Personal Access Token model)

ynab-mcp will be distributed as a **remote** (Streamable HTTP) MCP server that authenticates each
MCP client with **OAuth** — the "log in via a browser tab" experience. Because a shared instance
must never mix users' finances, **YNAB itself is the upstream identity provider**: the server acts
as an OAuth proxy, brokering YNAB's OAuth 2.0 (Authorization Code + PKCE + refresh tokens). Each
user connects **their own** YNAB account; the server stores per-user refresh tokens, **encrypted
and isolated per tenant**, and defaults to YNAB's **`read-only` scope** — write tools require an
explicit, separate scope elevation. The original stdio + Personal Access Token path is retained
**only as a local developer escape hatch** (a `YNAB_TOKEN` env that bypasses OAuth for dev/test),
not as the product.

## Considered options

- **stdio + Personal Access Token (the scaffold).** Rejected as the product: no browser login,
  single-user, requires manually creating and pasting a token, and can't safely back a shared
  instance. Kept as a dev-only escape hatch.
- **A separate identity provider (Google/GitHub) + a linked YNAB token.** Rejected: adds a second
  login and still needs each user's YNAB credentials, so YNAB may as well be the IdP directly.

## Consequences

- Requires hosting and persistent, encrypted, per-user token storage (see ADR-0003).
- **YNAB "Restricted Mode" caps a new OAuth app at 25 users** until YNAB reviews it (~2–4 weeks) —
  fine for personal/small use, a gate before opening it widely.
- YNAB access tokens expire after **2 hours**, so the server must refresh transparently; the
  per-user 200 req/hr limit is _not_ pooled across tenants (good for multi-tenancy).
- **Read-only by default** means the write tools (`✏️`) need a consent/scope-elevation flow; a
  read-only YNAB token returns `403` on any mutation, which is the secure-by-default backstop.
