import { describe, expect, it } from "vitest";

import type { OAuthConfig } from "../src/oauth-config.js";
import type { OAuthStorage } from "../src/worker-config.js";

import { YnabClient } from "../src/client.js";
import {
  getOrRefreshToken,
  initFromStorage,
  makeToolContext,
  makeToolContextFromProps,
} from "../src/worker-config.js";

const oauthConfig: OAuthConfig = {
  authorizeEndpoint: "https://app.ynab.com/oauth/authorize",
  tokenEndpoint: "https://app.ynab.com/oauth/token",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://ynab.example.com/callback",
  cookieSecret: "test-cookie-secret",
};

const freshTokenResponse = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  token_type: "bearer",
  expires_in: 7200,
};

function fakeFetch(status: number, payload: unknown) {
  const calls: string[] = [];
  const fn: typeof fetch = (input, init) => {
    const req = new Request(input, init);
    calls.push(req.url);
    return Promise.resolve(new Response(JSON.stringify(payload), { status }));
  };
  return { fn, calls };
}

describe("makeToolContext", () => {
  it("throws a descriptive error when token is empty string", () => {
    expect(() => makeToolContext("")).toThrow(/YNAB_DEV_TOKEN/);
  });

  it("throws a descriptive error when token is whitespace-only", () => {
    expect(() => makeToolContext("   ")).toThrow(/YNAB_DEV_TOKEN/);
  });

  it("throws a descriptive error when token is undefined (missing Workers secret)", () => {
    expect(() => makeToolContext(undefined)).toThrow(/YNAB_DEV_TOKEN/);
  });

  it("throws a descriptive error when token is null (missing Workers secret)", () => {
    expect(() => makeToolContext(null)).toThrow(/YNAB_DEV_TOKEN/);
  });

  it("returns a ToolContext when a non-empty token is provided", () => {
    const ctx = makeToolContext("my-token");

    expect(ctx.client).toBeInstanceOf(YnabClient);
    expect(ctx.readOnly).toBe(true);
    expect(ctx.enabledGroups.size).toBeGreaterThan(0);
    expect(ctx.defaultBudget).toBe("last-used");
  });

  it("trims surrounding whitespace from the token (padded token succeeds, empty-after-trim fails)", () => {
    expect(() => makeToolContext("  my-token  ")).not.toThrow();
    expect(() => makeToolContext("     ")).toThrow(/YNAB_DEV_TOKEN/);
  });
});

describe("getOrRefreshToken", () => {
  it("returns the stored token without calling fetch when not expired", async () => {
    const { fn, calls } = fakeFetch(200, freshTokenResponse);
    const props = {
      accessToken: "current-token",
      refreshToken: "rt",
      expiresAt: 9999999999999,
      readOnly: true,
    };

    const result = await getOrRefreshToken(props, oauthConfig, fn, 1000000000000);

    expect(result.token).toBe("current-token");
    expect(result.refreshed).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("calls YNAB refresh and returns new token and updated props when token is expired", async () => {
    const { fn, calls } = fakeFetch(200, freshTokenResponse);
    const nowMs = 1000000000000;
    const props = {
      accessToken: "old-token",
      refreshToken: "old-rt",
      expiresAt: nowMs - 1,
      readOnly: true,
    };

    const result = await getOrRefreshToken(props, oauthConfig, fn, nowMs);

    expect(result.token).toBe("new-access-token");
    expect(result.refreshed).not.toBeNull();
    expect(result.refreshed?.accessToken).toBe("new-access-token");
    expect(result.refreshed?.refreshToken).toBe("new-refresh-token");
    expect(result.refreshed?.expiresAt).toBe(nowMs + 7200 * 1000);
    expect(calls).toHaveLength(1);
  });
});

describe("makeToolContextFromProps", () => {
  it("returns a ToolContext built from the current access token when not expired", async () => {
    const { fn } = fakeFetch(200, freshTokenResponse);
    const props = {
      accessToken: "current-token",
      refreshToken: "rt",
      expiresAt: 9999999999999,
      readOnly: true,
    };

    const { ctx, refreshed } = await makeToolContextFromProps(
      props,
      oauthConfig,
      fn,
      1000000000000,
    );

    expect(ctx.client).toBeInstanceOf(YnabClient);
    expect(ctx.readOnly).toBe(true);
    expect(ctx.enabledGroups.size).toBeGreaterThan(0);
    expect(refreshed).toBeNull();
  });

  it("returns a ToolContext built from the refreshed token when expired, with refreshed props", async () => {
    const { fn } = fakeFetch(200, freshTokenResponse);
    const nowMs = 1000000000000;
    const props = {
      accessToken: "old-token",
      refreshToken: "old-rt",
      expiresAt: nowMs - 1,
      readOnly: true,
    };

    const { ctx, refreshed } = await makeToolContextFromProps(props, oauthConfig, fn, nowMs);

    expect(ctx.client).toBeInstanceOf(YnabClient);
    expect(refreshed?.accessToken).toBe("new-access-token");
  });
});

describe("initFromStorage", () => {
  it("returns a ToolContext from stored OAuth props when token is not expired", async () => {
    const storedProps = {
      accessToken: "stored-token",
      refreshToken: "stored-rt",
      expiresAt: 9999999999999,
    };
    const storage: OAuthStorage = {
      get: async (_key) => storedProps,
      put: async (_key, _val) => {},
    };
    const { fn } = fakeFetch(200, freshTokenResponse);

    const { ctx, refreshed } = await initFromStorage(storage, oauthConfig, fn, 1000000000000);

    expect(ctx.client).toBeInstanceOf(YnabClient);
    expect(ctx.readOnly).toBe(true);
    expect(refreshed).toBeNull();
  });

  it("refreshes and persists new props when stored token is expired", async () => {
    const nowMs = 1000000000000;
    const storedProps = {
      accessToken: "old-token",
      refreshToken: "old-rt",
      expiresAt: nowMs - 1,
      readOnly: true,
    };
    const puts: Array<{ key: string; val: unknown }> = [];
    const storage: OAuthStorage = {
      get: async (_key) => storedProps,
      put: async (key, val) => {
        puts.push({ key, val });
      },
    };
    const { fn } = fakeFetch(200, freshTokenResponse);

    const { ctx, refreshed } = await initFromStorage(storage, oauthConfig, fn, nowMs);

    expect(ctx.client).toBeInstanceOf(YnabClient);
    expect(refreshed?.accessToken).toBe("new-access-token");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBe("oauth_props");
  });

  it("creates a non-read-only context when stored props have readOnly=false", async () => {
    const storedProps = {
      accessToken: "write-token",
      refreshToken: "write-rt",
      expiresAt: 9999999999999,
      readOnly: false,
    };
    const storage: OAuthStorage = {
      get: async (_key) => storedProps,
      put: async (_key, _val) => {},
    };
    const { fn } = fakeFetch(200, freshTokenResponse);

    const { ctx } = await initFromStorage(storage, oauthConfig, fn, 1000000000000);

    expect(ctx.readOnly).toBe(false);
  });

  it("throws a descriptive error when no OAuth props are stored", async () => {
    const storage: OAuthStorage = { get: async (_key) => undefined, put: async (_key, _val) => {} };
    const { fn } = fakeFetch(200, freshTokenResponse);

    await expect(initFromStorage(storage, oauthConfig, fn, 1000000000000)).rejects.toThrow(
      /oauth/i,
    );
  });
});
