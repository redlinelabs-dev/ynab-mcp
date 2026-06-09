import { describe, expect, it } from "vitest";

import { ALL_GROUPS, isToolEnabled, parseReadOnly, parseToolsets } from "../src/toolsets.js";

describe("parseToolsets", () => {
  it("returns every group for undefined, empty, or 'all'", () => {
    for (const raw of [undefined, "", "all", "  ALL  "]) {
      expect([...parseToolsets(raw)].sort()).toEqual([...ALL_GROUPS].sort());
    }
  });

  it("parses a comma list and ignores unknown groups", () => {
    expect([...parseToolsets("transactions, scheduled, bogus")].sort()).toEqual([
      "scheduled",
      "transactions",
    ]);
  });
});

describe("parseReadOnly", () => {
  it("is true only for truthy tokens", () => {
    expect(parseReadOnly("true")).toBe(true);
    expect(parseReadOnly("1")).toBe(true);
    expect(parseReadOnly("no")).toBe(false);
    expect(parseReadOnly(undefined)).toBe(false);
  });
});

describe("isToolEnabled", () => {
  const enabled = parseToolsets("transactions");

  it("hides tools from disabled groups", () => {
    expect(isToolEnabled(enabled, false, "scheduled", false)).toBe(false);
    expect(isToolEnabled(enabled, false, "transactions", false)).toBe(true);
  });

  it("hides write tools when read-only", () => {
    expect(isToolEnabled(enabled, true, "transactions", true)).toBe(false);
    expect(isToolEnabled(enabled, true, "transactions", false)).toBe(true);
  });
});
