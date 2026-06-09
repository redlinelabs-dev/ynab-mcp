import { describe, expect, it } from "vitest";

import type { SummaryTxn } from "../src/summary.js";

import { summarizeSpending } from "../src/summary.js";

const txns: SummaryTxn[] = [
  { amount: -10000, category_name: "Groceries", payee_name: "Market" },
  { amount: -25000, category_name: "Rent", payee_name: "Landlord" },
  { amount: -5000, category_name: "Groceries", payee_name: "Market" },
];

describe("summarizeSpending", () => {
  it("groups by category with summed milliunits, units, and counts", () => {
    const summary = summarizeSpending(txns, "category");

    const groceries = summary.rows.find((r) => r.group === "Groceries");
    expect(groceries).toEqual({ group: "Groceries", total: -15000, total_units: -15, count: 2 });
    expect(summary.total).toBe(-40000);
    expect(summary.count).toBe(3);
  });

  it("sorts rows by largest outflow first (most negative total)", () => {
    const summary = summarizeSpending(txns, "category");

    expect(summary.rows.map((r) => r.group)).toEqual(["Rent", "Groceries"]);
  });
});
