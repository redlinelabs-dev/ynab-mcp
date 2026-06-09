// ============================================================================
// Transaction request-body builders — pure, no API calls.
//
// YNAB's create (`POST`), update (`PUT`), and bulk-update (`PATCH`) endpoints
// all accept the same "save transaction" field set. A field is sent only when
// the caller provided it; an explicit `null` is preserved (YNAB treats null as
// "clear this field", e.g. uncategorize or remove a memo).
// ============================================================================

export interface SaveTxnFields {
  account_id?: string;
  date?: string;
  amount?: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
  cleared?: string;
  approved?: boolean;
  flag_color?: string | null;
}

export interface BulkTxnUpdate extends SaveTxnFields {
  id: string;
}

/** Build a save-transaction object, omitting keys whose value is `undefined`. */
export function buildSaveTransaction(fields: SaveTxnFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Build the `{ transactions: [...] }` wrapper for the bulk PATCH endpoint. */
export function buildBulkTransactionsBody(updates: BulkTxnUpdate[]): {
  transactions: Record<string, unknown>[];
} {
  return {
    transactions: updates.map(({ id, ...fields }) => ({ id, ...buildSaveTransaction(fields) })),
  };
}
