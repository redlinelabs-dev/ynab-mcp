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
