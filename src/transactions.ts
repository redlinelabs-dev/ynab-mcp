// ============================================================================
// Transaction request-body builders — pure, no API calls.
//
// YNAB's create (`POST`), update (`PUT`), and bulk-update (`PATCH`) endpoints
// all accept the same "save transaction" field set. A field is sent only when
// the caller provided it; an explicit `null` is preserved (YNAB treats null as
// "clear this field", e.g. uncategorize or remove a memo).
// ============================================================================

// One leg of a split transaction. `amount` is required (milliunits); the legs
// must sum to the parent transaction's amount. YNAB only accepts these on
// CREATE — the subtransaction set of an existing split cannot be edited via the
// API (see ROADMAP).
export interface SaveSubTxnFields {
  amount: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
}

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
  import_id?: string | null;
  // A split: set the parent `category_id` to null and provide the legs here.
  subtransactions?: SaveSubTxnFields[];
}

export interface BulkTxnUpdate extends SaveTxnFields {
  id: string;
}

/** Build one subtransaction leg, omitting keys whose value is `undefined`. */
function buildSaveSubtransaction(fields: SaveSubTxnFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Build a save-transaction object, omitting keys whose value is `undefined`
 * (an explicit `null` is preserved). `subtransactions` legs are each cleaned the
 * same way, so a split can be created in one call.
 */
export function buildSaveTransaction(fields: SaveTxnFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (key === "subtransactions" && Array.isArray(value)) {
      out[key] = value.map((sub) => buildSaveSubtransaction(sub));
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface SaveScheduledTxnFields {
  account_id?: string;
  date?: string;
  amount?: number;
  frequency?: string;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
  flag_color?: string | null;
}

/** Build a save-scheduled-transaction object, omitting keys whose value is `undefined`. */
export function buildSaveScheduledTransaction(
  fields: SaveScheduledTxnFields,
): Record<string, unknown> {
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
