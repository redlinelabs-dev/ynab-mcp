import { describe, expect, it } from "vitest";

import {
  buildBulkCreateBody,
  buildBulkTransactionsBody,
  buildSaveTransaction,
} from "../src/transactions.js";

describe("buildSaveTransaction", () => {
  it("includes only provided fields and omits undefined ones", () => {
    const body = buildSaveTransaction({ category_id: "cat-1", approved: true });

    expect(body).toEqual({ category_id: "cat-1", approved: true });
    expect("memo" in body).toBe(false);
  });

  it("preserves an explicit null (e.g. clearing a category or memo)", () => {
    const body = buildSaveTransaction({ category_id: null, memo: null });

    expect(body).toEqual({ category_id: null, memo: null });
  });

  it("builds a split: parent category_id null + cleaned subtransaction legs", () => {
    const body = buildSaveTransaction({
      account_id: "acc-1",
      amount: -5000,
      category_id: null,
      import_id: "YNAB:-5000:2026-06-18:1",
      subtransactions: [
        { amount: -3000, category_id: "groceries" },
        { amount: -2000, category_id: "household", memo: "paper towels" },
      ],
    });

    expect(body).toEqual({
      account_id: "acc-1",
      amount: -5000,
      category_id: null,
      import_id: "YNAB:-5000:2026-06-18:1",
      subtransactions: [
        { amount: -3000, category_id: "groceries" },
        { amount: -2000, category_id: "household", memo: "paper towels" },
      ],
    });
  });

  it("omits undefined leg fields but keeps an explicit null in a leg", () => {
    const body = buildSaveTransaction({
      subtransactions: [{ amount: -1000, category_id: null, payee_name: undefined }],
    });

    expect(body).toEqual({ subtransactions: [{ amount: -1000, category_id: null }] });
  });
});

describe("buildBulkCreateBody", () => {
  it("wraps each new transaction under transactions[], cleaning each (incl. splits)", () => {
    const body = buildBulkCreateBody([
      { account_id: "a", date: "2026-06-18", amount: -1000, category_id: "c1", memo: undefined },
      {
        account_id: "a",
        date: "2026-06-18",
        amount: -5000,
        category_id: null,
        subtransactions: [{ amount: -2000, category_id: "x" }],
      },
    ]);

    expect(body).toEqual({
      transactions: [
        { account_id: "a", date: "2026-06-18", amount: -1000, category_id: "c1" },
        {
          account_id: "a",
          date: "2026-06-18",
          amount: -5000,
          category_id: null,
          subtransactions: [{ amount: -2000, category_id: "x" }],
        },
      ],
    });
  });
});

describe("buildBulkTransactionsBody", () => {
  it("wraps each update under transactions[], carrying its id plus provided fields", () => {
    const body = buildBulkTransactionsBody([
      { id: "a", category_id: "cat-1", approved: true },
      { id: "b", approved: true },
    ]);

    expect(body).toEqual({
      transactions: [
        { id: "a", category_id: "cat-1", approved: true },
        { id: "b", approved: true },
      ],
    });
  });
});
