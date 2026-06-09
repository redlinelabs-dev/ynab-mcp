import { describe, expect, it } from "vitest";

import type { OAuthConfig } from "../src/oauth-config.js";

import { exchangeYnabCode } from "../src/ynab-oauth.js";

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
});
