// ============================================================================
// Tool catalog + dispatch.
//
// `TOOLS` is the pure data array of MCP tool definitions (tagged with `group`
// and `write` for toolset gating). `handleTool` parses args, calls the
// injected `YnabClient`, and folds in pure logic (dedupe, summary). It returns
// a string; the server bootstrap wraps errors. No env / no process access here
// so the whole layer is unit-testable with a fake-fetch client.
// ============================================================================

import { z } from "zod";

import type { YnabClient } from "./client.js";
import type { DupTxn } from "./duplicates.js";
import type { SummaryTxn } from "./summary.js";
import type { ToolGroup } from "./toolsets.js";
import type { SaveScheduledTxnFields } from "./transactions.js";

import { findDuplicateTransactions } from "./duplicates.js";
import {
  formatAccount,
  formatCategory,
  formatMonth,
  formatPayee,
  formatScheduledTransaction,
  formatTransaction,
} from "./format.js";
import { summarizeSpending } from "./summary.js";
import { isToolEnabled } from "./toolsets.js";

export interface ToolContext {
  client: YnabClient;
  enabledGroups: Set<ToolGroup>;
  readOnly: boolean;
  defaultBudget: string;
}

export interface ToolDef {
  name: string;
  group: ToolGroup;
  write: boolean;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const BudgetArg = z.object({ budget_id: z.string().optional() }).passthrough();
const AccountRef = BudgetArg.extend({ account_id: z.string() });
const CategoryRef = BudgetArg.extend({ category_id: z.string() });
const TransactionRef = BudgetArg.extend({ transaction_id: z.string() });
const MonthRef = BudgetArg.extend({ month: z.string().default("current") });
const PayeeRef = BudgetArg.extend({ payee_id: z.string() });

const flagColor = z.enum(["red", "orange", "yellow", "green", "blue", "purple"]);
const cleared = z.enum(["cleared", "uncleared", "reconciled"]);

const ListTransactionsInput = BudgetArg.extend({
  account_id: z.string().optional(),
  since_date: z.string().optional(),
  type: z.enum(["uncategorized", "unapproved"]).optional(),
  max_results: z.number().default(50),
});

const UpdateCategoryBudgetInput = BudgetArg.extend({
  month: z.string().default("current"),
  category_id: z.string(),
  budgeted: z.number(),
});

const SaveTxnShape = {
  payee_id: z.string().optional(),
  payee_name: z.string().optional(),
  category_id: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  cleared: cleared.optional(),
  approved: z.boolean().optional(),
  flag_color: flagColor.nullable().optional(),
};

const SubtransactionInput = z.object({
  amount: z.number(),
  payee_id: z.string().optional(),
  payee_name: z.string().optional(),
  category_id: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

const CreateTransactionInput = BudgetArg.extend({
  account_id: z.string(),
  date: z.string(),
  amount: z.number(),
  import_id: z.string().optional(),
  subtransactions: z.array(SubtransactionInput).optional(),
  ...SaveTxnShape,
}).superRefine((val, ctx) => {
  // A split's legs must sum to the parent amount, or YNAB rejects it.
  if (val.subtransactions && val.subtransactions.length > 0) {
    const sum = val.subtransactions.reduce((acc, s) => acc + s.amount, 0);
    if (sum !== val.amount) {
      ctx.addIssue({
        code: "custom",
        message: `Split legs sum to ${sum} but the transaction amount is ${val.amount} — they must match (milliunits).`,
      });
    }
  }
});

const UpdateTransactionInput = TransactionRef.extend({
  date: z.string().optional(),
  amount: z.number().optional(),
  ...SaveTxnShape,
});

const BulkUpdateInput = BudgetArg.extend({
  updates: z
    .array(
      z.object({
        id: z.string(),
        category_id: z.string().nullable().optional(),
        approved: z.boolean().optional(),
        memo: z.string().nullable().optional(),
        cleared: cleared.optional(),
        flag_color: flagColor.nullable().optional(),
      }),
    )
    .min(1),
});

const CreateAccountInput = BudgetArg.extend({
  name: z.string(),
  type: z.enum(["checking", "savings", "cash", "creditCard", "otherAsset", "otherLiability"]),
  balance: z.number().default(0),
});

const FindDuplicatesInput = BudgetArg.extend({
  account_id: z.string().optional(),
  since_date: z.string().optional(),
});

const SpendingSummaryInput = BudgetArg.extend({
  group_by: z.enum(["category", "payee"]).default("category"),
  account_id: z.string().optional(),
  since_date: z.string().optional(),
  until_date: z.string().optional(),
});

const PayeeTxnsInput = PayeeRef.extend({ since_date: z.string().optional() });
const CategoryTxnsInput = CategoryRef.extend({ since_date: z.string().optional() });

const frequency = z.enum([
  "never",
  "daily",
  "weekly",
  "everyOtherWeek",
  "twiceAMonth",
  "every4Weeks",
  "monthly",
  "everyOtherMonth",
  "every3Months",
  "every4Months",
  "twiceAYear",
  "yearly",
  "everyOtherYear",
]);

const ScheduledTxnRef = BudgetArg.extend({ scheduled_transaction_id: z.string() });

const ScheduledOptionalShape = {
  payee_id: z.string().optional(),
  payee_name: z.string().optional(),
  category_id: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  flag_color: flagColor.nullable().optional(),
};

const CreateScheduledTxnInput = BudgetArg.extend({
  account_id: z.string(),
  date: z.string(),
  amount: z.number(),
  frequency,
  ...ScheduledOptionalShape,
});

const UpdateScheduledTxnInput = ScheduledTxnRef.extend({
  date: z.string().optional(),
  amount: z.number().optional(),
  frequency: frequency.optional(),
  ...ScheduledOptionalShape,
});

// ---------------------------------------------------------------------------
// Tool definitions (JSON schemas for the wire)
// ---------------------------------------------------------------------------

const budgetIdProp = {
  budget_id: {
    type: "string",
    description: 'Budget id or alias ("last-used", "default"). Defaults to YNAB_BUDGET_ID.',
  },
} as const;

const txnFieldProps = {
  payee_id: { type: "string" },
  payee_name: { type: "string" },
  category_id: { type: "string", description: "null clears the category (uncategorize)." },
  memo: { type: "string" },
  cleared: { type: "string", enum: ["cleared", "uncleared", "reconciled"] },
  approved: { type: "boolean" },
  flag_color: { type: "string", enum: ["red", "orange", "yellow", "green", "blue", "purple"] },
} as const;

const subtransactionProps = {
  amount: {
    type: "number",
    description: "Milliunits; same sign as the parent (legs sum to amount).",
  },
  category_id: { type: "string" },
  payee_id: { type: "string" },
  payee_name: { type: "string" },
  memo: { type: "string" },
} as const;

export const TOOLS: ToolDef[] = [
  {
    name: "list_budgets",
    group: "budgets",
    write: false,
    description: "List all budgets on the account (id, name, currency, date range).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "budget_settings",
    group: "budgets",
    write: false,
    description: "Currency and date-format settings for a budget.",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "list_accounts",
    group: "accounts",
    write: false,
    description: "List accounts in a budget with balances (milliunits + units).",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "get_account",
    group: "accounts",
    write: false,
    description: "Get one account by id.",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, account_id: { type: "string" } },
      required: ["account_id"],
    },
  },
  {
    name: "create_account",
    group: "accounts",
    write: true,
    description:
      "Create a MANUAL account (name, type, starting balance in milliunits). The API cannot link a bank for direct import — that is YNAB app-only.",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        name: { type: "string" },
        type: {
          type: "string",
          enum: ["checking", "savings", "cash", "creditCard", "otherAsset", "otherLiability"],
        },
        balance: { type: "number", description: "Starting balance in milliunits.", default: 0 },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "list_categories",
    group: "categories",
    write: false,
    description: "List category groups and their categories (budgeted, activity, balance).",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "get_category",
    group: "categories",
    write: false,
    description: "Get one category by id (current month figures).",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, category_id: { type: "string" } },
      required: ["category_id"],
    },
  },
  {
    name: "update_category_budget",
    group: "categories",
    write: true,
    description: "Set the budgeted amount (milliunits) for a category in a given month.",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        month: { type: "string", description: '"YYYY-MM-01" or "current".', default: "current" },
        category_id: { type: "string" },
        budgeted: { type: "number", description: "Budgeted amount in milliunits (1000 = 1 unit)." },
      },
      required: ["category_id", "budgeted"],
    },
  },
  {
    name: "list_transactions",
    group: "transactions",
    write: false,
    description:
      "List transactions. Optionally scope to an account, a since_date, or a type filter (uncategorized/unapproved).",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        account_id: { type: "string" },
        since_date: { type: "string" },
        type: { type: "string", enum: ["uncategorized", "unapproved"] },
        max_results: { type: "number", default: 50 },
      },
    },
  },
  {
    name: "get_transaction",
    group: "transactions",
    write: false,
    description: "Get one transaction by id.",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, transaction_id: { type: "string" } },
      required: ["transaction_id"],
    },
  },
  {
    name: "create_transaction",
    group: "transactions",
    write: true,
    description:
      "Create a transaction. amount is milliunits (negative = outflow). For a SPLIT across categories (e.g. a mixed Walmart/Target/Amazon receipt), set category_id to null and pass subtransactions whose amounts sum to amount; optionally set import_id so it matches the later bank-imported transaction. YNAB supports splits only on create — the leg breakdown of an existing split cannot be edited via the API.",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        account_id: { type: "string" },
        date: { type: "string", description: "ISO date, e.g. 2026-06-08." },
        amount: { type: "number", description: "Milliunits; negative outflow, positive inflow." },
        import_id: {
          type: "string",
          description: "Optional dedupe/match key so a later bank import reconciles to this txn.",
        },
        subtransactions: {
          type: "array",
          description:
            "Split legs. Set the parent category_id to null; leg amounts must sum to amount.",
          items: { type: "object", properties: subtransactionProps, required: ["amount"] },
        },
        ...txnFieldProps,
      },
      required: ["account_id", "date", "amount"],
    },
  },
  {
    name: "update_transaction",
    group: "transactions",
    write: true,
    description: "Update fields on an existing transaction (only provided fields change).",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        transaction_id: { type: "string" },
        date: { type: "string" },
        amount: { type: "number", description: "Milliunits." },
        ...txnFieldProps,
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "bulk_update_transactions",
    group: "transactions",
    write: true,
    description:
      "Update many transactions in ONE call (the efficient way to categorize and/or approve a batch). Each update needs an id.",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        updates: {
          type: "array",
          description: "Per-transaction updates; each item needs `id` plus the fields to change.",
          items: {
            type: "object",
            properties: { id: { type: "string" }, ...txnFieldProps },
            required: ["id"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "delete_transaction",
    group: "transactions",
    write: true,
    description: "Delete a transaction by id (use after confirming a duplicate).",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, transaction_id: { type: "string" } },
      required: ["transaction_id"],
    },
  },
  {
    name: "find_duplicate_transactions",
    group: "transactions",
    write: false,
    description:
      "Find candidate duplicate transactions (same account + amount + date). Returns clusters for review — does NOT delete. Pair with delete_transaction.",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        account_id: { type: "string" },
        since_date: { type: "string" },
      },
    },
  },
  {
    name: "import_transactions",
    group: "transactions",
    write: true,
    description:
      "Trigger direct import on accounts already bank-linked in the YNAB app (pull latest bank activity). Returns newly imported transaction ids. Cannot create the link itself.",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "spending_summary",
    group: "transactions",
    write: false,
    description:
      "Aggregate spending by category or payee over a date range — totals, units, and counts per group. Cheaper than listing every row.",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        group_by: { type: "string", enum: ["category", "payee"], default: "category" },
        account_id: { type: "string" },
        since_date: { type: "string" },
        until_date: { type: "string" },
      },
    },
  },
  {
    name: "payee_transactions",
    group: "transactions",
    write: false,
    description: "Transaction history for one payee (drill-down for spending habits).",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, payee_id: { type: "string" }, since_date: { type: "string" } },
      required: ["payee_id"],
    },
  },
  {
    name: "category_transactions",
    group: "transactions",
    write: false,
    description: "Transaction history for one category (drill-down for spending habits).",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        category_id: { type: "string" },
        since_date: { type: "string" },
      },
      required: ["category_id"],
    },
  },
  {
    name: "list_months",
    group: "months",
    write: false,
    description: "List budget months with income/budgeted/activity/to-be-budgeted summaries.",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "get_month",
    group: "months",
    write: false,
    description: 'Get one budget month (default "current") with its category breakdown.',
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        month: { type: "string", description: '"YYYY-MM-01" or "current".', default: "current" },
      },
    },
  },
  {
    name: "list_payees",
    group: "payees",
    write: false,
    description: "List payees in a budget.",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "list_scheduled_transactions",
    group: "scheduled",
    write: false,
    description: "List scheduled (recurring/upcoming) transactions with next date and frequency.",
    inputSchema: { type: "object", properties: { ...budgetIdProp } },
  },
  {
    name: "get_scheduled_transaction",
    group: "scheduled",
    write: false,
    description: "Get a single scheduled transaction by id.",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, scheduled_transaction_id: { type: "string" } },
      required: ["scheduled_transaction_id"],
    },
  },
  {
    name: "create_scheduled_transaction",
    group: "scheduled",
    write: true,
    description:
      "Create a scheduled (recurring) transaction. amount is milliunits (negative = outflow).",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        account_id: { type: "string" },
        date: { type: "string", description: "ISO date of the first occurrence." },
        amount: { type: "number", description: "Milliunits; negative outflow, positive inflow." },
        frequency: {
          type: "string",
          enum: [
            "never",
            "daily",
            "weekly",
            "everyOtherWeek",
            "twiceAMonth",
            "every4Weeks",
            "monthly",
            "everyOtherMonth",
            "every3Months",
            "every4Months",
            "twiceAYear",
            "yearly",
            "everyOtherYear",
          ],
        },
        payee_id: { type: "string" },
        payee_name: { type: "string" },
        category_id: { type: "string" },
        memo: { type: "string" },
        flag_color: {
          type: "string",
          enum: ["red", "orange", "yellow", "green", "blue", "purple"],
        },
      },
      required: ["account_id", "date", "amount", "frequency"],
    },
  },
  {
    name: "update_scheduled_transaction",
    group: "scheduled",
    write: true,
    description:
      "Update fields on an existing scheduled transaction (only provided fields change).",
    inputSchema: {
      type: "object",
      properties: {
        ...budgetIdProp,
        scheduled_transaction_id: { type: "string" },
        date: { type: "string" },
        amount: { type: "number", description: "Milliunits." },
        frequency: {
          type: "string",
          enum: [
            "never",
            "daily",
            "weekly",
            "everyOtherWeek",
            "twiceAMonth",
            "every4Weeks",
            "monthly",
            "everyOtherMonth",
            "every3Months",
            "every4Months",
            "twiceAYear",
            "yearly",
            "everyOtherYear",
          ],
        },
        payee_id: { type: "string" },
        payee_name: { type: "string" },
        category_id: { type: "string" },
        memo: { type: "string" },
        flag_color: {
          type: "string",
          enum: ["red", "orange", "yellow", "green", "blue", "purple"],
        },
      },
      required: ["scheduled_transaction_id"],
    },
  },
  {
    name: "delete_scheduled_transaction",
    group: "scheduled",
    write: true,
    description: "Delete a scheduled transaction by id.",
    inputSchema: {
      type: "object",
      properties: { ...budgetIdProp, scheduled_transaction_id: { type: "string" } },
      required: ["scheduled_transaction_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function enabledToolNames(ctx: ToolContext): Set<string> {
  return new Set(
    TOOLS.filter((t) => isToolEnabled(ctx.enabledGroups, ctx.readOnly, t.group, t.write)).map(
      (t) => t.name,
    ),
  );
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function handleTool(
  ctx: ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<string> {
  if (!enabledToolNames(ctx).has(name)) {
    throw new Error(
      `Tool "${name}" is not enabled. Adjust YNAB_TOOLSETS / YNAB_READ_ONLY to enable it.`,
    );
  }
  const { client } = ctx;
  const budget = (args: { budget_id?: string }) =>
    (args.budget_id ?? "").trim() || ctx.defaultBudget;

  switch (name) {
    case "list_budgets": {
      const budgets = await client.listBudgets();
      return json(
        budgets.map((b) => ({
          id: b.id,
          name: b.name,
          currency: b.currency_format?.iso_code ?? "",
          first_month: b.first_month,
          last_month: b.last_month,
        })),
      );
    }
    case "budget_settings": {
      const args = BudgetArg.parse(rawArgs);
      return json(await client.getBudgetSettings(budget(args)));
    }
    case "list_accounts": {
      const args = BudgetArg.parse(rawArgs);
      const accounts = await client.listAccounts(budget(args));
      return json(accounts.filter((a) => !a.deleted).map(formatAccount));
    }
    case "get_account": {
      const args = AccountRef.parse(rawArgs);
      return json(formatAccount(await client.getAccount(budget(args), args.account_id)));
    }
    case "create_account": {
      const args = CreateAccountInput.parse(rawArgs);
      const account = await client.createAccount(budget(args), {
        name: args.name,
        type: args.type,
        balance: args.balance,
      });
      return json(formatAccount(account));
    }
    case "list_categories": {
      const args = BudgetArg.parse(rawArgs);
      const groups = await client.listCategories(budget(args));
      return json(
        groups
          .filter((g) => !g.deleted && !g.hidden)
          .map((g) => ({
            group: g.name,
            categories: g.categories.filter((c) => !c.deleted && !c.hidden).map(formatCategory),
          })),
      );
    }
    case "get_category": {
      const args = CategoryRef.parse(rawArgs);
      return json(formatCategory(await client.getCategory(budget(args), args.category_id)));
    }
    case "update_category_budget": {
      const args = UpdateCategoryBudgetInput.parse(rawArgs);
      const category = await client.updateCategoryBudget(
        budget(args),
        args.month,
        args.category_id,
        args.budgeted,
      );
      return json(formatCategory(category));
    }
    case "list_transactions": {
      const args = ListTransactionsInput.parse(rawArgs);
      const txns = await client.listTransactions(budget(args), {
        ...(args.account_id !== undefined && { account_id: args.account_id }),
        ...(args.since_date !== undefined && { since_date: args.since_date }),
        ...(args.type !== undefined && { type: args.type }),
      });
      const out = txns
        .filter((t) => !t.deleted)
        .slice(-args.max_results)
        .map(formatTransaction);
      return out.length > 0 ? json(out) : "No transactions found.";
    }
    case "get_transaction": {
      const args = TransactionRef.parse(rawArgs);
      return json(
        formatTransaction(await client.getTransaction(budget(args), args.transaction_id)),
      );
    }
    case "create_transaction": {
      const args = CreateTransactionInput.parse(rawArgs);
      const { budget_id: _b, ...fields } = args;
      return json(formatTransaction(await client.createTransaction(budget(args), fields)));
    }
    case "update_transaction": {
      const args = UpdateTransactionInput.parse(rawArgs);
      const { budget_id: _b, transaction_id, ...fields } = args;
      return json(
        formatTransaction(await client.updateTransaction(budget(args), transaction_id, fields)),
      );
    }
    case "bulk_update_transactions": {
      const args = BulkUpdateInput.parse(rawArgs);
      const result = await client.bulkUpdateTransactions(budget(args), args.updates);
      return json({
        updated: result.transaction_ids.length,
        transaction_ids: result.transaction_ids,
        transactions: result.transactions.map(formatTransaction),
      });
    }
    case "delete_transaction": {
      const args = TransactionRef.parse(rawArgs);
      const deleted = await client.deleteTransaction(budget(args), args.transaction_id);
      return json({ deleted: true, transaction: formatTransaction(deleted) });
    }
    case "find_duplicate_transactions": {
      const args = FindDuplicatesInput.parse(rawArgs);
      const txns = await client.listTransactions(budget(args), {
        ...(args.account_id !== undefined && { account_id: args.account_id }),
        ...(args.since_date !== undefined && { since_date: args.since_date }),
      });
      const candidates: DupTxn[] = txns
        .filter((t) => !t.deleted)
        .map((t) => ({
          id: t.id,
          account_id: t.account_id,
          amount: t.amount,
          date: t.date,
          import_id: t.import_id,
          payee_name: t.payee_name,
        }));
      const clusters = findDuplicateTransactions(candidates);
      return clusters.length > 0 ? json(clusters) : "No duplicate transactions found.";
    }
    case "import_transactions": {
      const args = BudgetArg.parse(rawArgs);
      const ids = await client.importTransactions(budget(args));
      return json({ imported: ids.length, transaction_ids: ids });
    }
    case "spending_summary": {
      const args = SpendingSummaryInput.parse(rawArgs);
      const txns = await client.listTransactions(budget(args), {
        ...(args.account_id !== undefined && { account_id: args.account_id }),
        ...(args.since_date !== undefined && { since_date: args.since_date }),
        ...(args.until_date !== undefined && { until_date: args.until_date }),
      });
      const summaryTxns: SummaryTxn[] = txns
        .filter((t) => !t.deleted)
        .map((t) => ({
          amount: t.amount,
          category_name: t.category_name,
          payee_name: t.payee_name,
        }));
      return json(summarizeSpending(summaryTxns, args.group_by));
    }
    case "payee_transactions": {
      const args = PayeeTxnsInput.parse(rawArgs);
      const txns = await client.listPayeeTransactions(budget(args), args.payee_id, {
        ...(args.since_date !== undefined && { since_date: args.since_date }),
      });
      return json(txns.filter((t) => !t.deleted).map(formatTransaction));
    }
    case "category_transactions": {
      const args = CategoryTxnsInput.parse(rawArgs);
      const txns = await client.listCategoryTransactions(budget(args), args.category_id, {
        ...(args.since_date !== undefined && { since_date: args.since_date }),
      });
      return json(txns.filter((t) => !t.deleted).map(formatTransaction));
    }
    case "list_months": {
      const args = BudgetArg.parse(rawArgs);
      const months = await client.listMonths(budget(args));
      return json(months.filter((m) => !m.deleted).map(formatMonth));
    }
    case "get_month": {
      const args = MonthRef.parse(rawArgs);
      const m = await client.getMonth(budget(args), args.month);
      return json({
        ...formatMonth(m),
        categories: m.categories.filter((c) => !c.deleted && !c.hidden).map(formatCategory),
      });
    }
    case "list_payees": {
      const args = BudgetArg.parse(rawArgs);
      const payees = await client.listPayees(budget(args));
      return json(payees.filter((p) => !p.deleted).map(formatPayee));
    }
    case "list_scheduled_transactions": {
      const args = BudgetArg.parse(rawArgs);
      const scheduled = await client.listScheduledTransactions(budget(args));
      return json(scheduled.filter((s) => !s.deleted).map(formatScheduledTransaction));
    }
    case "get_scheduled_transaction": {
      const args = ScheduledTxnRef.parse(rawArgs);
      const s = await client.getScheduledTransaction(budget(args), args.scheduled_transaction_id);
      return json(formatScheduledTransaction(s));
    }
    case "create_scheduled_transaction": {
      const args = CreateScheduledTxnInput.parse(rawArgs);
      const fields: SaveScheduledTxnFields = {
        account_id: args.account_id,
        date: args.date,
        amount: args.amount,
        frequency: args.frequency,
        payee_id: args.payee_id,
        payee_name: args.payee_name,
        category_id: args.category_id,
        memo: args.memo,
        flag_color: args.flag_color,
      };
      const s = await client.createScheduledTransaction(budget(args), fields);
      return json(formatScheduledTransaction(s));
    }
    case "update_scheduled_transaction": {
      const args = UpdateScheduledTxnInput.parse(rawArgs);
      const fields: SaveScheduledTxnFields = {
        date: args.date,
        amount: args.amount,
        frequency: args.frequency,
        payee_id: args.payee_id,
        payee_name: args.payee_name,
        category_id: args.category_id,
        memo: args.memo,
        flag_color: args.flag_color,
      };
      const s = await client.updateScheduledTransaction(
        budget(args),
        args.scheduled_transaction_id,
        fields,
      );
      return json(formatScheduledTransaction(s));
    }
    case "delete_scheduled_transaction": {
      const args = ScheduledTxnRef.parse(rawArgs);
      const s = await client.deleteScheduledTransaction(
        budget(args),
        args.scheduled_transaction_id,
      );
      return json(formatScheduledTransaction(s));
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
