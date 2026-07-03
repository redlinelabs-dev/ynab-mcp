import { describe, expect, it } from "vitest";

import { YnabClient } from "../src/client.js";

interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

/** A fake `fetch` that records the request and returns a canned JSON response. */
function fakeFetch(status: number, payload: unknown) {
  const calls: Recorded[] = [];
  const fn: typeof fetch = (input, init) => {
    const req = new Request(input, init);
    return req.text().then((body) => {
      calls.push({
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: body === "" ? null : body,
      });
      return new Response(JSON.stringify(payload), { status });
    });
  };
  return { fn, calls };
}

describe("YnabClient", () => {
  it("GETs with a Bearer token and parses the data envelope", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { budgets: [{ id: "b1", name: "My Budget" }], default_budget: null },
    });
    const client = new YnabClient("secret-token", fn);

    const budgets = await client.listBudgets();

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets");
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer secret-token");
    expect(budgets.map((b) => b.id)).toEqual(["b1"]);
  });

  it("GETs plans with include_accounts when requested", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { budgets: [{ id: "b1", name: "My Budget", accounts: [] }], default_budget: null },
    });
    const client = new YnabClient("secret-token", fn);

    await client.listBudgets({ include_accounts: true });

    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets?include_accounts=true");
  });

  it("GETs a full budget export with server knowledge", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { budget: { id: "b1", name: "My Budget", accounts: [] }, server_knowledge: 42 },
    });
    const client = new YnabClient("secret-token", fn);

    const budget = await client.getBudget("b1", { last_knowledge_of_server: 21 });

    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/b1?last_knowledge_of_server=21");
    expect(budget.server_knowledge).toBe(42);
    expect(budget.budget.id).toBe("b1");
  });

  it("PATCHes a JSON body for bulk updates", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { transaction_ids: ["t1"], transactions: [], duplicate_import_ids: [] },
    });
    const client = new YnabClient("tok", fn);

    const result = await client.bulkUpdateTransactions("last-used", [
      { id: "t1", category_id: "c1", approved: true },
    ]);

    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/last-used/transactions");
    expect(JSON.parse(calls[0]?.body ?? "null")).toEqual({
      transactions: [{ id: "t1", category_id: "c1", approved: true }],
    });
    expect(result.transaction_ids).toEqual(["t1"]);
  });

  it("DELETEs a single transaction", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { transaction: { id: "t9", date: "2026-06-01" } },
    });
    const client = new YnabClient("tok", fn);

    await client.deleteTransaction("budget-1", "t9");

    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/budget-1/transactions/t9");
  });

  it("GETs transactions with all supported query parameters", async () => {
    const { fn, calls } = fakeFetch(200, { data: { transactions: [], server_knowledge: 11 } });
    const client = new YnabClient("tok", fn);

    await client.listTransactions("budget-1", {
      since_date: "2026-01-01",
      until_date: "2026-02-01",
      type: "uncategorized",
      last_knowledge_of_server: 7,
    });

    expect(calls[0]?.url).toBe(
      "https://api.ynab.com/v1/budgets/budget-1/transactions?since_date=2026-01-01&until_date=2026-02-01&type=uncategorized&last_knowledge_of_server=7",
    );
  });

  it("GETs payee transactions with until_date, type, and server knowledge", async () => {
    const { fn, calls } = fakeFetch(200, { data: { transactions: [], server_knowledge: 12 } });
    const client = new YnabClient("tok", fn);

    await client.listPayeeTransactions("budget-1", "payee-1", {
      since_date: "2026-01-01",
      until_date: "2026-02-01",
      type: "unapproved",
      last_knowledge_of_server: 8,
    });

    expect(calls[0]?.url).toBe(
      "https://api.ynab.com/v1/budgets/budget-1/payees/payee-1/transactions?since_date=2026-01-01&until_date=2026-02-01&type=unapproved&last_knowledge_of_server=8",
    );
  });

  it("throws on a non-2xx response, including the status and body", async () => {
    const { fn } = fakeFetch(429, { error: { detail: "Too many requests" } });
    const client = new YnabClient("tok", fn);

    await expect(client.listBudgets()).rejects.toThrow(/429/);
  });

  it("GETs a single scheduled transaction by id", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: {
        scheduled_transaction: {
          id: "s1",
          date_first: "2026-06-01",
          date_next: "2026-07-01",
          frequency: "monthly",
          amount: -50000,
        },
      },
    });
    const client = new YnabClient("tok", fn);

    const s = await client.getScheduledTransaction("bud-1", "s1");

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/bud-1/scheduled_transactions/s1");
    expect(s.id).toBe("s1");
  });

  it("POSTs a new payee", async () => {
    const { fn, calls } = fakeFetch(201, {
      data: { payee: { id: "p1", name: "New Payee" } },
    });
    const client = new YnabClient("tok", fn);

    const payee = await client.createPayee("bud-1", "New Payee");

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/bud-1/payees");
    expect(JSON.parse(calls[0]?.body ?? "null")).toEqual({ payee: { name: "New Payee" } });
    expect(payee.id).toBe("p1");
  });

  it("GETs money movement resources", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { money_movements: [{ id: "mm1", amount: 1000 }], server_knowledge: 5 },
    });
    const client = new YnabClient("tok", fn);

    const out = await client.listMoneyMovements("bud-1");

    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/bud-1/money_movements");
    expect(out.server_knowledge).toBe(5);
    expect(out.money_movements[0]?.id).toBe("mm1");
  });

  it("GETs month money movement group resources", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: { money_movement_groups: [{ id: "mmg1", month: "2026-07-01" }], server_knowledge: 9 },
    });
    const client = new YnabClient("tok", fn);

    const out = await client.listMonthMoneyMovementGroups("bud-1", "2026-07-01");

    expect(calls[0]?.url).toBe(
      "https://api.ynab.com/v1/budgets/bud-1/months/2026-07-01/money_movement_groups",
    );
    expect(out.money_movement_groups[0]?.id).toBe("mmg1");
  });

  it("POSTs a new scheduled transaction", async () => {
    const { fn, calls } = fakeFetch(201, {
      data: {
        scheduled_transaction: {
          id: "s2",
          date_first: "2026-07-01",
          date_next: "2026-07-01",
          frequency: "weekly",
          amount: -10000,
        },
      },
    });
    const client = new YnabClient("tok", fn);

    const s = await client.createScheduledTransaction("bud-1", {
      account_id: "acct-1",
      date: "2026-07-01",
      amount: -10000,
      frequency: "weekly",
    });

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/bud-1/scheduled_transactions");
    expect(JSON.parse(calls[0]?.body ?? "null")).toEqual({
      scheduled_transaction: {
        account_id: "acct-1",
        date: "2026-07-01",
        amount: -10000,
        frequency: "weekly",
      },
    });
    expect(s.id).toBe("s2");
  });

  it("PUTs an update to a scheduled transaction", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: {
        scheduled_transaction: {
          id: "s3",
          date_first: "2026-06-01",
          date_next: "2026-07-01",
          frequency: "monthly",
          amount: -20000,
        },
      },
    });
    const client = new YnabClient("tok", fn);

    await client.updateScheduledTransaction("bud-1", "s3", { amount: -20000 });

    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/bud-1/scheduled_transactions/s3");
    expect(JSON.parse(calls[0]?.body ?? "null")).toEqual({
      scheduled_transaction: { amount: -20000 },
    });
  });

  it("DELETEs a scheduled transaction", async () => {
    const { fn, calls } = fakeFetch(200, {
      data: {
        scheduled_transaction: {
          id: "s4",
          date_first: "2026-06-01",
          date_next: "2026-07-01",
          frequency: "monthly",
          amount: -5000,
        },
      },
    });
    const client = new YnabClient("tok", fn);

    await client.deleteScheduledTransaction("bud-1", "s4");

    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://api.ynab.com/v1/budgets/bud-1/scheduled_transactions/s4");
  });
});
