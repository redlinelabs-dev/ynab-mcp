import { describe, expect, it } from "vitest";

import type { OAuthConfig } from "../src/oauth-config.js";
import type { OAuthStorage } from "../src/worker-config.js";

import { handleOAuthAuthorize, handleOAuthCallback } from "../src/oauth-handler.js";

const config: OAuthConfig = {
  authorizeEndpoint: "https://app.ynab.com/oauth/authorize",
  tokenEndpoint: "https://app.ynab.com/oauth/token",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://ynab.example.com/callback",
  cookieSecret: "test-cookie-secret",
};

const tokenResponse = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  token_type: "bearer",
  expires_in: 7200,
};

function fakeFetch(status: number, payload: unknown) {
  const fn: typeof fetch = (_input, _init) =>
    Promise.resolve(new Response(JSON.stringify(payload), { status }));
  return fn;
}

function fakeStorage(): { storage: OAuthStorage; puts: Array<{ key: string; val: unknown }> } {
  const puts: Array<{ key: string; val: unknown }> = [];
  const storage: OAuthStorage = {
    get: async (_key: string) => undefined,
    put: async (key: string, val: unknown) => {
      puts.push({ key, val });
    },
  };
  return { storage, puts };
}

// Calls handleOAuthAuthorize and builds a matching callback request (valid state roundtrip).
function makeCallbackRequest(
  pathAndQuery: string,
  scope: "read-only" | "full" = "read-only",
): Request {
  const authRes = handleOAuthAuthorize(config, scope);
  const location = authRes.headers.get("location") ?? "";
  const state = new URL(location).searchParams.get("state") ?? "";
  const setCookie = authRes.headers.get("set-cookie") ?? "";
  const stateCookie = setCookie.split(";")[0] ?? "";

  const base = "https://ynab.example.com";
  const url = new URL(`${base}${pathAndQuery}`);
  if (state) url.searchParams.set("state", state);

  return new Request(url.toString(), { headers: { Cookie: stateCookie } });
}

describe("handleOAuthCallback", () => {
  it("returns 400 when the code query param is missing", async () => {
    const req = makeCallbackRequest("/callback");
    const { storage } = fakeStorage();

    const res = await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(res.status).toBe(400);
  });

  it("returns 400 when the state param is missing", async () => {
    const req = new Request("https://ynab.example.com/callback?code=auth-code-123");
    const { storage } = fakeStorage();

    const res = await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(res.status).toBe(400);
  });

  it("returns 400 when the state cookie is absent", async () => {
    const req = new Request(
      "https://ynab.example.com/callback?code=auth-code-123&state=some-state",
    );
    const { storage } = fakeStorage();

    const res = await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(res.status).toBe(400);
  });

  it("returns 400 when the state param does not match the cookie", async () => {
    const authRes = handleOAuthAuthorize(config);
    const setCookie = authRes.headers.get("set-cookie") ?? "";
    const stateCookie = setCookie.split(";")[0] ?? "";

    const req = new Request(
      "https://ynab.example.com/callback?code=auth-code-123&state=wrong-state",
      { headers: { Cookie: stateCookie } },
    );
    const { storage } = fakeStorage();

    const res = await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(res.status).toBe(400);
  });

  it("exchanges code and stores OAuth props when code and state are valid", async () => {
    const req = makeCallbackRequest("/callback?code=auth-code-123");
    const nowMs = 1000000000000;
    const { storage, puts } = fakeStorage();

    const res = await handleOAuthCallback(
      req,
      storage,
      config,
      fakeFetch(200, tokenResponse),
      nowMs,
    );

    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBe("oauth_props");
  });

  it("stores props with expiresAt = nowMs + expiresIn * 1000", async () => {
    const req = makeCallbackRequest("/callback?code=auth-code-123");
    const nowMs = 1000000000000;
    const { storage, puts } = fakeStorage();

    await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), nowMs);

    expect(puts[0]?.val).toMatchObject({ expiresAt: nowMs + tokenResponse.expires_in * 1000 });
  });

  it("stores the access and refresh tokens from YNAB response", async () => {
    const req = makeCallbackRequest("/callback?code=auth-code-123");
    const { storage, puts } = fakeStorage();

    await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(puts[0]?.val).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("stores readOnly=true in props when the default (read-only) scope was used", async () => {
    const req = makeCallbackRequest("/callback?code=auth-code-123");
    const { storage, puts } = fakeStorage();

    await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(puts[0]?.val).toMatchObject({ readOnly: true });
  });

  it("stores readOnly=false in props when full scope was used", async () => {
    const req = makeCallbackRequest("/callback?code=auth-code-123", "full");
    const { storage, puts } = fakeStorage();

    await handleOAuthCallback(req, storage, config, fakeFetch(200, tokenResponse), 0);

    expect(puts[0]?.val).toMatchObject({ readOnly: false });
  });

  it("returns 502 with a message when YNAB token exchange fails", async () => {
    const req = makeCallbackRequest("/callback?code=bad-code");
    const { storage } = fakeStorage();

    const res = await handleOAuthCallback(
      req,
      storage,
      config,
      fakeFetch(400, { error: "invalid_grant" }),
      0,
    );

    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("handleOAuthAuthorize", () => {
  it("returns a 302 redirect", () => {
    const res = handleOAuthAuthorize(config);
    expect(res.status).toBe(302);
  });

  it("redirects to the YNAB authorize endpoint", () => {
    const res = handleOAuthAuthorize(config);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("https://app.ynab.com/oauth/authorize")).toBe(true);
  });

  it("includes client_id in the redirect URL", () => {
    const res = handleOAuthAuthorize(config);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
  });

  it("includes redirect_uri in the redirect URL", () => {
    const res = handleOAuthAuthorize(config);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.searchParams.get("redirect_uri")).toBe("https://ynab.example.com/callback");
  });

  it("includes response_type=code in the redirect URL", () => {
    const res = handleOAuthAuthorize(config);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("includes a non-empty state param in the redirect URL", () => {
    const res = handleOAuthAuthorize(config);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("sets an HttpOnly oauth_state cookie matching the state param", () => {
    const res = handleOAuthAuthorize(config);
    const location = res.headers.get("location") ?? "";
    const state = new URL(location).searchParams.get("state") ?? "";
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`oauth_state=${state}`);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("generates a different state on each call", () => {
    const state1 = new URL(
      handleOAuthAuthorize(config).headers.get("location") ?? "",
    ).searchParams.get("state");
    const state2 = new URL(
      handleOAuthAuthorize(config).headers.get("location") ?? "",
    ).searchParams.get("state");
    expect(state1).not.toBe(state2);
  });

  it("includes scope=read-only in the redirect URL by default", () => {
    const res = handleOAuthAuthorize(config);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.searchParams.get("scope")).toBe("read-only");
  });

  it("omits the scope param when scope='full' (grants write access)", () => {
    const res = handleOAuthAuthorize(config, "full");
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});
