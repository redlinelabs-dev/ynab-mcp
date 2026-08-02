// ============================================================================
// Demo mode — a fixture-backed `fetch` that emulates the YNAB REST API.
//
// `createDemoFetch` returns a `FetchFn` that can be injected into `YnabClient`
// exactly like the real global `fetch` (ADR-0001's seam). It never touches the
// network: every request is routed against an in-memory `DemoState` (see
// `demo-fixtures.ts`), and every response is the same `{ data: ... }` envelope
// shape the real API returns, so it validates through the same Zod schemas in
// `src/schemas.ts`. Writes mutate the injected state so the demo budget
// behaves like a real one for the life of the process; tool handlers, schemas,
// and client methods have no idea they're talking to a fixture.
// ============================================================================

import { z } from "zod";

import type { FetchFn } from "./client.js";
import type { DemoState } from "./demo-fixtures.js";
import type {
  Account,
  Category,
  CategoryGroup,
  Payee,
  ScheduledTransaction,
  Transaction,
} from "./schemas.js";

import {
  allCategories,
  createDemoState,
  monthSummaries,
  refreshCategoryActivity,
} from "./demo-fixtures.js";

class DemoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Write-body schemas — mirror what `src/transactions.ts`'s builders send.
// ---------------------------------------------------------------------------

const SubtransactionFieldsSchema = z.object({
  amount: z.number(),
  payee_id: z.string().nullable().optional(),
  payee_name: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

const SaveTxnFieldsSchema = z.object({
  account_id: z.string().optional(),
  date: z.string().optional(),
  amount: z.number().optional(),
  payee_id: z.string().nullable().optional(),
  payee_name: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  cleared: z.string().optional(),
  approved: z.boolean().optional(),
  flag_color: z.string().nullable().optional(),
  import_id: z.string().nullable().optional(),
  subtransactions: z.array(SubtransactionFieldsSchema).optional(),
});
type SaveTxnFields = z.infer<typeof SaveTxnFieldsSchema>;

const SingleTxnBody = z.object({ transaction: SaveTxnFieldsSchema });
const BulkTxnCreateBody = z.object({ transactions: z.array(SaveTxnFieldsSchema) });
const BulkTxnUpdateBody = z.object({
  transactions: z.array(SaveTxnFieldsSchema.extend({ id: z.string() })),
});

const CreateAccountBody = z.object({
  account: z.object({ name: z.string(), type: z.string(), balance: z.number() }),
});

// Simplification (documented, not a bug): `SaveCategoryFields` (src/client.ts)
// also sends `note`, `goal_target_date`, and `goal_needs_whole_amount`. They're
// accepted here (unknown keys are dropped by default, not rejected) but never
// stored — `CategorySchema` in src/schemas.ts doesn't model them either, and
// no formatter or tool in this repo reads them back, so there's nothing for
// the demo to round-trip. Wiring them through would mean growing a live-API
// contract (CategorySchema) purely to satisfy the fixture.
const CreateCategoryBody = z.object({
  category: z.object({
    name: z.string(),
    category_group_id: z.string(),
    goal_target: z.number().nullable().optional(),
  }),
});
const UpdateCategoryBody = z.object({
  category: z.object({
    name: z.string().optional(),
    goal_target: z.number().nullable().optional(),
  }),
});
const SaveCategoryGroupBody = z.object({ category_group: z.object({ name: z.string() }) });
const UpdateCategoryBudgetBody = z.object({ category: z.object({ budgeted: z.number() }) });

const SavePayeeBody = z.object({ payee: z.object({ name: z.string() }) });

const SaveScheduledFieldsSchema = z.object({
  account_id: z.string().optional(),
  date: z.string().optional(),
  amount: z.number().optional(),
  frequency: z.string().optional(),
  payee_id: z.string().nullable().optional(),
  payee_name: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});
const SaveScheduledBody = z.object({ scheduled_transaction: SaveScheduledFieldsSchema });

// ---------------------------------------------------------------------------
// Lookup helpers — find-or-404 against the live state.
// ---------------------------------------------------------------------------

function findAccount(state: DemoState, id: string): Account {
  const account = state.accounts.find((a) => a.id === id && !a.deleted);
  if (!account) throw new DemoApiError(404, `Unknown demo account_id: ${id}`);
  return account;
}

function findCategory(state: DemoState, id: string): Category {
  const category = allCategories(state).find((c) => c.id === id && !c.deleted);
  if (!category) throw new DemoApiError(404, `Unknown demo category_id: ${id}`);
  return category;
}

function findCategoryGroup(state: DemoState, id: string): CategoryGroup {
  const group = state.categoryGroups.find((g) => g.id === id && !g.deleted);
  if (!group) throw new DemoApiError(404, `Unknown demo category_group_id: ${id}`);
  return group;
}

function findPayee(state: DemoState, id: string): Payee {
  const payee = state.payees.find((p) => p.id === id && !p.deleted);
  if (!payee) throw new DemoApiError(404, `Unknown demo payee_id: ${id}`);
  return payee;
}

function findTransaction(state: DemoState, id: string): Transaction {
  const txn = state.transactions.find((t) => t.id === id);
  if (!txn) throw new DemoApiError(404, `Unknown demo transaction_id: ${id}`);
  return txn;
}

function findScheduled(state: DemoState, id: string): ScheduledTransaction {
  const scheduled = state.scheduledTransactions.find((s) => s.id === id);
  if (!scheduled) throw new DemoApiError(404, `Unknown demo scheduled_transaction_id: ${id}`);
  return scheduled;
}

function requireSegment(rest: string[], i: number): string {
  const v = rest[i];
  if (v === undefined) throw new DemoApiError(404, "Malformed demo path");
  return v;
}

function resolvePayee(
  state: DemoState,
  payeeId: string | null | undefined,
  payeeName: string | null | undefined,
): { payee_id: string | null; payee_name: string | null } {
  if (payeeId) {
    const payee = findPayee(state, payeeId);
    return { payee_id: payee.id, payee_name: payee.name };
  }
  if (payeeName) {
    const existing = state.payees.find(
      (p) => !p.deleted && p.name.toLowerCase() === payeeName.toLowerCase(),
    );
    if (existing) return { payee_id: existing.id, payee_name: existing.name };
    const created: Payee = {
      id: state.nextId("payee"),
      name: payeeName,
      transfer_account_id: null,
      deleted: false,
    };
    state.payees.push(created);
    return { payee_id: created.id, payee_name: created.name };
  }
  return { payee_id: null, payee_name: null };
}

function resolveCategoryField(
  state: DemoState,
  categoryId: string | null | undefined,
): { category_id: string | null; category_name: string | null } {
  if (categoryId === undefined || categoryId === null)
    return { category_id: null, category_name: null };
  const category = findCategory(state, categoryId);
  return { category_id: category.id, category_name: category.name };
}

function adjustAccountBalance(
  state: DemoState,
  accountId: string,
  amount: number,
  cleared: string,
): void {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return;
  account.balance += amount;
  if (cleared === "uncleared") account.uncleared_balance += amount;
  else account.cleared_balance += amount;
}

function refreshDerived(state: DemoState): void {
  refreshCategoryActivity(state.categoryGroups, state.transactions);
}

/** Every write bumps `server_knowledge` and the budget's `last_modified_on` together. */
function bumpServerKnowledge(state: DemoState): void {
  state.serverKnowledge += 1;
  state.lastModifiedOn = new Date().toISOString();
}

/**
 * Find the payee that represents "this is a transfer to `accountId`" (i.e.
 * its `transfer_account_id` is `accountId`), creating one if this is the
 * first transfer ever made to that account in this session — matching how
 * YNAB lazily creates the paired transfer payee for a new account.
 */
function findOrCreateTransferPayee(state: DemoState, accountId: string): Payee {
  const existing = state.payees.find((p) => !p.deleted && p.transfer_account_id === accountId);
  if (existing) return existing;
  const account = findAccount(state, accountId);
  const created: Payee = {
    id: state.nextId("payee"),
    name: `Transfer : ${account.name}`,
    transfer_account_id: accountId,
    deleted: false,
  };
  state.payees.push(created);
  return created;
}

/**
 * Create the other leg of a transfer: an inverse-amount transaction on the
 * destination account, using (or creating) the transfer payee that points
 * back at `source`'s account. Links the two legs in `state.transferLinks` so
 * `applyTxnPatch`/`deleteTransactionEntity` can keep them in sync.
 */
function createTransferMirror(
  state: DemoState,
  source: Transaction,
  destinationAccountId: string,
): void {
  const destinationAccount = findAccount(state, destinationAccountId);
  const mirrorPayee = findOrCreateTransferPayee(state, source.account_id);
  const mirror: Transaction = {
    id: state.nextId("txn"),
    date: source.date,
    amount: -source.amount,
    memo: source.memo,
    cleared: source.cleared,
    approved: source.approved,
    flag_color: null,
    account_id: destinationAccount.id,
    account_name: destinationAccount.name,
    payee_id: mirrorPayee.id,
    payee_name: mirrorPayee.name,
    category_id: null,
    category_name: null,
    import_id: null,
    transfer_account_id: source.account_id,
    subtransactions: [],
    deleted: false,
  };
  state.transactions.push(mirror);
  adjustAccountBalance(state, mirror.account_id, mirror.amount, mirror.cleared);
  state.transferLinks.set(source.id, mirror.id);
  state.transferLinks.set(mirror.id, source.id);
}

// ---------------------------------------------------------------------------
// Transaction create / patch / delete
// ---------------------------------------------------------------------------

function createTransactionEntity(state: DemoState, fields: SaveTxnFields): Transaction {
  if (!fields.account_id) throw new DemoApiError(400, "account_id is required");
  if (!fields.date) throw new DemoApiError(400, "date is required");
  if (fields.amount === undefined) throw new DemoApiError(400, "amount is required");

  const account = findAccount(state, fields.account_id);
  const payee = resolvePayee(state, fields.payee_id, fields.payee_name);
  const payeeEntity = payee.payee_id
    ? state.payees.find((p) => p.id === payee.payee_id && !p.deleted)
    : undefined;
  const transferAccountId = payeeEntity?.transfer_account_id ?? null;
  // A transfer payee wins over any explicit category_id: real YNAB doesn't
  // allow categorizing a transfer between two on-budget accounts, which is
  // the only kind of account this demo has.
  const category = transferAccountId
    ? { category_id: null, category_name: null }
    : resolveCategoryField(state, fields.category_id);
  const cleared = fields.cleared ?? "cleared";

  const legs = (fields.subtransactions ?? []).map((s) => {
    const legPayee = resolvePayee(state, s.payee_id, s.payee_name);
    const legCategory = resolveCategoryField(state, s.category_id);
    return {
      id: state.nextId("sub"),
      amount: s.amount,
      memo: s.memo ?? null,
      payee_id: legPayee.payee_id,
      payee_name: legPayee.payee_name,
      category_id: legCategory.category_id,
      category_name: legCategory.category_name,
      deleted: false,
    };
  });

  const txn: Transaction = {
    id: state.nextId("txn"),
    date: fields.date,
    amount: fields.amount,
    memo: fields.memo ?? null,
    cleared,
    approved: fields.approved ?? true,
    flag_color: fields.flag_color ?? null,
    account_id: account.id,
    account_name: account.name,
    payee_id: payee.payee_id,
    payee_name: payee.payee_name,
    category_id: category.category_id,
    category_name: category.category_name,
    import_id: fields.import_id ?? null,
    transfer_account_id: transferAccountId,
    subtransactions: legs,
    deleted: false,
  };

  state.transactions.push(txn);
  bumpServerKnowledge(state);
  adjustAccountBalance(state, txn.account_id, txn.amount, txn.cleared);
  if (transferAccountId) {
    createTransferMirror(state, txn, transferAccountId);
  }
  refreshDerived(state);
  return txn;
}

function applyTxnPatch(
  state: DemoState,
  existing: Transaction,
  fields: SaveTxnFields,
): Transaction {
  // Simplification (documented, not a bug): changing the account or payee of
  // one leg of a transfer decouples it from its mirror. Real YNAB would
  // either reject that or re-derive a new pairing; this demo takes the
  // simpler path of severing the link — both legs become ordinary,
  // independently-editable transactions from that point on, rather than
  // risking a mirror update against a leg it no longer actually corresponds
  // to. Amount/date/memo/cleared/approved edits keep syncing right up until
  // the account or payee changes.
  const changesAccountOrPayee =
    fields.account_id !== undefined ||
    fields.payee_id !== undefined ||
    fields.payee_name !== undefined;
  const breaksTransferLink = changesAccountOrPayee && state.transferLinks.has(existing.id);
  if (breaksTransferLink) {
    const mirrorId = state.transferLinks.get(existing.id);
    state.transferLinks.delete(existing.id);
    if (mirrorId !== undefined) state.transferLinks.delete(mirrorId);
  }

  const oldAmount = existing.amount;
  const oldAccountId = existing.account_id;
  const oldCleared = existing.cleared;

  const next: Transaction = { ...existing };
  if (breaksTransferLink) next.transfer_account_id = null;
  if (fields.account_id !== undefined) {
    const account = findAccount(state, fields.account_id);
    next.account_id = account.id;
    next.account_name = account.name;
  }
  if (fields.date !== undefined) next.date = fields.date;
  if (fields.amount !== undefined) next.amount = fields.amount;
  if (fields.memo !== undefined) next.memo = fields.memo;
  if (fields.cleared !== undefined) next.cleared = fields.cleared;
  if (fields.approved !== undefined) next.approved = fields.approved;
  if (fields.flag_color !== undefined) next.flag_color = fields.flag_color;
  if (fields.import_id !== undefined) next.import_id = fields.import_id;
  if (fields.category_id !== undefined) {
    const resolved = resolveCategoryField(state, fields.category_id);
    next.category_id = resolved.category_id;
    next.category_name = resolved.category_name;
  }
  if (fields.payee_id !== undefined || fields.payee_name !== undefined) {
    const resolved = resolvePayee(state, fields.payee_id, fields.payee_name);
    next.payee_id = resolved.payee_id;
    next.payee_name = resolved.payee_name;
  }

  const idx = state.transactions.findIndex((t) => t.id === existing.id);
  if (idx === -1) throw new DemoApiError(404, `Unknown demo transaction_id: ${existing.id}`);
  state.transactions[idx] = next;

  adjustAccountBalance(state, oldAccountId, -oldAmount, oldCleared);
  adjustAccountBalance(state, next.account_id, next.amount, next.cleared);

  const mirrorId = state.transferLinks.get(existing.id);
  if (mirrorId !== undefined) {
    const mirrorIdx = state.transactions.findIndex((t) => t.id === mirrorId);
    const mirror = mirrorIdx === -1 ? undefined : state.transactions[mirrorIdx];
    if (mirror !== undefined) {
      const oldMirrorAmount = mirror.amount;
      const oldMirrorAccountId = mirror.account_id;
      const oldMirrorCleared = mirror.cleared;
      const updatedMirror: Transaction = {
        ...mirror,
        date: next.date,
        memo: next.memo,
        cleared: next.cleared,
        approved: next.approved,
        amount: -next.amount,
      };
      state.transactions[mirrorIdx] = updatedMirror;
      adjustAccountBalance(state, oldMirrorAccountId, -oldMirrorAmount, oldMirrorCleared);
      adjustAccountBalance(
        state,
        updatedMirror.account_id,
        updatedMirror.amount,
        updatedMirror.cleared,
      );
    }
  }

  return next;
}

function deleteTransactionEntity(state: DemoState, id: string): Transaction {
  const existing = findTransaction(state, id);
  const idx = state.transactions.findIndex((t) => t.id === id);
  if (idx === -1) throw new DemoApiError(404, `Unknown demo transaction_id: ${id}`);
  const deleted: Transaction = { ...existing, deleted: true };
  state.transactions[idx] = deleted;
  adjustAccountBalance(state, existing.account_id, -existing.amount, existing.cleared);
  bumpServerKnowledge(state);

  // Deleting one leg of a transfer deletes both — matches real YNAB, which
  // never leaves a transfer with only one side of the ledger entry.
  const mirrorId = state.transferLinks.get(id);
  if (mirrorId !== undefined) {
    const mirrorIdx = state.transactions.findIndex((t) => t.id === mirrorId);
    const mirror = mirrorIdx === -1 ? undefined : state.transactions[mirrorIdx];
    if (mirror !== undefined && !mirror.deleted) {
      state.transactions[mirrorIdx] = { ...mirror, deleted: true };
      adjustAccountBalance(state, mirror.account_id, -mirror.amount, mirror.cleared);
    }
    state.transferLinks.delete(id);
    state.transferLinks.delete(mirrorId);
  }

  refreshDerived(state);
  return deleted;
}

// ---------------------------------------------------------------------------
// Query filtering
// ---------------------------------------------------------------------------

interface TxnFilterOpts {
  since_date?: string;
  until_date?: string;
  type?: "uncategorized" | "unapproved";
}

function queryOpts(url: URL): TxnFilterOpts {
  const since_date = url.searchParams.get("since_date") ?? undefined;
  const until_date = url.searchParams.get("until_date") ?? undefined;
  const typeRaw = url.searchParams.get("type");
  const type = typeRaw === "uncategorized" || typeRaw === "unapproved" ? typeRaw : undefined;
  return {
    ...(since_date !== undefined && { since_date }),
    ...(until_date !== undefined && { until_date }),
    ...(type !== undefined && { type }),
  };
}

function filterTransactions(txns: Transaction[], opts: TxnFilterOpts): Transaction[] {
  return txns
    .filter((t) => {
      if (t.deleted) return false;
      if (opts.since_date !== undefined && t.date < opts.since_date) return false;
      if (opts.until_date !== undefined && t.date > opts.until_date) return false;
      if (opts.type === "uncategorized" && t.category_id !== null) return false;
      if (opts.type === "unapproved" && t.approved) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Budget-level shapes
// ---------------------------------------------------------------------------

function budgetSummary(state: DemoState, includeAccounts: boolean): Record<string, unknown> {
  return {
    id: state.budgetId,
    name: state.budgetName,
    last_modified_on: state.lastModifiedOn,
    first_month: state.months[0] ?? null,
    last_month: state.months[state.months.length - 1] ?? null,
    currency_format: state.currency,
    ...(includeAccounts && { accounts: state.accounts.filter((a) => !a.deleted) }),
  };
}

function budgetDetail(state: DemoState): Record<string, unknown> {
  return {
    ...budgetSummary(state, true),
    payees: state.payees.filter((p) => !p.deleted),
    payee_locations: [],
    category_groups: state.categoryGroups,
    categories: allCategories(state),
    months: monthSummaries(state),
    transactions: state.transactions.filter((t) => !t.deleted),
    subtransactions: state.transactions.flatMap((t) => t.subtransactions),
    scheduled_transactions: state.scheduledTransactions.filter((s) => !s.deleted),
    scheduled_subtransactions: [],
  };
}

function resolveMonthKey(state: DemoState, raw: string): string {
  return raw === "current" ? state.currentMonth : raw;
}

function requireMonth(state: DemoState, raw: string): string {
  const key = resolveMonthKey(state, raw);
  if (!state.months.includes(key)) throw new DemoApiError(404, `Unknown demo month: ${raw}`);
  return key;
}

function monthDetail(state: DemoState, monthKey: string): Record<string, unknown> {
  const summary = monthSummaries(state).find((m) => m.month === monthKey);
  if (!summary) throw new DemoApiError(404, `Unknown demo month: ${monthKey}`);
  return { ...summary, categories: allCategories(state) };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function ensureBudget(state: DemoState, seg: string): void {
  if (seg === "last-used" || seg === "default" || seg === state.budgetId) return;
  throw new DemoApiError(404, `Unknown demo budget: ${seg}`);
}

function route(state: DemoState, method: string, url: URL, body: unknown): unknown {
  const raw = url.pathname.split("/").filter(Boolean);
  const segments = raw[0] === "v1" ? raw.slice(1) : raw;

  if (segments.length === 1 && segments[0] === "user" && method === "GET") {
    return { user: { id: "demo-user" } };
  }

  if (segments[0] === "budgets") {
    if (segments.length === 1) {
      if (method !== "GET")
        throw new DemoApiError(404, `Unknown demo route: ${method} ${url.pathname}`);
      const includeAccounts = url.searchParams.get("include_accounts") === "true";
      return {
        budgets: [budgetSummary(state, includeAccounts)],
        default_budget: budgetSummary(state, false),
      };
    }
    ensureBudget(state, requireSegment(segments, 1));
    const rest = segments.slice(2);
    return routeBudget(state, method, rest, url, body);
  }

  throw new DemoApiError(404, `Unknown demo route: ${method} ${url.pathname}`);
}

function routeBudget(
  state: DemoState,
  method: string,
  rest: string[],
  url: URL,
  body: unknown,
): unknown {
  // --- Budget detail / settings ---
  if (rest.length === 0 && method === "GET") {
    return { budget: budgetDetail(state), server_knowledge: state.serverKnowledge };
  }
  if (rest.length === 1 && rest[0] === "settings" && method === "GET") {
    return { settings: { date_format: { format: "MM/DD/YYYY" }, currency_format: state.currency } };
  }

  // --- Accounts ---
  if (rest.length === 1 && rest[0] === "accounts") {
    if (method === "GET") {
      return {
        accounts: state.accounts.filter((a) => !a.deleted),
        server_knowledge: state.serverKnowledge,
      };
    }
    if (method === "POST") {
      const parsed = CreateAccountBody.parse(body);
      const account: Account = {
        id: state.nextId("acc"),
        name: parsed.account.name,
        type: parsed.account.type,
        on_budget: true,
        closed: false,
        balance: parsed.account.balance,
        cleared_balance: parsed.account.balance,
        uncleared_balance: 0,
        deleted: false,
      };
      state.accounts.push(account);
      // Every account gets its "Transfer : <account>" payee immediately, the
      // way real YNAB does — not lazily on first use. `findOrCreateTransferPayee`
      // is still a fallback for the (currently unreachable) case of a transfer
      // targeting an account that somehow has none.
      findOrCreateTransferPayee(state, account.id);
      bumpServerKnowledge(state);
      return { account };
    }
  }
  if (rest.length === 2 && rest[0] === "accounts" && method === "GET") {
    return { account: findAccount(state, requireSegment(rest, 1)) };
  }
  if (
    rest.length === 3 &&
    rest[0] === "accounts" &&
    rest[2] === "transactions" &&
    method === "GET"
  ) {
    const accountId = requireSegment(rest, 1);
    findAccount(state, accountId);
    const txns = filterTransactions(
      state.transactions.filter((t) => t.account_id === accountId),
      queryOpts(url),
    );
    return { transactions: txns, server_knowledge: state.serverKnowledge };
  }

  // --- Categories ---
  if (rest.length === 1 && rest[0] === "categories") {
    if (method === "GET") {
      return { category_groups: state.categoryGroups, server_knowledge: state.serverKnowledge };
    }
    if (method === "POST") {
      const parsed = CreateCategoryBody.parse(body);
      const group = findCategoryGroup(state, parsed.category.category_group_id);
      const category: Category = {
        id: state.nextId("cat"),
        category_group_id: group.id,
        category_group_name: group.name,
        name: parsed.category.name,
        hidden: false,
        budgeted: 0,
        activity: 0,
        balance: 0,
        goal_type: parsed.category.goal_target !== undefined ? "TB" : null,
        goal_target: parsed.category.goal_target ?? null,
        deleted: false,
      };
      group.categories.push(category);
      bumpServerKnowledge(state);
      return { category };
    }
  }
  if (rest.length === 2 && rest[0] === "categories") {
    const categoryId = requireSegment(rest, 1);
    if (method === "GET") return { category: findCategory(state, categoryId) };
    if (method === "PATCH") {
      const parsed = UpdateCategoryBody.parse(body);
      const category = findCategory(state, categoryId);
      if (parsed.category.name !== undefined) category.name = parsed.category.name;
      if (parsed.category.goal_target !== undefined)
        category.goal_target = parsed.category.goal_target;
      bumpServerKnowledge(state);
      return { category };
    }
  }
  if (
    rest.length === 3 &&
    rest[0] === "categories" &&
    rest[2] === "transactions" &&
    method === "GET"
  ) {
    const categoryId = requireSegment(rest, 1);
    findCategory(state, categoryId);
    const txns = filterTransactions(
      state.transactions.filter((t) => t.category_id === categoryId),
      queryOpts(url),
    );
    return { transactions: txns, server_knowledge: state.serverKnowledge };
  }

  // --- Category groups ---
  if (rest.length === 1 && rest[0] === "category_groups" && method === "POST") {
    const parsed = SaveCategoryGroupBody.parse(body);
    const group: CategoryGroup = {
      id: state.nextId("grp"),
      name: parsed.category_group.name,
      hidden: false,
      deleted: false,
      categories: [],
    };
    state.categoryGroups.push(group);
    bumpServerKnowledge(state);
    return { category_group: group };
  }
  if (rest.length === 2 && rest[0] === "category_groups" && method === "PATCH") {
    const parsed = SaveCategoryGroupBody.parse(body);
    const group = findCategoryGroup(state, requireSegment(rest, 1));
    group.name = parsed.category_group.name;
    bumpServerKnowledge(state);
    return { category_group: group };
  }

  // --- Transactions ---
  if (rest.length === 1 && rest[0] === "transactions") {
    if (method === "GET") {
      return {
        transactions: filterTransactions(state.transactions, queryOpts(url)),
        server_knowledge: state.serverKnowledge,
      };
    }
    if (method === "POST") {
      const single = SingleTxnBody.safeParse(body);
      if (single.success) {
        return { transaction: createTransactionEntity(state, single.data.transaction) };
      }
      const bulk = BulkTxnCreateBody.safeParse(body);
      if (bulk.success) {
        const created = bulk.data.transactions.map((fields) =>
          createTransactionEntity(state, fields),
        );
        return {
          transaction_ids: created.map((t) => t.id),
          transactions: created,
          duplicate_import_ids: [],
        };
      }
      throw new DemoApiError(400, "Malformed demo transaction create body");
    }
    if (method === "PATCH") {
      const parsed = BulkTxnUpdateBody.parse(body);
      const updated = parsed.transactions.map(({ id, ...fields }) =>
        applyTxnPatch(state, findTransaction(state, id), fields),
      );
      bumpServerKnowledge(state);
      refreshDerived(state);
      return {
        transaction_ids: updated.map((t) => t.id),
        transactions: updated,
        duplicate_import_ids: [],
      };
    }
  }
  if (
    rest.length === 2 &&
    rest[0] === "transactions" &&
    rest[1] === "import" &&
    method === "POST"
  ) {
    return { transaction_ids: [] }; // demo has no linked accounts to import from
  }
  if (rest.length === 2 && rest[0] === "transactions") {
    const id = requireSegment(rest, 1);
    if (method === "GET") return { transaction: findTransaction(state, id) };
    if (method === "PUT") {
      const parsed = SingleTxnBody.parse(body);
      const updated = applyTxnPatch(state, findTransaction(state, id), parsed.transaction);
      bumpServerKnowledge(state);
      refreshDerived(state);
      return { transaction: updated };
    }
    if (method === "DELETE") {
      return { transaction: deleteTransactionEntity(state, id) };
    }
  }

  // --- Payees ---
  if (rest.length === 1 && rest[0] === "payees") {
    if (method === "GET") {
      return {
        payees: state.payees.filter((p) => !p.deleted),
        server_knowledge: state.serverKnowledge,
      };
    }
    if (method === "POST") {
      const parsed = SavePayeeBody.parse(body);
      const payee: Payee = {
        id: state.nextId("payee"),
        name: parsed.payee.name,
        transfer_account_id: null,
        deleted: false,
      };
      state.payees.push(payee);
      bumpServerKnowledge(state);
      return { payee };
    }
  }
  if (rest.length === 2 && rest[0] === "payees") {
    const payeeId = requireSegment(rest, 1);
    if (method === "GET") return { payee: findPayee(state, payeeId) };
    if (method === "PATCH") {
      const parsed = SavePayeeBody.parse(body);
      const payee = findPayee(state, payeeId);
      payee.name = parsed.payee.name;
      bumpServerKnowledge(state);
      return { payee };
    }
  }
  if (rest.length === 3 && rest[0] === "payees" && rest[2] === "transactions" && method === "GET") {
    const payeeId = requireSegment(rest, 1);
    findPayee(state, payeeId);
    const txns = filterTransactions(
      state.transactions.filter((t) => t.payee_id === payeeId),
      queryOpts(url),
    );
    return { transactions: txns, server_knowledge: state.serverKnowledge };
  }
  if (
    rest.length === 3 &&
    rest[0] === "payees" &&
    rest[2] === "payee_locations" &&
    method === "GET"
  ) {
    findPayee(state, requireSegment(rest, 1));
    return { payee_locations: [] };
  }

  // --- Payee locations (read-only; no demo GPS data) ---
  if (rest.length === 1 && rest[0] === "payee_locations" && method === "GET") {
    return { payee_locations: [] };
  }
  if (rest.length === 2 && rest[0] === "payee_locations" && method === "GET") {
    throw new DemoApiError(404, `Unknown demo payee_location_id: ${requireSegment(rest, 1)}`);
  }

  // --- Scheduled transactions ---
  if (rest.length === 1 && rest[0] === "scheduled_transactions") {
    if (method === "GET") {
      return {
        scheduled_transactions: state.scheduledTransactions.filter((s) => !s.deleted),
        server_knowledge: state.serverKnowledge,
      };
    }
    if (method === "POST") {
      const parsed = SaveScheduledBody.parse(body);
      const f = parsed.scheduled_transaction;
      if (!f.account_id) throw new DemoApiError(400, "account_id is required");
      if (!f.date) throw new DemoApiError(400, "date is required");
      if (f.amount === undefined) throw new DemoApiError(400, "amount is required");
      if (!f.frequency) throw new DemoApiError(400, "frequency is required");
      const account = findAccount(state, f.account_id);
      const category = resolveCategoryField(state, f.category_id);
      const payee = resolvePayee(state, f.payee_id, f.payee_name);
      const scheduled: ScheduledTransaction = {
        id: state.nextId("sched"),
        date_first: f.date,
        date_next: f.date,
        frequency: f.frequency,
        amount: f.amount,
        memo: f.memo ?? null,
        account_id: account.id,
        account_name: account.name,
        payee_id: payee.payee_id,
        payee_name: payee.payee_name,
        category_id: category.category_id,
        category_name: category.category_name,
        deleted: false,
      };
      state.scheduledTransactions.push(scheduled);
      bumpServerKnowledge(state);
      return { scheduled_transaction: scheduled };
    }
  }
  if (rest.length === 2 && rest[0] === "scheduled_transactions") {
    const id = requireSegment(rest, 1);
    if (method === "GET") return { scheduled_transaction: findScheduled(state, id) };
    if (method === "PUT") {
      const parsed = SaveScheduledBody.parse(body);
      const f = parsed.scheduled_transaction;
      const existing = findScheduled(state, id);
      const next: ScheduledTransaction = { ...existing };
      if (f.account_id !== undefined) {
        const account = findAccount(state, f.account_id);
        next.account_id = account.id;
        next.account_name = account.name;
      }
      if (f.date !== undefined) next.date_next = f.date;
      if (f.amount !== undefined) next.amount = f.amount;
      if (f.frequency !== undefined) next.frequency = f.frequency;
      if (f.memo !== undefined) next.memo = f.memo;
      if (f.category_id !== undefined) {
        const resolved = resolveCategoryField(state, f.category_id);
        next.category_id = resolved.category_id;
        next.category_name = resolved.category_name;
      }
      if (f.payee_id !== undefined || f.payee_name !== undefined) {
        const resolved = resolvePayee(state, f.payee_id, f.payee_name);
        next.payee_id = resolved.payee_id;
        next.payee_name = resolved.payee_name;
      }
      const idx = state.scheduledTransactions.findIndex((s) => s.id === id);
      if (idx === -1) throw new DemoApiError(404, `Unknown demo scheduled_transaction_id: ${id}`);
      state.scheduledTransactions[idx] = next;
      bumpServerKnowledge(state);
      return { scheduled_transaction: next };
    }
    if (method === "DELETE") {
      const existing = findScheduled(state, id);
      const idx = state.scheduledTransactions.findIndex((s) => s.id === id);
      if (idx === -1) throw new DemoApiError(404, `Unknown demo scheduled_transaction_id: ${id}`);
      const deleted: ScheduledTransaction = { ...existing, deleted: true };
      state.scheduledTransactions[idx] = deleted;
      bumpServerKnowledge(state);
      return { scheduled_transaction: deleted };
    }
  }

  // --- Months ---
  if (rest.length === 1 && rest[0] === "months" && method === "GET") {
    return { months: monthSummaries(state), server_knowledge: state.serverKnowledge };
  }
  if (rest.length === 2 && rest[0] === "months" && method === "GET") {
    return { month: monthDetail(state, requireMonth(state, requireSegment(rest, 1))) };
  }
  if (rest.length === 3 && rest[0] === "months" && rest[2] === "transactions" && method === "GET") {
    const monthKey = requireMonth(state, requireSegment(rest, 1));
    const txns = filterTransactions(
      state.transactions.filter((t) => t.date.slice(0, 7) === monthKey.slice(0, 7)),
      queryOpts(url),
    );
    return { transactions: txns, server_knowledge: state.serverKnowledge };
  }
  if (rest.length === 4 && rest[0] === "months" && rest[2] === "categories") {
    requireMonth(state, requireSegment(rest, 1));
    const categoryId = requireSegment(rest, 3);
    if (method === "GET") return { category: findCategory(state, categoryId) };
    if (method === "PATCH") {
      const parsed = UpdateCategoryBudgetBody.parse(body);
      const category = findCategory(state, categoryId);
      category.budgeted = parsed.category.budgeted;
      category.balance = category.budgeted + category.activity;
      bumpServerKnowledge(state);
      return { category };
    }
  }
  if (
    rest.length === 3 &&
    rest[0] === "months" &&
    rest[2] === "money_movements" &&
    method === "GET"
  ) {
    requireMonth(state, requireSegment(rest, 1));
    return { money_movements: [], server_knowledge: state.serverKnowledge };
  }
  if (
    rest.length === 3 &&
    rest[0] === "months" &&
    rest[2] === "money_movement_groups" &&
    method === "GET"
  ) {
    requireMonth(state, requireSegment(rest, 1));
    return { money_movement_groups: [], server_knowledge: state.serverKnowledge };
  }

  // --- Money movements (top-level; demo has none) ---
  if (rest.length === 1 && rest[0] === "money_movements" && method === "GET") {
    return { money_movements: [], server_knowledge: state.serverKnowledge };
  }
  if (rest.length === 1 && rest[0] === "money_movement_groups" && method === "GET") {
    return { money_movement_groups: [], server_knowledge: state.serverKnowledge };
  }

  throw new DemoApiError(404, `Unknown demo route: ${method} /budgets/.../${rest.join("/")}`);
}

// ---------------------------------------------------------------------------
// fetch adapter
// ---------------------------------------------------------------------------

function parseJsonBody(text: string): unknown {
  if (text === "") return undefined;
  return JSON.parse(text);
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Build a `fetch` that emulates the YNAB REST API against an in-memory demo
 * budget. Pass a `DemoState` explicitly to share it across calls (e.g. a
 * running server); omit it to get a fresh budget.
 */
export function createDemoFetch(state: DemoState = createDemoState()): FetchFn {
  const fn: FetchFn = (input, init) => {
    const req = new Request(input, init);
    return req
      .text()
      .then((text) => {
        const url = new URL(req.url);
        const body = parseJsonBody(text);
        const payload = route(state, req.method.toUpperCase(), url, body);
        return jsonResponse(200, { data: payload });
      })
      .catch((err: unknown) => {
        if (err instanceof DemoApiError) {
          return jsonResponse(err.status, { error: { detail: err.message } });
        }
        if (err instanceof z.ZodError) {
          return jsonResponse(400, { error: { detail: err.message } });
        }
        throw err instanceof Error ? err : new Error(String(err));
      });
  };
  return fn;
}
