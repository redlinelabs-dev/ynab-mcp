import { describe, expect, it } from "vitest";

import type { GrantRecord } from "../src/store.js";

import { Store } from "../src/store.js";

function store(): Store {
  return new Store(":memory:");
}

const FUTURE = 9_999_999_999_999;

function grant(over: Partial<GrantRecord> = {}): GrantRecord {
  return {
    grantId: "g1",
    userId: "user-1",
    clientId: "client-1",
    encAccess: "enc-a",
    encRefresh: "enc-r",
    expiresAt: FUTURE,
    readOnly: true,
    scope: "ynab.read",
    ...over,
  };
}

describe("clients", () => {
  it("round-trips a client by id", () => {
    const s = store();
    s.putClient("c1", { client_id: "c1", redirect_uris: ["https://x/cb"] }, 1000);
    expect(s.getClient("c1")).toEqual({ client_id: "c1", redirect_uris: ["https://x/cb"] });
  });

  it("returns undefined for an unknown client", () => {
    expect(store().getClient("nope")).toBeUndefined();
  });
});

describe("grants", () => {
  it("stores and reads a grant, preserving readOnly", () => {
    const s = store();
    s.upsertGrant(grant({ readOnly: false }));
    expect(s.getGrant("g1")?.readOnly).toBe(false);
  });

  it("replaces an existing grant for the same user+client", () => {
    const s = store();
    s.upsertGrant(grant({ grantId: "old" }));
    s.upsertGrant(grant({ grantId: "new" }));
    expect(s.getGrant("old")).toBeUndefined();
    expect(s.getGrant("new")).toBeDefined();
  });

  it("updates only the token columns", () => {
    const s = store();
    s.upsertGrant(grant());
    s.updateGrantTokens("g1", "enc-a2", "enc-r2", 5000);
    const g = s.getGrant("g1");
    expect(g?.encAccess).toBe("enc-a2");
    expect(g?.expiresAt).toBe(5000);
    expect(g?.readOnly).toBe(true);
  });
});

describe("pending auth", () => {
  it("take consumes the row and honors expiry", () => {
    const s = store();
    s.putPendingAuth({
      id: "p1",
      clientId: "c1",
      redirectUri: "https://x/cb",
      codeChallenge: "chal",
      state: "st",
      scope: "ynab",
      expiresAt: FUTURE,
    });
    expect(s.takePendingAuth("p1", 1000)?.clientId).toBe("c1");
    expect(s.takePendingAuth("p1", 1000)).toBeUndefined(); // consumed
  });

  it("treats an expired pending row as absent", () => {
    const s = store();
    s.putPendingAuth({
      id: "p2",
      clientId: "c1",
      redirectUri: "u",
      codeChallenge: "c",
      state: null,
      scope: "s",
      expiresAt: 100,
    });
    expect(s.takePendingAuth("p2", 200)).toBeUndefined();
  });
});

describe("login state", () => {
  it("take consumes and returns verifier + scope", () => {
    const s = store();
    s.putLoginState({
      upstreamState: "us1",
      pendingId: "p1",
      verifier: "v",
      scope: "full",
      expiresAt: FUTURE,
    });
    const got = s.takeLoginState("us1", 1000);
    expect(got?.verifier).toBe("v");
    expect(got?.scope).toBe("full");
    expect(s.takeLoginState("us1", 1000)).toBeUndefined();
  });
});

describe("auth codes", () => {
  it("take consumes and honors expiry", () => {
    const s = store();
    s.putAuthCode({
      codeHash: "h1",
      grantId: "g1",
      clientId: "c1",
      codeChallenge: "chal",
      redirectUri: "u",
      scope: "ynab.read",
      expiresAt: FUTURE,
    });
    expect(s.takeAuthCode("h1", 1000)?.codeChallenge).toBe("chal");
    expect(s.takeAuthCode("h1", 1000)).toBeUndefined();
  });
});

describe("access tokens", () => {
  it("reads a live token and rejects an expired one", () => {
    const s = store();
    s.putAccessToken({
      tokenHash: "a1",
      grantId: "g1",
      clientId: "c1",
      scope: "ynab.read",
      expiresAt: FUTURE,
    });
    s.putAccessToken({
      tokenHash: "a2",
      grantId: "g1",
      clientId: "c1",
      scope: "ynab.read",
      expiresAt: 100,
    });
    expect(s.getAccessToken("a1", 1000)?.grantId).toBe("g1");
    expect(s.getAccessToken("a2", 1000)).toBeUndefined();
  });
});

describe("refresh tokens", () => {
  it("get is non-consuming (reusable) until explicitly deleted", () => {
    const s = store();
    s.putRefreshToken({ tokenHash: "r1", grantId: "g1", clientId: "c1", scope: "ynab.read" });
    expect(s.getRefreshToken("r1")?.grantId).toBe("g1");
    expect(s.getRefreshToken("r1")?.grantId).toBe("g1"); // still there
    s.deleteRefreshToken("r1");
    expect(s.getRefreshToken("r1")).toBeUndefined();
  });
});
