import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

import { beforeEach, describe, expect, it } from "vitest";

import type { OAuthConfig } from "../src/oauth-config.js";

import { importKey, unseal } from "../src/encryption.js";
import { YnabOAuthProvider } from "../src/oauth-server.js";
import { Store } from "../src/store.js";

const config: OAuthConfig = {
  authorizeEndpoint: "https://app.ynab.com/oauth/authorize",
  tokenEndpoint: "https://app.ynab.com/oauth/token",
  clientId: "ynab-app-id",
  clientSecret: "ynab-app-secret",
  redirectUri: "https://ynab.example.com/callback",
  cookieSecret: "unused-here",
};

const KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32)));
const NOW = 1_000_000;

const client: OAuthClientInformationFull = {
  client_id: "client-1",
  redirect_uris: ["https://client.example/cb"],
};

function fakeFetch(bodies: { url: string; body: string }[]) {
  const fn: typeof fetch = (input, init) => {
    const req = new Request(input, init);
    return req.text().then((body) => {
      bodies.push({ url: req.url, body });
      if (req.url.includes("/oauth/token")) {
        const grant = new URLSearchParams(body).get("grant_type");
        const access = grant === "refresh_token" ? "ynab-access-2" : "ynab-access-1";
        const refresh = grant === "refresh_token" ? "ynab-refresh-2" : "ynab-refresh-1";
        return new Response(
          JSON.stringify({ access_token: access, refresh_token: refresh, expires_in: 7200 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: { user: { id: "user-9" } } }), { status: 200 });
    });
  };
  return fn;
}

function provider(store: Store, calls: { url: string; body: string }[]): YnabOAuthProvider {
  return new YnabOAuthProvider({
    store,
    config,
    encKey: KEY_DUMMY,
    fetchFn: fakeFetch(calls),
    accessTokenTtlSec: 7000,
    now: () => NOW,
  });
}

let KEY_DUMMY: CryptoKey;
beforeEach(async () => {
  KEY_DUMMY = await importKey(KEY_B64);
});

// Seed a pending authorize request + an upstream login_state, as if the user had
// just submitted consent and is returning from YNAB with `state`/`code`.
function seedLogin(store: Store, scope: "read-only" | "full"): string {
  store.putPendingAuth({
    id: "pending-1",
    clientId: client.client_id,
    redirectUri: "https://client.example/cb",
    codeChallenge: "mcp-challenge",
    state: "mcp-state",
    scope: "",
    expiresAt: NOW + 600_000,
  });
  store.putLoginState({
    upstreamState: "ustate-1",
    pendingId: "pending-1",
    verifier: "ynab-verifier",
    scope,
    expiresAt: NOW + 600_000,
  });
  return "ustate-1";
}

describe("clientsStore", () => {
  it("registers and reads back a client", () => {
    const store = new Store(":memory:");
    const p = provider(store, []);
    const registered = p.clientsStore.registerClient?.(client);
    expect(registered).toBeDefined();
    expect(p.clientsStore.getClient("client-1")).toMatchObject({ client_id: "client-1" });
  });
});

describe("handleCallback", () => {
  it("exchanges the YNAB code, creates a sealed grant, and redirects with our code", async () => {
    const store = new Store(":memory:");
    const calls: { url: string; body: string }[] = [];
    const p = provider(store, calls);
    seedLogin(store, "read-only");

    const result = await p.handleCallback({ state: "ustate-1", code: "ynab-code" });

    expect(result.ok).toBe(true);
    const redirect = new URL(result.redirectTo ?? "");
    expect(redirect.origin + redirect.pathname).toBe("https://client.example/cb");
    expect(redirect.searchParams.get("state")).toBe("mcp-state");
    expect(redirect.searchParams.get("code")).toBeTruthy();

    // The token exchange used the upstream PKCE verifier.
    const tokenCall = calls.find((c) => c.url.includes("/oauth/token"));
    expect(new URLSearchParams(tokenCall?.body).get("code_verifier")).toBe("ynab-verifier");
  });

  it("seals the YNAB tokens at rest (not plaintext in the grant)", async () => {
    const store = new Store(":memory:");
    const p = provider(store, []);
    const code = await completeAndGetCode(store, p, "full");
    const tokens = await p.exchangeAuthorizationCode(client, code);
    const info = await p.verifyAccessToken(tokens.access_token);
    const grantId = typeof info.extra?.["grantId"] === "string" ? info.extra["grantId"] : "";

    const grant = store.getGrant(grantId);
    expect(grant?.encAccess).not.toContain("ynab-access-1");
    expect(await unseal(KEY_DUMMY, grant?.encAccess ?? "")).toBe("ynab-access-1");
    expect(grant?.readOnly).toBe(false);
  });

  it("returns 400 when the login state is missing/expired", async () => {
    const store = new Store(":memory:");
    const p = provider(store, []);
    const result = await p.handleCallback({ state: "nope", code: "c" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("returns 502 when the YNAB exchange fails", async () => {
    const store = new Store(":memory:");
    const failing = new YnabOAuthProvider({
      store,
      config,
      encKey: KEY_DUMMY,
      fetchFn: () => Promise.resolve(new Response("nope", { status: 400 })),
      accessTokenTtlSec: 7000,
      now: () => NOW,
    });
    seedLogin(store, "read-only");
    const result = await failing.handleCallback({ state: "ustate-1", code: "bad" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
  });
});

// Helper: complete a callback and pull the issued authorization code out of the redirect.
async function completeAndGetCode(store: Store, p: YnabOAuthProvider, scope: "read-only" | "full") {
  seedLogin(store, scope);
  const result = await p.handleCallback({ state: "ustate-1", code: "ynab-code" });
  return new URL(result.redirectTo ?? "").searchParams.get("code") ?? "";
}

describe("token issuance + verification", () => {
  it("exchanges our auth code for access+refresh tokens and verifies the access token", async () => {
    const store = new Store(":memory:");
    const p = provider(store, []);
    const code = await completeAndGetCode(store, p, "read-only");

    const tokens = await p.exchangeAuthorizationCode(client, code);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.refresh_token).toBeTruthy();

    const info = await p.verifyAccessToken(tokens.access_token);
    expect(info.clientId).toBe("client-1");
    expect(info.scopes).toEqual(["ynab.read"]);
    expect(typeof info.extra?.["grantId"]).toBe("string");
  });

  it("returns the stored PKCE challenge for the issued code", async () => {
    const store = new Store(":memory:");
    const p = provider(store, []);
    const code = await completeAndGetCode(store, p, "read-only");
    expect(await p.challengeForAuthorizationCode(client, code)).toBe("mcp-challenge");
  });

  it("rejects an already-consumed auth code (one-time use)", async () => {
    const store = new Store(":memory:");
    const p = provider(store, []);
    const code = await completeAndGetCode(store, p, "read-only");
    await p.exchangeAuthorizationCode(client, code);
    await expect(p.exchangeAuthorizationCode(client, code)).rejects.toThrow();
  });

  it("mints a fresh access token on refresh while keeping the refresh token reusable (non-rotating)", async () => {
    const store = new Store(":memory:");
    const calls: { url: string; body: string }[] = [];
    const p = provider(store, calls);
    const code = await completeAndGetCode(store, p, "full");
    const first = await p.exchangeAuthorizationCode(client, code);

    const second = await p.exchangeRefreshToken(client, first.refresh_token ?? "");
    // New access token, same (non-rotating) refresh token.
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.refresh_token).toBe(first.refresh_token);

    // The refresh endpoint never makes a YNAB refresh call — that happens lazily
    // on /mcp use (the only calls are the authorization-code exchange from setup).
    expect(
      calls.some((c) => new URLSearchParams(c.body).get("grant_type") === "refresh_token"),
    ).toBe(false);

    // The same refresh token still works afterward (a hiccup can't void it).
    const third = await p.exchangeRefreshToken(client, first.refresh_token ?? "");
    expect(third.access_token).not.toBe(second.access_token);
    expect(await p.verifyAccessToken(third.access_token)).toBeDefined();
  });
});
