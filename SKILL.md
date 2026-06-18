# YNAB OAuth API — reference

How YNAB's OAuth 2.0 works, as used by this server's upstream auth leg
(`src/ynab-oauth.ts`, `src/oauth-server.ts`). Verified against YNAB's official API
docs (<https://api.ynab.com/>) and confirmed against the live service, 2026-06.

This server is an **OAuth proxy**: it is the authorization server to MCP clients,
and an OAuth _client_ of YNAB. Everything below is the YNAB-client side.

## Endpoints

| Purpose   | URL                                    | Method                 |
| --------- | -------------------------------------- | ---------------------- |
| Authorize | `https://app.ynab.com/oauth/authorize` | GET (browser redirect) |
| Token     | `https://app.ynab.com/oauth/token`     | POST (form-encoded)    |
| API base  | `https://api.ynab.com/v1`              | Bearer access token    |

## App registration

Create an OAuth Application at **YNAB → Account Settings → Developer Settings**. You get
a **Client ID** and **Client Secret** (confidential client). New apps run in
**Restricted Mode** — they can issue tokens to at most **25 users** until YNAB reviews
the app (~2–4 weeks). Fine for personal/small use.

**Redirect URIs must be pre-registered and matched _exactly_.** New apps come with three
defaults: `urn:ietf:wg:oauth:2.0:oob`, `http://localhost`, `http://127.0.0.1`. Add your
real callback (e.g. `https://ynab.<host>.ts.net/callback`) — a non-https, trailing-slash,
or otherwise mismatched `redirect_uri` makes the authorize page show **"An error has
occurred"** (this is the #1 setup failure; the error is rendered by YNAB before login).

## Authorization Code grant (what this server uses)

### 1. Authorize (browser)

Redirect the user's browser to the authorize endpoint with:

| Param                   | Notes                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `client_id`             | your app's Client ID                                          |
| `redirect_uri`          | must exactly match a registered URI                           |
| `response_type`         | `code`                                                        |
| `scope`                 | **optional**; `read-only` for read-only, omit for full access |
| `state`                 | recommended (CSRF)                                            |
| `code_challenge`        | PKCE (S256); optional but supported, see note                 |
| `code_challenge_method` | `S256`                                                        |

YNAB shows an "Authorize <app>" page; on approval it redirects to
`redirect_uri?code=<auth_code>&state=<state>`.

**PKCE:** YNAB supports `code_challenge`/`code_challenge_method=S256` and accepts them
on a **confidential** client (one with a secret) — we send them. The client secret is
still required at the token step regardless.

### 2. Exchange code → tokens (POST `…/oauth/token`, form-encoded)

```
grant_type=authorization_code
client_id=<id>
client_secret=<secret>
redirect_uri=<same as authorize>
code=<auth_code>
code_verifier=<pkce verifier>   # if PKCE was used
```

Response: `{ "access_token", "refresh_token", "expires_in": 7200, "token_type": "bearer" }`.

### 3. Use the API

`Authorization: Bearer <access_token>` against `https://api.ynab.com/v1`. A `read-only`
token returns **403** on any POST/PATCH/DELETE.

### 4. Refresh (POST `…/oauth/token`, form-encoded)

```
grant_type=refresh_token
client_id=<id>
client_secret=<secret>
refresh_token=<refresh_token>
```

Response is the same shape — a fresh `access_token` **and a new `refresh_token`**.

## Token lifetimes (the important part)

- **Access token: 2 hours** (`expires_in: 7200`). Refresh transparently before/at expiry.
- **Refresh token: no stated expiry, no inactivity timeout** — it persists until the user
  revokes the app. So a connection authenticated once can stay live **indefinitely** by
  refreshing. This is the "connect once, forever" property.
- **YNAB rotates the refresh token on every refresh.** Each `refresh_token` grant returns a
  **new** refresh token; the old one is single-use. You MUST persist the returned
  `refresh_token` or the next refresh fails. Refresh from a **single** code path to avoid
  using a stale (already-rotated) refresh token — this server refreshes the YNAB token only
  in the `/mcp` request handler, on actual use.

## Other constraints

- **Rate limit: 200 requests/hour per access token**, rolling window, `429` over limit.
  Favor bulk endpoints and server-side aggregation over many single calls.
- **No bank linking via the API** — `POST /accounts` makes manual accounts only;
  `POST /transactions/import` only refreshes accounts already bank-linked in the YNAB app.

## How this server maps to the above

- `src/ynab-oauth.ts` — `exchangeYnabCode` (step 2, with PKCE verifier), `refreshYnabToken`
  (step 4), `fetchYnabUserId` (`GET /v1/user`, used to key the grant).
- `src/oauth-server.ts` — `beginUpstreamLogin` builds the step-1 URL with PKCE; `handleCallback`
  runs step 2 and stores the sealed grant.
- `src/server.ts` `handleMcp` — the single place the YNAB token is refreshed (step 4), on use,
  persisting the rotated refresh token back to the grant.
