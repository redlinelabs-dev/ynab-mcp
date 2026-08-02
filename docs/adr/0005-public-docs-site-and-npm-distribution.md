# Public docs site (in-repo Starlight), npm distribution under MIT, and a fixture demo mode

Status: accepted (amends ADR-0002; restores the npm distribution that ADR-0003 dropped)

ynab-mcp gets a **public documentation site for consumers** (not contributors) at
**`ynab-mcp.redlinelabs.dev`**: people connecting an AI agent to an instance someone else hosts,
and Operators running their own. It is built with **Astro + Starlight plus a custom landing page**
(the atrium-site pattern), lives **in this repo under `site/`**, and deploys to **GitHub Pages**
via a path-filtered workflow with a committed `CNAME`. To make the documented on-ramp real, the
package is **published to npm under MIT** (un-`private`, a `bin` for the stdio entry), and the
stdio + PAT mode is re-promoted to a supported product path (see the ADR-0002 amendment): PAT is
the five-minute solo quick start, the remote OAuth server is the recommended home for households
and shared instances.

## Decisions and why

- **In-repo `site/`, not a separate repo.** atrium's split existed only because its app repo is
  private; this repo is public. In-repo lets the tool reference be generated from the same commit
  it documents, so a PR that changes a tool regenerates its docs in the same diff.
- **Starlight, not bare Astro (keel-style).** The site is a documentation tree — a quick start,
  per-harness connect guides, an Operator guide, a Trust page, and a reference of ~46 tools —
  which needs the sidebar, static search, and content collections Starlight ships. keel's
  plain-english character is carried by prose conventions, not by the absence of a framework.
- **The tool reference is generated from the `TOOLS` array; the YNAB API mapping lives in code.**
  Each `TOOLS` entry carries `endpoints` metadata (method, path, and the `api.ynab.com/v1`
  OpenAPI operation anchor); a build script emits one reference page per toolset group with
  parameters derived from the Zod input schemas and a backlink per tool. A test requires every
  tool to declare its endpoints, so drift is structurally impossible. Hand-written prose lives in
  per-group preambles the generator preserves.
- **Demo mode is a server feature, not a site simulation.** `YNAB_DEMO=1` serves a canned,
  fictional demo Budget with no token and no YNAB account, so anyone can feel the server working
  in their own harness in a minute, and every screenshot on the site is a **real** capture of a
  real session against fake finances. Simulating other companies' UIs (fake Claude/Codex chrome)
  was rejected: fabricated screenshots are misleading, a trademark problem, and a maintenance
  sink.
- **Prose register.** Plain english everywhere except a single jargon-consolidated "How it works"
  page (keel's `/technical` pattern), keel's claims rule (every claim falsifiable against the
  repo), and a docs test pinning load-bearing claims and tool counts.

## Consequences

- `"private": true` and `UNLICENSED` are removed; a public repo with no license granted nobody
  the right to run it, which contradicted the site's entire premise. MIT chosen: the norm for MCP
  servers, and nothing here needs copyleft protection — every user brings their own YNAB
  credentials.
- The Release workflow gains an npm publish step; release-please is unchanged.
- ADR-0003's "npm is no longer the deploy path" is superseded on that point (ADR-0004 already
  superseded its hosting choice); Docker remains the deploy path for the remote server.
- The docs site is a consumer surface: contributor/architecture docs stay in-repo (`CLAUDE.md`,
  `docs/`, ADRs) and are not published to the site.

## Amendment (2026-08-02): OAuth is the preferred connection method

"PAT is the five-minute solo quick start, documented first" is revised: every connect page now
leads with **OAuth against a hosted instance (recommended)** — Claude Desktop custom connectors,
Claude Code's HTTP transport, and Codex all support the browser OAuth flow, and the server already
ships the Dynamic Client Registration they require. The PAT/stdio path remains fully supported but
is presented as the alternate for solo users who won't run the server; demo mode
(`YNAB_DEMO=1 npx @redlinelabs/ynab-mcp`) stays the zero-credential try-it path. Because desktop
OAuth flows want HTTPS, the operator guide blesses `tailscale serve` as the recommended exposure.
