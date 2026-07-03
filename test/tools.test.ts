import { describe, expect, it } from "vitest";
import { z } from "zod";

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

  it("create_transaction sends a split (parent category null + legs) and formats the legs back", async () => {
    const calls: string[] = [];
    const fn: typeof fetch = (input, init) => {
      const req = new Request(input, init);
      return req.text().then((body) => {
        calls.push(body);
        return new Response(
          JSON.stringify({
            data: {
              transaction: {
                id: "t-new",
                date: "2026-06-18",
                amount: -5000,
                category_id: null,
                account_id: "acc-1",
                subtransactions: [
                  { id: "s1", amount: -3000, category_id: "groceries", category_name: "Groceries" },
                  { id: "s2", amount: -2000, category_id: "household", category_name: "Household" },
                ],
              },
            },
          }),
          { status: 200 },
        );
      });
    };

    const out = JSON.parse(
      await handleTool(ctxWith(fn), "create_transaction", {
        account_id: "acc-1",
        date: "2026-06-18",
        amount: -5000,
        category_id: null,
        import_id: "YNAB:-5000:2026-06-18:1",
        subtransactions: [
          { amount: -3000, category_id: "groceries" },
          { amount: -2000, category_id: "household" },
        ],
      }),
    );

    const sent: unknown = JSON.parse(calls[0] ?? "{}");
    const parsed = z
      .object({
        transaction: z.object({
          category_id: z.null(),
          import_id: z.string(),
          subtransactions: z.array(z.object({ amount: z.number(), category_id: z.string() })),
        }),
      })
      .parse(sent);
    expect(parsed.transaction.subtransactions).toEqual([
      { amount: -3000, category_id: "groceries" },
      { amount: -2000, category_id: "household" },
    ]);
    expect(out.subtransactions).toHaveLength(2);
    expect(out.subtransactions[0].category).toBe("Groceries");
  });

  it("create_transaction rejects a split whose legs don't sum to the amount", async () => {
    await expect(
      handleTool(ctxWith(fetchReturning({})), "create_transaction", {
        account_id: "acc-1",
        date: "2026-06-18",
        amount: -5000,
        category_id: null,
        subtransactions: [
          { amount: -3000, category_id: "g" },
          { amount: -1000, category_id: "h" },
        ],
      }),
    ).rejects.toThrow(/sum/i);
  });

  function capturingFetch(payload: unknown) {
    const calls: { url: string; method: string; body: string }[] = [];
    const fn: typeof fetch = (input, init) => {
      const req = new Request(input, init);
      return req.text().then((body) => {
        calls.push({ url: req.url, method: req.method, body });
        return new Response(JSON.stringify(payload), { status: 200 });
      });
    };
    return { fn, calls };
  }

  it("get_user returns the user id", async () => {
    const ctx = ctxWith(fetchReturning({ data: { user: { id: "user-7" } } }));
    expect(JSON.parse(await handleTool(ctx, "get_user", {})).id).toBe("user-7");
  });

  it("update_payee PATCHes the payee with the new name", async () => {
    const { fn, calls } = capturingFetch({ data: { payee: { id: "p1", name: "Costco" } } });
    await handleTool(ctxWith(fn), "update_payee", { payee_id: "p1", name: "Costco" });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toContain("/payees/p1");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ payee: { name: "Costco" } });
  });

  it("create_payee POSTs a payee name", async () => {
    const { fn, calls } = capturingFetch({ data: { payee: { id: "p2", name: "Trader Joe's" } } });
    const out = JSON.parse(await handleTool(ctxWith(fn), "create_payee", { name: "Trader Joe's" }));
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toContain("/payees");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ payee: { name: "Trader Joe's" } });
    expect(out.name).toBe("Trader Joe's");
  });

  it("update_category moves a category to another group (category_group_id)", async () => {
    const { fn, calls } = capturingFetch({ data: { category: { id: "c1", name: "Rent" } } });
    await handleTool(ctxWith(fn), "update_category", {
      category_id: "c1",
      category_group_id: "grp-2",
    });
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toContain("/categories/c1");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      category: { category_group_id: "grp-2" },
    });
  });

  it("create_category accepts official goal fields", async () => {
    const { fn, calls } = capturingFetch({
      data: { category: { id: "c2", name: "Vacation", goal_target: 500000 } },
    });
    await handleTool(ctxWith(fn), "create_category", {
      name: "Vacation",
      category_group_id: "grp-1",
      goal_target: 500000,
      goal_target_date: "2026-12-01",
      goal_needs_whole_amount: true,
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      category: {
        name: "Vacation",
        category_group_id: "grp-1",
        goal_target: 500000,
        goal_target_date: "2026-12-01",
        goal_needs_whole_amount: true,
      },
    });
  });

  it("get_budget returns the full budget export", async () => {
    const out = JSON.parse(
      await handleTool(
        ctxWith(
          fetchReturning({ data: { budget: { id: "b1", accounts: [] }, server_knowledge: 17 } }),
        ),
        "get_budget",
        { last_knowledge_of_server: 12 },
      ),
    );

    expect(out.server_knowledge).toBe(17);
    expect(out.budget.id).toBe("b1");
  });

  it("list_budgets passes include_accounts through", async () => {
    const { fn, calls } = capturingFetch({
      data: { budgets: [{ id: "b1", name: "Budget 1", accounts: [] }], default_budget: null },
    });
    await handleTool(ctxWith(fn), "list_budgets", { include_accounts: true });
    expect(calls[0]?.url).toContain("/budgets?include_accounts=true");
  });

  it("payee_transactions passes until_date and type filters", async () => {
    const { fn, calls } = capturingFetch({ data: { transactions: [] } });
    await handleTool(ctxWith(fn), "payee_transactions", {
      payee_id: "p1",
      since_date: "2026-01-01",
      until_date: "2026-01-31",
      type: "uncategorized",
    });
    expect(calls[0]?.url).toContain(
      "/payees/p1/transactions?since_date=2026-01-01&until_date=2026-01-31&type=uncategorized",
    );
  });

  it("list_money_movements returns money movement rows with server knowledge", async () => {
    const out = JSON.parse(
      await handleTool(
        ctxWith(
          fetchReturning({
            data: { money_movements: [{ id: "mm1", amount: 1000 }], server_knowledge: 3 },
          }),
        ),
        "list_money_movements",
        {},
      ),
    );

    expect(out.server_knowledge).toBe(3);
    expect(out.money_movements[0]).toMatchObject({ id: "mm1", amount: 1000, amount_units: 1 });
  });

  it("month_money_movement_groups returns money movement groups", async () => {
    const out = JSON.parse(
      await handleTool(
        ctxWith(
          fetchReturning({
            data: {
              money_movement_groups: [{ id: "mmg1", month: "2026-07-01", note: "Rebalance" }],
              server_knowledge: 4,
            },
          }),
        ),
        "month_money_movement_groups",
        { month: "2026-07-01" },
      ),
    );

    expect(out.server_knowledge).toBe(4);
    expect(out.money_movement_groups[0]?.id).toBe("mmg1");
  });

  it("bulk_create_transactions POSTs an array and summarizes the result", async () => {
    const { fn, calls } = capturingFetch({
      data: {
        transaction_ids: ["t1", "t2"],
        transactions: [
          { id: "t1", account_id: "a", amount: -1000, date: "2026-06-18" },
          { id: "t2", account_id: "a", amount: -2000, date: "2026-06-18" },
        ],
        duplicate_import_ids: [],
      },
    });
    const out = JSON.parse(
      await handleTool(ctxWith(fn), "bulk_create_transactions", {
        transactions: [
          { account_id: "a", date: "2026-06-18", amount: -1000 },
          { account_id: "a", date: "2026-06-18", amount: -2000 },
        ],
      }),
    );
    expect(calls[0]?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.body ?? "{}").transactions).toHaveLength(2);
    expect(out.created).toBe(2);
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
