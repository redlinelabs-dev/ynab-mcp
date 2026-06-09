import { describe, expect, it } from "vitest";

import type { DupTxn } from "../src/duplicates.js";

import { findDuplicateTransactions } from "../src/duplicates.js";

function txn(over: Partial<DupTxn> & Pick<DupTxn, "id">): DupTxn {
  return {
    account_id: "acct-1",
    amount: -10000,
    date: "2026-06-01",
    import_id: null,
    payee_name: "Coffee Shop",
    ...over,
  };
}

describe("findDuplicateTransactions", () => {
  it("clusters two transactions with the same account, amount, and date", () => {
    const clusters = findDuplicateTransactions([txn({ id: "a" }), txn({ id: "b" })]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.transaction_ids.sort()).toEqual(["a", "b"]);
  });

  it("reports only duplicate clusters, excludes uniques, sorted by date ascending", () => {
    const clusters = findDuplicateTransactions([
      txn({ id: "late-1", date: "2026-06-10", amount: -5000 }),
      txn({ id: "unique", date: "2026-06-05", amount: -777 }),
      txn({ id: "late-2", date: "2026-06-10", amount: -5000 }),
      txn({ id: "early-1", date: "2026-06-02", amount: -3000 }),
      txn({ id: "early-2", date: "2026-06-02", amount: -3000 }),
    ]);

    expect(clusters.map((c) => c.date)).toEqual(["2026-06-02", "2026-06-10"]);
    expect(clusters[0]?.transaction_ids.sort()).toEqual(["early-1", "early-2"]);
    expect(clusters[1]?.transaction_ids.sort()).toEqual(["late-1", "late-2"]);
  });
});
