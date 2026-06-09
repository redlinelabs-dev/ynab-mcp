import { describe, expect, it } from "vitest";

import { oauthConfig } from "../src/oauth-config.js";

const validEnv = {
  YNAB_CLIENT_ID: "test-client-id",
  YNAB_CLIENT_SECRET: "test-client-secret",
  YNAB_REDIRECT_URI: "https://ynab.example.com/callback",
  COOKIE_SECRET: "test-cookie-secret",
};

describe("oauthConfig", () => {
  it("returns YNAB authorize and token endpoints for a valid env", () => {
    const config = oauthConfig(validEnv);

    expect(config.authorizeEndpoint).toBe("https://app.ynab.com/oauth/authorize");
    expect(config.tokenEndpoint).toBe("https://app.ynab.com/oauth/token");
    expect(config.clientId).toBe("test-client-id");
    expect(config.redirectUri).toBe("https://ynab.example.com/callback");
  });

  it("throws a descriptive error when YNAB_REDIRECT_URI is missing", () => {
    expect(() => oauthConfig({ ...validEnv, YNAB_REDIRECT_URI: "" })).toThrow(/YNAB_REDIRECT_URI/);
  });

  it("throws a descriptive error when YNAB_CLIENT_ID is missing", () => {
    expect(() => oauthConfig({ ...validEnv, YNAB_CLIENT_ID: "" })).toThrow(/YNAB_CLIENT_ID/);
  });

  it("throws a descriptive error when YNAB_CLIENT_SECRET is missing", () => {
    expect(() => oauthConfig({ ...validEnv, YNAB_CLIENT_SECRET: "" })).toThrow(
      /YNAB_CLIENT_SECRET/,
    );
  });

  it("throws a descriptive error when COOKIE_SECRET is missing", () => {
    expect(() => oauthConfig({ ...validEnv, COOKIE_SECRET: "" })).toThrow(/COOKIE_SECRET/);
  });
});
