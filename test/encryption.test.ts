import { describe, expect, it } from "vitest";

import { importKey, seal, sha256Hex, unseal } from "../src/encryption.js";

// 32 zero bytes, base64.
const KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32)));

describe("importKey", () => {
  it("imports a 32-byte base64 key", async () => {
    await expect(importKey(KEY_B64)).resolves.toBeDefined();
  });

  it("rejects a key that is not 32 bytes", async () => {
    await expect(importKey(btoa("short"))).rejects.toThrow(/32 bytes/);
  });
});

describe("seal / unseal", () => {
  it("round-trips plaintext", async () => {
    const key = await importKey(KEY_B64);
    const blob = await seal(key, "ynab-refresh-token-value");
    expect(blob).not.toContain("ynab-refresh-token-value");
    expect(await unseal(key, blob)).toBe("ynab-refresh-token-value");
  });

  it("produces a different ciphertext each call (random IV)", async () => {
    const key = await importKey(KEY_B64);
    const a = await seal(key, "same");
    const b = await seal(key, "same");
    expect(a).not.toBe(b);
  });

  it("rejects a tampered blob", async () => {
    const key = await importKey(KEY_B64);
    const blob = await seal(key, "secret");
    const tampered = `${blob.slice(0, -2)}AA`;
    await expect(unseal(key, tampered)).rejects.toBeDefined();
  });
});

describe("sha256Hex", () => {
  it("matches the known SHA-256 of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable for the same input", async () => {
    expect(await sha256Hex("token")).toBe(await sha256Hex("token"));
  });
});
