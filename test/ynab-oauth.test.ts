import { describe, expect, it } from "vitest";

import type { OAuthConfig } from "../src/oauth-config.js";

import { exchangeYnabCode, fetchYnabUserId, refreshYnabToken } from "../src/ynab-oauth.js";

const config: OAuthConfig = {
  authorizeEndpoint: "https://app.ynab.com/oauth/authorize",
  tokenEndpoint: "https://app.ynab.com/oauth/token",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://ynab.example.com/callback",
  cookieSecret: "test-cookie-secret",
};

const tokenResponse = {
  access_token: "ynab-access-token",
  refresh_token: "ynab-refresh-token",
  token_type: "bearer",
  expires_in: 7200,
};

function fakeFetch(status: number, payload: unknown) {
  const calls: { url: string; method: string; body: string }[] = [];
  const fn: typeof fetch = (input, init) => {
    const req = new Request(input, init);
    return req.text().then((body) => {
      calls.push({ url: req.url, method: req.method, body });
      return new Response(JSON.stringify(payload), { status });
    });
  };
  return { fn, calls };
}

describe("exchangeYnabCode", () => {
  it("returns accessToken, refreshToken, and expiresIn from the YNAB token response", async () => {
    const { fn } = fakeFetch(200, tokenResponse);

    const tokens = await exchangeYnabCode("auth-code-123", config, fn);

    expect(tokens.accessToken).toBe("ynab-access-token");
    expect(tokens.refreshToken).toBe("ynab-refresh-token");
    expect(tokens.expiresIn).toBe(7200);
  });

  it("POSTs to the YNAB token endpoint with correct form-encoded parameters", async () => {
    const { fn, calls } = fakeFetch(200, tokenResponse);

    await exchangeYnabCode("auth-code-123", config, fn);

    const call = calls[0];
    expect(call?.url).toBe("https://app.ynab.com/oauth/token");
    expect(call?.method).toBe("POST");
    const params = new URLSearchParams(call?.body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-123");
    expect(params.get("client_id")).toBe("test-client-id");
    expect(params.get("client_secret")).toBe("test-client-secret");
    expect(params.get("redirect_uri")).toBe("https://ynab.example.com/callback");
  });

  it("throws a descriptive error when YNAB responds with non-2xx", async () => {
    const { fn } = fakeFetch(400, { error: "invalid_grant" });

    await expect(exchangeYnabCode("bad-code", config, fn)).rejects.toThrow(/400/);
  });

  it("includes code_verifier when a PKCE verifier is supplied", async () => {
    const { fn, calls } = fakeFetch(200, tokenResponse);

    await exchangeYnabCode("auth-code-123", config, fn, "the-pkce-verifier");

    const params = new URLSearchParams(calls[0]?.body);
    expect(params.get("code_verifier")).toBe("the-pkce-verifier");
  });

  it("omits code_verifier when no PKCE verifier is supplied", async () => {
    const { fn, calls } = fakeFetch(200, tokenResponse);

    await exchangeYnabCode("auth-code-123", config, fn);

    const params = new URLSearchParams(calls[0]?.body);
    expect(params.has("code_verifier")).toBe(false);
  });
});

describe("fetchYnabUserId", () => {
  it("returns the user id from the YNAB /user response", async () => {
    const { fn } = fakeFetch(200, { data: { user: { id: "user-abc-123" } } });

    const id = await fetchYnabUserId("access-token", fn);

    expect(id).toBe("user-abc-123");
  });

  it("sends the access token as a Bearer Authorization header", async () => {
    const headers: string[] = [];
    const fn: typeof fetch = (input, init) => {
      const req = new Request(input, init);
      headers.push(req.headers.get("authorization") ?? "");
      return Promise.resolve(
        new Response(JSON.stringify({ data: { user: { id: "u1" } } }), { status: 200 }),
      );
    };

    await fetchYnabUserId("my-access-token", fn);

    expect(headers[0]).toBe("Bearer my-access-token");
  });

  it("throws a descriptive error when YNAB responds with non-2xx", async () => {
    const { fn } = fakeFetch(401, { error: "unauthorized" });

    await expect(fetchYnabUserId("bad-token", fn)).rejects.toThrow(/401/);
  });
});

describe("refreshYnabToken", () => {
  it("returns accessToken, refreshToken, and expiresIn from the YNAB token response", async () => {
    const { fn } = fakeFetch(200, tokenResponse);

    const tokens = await refreshYnabToken("old-refresh-token", config, fn);

    expect(tokens.accessToken).toBe("ynab-access-token");
    expect(tokens.refreshToken).toBe("ynab-refresh-token");
    expect(tokens.expiresIn).toBe(7200);
  });

  it("POSTs to the YNAB token endpoint with grant_type=refresh_token and the refresh token", async () => {
    const { fn, calls } = fakeFetch(200, tokenResponse);

    await refreshYnabToken("old-refresh-token", config, fn);

    const call = calls[0];
    expect(call?.url).toBe("https://app.ynab.com/oauth/token");
    expect(call?.method).toBe("POST");
    const params = new URLSearchParams(call?.body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old-refresh-token");
    expect(params.get("client_id")).toBe("test-client-id");
    expect(params.get("client_secret")).toBe("test-client-secret");
  });

  it("throws a descriptive error when YNAB responds with non-2xx", async () => {
    const { fn } = fakeFetch(401, { error: "invalid_token" });

    await expect(refreshYnabToken("expired-token", config, fn)).rejects.toThrow(/401/);
  });
});
