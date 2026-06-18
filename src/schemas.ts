// ============================================================================
// Zod schemas — the contract for YNAB's API responses.
//
// YNAB wraps every response in `{ data: ... }`; `dataEnvelope` unwraps it.
// Resilience is deliberate: every object uses `.passthrough()` (extra API
// fields don't break parsing) and fields use `.catch(...)` liberally.
//
// Monetary amounts are in **milliunits** (1000 = one currency unit).
// ============================================================================

import { z } from "zod";

export function dataEnvelope<T extends z.ZodTypeAny>(inner: T) {
  return z.object({ data: inner }).passthrough();
}

// --- Budget ---

export const BudgetSummarySchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    last_modified_on: z.string().nullable().catch(null),
    first_month: z.string().nullable().catch(null),
    last_month: z.string().nullable().catch(null),
    currency_format: z
      .object({ iso_code: z.string().catch(""), decimal_digits: z.number().catch(2) })
      .passthrough()
      .nullable()
      .catch(null),
  })
  .passthrough();

export const BudgetsResponseSchema = dataEnvelope(
  z
    .object({
      budgets: z.array(BudgetSummarySchema).catch([]),
      default_budget: BudgetSummarySchema.nullable().catch(null),
    })
    .passthrough(),
);

export const BudgetSettingsSchema = z
  .object({
    date_format: z
      .object({ format: z.string().catch("") })
      .passthrough()
      .nullable()
      .catch(null),
    currency_format: z
      .object({
        iso_code: z.string().catch(""),
        decimal_digits: z.number().catch(2),
        currency_symbol: z.string().catch(""),
      })
      .passthrough()
      .nullable()
      .catch(null),
  })
  .passthrough();

export const BudgetSettingsResponseSchema = dataEnvelope(
  z.object({ settings: BudgetSettingsSchema }).passthrough(),
);

// --- Account ---

export const AccountSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    type: z.string().catch(""),
    on_budget: z.boolean().catch(true),
    closed: z.boolean().catch(false),
    balance: z.number().catch(0),
    cleared_balance: z.number().catch(0),
    uncleared_balance: z.number().catch(0),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const AccountsResponseSchema = dataEnvelope(
  z.object({ accounts: z.array(AccountSchema).catch([]) }).passthrough(),
);

export const AccountResponseSchema = dataEnvelope(
  z.object({ account: AccountSchema }).passthrough(),
);

// --- Category ---

export const CategorySchema = z
  .object({
    id: z.string(),
    category_group_id: z.string().catch(""),
    category_group_name: z.string().optional().catch(undefined),
    name: z.string().catch(""),
    hidden: z.boolean().catch(false),
    budgeted: z.number().catch(0),
    activity: z.number().catch(0),
    balance: z.number().catch(0),
    goal_type: z.string().nullable().catch(null),
    goal_target: z.number().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const CategoryGroupSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    hidden: z.boolean().catch(false),
    deleted: z.boolean().catch(false),
    categories: z.array(CategorySchema).catch([]),
  })
  .passthrough();

export const CategoriesResponseSchema = dataEnvelope(
  z.object({ category_groups: z.array(CategoryGroupSchema).catch([]) }).passthrough(),
);

export const CategoryResponseSchema = dataEnvelope(
  z.object({ category: CategorySchema }).passthrough(),
);

export const CategoryGroupResponseSchema = dataEnvelope(
  z.object({ category_group: CategoryGroupSchema }).passthrough(),
);

// --- Transaction ---

export const SubTransactionSchema = z
  .object({
    id: z.string().catch(""),
    amount: z.number().catch(0),
    memo: z.string().nullable().catch(null),
    payee_id: z.string().nullable().catch(null),
    payee_name: z.string().nullable().catch(null),
    category_id: z.string().nullable().catch(null),
    category_name: z.string().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const TransactionSchema = z
  .object({
    id: z.string(),
    date: z.string().catch(""),
    amount: z.number().catch(0),
    memo: z.string().nullable().catch(null),
    cleared: z.string().catch(""),
    approved: z.boolean().catch(false),
    flag_color: z.string().nullable().catch(null),
    account_id: z.string().catch(""),
    account_name: z.string().optional().catch(undefined),
    payee_id: z.string().nullable().catch(null),
    payee_name: z.string().nullable().catch(null),
    category_id: z.string().nullable().catch(null),
    category_name: z.string().nullable().catch(null),
    import_id: z.string().nullable().catch(null),
    transfer_account_id: z.string().nullable().catch(null),
    subtransactions: z.array(SubTransactionSchema).catch([]),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const TransactionsResponseSchema = dataEnvelope(
  z.object({ transactions: z.array(TransactionSchema).catch([]) }).passthrough(),
);

export const TransactionResponseSchema = dataEnvelope(
  z.object({ transaction: TransactionSchema }).passthrough(),
);

// Bulk PATCH /transactions returns ids + the updated transactions.
export const BulkTransactionsResponseSchema = dataEnvelope(
  z
    .object({
      transaction_ids: z.array(z.string()).catch([]),
      transactions: z.array(TransactionSchema).catch([]),
      duplicate_import_ids: z.array(z.string()).catch([]),
    })
    .passthrough(),
);

// POST /transactions/import returns the ids it imported.
export const ImportResponseSchema = dataEnvelope(
  z.object({ transaction_ids: z.array(z.string()).catch([]) }).passthrough(),
);

// --- Scheduled transaction ---

export const ScheduledTransactionSchema = z
  .object({
    id: z.string(),
    date_first: z.string().catch(""),
    date_next: z.string().catch(""),
    frequency: z.string().catch(""),
    amount: z.number().catch(0),
    memo: z.string().nullable().catch(null),
    account_id: z.string().catch(""),
    account_name: z.string().optional().catch(undefined),
    payee_id: z.string().nullable().catch(null),
    payee_name: z.string().nullable().catch(null),
    category_id: z.string().nullable().catch(null),
    category_name: z.string().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const ScheduledTransactionsResponseSchema = dataEnvelope(
  z.object({ scheduled_transactions: z.array(ScheduledTransactionSchema).catch([]) }).passthrough(),
);

export const ScheduledTransactionResponseSchema = dataEnvelope(
  z.object({ scheduled_transaction: ScheduledTransactionSchema }).passthrough(),
);

// --- Month ---

export const MonthSummarySchema = z
  .object({
    month: z.string().catch(""),
    note: z.string().nullable().catch(null),
    income: z.number().catch(0),
    budgeted: z.number().catch(0),
    activity: z.number().catch(0),
    to_be_budgeted: z.number().catch(0),
    age_of_money: z.number().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const MonthDetailSchema = MonthSummarySchema.extend({
  categories: z.array(CategorySchema).catch([]),
}).passthrough();

export const MonthsResponseSchema = dataEnvelope(
  z.object({ months: z.array(MonthSummarySchema).catch([]) }).passthrough(),
);

export const MonthResponseSchema = dataEnvelope(
  z.object({ month: MonthDetailSchema }).passthrough(),
);

// --- Payee ---

export const PayeeSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    transfer_account_id: z.string().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const PayeesResponseSchema = dataEnvelope(
  z.object({ payees: z.array(PayeeSchema).catch([]) }).passthrough(),
);

export const PayeeResponseSchema = dataEnvelope(z.object({ payee: PayeeSchema }).passthrough());

export const PayeeLocationSchema = z
  .object({
    id: z.string(),
    payee_id: z.string().catch(""),
    latitude: z.string().nullable().catch(null),
    longitude: z.string().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

export const PayeeLocationsResponseSchema = dataEnvelope(
  z.object({ payee_locations: z.array(PayeeLocationSchema).catch([]) }).passthrough(),
);

export const PayeeLocationResponseSchema = dataEnvelope(
  z.object({ payee_location: PayeeLocationSchema }).passthrough(),
);

// --- User ---

export const UserResponseSchema = dataEnvelope(
  z.object({ user: z.object({ id: z.string() }).passthrough() }).passthrough(),
);

// ============================================================================
// Inferred types — never hand-written
// ============================================================================

export type Account = z.infer<typeof AccountSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type ScheduledTransaction = z.infer<typeof ScheduledTransactionSchema>;
export type MonthSummary = z.infer<typeof MonthSummarySchema>;
export type Payee = z.infer<typeof PayeeSchema>;
export type PayeeLocation = z.infer<typeof PayeeLocationSchema>;
export type CategoryGroup = z.infer<typeof CategoryGroupSchema>;
