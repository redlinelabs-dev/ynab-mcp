// ============================================================================
// Duplicate-transaction detection — pure logic, no API calls.
//
// YNAB's own `import_id` dedup only prevents re-importing; it does nothing for
// duplicates that already exist (e.g. a manual entry plus an imported one).
// This finds candidate clusters for review — it never deletes anything.
// ============================================================================

export interface DupTxn {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  import_id?: string | null;
  payee_name?: string | null;
}

export interface DuplicateCluster {
  account_id: string;
  amount: number;
  date: string;
  transaction_ids: string[];
  transactions: DupTxn[];
}

export function findDuplicateTransactions(txns: DupTxn[]): DuplicateCluster[] {
  const groups = new Map<string, DupTxn[]>();
  for (const t of txns) {
    const key = `${t.account_id}|${t.amount}|${t.date}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(t);
    } else {
      groups.set(key, [t]);
    }
  }

  const clusters: DuplicateCluster[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const first = bucket[0];
    if (!first) continue;
    clusters.push({
      account_id: first.account_id,
      amount: first.amount,
      date: first.date,
      transaction_ids: bucket.map((t) => t.id),
      transactions: bucket,
    });
  }
  clusters.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amount - b.amount));
  return clusters;
}
