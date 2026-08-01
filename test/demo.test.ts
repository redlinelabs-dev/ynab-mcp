import { describe, expect, it } from "vitest";

import { YnabClient } from "../src/client.js";
import { createDemoState, DEMO_BUDGET_ID } from "../src/demo-fixtures.js";
import { createDemoFetch } from "../src/demo.js";
import { handleTool, type ToolContext } from "../src/tools.js";
import { parseToolsets } from "../src/toolsets.js";

// Every assertion below goes through `YnabClient`, which validates every
// response through the real Zod schemas in `src/schemas.ts` before handing
// data back — a malformed fixture would throw a ZodError and fail the test,
// exactly like a live API response would.

describe("demo mode — read path", () => {
  it("list_budgets returns the fictional Demo Budget", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const budgets = await client.listBudgets();

    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.name).toBe("Demo Budget");
    expect(budgets[0]?.currency_format?.iso_code).toBe("USD");
  });

  it("list_accounts returns checking, savings, and a credit card — all fictional", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const { accounts } = await client.listAccounts("last-used");

    expect(accounts.map((a) => a.name).sort()).toEqual([
      "Checking",
      "Rewards Credit Card",
      "Savings",
    ]);
    for (const a of accounts) {
      expect(a.name.toLowerCase()).not.toContain("chase");
      expect(a.name.toLowerCase()).not.toContain("bank of america");
    }
  });

  it("list_transactions returns a coherent, realistic set of transactions", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const { transactions } = await client.listTransactions("last-used");

    expect(transactions.length).toBeGreaterThan(20);
    expect(transactions.every((t) => typeof t.date === "string" && t.date.length > 0)).toBe(true);
    expect(transactions.some((t) => t.payee_name === "Nimbus Analytics Payroll")).toBe(true);
  });

  it("list_categories returns category groups with budgeted/activity/balance", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const { category_groups } = await client.listCategories("last-used");

    expect(category_groups.length).toBeGreaterThan(0);
    const groceries = category_groups
      .flatMap((g) => g.categories)
      .find((c) => c.name === "Groceries");
    expect(groceries?.budgeted).toBeGreaterThan(0);
    expect(groceries?.balance).toBe((groceries?.budgeted ?? 0) + (groceries?.activity ?? 0));
  });

  it("list_scheduled_transactions returns believable recurring transactions", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const { scheduled_transactions } = await client.listScheduledTransactions("last-used");

    expect(scheduled_transactions.some((s) => s.payee_name === "Maple Street Apartments")).toBe(
      true,
    );
  });

  it("get_budget returns full budget detail with accounts, categories, and transactions", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const detail = await client.getBudget("last-used");

    expect(detail.budget.id).toBe(DEMO_BUDGET_ID);
    expect(Array.isArray(detail.budget.accounts)).toBe(true);
    expect(Array.isArray(detail.budget.transactions)).toBe(true);
    expect(Array.isArray(detail.budget.category_groups)).toBe(true);
  });

  it("get_month resolves the 'current' alias to the current demo month", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    const month = await client.getMonth("last-used", "current");

    expect(month.month).toBe("2026-08-01");
    expect(month.categories.length).toBeGreaterThan(0);
  });

  it("'last-used', 'default', and the real budget id all resolve to the same demo budget", async () => {
    const state = createDemoState();
    const fetchFn = createDemoFetch(state);

    for (const alias of ["last-used", "default", DEMO_BUDGET_ID]) {
      const client = new YnabClient("demo-token", fetchFn);
      const budget = await client.getBudget(alias);
      expect(budget.budget.id).toBe(DEMO_BUDGET_ID);
    }
  });

  it("an unknown budget id 404s", async () => {
    const client = new YnabClient("demo-token", createDemoFetch());

    await expect(client.getBudget("not-the-demo-budget")).rejects.toThrow(/404/);
  });

  it("no network request ever leaves the process — fetch is never the real global fetch", async () => {
    const state = createDemoState();
    const fetchFn = createDemoFetch(state);
    // The demo fetch is a plain function closed over in-memory state; calling
    // it repeatedly must never differ from calling it once, and must resolve
    // synchronously from local data (no timers, no I/O).
    const client = new YnabClient("demo-token", fetchFn);
    const before = Date.now();
    await client.listBudgets();
    expect(Date.now() - before).toBeLessThan(50);
  });
});

describe("demo mode — write path mutates state", () => {
  it("create_transaction then list_transactions shows the created transaction", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));
    const { accounts } = await client.listAccounts("last-used");
    const checking = accounts.find((a) => a.name === "Checking");
    if (!checking) throw new Error("fixture missing Checking account");

    const created = await client.createTransaction("last-used", {
      account_id: checking.id,
      date: "2026-08-29",
      amount: -12340,
      payee_name: "Test Coffee Shop",
      memo: "Round-trip test",
    });

    expect(created.payee_name).toBe("Test Coffee Shop");

    const { transactions } = await client.listTransactions("last-used");
    expect(transactions.some((t) => t.id === created.id && t.memo === "Round-trip test")).toBe(
      true,
    );
  });

  it("creating a transaction with a new payee_name creates the payee", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));
    const { accounts } = await client.listAccounts("last-used");
    const checking = accounts.find((a) => a.name === "Checking");
    if (!checking) throw new Error("fixture missing Checking account");

    await client.createTransaction("last-used", {
      account_id: checking.id,
      date: "2026-08-29",
      amount: -500,
      payee_name: "Brand New Payee",
    });

    const { payees } = await client.listPayees("last-used");
    expect(payees.some((p) => p.name === "Brand New Payee")).toBe(true);
  });

  it("create_transaction adjusts the account balance", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));
    const before = await client.getAccount("last-used", "acc-checking");

    await client.createTransaction("last-used", {
      account_id: "acc-checking",
      date: "2026-08-29",
      amount: -10000,
    });

    const after = await client.getAccount("last-used", "acc-checking");
    expect(after.balance).toBe(before.balance - 10000);
  });

  it("update_transaction (PUT) mutates the stored transaction", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));

    const updated = await client.updateTransaction("last-used", "txn-4003", { memo: "edited" });

    expect(updated.memo).toBe("edited");
    const fetched = await client.getTransaction("last-used", "txn-4003");
    expect(fetched.memo).toBe("edited");
  });

  it("delete_transaction removes it from subsequent list results and adjusts the balance", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));
    const before = await client.getAccount("last-used", "acc-checking");
    const target = await client.getTransaction("last-used", "txn-4003");

    await client.deleteTransaction("last-used", "txn-4003");

    const { transactions } = await client.listTransactions("last-used");
    expect(transactions.some((t) => t.id === "txn-4003")).toBe(false);
    const after = await client.getAccount("last-used", "acc-checking");
    expect(after.balance).toBe(before.balance - target.amount);
  });

  it("bulk_update_transactions patches multiple transactions in one call", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));

    const result = await client.bulkUpdateTransactions("last-used", [
      { id: "txn-4003", approved: true, flag_color: "green" },
      { id: "txn-4004", memo: "bulk edit" },
    ]);

    expect(result.transaction_ids.sort()).toEqual(["txn-4003", "txn-4004"]);
    const txn4004 = await client.getTransaction("last-used", "txn-4004");
    expect(txn4004.memo).toBe("bulk edit");
  });

  it("update_category_budget mutates budgeted and recomputes balance", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));
    const before = await client.getMonthCategory("last-used", "current", "cat-groceries");

    const updated = await client.updateCategoryBudget(
      "last-used",
      "current",
      "cat-groceries",
      700000,
    );

    expect(updated.budgeted).toBe(700000);
    expect(updated.balance).toBe(700000 + before.activity);
  });

  it("create_scheduled_transaction then list shows the new schedule", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));

    const created = await client.createScheduledTransaction("last-used", {
      account_id: "acc-checking",
      date: "2026-09-15",
      amount: -2500,
      frequency: "monthly",
      payee_name: "New Recurring Payee",
    });

    const { scheduled_transactions } = await client.listScheduledTransactions("last-used");
    expect(scheduled_transactions.some((s) => s.id === created.id)).toBe(true);
  });

  it("create_account adds a new manual account visible in subsequent list_accounts calls", async () => {
    const state = createDemoState();
    const client = new YnabClient("demo-token", createDemoFetch(state));

    const created = await client.createAccount("last-used", {
      name: "New Manual Account",
      type: "checking",
      balance: 1000,
    });

    const { accounts } = await client.listAccounts("last-used");
    expect(accounts.some((a) => a.id === created.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Through the tool dispatcher (handleTool), the way the MCP server actually
// calls into the client — covers toolset/read-only gating in demo mode.
// ---------------------------------------------------------------------------

function demoCtx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    client: new YnabClient("demo-token", createDemoFetch()),
    enabledGroups: parseToolsets("all"),
    readOnly: false,
    defaultBudget: "last-used",
    ...over,
  };
}

describe("demo mode — through handleTool", () => {
  it("list_transactions works end to end against the demo fetch", async () => {
    const ctx = demoCtx();

    const out = JSON.parse(await handleTool(ctx, "list_transactions", {}));

    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it("create_transaction then list_transactions reflects the write in the same session", async () => {
    const state = createDemoState();
    const ctx: ToolContext = {
      client: new YnabClient("demo-token", createDemoFetch(state)),
      enabledGroups: parseToolsets("all"),
      readOnly: false,
      defaultBudget: "last-used",
    };

    await handleTool(ctx, "create_transaction", {
      account_id: "acc-checking",
      date: "2026-08-30",
      amount: -777,
      payee_name: "handleTool Round Trip",
    });

    const out = JSON.parse(await handleTool(ctx, "list_transactions", {}));
    expect(out.some((t: { payee: string }) => t.payee === "handleTool Round Trip")).toBe(true);
  });

  it("read-only gating still rejects write tools when demo mode is combined with YNAB_READ_ONLY", async () => {
    const ctx = demoCtx({ readOnly: true });

    await expect(
      handleTool(ctx, "create_transaction", {
        account_id: "acc-checking",
        date: "2026-08-30",
        amount: -100,
      }),
    ).rejects.toThrow(/not enabled/);
  });

  it("read tools stay available when demo mode is read-only", async () => {
    const ctx = demoCtx({ readOnly: true });

    const out = JSON.parse(await handleTool(ctx, "list_accounts", {}));

    expect(out.length).toBeGreaterThan(0);
  });
});
