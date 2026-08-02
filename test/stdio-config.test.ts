import { describe, expect, it } from "vitest";

import { YnabClient } from "../src/client.js";
import { buildStdioContext, parseDemoFlag } from "../src/stdio-config.js";

describe("parseDemoFlag", () => {
  it("is true for '1' and 'true' (case-insensitive, trimmed)", () => {
    expect(parseDemoFlag("1")).toBe(true);
    expect(parseDemoFlag("true")).toBe(true);
    expect(parseDemoFlag("TRUE")).toBe(true);
    expect(parseDemoFlag("  true  ")).toBe(true);
  });

  it("is false for unset, empty, or any other value", () => {
    expect(parseDemoFlag(undefined)).toBe(false);
    expect(parseDemoFlag("")).toBe(false);
    expect(parseDemoFlag("0")).toBe(false);
    expect(parseDemoFlag("false")).toBe(false);
    expect(parseDemoFlag("yes")).toBe(false);
  });
});

describe("buildStdioContext", () => {
  it("fails without YNAB_TOKEN when YNAB_DEMO is unset", () => {
    const result = buildStdioContext({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/YNAB_TOKEN/);
    }
  });

  it("fails without YNAB_TOKEN even when YNAB_DEMO is explicitly falsy", () => {
    const result = buildStdioContext({ YNAB_DEMO: "false" });

    expect(result.ok).toBe(false);
  });

  it("succeeds without YNAB_TOKEN when YNAB_DEMO=1", () => {
    const result = buildStdioContext({ YNAB_DEMO: "1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.demo).toBe(true);
      expect(result.ctx.client).toBeInstanceOf(YnabClient);
    }
  });

  it("succeeds without YNAB_TOKEN when YNAB_DEMO=true", () => {
    const result = buildStdioContext({ YNAB_DEMO: "true" });

    expect(result.ok).toBe(true);
  });

  it("demo mode's client can actually serve tools (no live network needed)", async () => {
    const result = buildStdioContext({ YNAB_DEMO: "1" });
    if (!result.ok) throw new Error("expected demo context");

    const budgets = await result.ctx.client.listBudgets();

    expect(budgets[0]?.name).toBe("Demo Budget");
  });

  it("succeeds with YNAB_TOKEN when YNAB_DEMO is unset", () => {
    const result = buildStdioContext({ YNAB_TOKEN: "a-real-token" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.demo).toBe(false);
    }
  });

  it("passes through YNAB_TOOLSETS and YNAB_READ_ONLY in demo mode", () => {
    const result = buildStdioContext({
      YNAB_DEMO: "1",
      YNAB_TOOLSETS: "accounts,transactions",
      YNAB_READ_ONLY: "true",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.readOnly).toBe(true);
      expect([...result.ctx.enabledGroups].sort()).toEqual(["accounts", "transactions"]);
    }
  });

  it("passes through YNAB_BUDGET_ID, defaulting to last-used", () => {
    const withDefault = buildStdioContext({ YNAB_DEMO: "1" });
    const withExplicit = buildStdioContext({ YNAB_DEMO: "1", YNAB_BUDGET_ID: "demo-budget" });

    if (withDefault.ok) expect(withDefault.ctx.defaultBudget).toBe("last-used");
    if (withExplicit.ok) expect(withExplicit.ctx.defaultBudget).toBe("demo-budget");
  });
});
