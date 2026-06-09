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

  const scheduledPayload = {
    data: {
      scheduled_transaction: {
        id: "s1",
        date_first: "2026-06-01",
        date_next: "2026-07-01",
        frequency: "monthly",
        amount: -50000,
        payee_name: "Landlord",
        category_name: "Rent",
        account_id: "acct-1",
        account_name: "Checking",
        memo: null,
      },
    },
  };

  it("get_scheduled_transaction returns a formatted scheduled transaction", async () => {
    const ctx = ctxWith(fetchReturning(scheduledPayload));

    const out = JSON.parse(
      await handleTool(ctx, "get_scheduled_transaction", { scheduled_transaction_id: "s1" }),
    );

    expect(out.id).toBe("s1");
    expect(out.frequency).toBe("monthly");
    expect(out.amount_units).toBe(-50);
  });

  it("create_scheduled_transaction creates and returns formatted scheduled transaction", async () => {
    const ctx = ctxWith(fetchReturning(scheduledPayload));

    const out = JSON.parse(
      await handleTool(ctx, "create_scheduled_transaction", {
        account_id: "acct-1",
        date: "2026-06-01",
        amount: -50000,
        frequency: "monthly",
      }),
    );

    expect(out.id).toBe("s1");
  });

  it("update_scheduled_transaction updates and returns formatted scheduled transaction", async () => {
    const ctx = ctxWith(fetchReturning(scheduledPayload));

    const out = JSON.parse(
      await handleTool(ctx, "update_scheduled_transaction", {
        scheduled_transaction_id: "s1",
        amount: -50000,
      }),
    );

    expect(out.id).toBe("s1");
  });

  it("delete_scheduled_transaction deletes and returns formatted scheduled transaction", async () => {
    const ctx = ctxWith(fetchReturning(scheduledPayload));

    const out = JSON.parse(
      await handleTool(ctx, "delete_scheduled_transaction", { scheduled_transaction_id: "s1" }),
    );

    expect(out.id).toBe("s1");
  });
});
