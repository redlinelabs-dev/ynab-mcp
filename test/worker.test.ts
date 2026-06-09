import { describe, expect, it } from "vitest";

import { YnabClient } from "../src/client.js";
import { makeToolContext } from "../src/worker-config.js";

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
