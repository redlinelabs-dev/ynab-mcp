// ============================================================================
// Spending aggregation — pure logic, no API calls.
//
// Collapses a transaction list into per-group totals so the assistant can
// reason about spending habits without re-reading every row (and without
// burning the 200 req/hr API budget). Outflows are negative milliunits, so
// rows sort ascending — the largest spend lands first.
// ============================================================================

import { units } from "./money.js";

export interface SummaryTxn {
  amount: number;
  category_name?: string | null;
  payee_name?: string | null;
}

export interface SummaryRow {
  group: string;
  total: number;
  total_units: number;
  count: number;
}

export interface SpendingSummary {
  group_by: "category" | "payee";
  rows: SummaryRow[];
  total: number;
  total_units: number;
  count: number;
}

const UNLABELED: Record<"category" | "payee", string> = {
  category: "(uncategorized)",
  payee: "(no payee)",
};

export function summarizeSpending(
  txns: SummaryTxn[],
  groupBy: "category" | "payee",
): SpendingSummary {
  const totals = new Map<string, { total: number; count: number }>();
  let grandTotal = 0;

  for (const t of txns) {
    const label = (groupBy === "category" ? t.category_name : t.payee_name) ?? UNLABELED[groupBy];
    const row = totals.get(label) ?? { total: 0, count: 0 };
    row.total += t.amount;
    row.count += 1;
    totals.set(label, row);
    grandTotal += t.amount;
  }

  const rows: SummaryRow[] = [...totals.entries()].map(([group, r]) => ({
    group,
    total: r.total,
    total_units: units(r.total),
    count: r.count,
  }));
  rows.sort((a, b) => a.total - b.total);

  return {
    group_by: groupBy,
    rows,
    total: grandTotal,
    total_units: units(grandTotal),
    count: txns.length,
  };
}
