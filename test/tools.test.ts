import { describe, expect, it } from "vitest";

import type { ToolContext } from "../src/tools.js";

import { YnabClient } from "../src/client.js";
import { handleTool, TOOLS } from "../src/tools.js";
import { parseToolsets } from "../src/toolsets.js";

function fetchReturning(payload: unknown): typeof fetch {
  return (_input, _init) => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
}

function ctxWith(fn: typeof fetch, over: Partial<ToolContext> = {}): ToolContext {
  return {
    client: new YnabClient("tok", fn),
    enabledGroups: parseToolsets("all"),
    readOnly: false,
    defaultBudget: "last-used",
    ...over,
  };
}

const dupPayload = {
  data: {
    transactions: [
      { id: "a", account_id: "x", amount: -5000, date: "2026-06-01" },
      { id: "b", account_id: "x", amount: -5000, date: "2026-06-01" },
      { id: "c", account_id: "x", amount: -1, date: "2026-06-02" },
    ],
  },
};

describe("handleTool", () => {
  it("find_duplicate_transactions reads transactions and returns clusters", async () => {
    const ctx = ctxWith(fetchReturning(dupPayload));

    const out = JSON.parse(await handleTool(ctx, "find_duplicate_transactions", {}));

    expect(out).toHaveLength(1);
    expect(out[0].transaction_ids.sort()).toEqual(["a", "b"]);
  });

  it("rejects a write tool when read-only", async () => {
    const ctx = ctxWith(fetchReturning({}), { readOnly: true });

    await expect(handleTool(ctx, "delete_transaction", { transaction_id: "t1" })).rejects.toThrow(
      /not enabled/,
    );
  });

  it("spending_summary aggregates transactions by category", async () => {
    const ctx = ctxWith(
      fetchReturning({
        data: {
          transactions: [
            { id: "a", account_id: "x", amount: -10000, date: "2026-06-01", category_name: "Food" },
            { id: "b", account_id: "x", amount: -5000, date: "2026-06-02", category_name: "Food" },
          ],
        },
      }),
    );

    const out = JSON.parse(await handleTool(ctx, "spending_summary", { group_by: "category" }));

    expect(out.rows[0]).toMatchObject({ group: "Food", total: -15000, count: 2 });
    expect(out.total).toBe(-15000);
  });

  it("exposes every tool with a group and write flag", () => {
    for (const t of TOOLS) {
      expect(typeof t.group).toBe("string");
      expect(typeof t.write).toBe("boolean");
    }
  });
});
