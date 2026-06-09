# Modular architecture with an injected-fetch client, and Vitest for tests

Status: accepted

ynab-mcp began as a single-file stdio server mirroring `bitbucket-mcp` (the house style is "one
file, no test runner"). We deliberately deviated: the server is split into transport-agnostic
modules behind a `YnabClient` whose `fetch` is **injected** (defaults to the global), and we added
**Vitest** (folded into `npm run check`). We did this so the tool logic is unit-testable without
hitting the live YNAB API or its 200 req/hr limit, and so the core (`client`, `tools`, `schemas`,
`duplicates`, `summary`, `transactions`, `format`) is runtime-agnostic.

## Consequences

- Deviates from the two `bitbucket-mcp` conventions on purpose; this is the intended divergence, not
  drift. (The oxlint config already anticipated Vitest.)
- Tests obey the same lint rules as source (no `any`, no `as` — type the fake `fetch` with an
  annotation, not an assertion).
- **This is what makes ADR-0003 cheap:** because the core never depends on Node-only APIs or on the
  stdio transport, porting it to the Cloudflare Workers runtime touches only the bootstrap + auth
  layer, not the business logic.
