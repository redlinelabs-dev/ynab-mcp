# MCP SDK v2: serve both protocol eras, keep the v1 auth copy

Status: accepted (amends ADR-0004's transport choice)

MCP spec `2026-07-28` removes the `initialize` handshake: every request carries its protocol version
in a `_meta` envelope, and clients probe with `server/discover`. The v1 SDK (`@modelcontextprotocol/sdk`)
stops at `2025-11-25`, so we move to the v2 packages (`@modelcontextprotocol/server`, `/node`,
`/server-legacy`).

- **One endpoint, both eras.** `buildMcpHttpHandler` (`src/mcp-server.ts`) routes each request with
  the SDK's `isLegacyRequest`: 2026-era traffic goes to `createMcpHandler(…, { legacy: "reject",
responseMode: "json" })`, and 2025-era traffic to our own stateless
  `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse`. Existing clients keep working
  without changing their config. stdio uses `serveStdio`, which chooses the era from the first exchange.
- **Why not the SDK's built-in 2025 fallback.** `createMcpHandler`'s default `legacy: "stateless"`
  always answers with SSE. Reverse proxies (Tailscale `serve`) buffer SSE, so tool calls hang, which is
  the bug the v1 `enableJsonResponse: true` fixed. We route legacy traffic ourselves to keep JSON.
- **Auth stays on `@modelcontextprotocol/server-legacy/auth`.** v2 dropped the authorization-server
  helpers (`mcpAuthRouter`, `OAuthServerProvider`) and ships them only as that frozen v1 copy. The
  resource-server `requireBearerAuth` stays on the same copy on purpose: v2's maintained one (in
  `@modelcontextprotocol/express`) only recognizes the v2 `OAuthError`, so our provider's legacy
  `InvalidTokenError` would turn every bad token into a 500. Nothing on the wire changes: the endpoints,
  the metadata, and every issued token and grant in SQLite stay valid across the upgrade.

**Revisit when** the frozen auth copy blocks something. Then the likely path is moving the provider to
v2 `OAuthError` + `@modelcontextprotocol/express`'s `requireBearerAuth`, and replacing `mcpAuthRouter`
with a dedicated OAuth library.
