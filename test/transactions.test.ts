import { describe, expect, it } from "vitest";

import { buildBulkTransactionsBody, buildSaveTransaction } from "../src/transactions.js";

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
