import { describe, expect, it } from "vitest";

import { generatePkce, s256Challenge } from "../src/pkce.js";

describe("s256Challenge", () => {
  it("produces the RFC 7636 reference challenge for the reference verifier", async () => {
    // From RFC 7636 Appendix B.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await s256Challenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("emits base64url with no padding or +/ characters", async () => {
    const challenge = await s256Challenge("some-verifier-value");
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe("generatePkce", () => {
  it("returns a verifier whose S256 hash equals the challenge", async () => {
    const { verifier, challenge } = await generatePkce();
    expect(await s256Challenge(verifier)).toBe(challenge);
  });

  it("generates a fresh verifier on each call", async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("produces a verifier within the RFC 7636 length bounds (43-128 chars)", async () => {
    const { verifier } = await generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });
});
