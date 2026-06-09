#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============================================================================
// Config
// ============================================================================

const TOKEN = process.env["YNAB_TOKEN"] ?? "";
// Budget can be a real UUID or one of YNAB's aliases ("last-used", "default").
const DEFAULT_BUDGET = (process.env["YNAB_BUDGET_ID"] ?? "last-used").trim() || "last-used";
const BASE = "https://api.ynab.com/v1";

if (!TOKEN) {
  console.error(
    "Set YNAB_TOKEN to a YNAB Personal Access Token (Account Settings > Developer Settings).",
  );
  process.exit(1);
}

const AUTH_HEADER = `Bearer ${TOKEN}`;

// ============================================================================
// Toolset gating — operators choose which tool groups load, to keep the
// model's context window lean. Two orthogonal axes:
//   YNAB_TOOLSETS   — comma-separated group names, or "all" (default)
//   YNAB_READ_ONLY  — "true"/"1"/"yes" exposes only non-mutating tools
// ============================================================================

type ToolGroup = "budgets" | "accounts" | "categories" | "transactions" | "months" | "payees";

const ALL_GROUPS: ToolGroup[] = [
  "budgets",
  "accounts",
  "categories",
  "transactions",
  "months",
  "payees",
];

function isToolGroup(s: string): s is ToolGroup {
  return ALL_GROUPS.filter((g) => g === s).length > 0;
}

const ENABLED_GROUPS: Set<ToolGroup> = (() => {
  const raw = (process.env["YNAB_TOOLSETS"] ?? "all").trim().toLowerCase();
  if (raw === "" || raw === "all") {
    return new Set<ToolGroup>(ALL_GROUPS);
  }
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const t of tokens) {
    if (!isToolGroup(t)) {
      console.error(`[ynab-mcp] Unknown toolset "${t}" ignored (valid: ${ALL_GROUPS.join(", ")}).`);
    }
  }
  const enabled = new Set<ToolGroup>(tokens.filter(isToolGroup));
  if (enabled.size === 0) {
    console.error(
      "[ynab-mcp] No valid toolsets configured — all tools are disabled. Check YNAB_TOOLSETS.",
    );
  }
  return enabled;
})();

const READ_ONLY = ["1", "true", "yes"].includes(
  (process.env["YNAB_READ_ONLY"] ?? "").trim().toLowerCase(),
);

function isToolEnabled(group: ToolGroup, write: boolean): boolean {
  return ENABLED_GROUPS.has(group) && (!READ_ONLY || !write);
}

// ============================================================================
// Zod schemas — the contract for YNAB's API responses.
//
// Resilience is deliberate: every object uses `.passthrough()` (extra API
// fields don't break parsing) and fields use `.catch(...)` liberally. YNAB
// wraps every response in `{ data: ... }`; `dataEnvelope` unwraps it.
//
// Monetary amounts are in **milliunits** (1000 = one currency unit).
// ============================================================================

function dataEnvelope<T extends z.ZodTypeAny>(inner: T) {
  return z.object({ data: inner }).passthrough();
}

// --- Budget ---

const BudgetSummarySchema = z
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

const BudgetsResponseSchema = dataEnvelope(
  z
    .object({
      budgets: z.array(BudgetSummarySchema).catch([]),
      default_budget: BudgetSummarySchema.nullable().catch(null),
    })
    .passthrough(),
);

const BudgetSettingsSchema = z
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

const BudgetSettingsResponseSchema = dataEnvelope(
  z.object({ settings: BudgetSettingsSchema }).passthrough(),
);

// --- Account ---

const AccountSchema = z
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

const AccountsResponseSchema = dataEnvelope(
  z.object({ accounts: z.array(AccountSchema).catch([]) }).passthrough(),
);

const AccountResponseSchema = dataEnvelope(z.object({ account: AccountSchema }).passthrough());

// --- Category ---

const CategorySchema = z
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

const CategoryGroupSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    hidden: z.boolean().catch(false),
    deleted: z.boolean().catch(false),
    categories: z.array(CategorySchema).catch([]),
  })
  .passthrough();

const CategoriesResponseSchema = dataEnvelope(
  z.object({ category_groups: z.array(CategoryGroupSchema).catch([]) }).passthrough(),
);

const CategoryResponseSchema = dataEnvelope(z.object({ category: CategorySchema }).passthrough());

// --- Transaction ---

const TransactionSchema = z
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
    transfer_account_id: z.string().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

const TransactionsResponseSchema = dataEnvelope(
  z.object({ transactions: z.array(TransactionSchema).catch([]) }).passthrough(),
);

const TransactionResponseSchema = dataEnvelope(
  z.object({ transaction: TransactionSchema }).passthrough(),
);

// --- Month ---

const MonthSummarySchema = z
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

const MonthDetailSchema = MonthSummarySchema.extend({
  categories: z.array(CategorySchema).catch([]),
}).passthrough();

const MonthsResponseSchema = dataEnvelope(
  z.object({ months: z.array(MonthSummarySchema).catch([]) }).passthrough(),
);

const MonthResponseSchema = dataEnvelope(z.object({ month: MonthDetailSchema }).passthrough());

// --- Payee ---

const PayeeSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    transfer_account_id: z.string().nullable().catch(null),
    deleted: z.boolean().catch(false),
  })
  .passthrough();

const PayeesResponseSchema = dataEnvelope(
  z.object({ payees: z.array(PayeeSchema).catch([]) }).passthrough(),
);

// ============================================================================
// Inferred types — never hand-written
// ============================================================================

type Account = z.infer<typeof AccountSchema>;
type Category = z.infer<typeof CategorySchema>;
type Transaction = z.infer<typeof TransactionSchema>;
type MonthSummary = z.infer<typeof MonthSummarySchema>;
type Payee = z.infer<typeof PayeeSchema>;

// ============================================================================
// HTTP helpers — `rawFetch` is the single fetch chokepoint (throws on non-2xx
// with a sliced error body). Typed wrappers validate at the boundary.
// ============================================================================

async function rawFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: AUTH_HEADER };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${method} ${path}: ${r.status} ${r.statusText} — ${text.slice(0, 300)}`);
  }
  return r;
}

async function getTyped<T>(schema: z.ZodType<T>, path: string): Promise<T> {
  const r = await rawFetch("GET", path);
  const json: unknown = await r.json();
  return schema.parse(json);
}

async function sendTyped<T>(
  method: "POST" | "PUT" | "PATCH",
  schema: z.ZodType<T>,
  path: string,
  body: unknown,
): Promise<T> {
  const r = await rawFetch(method, path, body);
  const json: unknown = await r.json();
  return schema.parse(json);
}

// ============================================================================
// Formatters — token-efficient, fully typed output shapes. Amounts stay in
// milliunits but each gets a human-readable `*_units` sibling (÷1000).
// ============================================================================

function units(milli: number): number {
  return Math.round(milli) / 1000;
}

function resolveBudget(arg: string | undefined): string {
  return (arg ?? "").trim() || DEFAULT_BUDGET;
}

function formatAccount(a: Account) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    on_budget: a.on_budget,
    closed: a.closed,
    balance: a.balance,
    balance_units: units(a.balance),
    cleared_balance_units: units(a.cleared_balance),
    uncleared_balance_units: units(a.uncleared_balance),
  };
}

function formatCategory(c: Category) {
  return {
    id: c.id,
    name: c.name,
    group: c.category_group_name ?? c.category_group_id,
    hidden: c.hidden,
    budgeted: c.budgeted,
    budgeted_units: units(c.budgeted),
    activity_units: units(c.activity),
    balance_units: units(c.balance),
    goal_type: c.goal_type,
  };
}

function formatTransaction(t: Transaction) {
  return {
    id: t.id,
    date: t.date,
    amount: t.amount,
    amount_units: units(t.amount),
    payee: t.payee_name,
    category: t.category_name,
    account: t.account_name ?? t.account_id,
    memo: t.memo,
    cleared: t.cleared,
    approved: t.approved,
    flag_color: t.flag_color,
  };
}

function formatMonth(m: MonthSummary) {
  return {
    month: m.month,
    income_units: units(m.income),
    budgeted_units: units(m.budgeted),
    activity_units: units(m.activity),
    to_be_budgeted_units: units(m.to_be_budgeted),
    age_of_money: m.age_of_money,
    note: m.note,
  };
}

function formatPayee(p: Payee) {
  return { id: p.id, name: p.name, is_transfer: p.transfer_account_id !== null };
}

// ============================================================================
// Tool input schemas — validated at handler entry
// ============================================================================

const NoArgs = z.object({}).passthrough();

const BudgetArg = z.object({ budget_id: z.string().optional() }).passthrough();

const AccountRef = BudgetArg.extend({ account_id: z.string() });

const CategoryRef = BudgetArg.extend({ category_id: z.string() });

const ListTransactionsInput = BudgetArg.extend({
  account_id: z.string().optional(),
  since_date: z.string().optional(),
  type: z.enum(["uncategorized", "unapproved"]).optional(),
  max_results: z.number().default(50),
});

const TransactionRef = BudgetArg.extend({ transaction_id: z.string() });

const MonthRef = BudgetArg.extend({ month: z.string().default("current") });

const UpdateCategoryBudgetInput = BudgetArg.extend({
  month: z.string().default("current"),
  category_id: z.string(),
  budgeted: z.number().describe("Budgeted amount in milliunits (1000 = one currency unit)"),
});

const CreateTransactionInput = BudgetArg.extend({
  account_id: z.string(),
  date: z.string().describe("ISO date, e.g. 2026-06-08"),
  amount: z.number().describe("Milliunits; negative for outflow, positive for inflow"),
  payee_id: z.string().optional(),
  payee_name: z.string().optional(),
  category_id: z.string().optional(),
  memo: z.string().optional(),
  cleared: z.enum(["cleared", "uncleared", "reconciled"]).optional(),
  approved: z.boolean().optional(),
  flag_color: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).optional(),
});

const UpdateTransactionInput = TransactionRef.extend({
  date: z.string().optional(),
  amount: z.number().optional(),
  payee_id: z.string().optional(),
  payee_name: z.string().optional(),
  category_id: z.string().optional(),
  memo: z.string().optional(),
  cleared: z.enum(["cleared", "uncleared", "reconciled"]).optional(),
  approved: z.boolean().optional(),
  flag_color: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).optional(),
});

// ============================================================================
// TOOLS — MCP tool definitions. Each entry is tagged with `group` (toolset)
// and `write` (mutating?) so ListTools can filter by YNAB_TOOLSETS /
// YNAB_READ_ONLY. `budget_id` is optional everywhere (defaults to
// YNAB_BUDGET_ID, itself defaulting to the "last-used" alias).
// ============================================================================

const budgetIdProp = {
  budget_id: {
    type: "string",
    description: 'Budget id or alias ("last-used", "default"). Defaults to YNAB_BUDGET_ID.',
  },
} as const;

const TOOLS = [
  {
    name: "list_budgets",
    group: "budgets",
    write: false,
    description: "List all budgets on the account (id, name, currency, date range).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "budget_settings",
    group: "budgets",
    write: false,
    description: "Currency and date-format settings for a budget.",
    inputSchema: { type: "object" as const, properties: { ...budgetIdProp } },
  },
  {
    name: "list_accounts",
    group: "accounts",
    write: false,
    description: "List accounts in a budget with balances (milliunits + units).",
    inputSchema: { type: "object" as const, properties: { ...budgetIdProp } },
  },
  {
    name: "get_account",
    group: "accounts",
    write: false,
    description: "Get one account by id.",
    inputSchema: {
      type: "object" as const,
      properties: { ...budgetIdProp, account_id: { type: "string" } },
      required: ["account_id"],
    },
  },
  {
    name: "list_categories",
    group: "categories",
    write: false,
    description: "List category groups and their categories (budgeted, activity, balance).",
    inputSchema: { type: "object" as const, properties: { ...budgetIdProp } },
  },
  {
    name: "get_category",
    group: "categories",
    write: false,
    description: "Get one category by id (current month figures).",
    inputSchema: {
      type: "object" as const,
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
      type: "object" as const,
      properties: {
        ...budgetIdProp,
        month: {
          type: "string",
          description: 'Budget month "YYYY-MM-01" or "current".',
          default: "current",
        },
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
      "List transactions in a budget. Optionally scope to an account, a since_date, or a type filter (uncategorized/unapproved).",
    inputSchema: {
      type: "object" as const,
      properties: {
        ...budgetIdProp,
        account_id: { type: "string", description: "Limit to one account (optional)." },
        since_date: { type: "string", description: "Only on/after this ISO date (optional)." },
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
      type: "object" as const,
      properties: { ...budgetIdProp, transaction_id: { type: "string" } },
      required: ["transaction_id"],
    },
  },
  {
    name: "create_transaction",
    group: "transactions",
    write: true,
    description:
      "Create a transaction. amount is milliunits (negative = outflow). Provide payee_id or payee_name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ...budgetIdProp,
        account_id: { type: "string" },
        date: { type: "string", description: "ISO date, e.g. 2026-06-08." },
        amount: { type: "number", description: "Milliunits; negative outflow, positive inflow." },
        payee_id: { type: "string" },
        payee_name: { type: "string" },
        category_id: { type: "string" },
        memo: { type: "string" },
        cleared: { type: "string", enum: ["cleared", "uncleared", "reconciled"] },
        approved: { type: "boolean" },
        flag_color: {
          type: "string",
          enum: ["red", "orange", "yellow", "green", "blue", "purple"],
        },
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
      type: "object" as const,
      properties: {
        ...budgetIdProp,
        transaction_id: { type: "string" },
        date: { type: "string" },
        amount: { type: "number", description: "Milliunits." },
        payee_id: { type: "string" },
        payee_name: { type: "string" },
        category_id: { type: "string" },
        memo: { type: "string" },
        cleared: { type: "string", enum: ["cleared", "uncleared", "reconciled"] },
        approved: { type: "boolean" },
        flag_color: {
          type: "string",
          enum: ["red", "orange", "yellow", "green", "blue", "purple"],
        },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "list_months",
    group: "months",
    write: false,
    description: "List budget months with income/budgeted/activity/to-be-budgeted summaries.",
    inputSchema: { type: "object" as const, properties: { ...budgetIdProp } },
  },
  {
    name: "get_month",
    group: "months",
    write: false,
    description: 'Get one budget month (default "current") with its category breakdown.',
    inputSchema: {
      type: "object" as const,
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
    inputSchema: { type: "object" as const, properties: { ...budgetIdProp } },
  },
] satisfies ReadonlyArray<{
  name: string;
  group: ToolGroup;
  write: boolean;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}>;

// Tool names exposed under the current YNAB_TOOLSETS / YNAB_READ_ONLY config.
const ENABLED_TOOL_NAMES = new Set<string>(
  TOOLS.filter((t) => isToolEnabled(t.group, t.write)).map((t) => t.name),
);

// ============================================================================
// Tool handlers
// ============================================================================

/** Build a transaction request body from optional fields (omitting undefined). */
function transactionBody(args: z.infer<typeof UpdateTransactionInput>): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  if (args.date !== undefined) t["date"] = args.date;
  if (args.amount !== undefined) t["amount"] = args.amount;
  if (args.payee_id !== undefined) t["payee_id"] = args.payee_id;
  if (args.payee_name !== undefined) t["payee_name"] = args.payee_name;
  if (args.category_id !== undefined) t["category_id"] = args.category_id;
  if (args.memo !== undefined) t["memo"] = args.memo;
  if (args.cleared !== undefined) t["cleared"] = args.cleared;
  if (args.approved !== undefined) t["approved"] = args.approved;
  if (args.flag_color !== undefined) t["flag_color"] = args.flag_color;
  return t;
}

async function handleTool(name: string, rawArgs: unknown): Promise<string> {
  if (!ENABLED_TOOL_NAMES.has(name)) {
    throw new Error(
      `Tool "${name}" is not enabled. Adjust YNAB_TOOLSETS / YNAB_READ_ONLY to enable it.`,
    );
  }

  switch (name) {
    case "list_budgets": {
      NoArgs.parse(rawArgs);
      const data = await getTyped(BudgetsResponseSchema, "/budgets");
      const budgets = data.data.budgets.map((b) => ({
        id: b.id,
        name: b.name,
        currency: b.currency_format?.iso_code ?? "",
        first_month: b.first_month,
        last_month: b.last_month,
      }));
      return JSON.stringify(budgets, null, 2);
    }

    case "budget_settings": {
      const args = BudgetArg.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(BudgetSettingsResponseSchema, `/budgets/${id}/settings`);
      return JSON.stringify(data.data.settings, null, 2);
    }

    case "list_accounts": {
      const args = BudgetArg.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(AccountsResponseSchema, `/budgets/${id}/accounts`);
      const accounts = data.data.accounts.filter((a) => !a.deleted).map(formatAccount);
      return JSON.stringify(accounts, null, 2);
    }

    case "get_account": {
      const args = AccountRef.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(
        AccountResponseSchema,
        `/budgets/${id}/accounts/${args.account_id}`,
      );
      return JSON.stringify(formatAccount(data.data.account), null, 2);
    }

    case "list_categories": {
      const args = BudgetArg.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(CategoriesResponseSchema, `/budgets/${id}/categories`);
      const groups = data.data.category_groups
        .filter((g) => !g.deleted && !g.hidden)
        .map((g) => ({
          group: g.name,
          categories: g.categories.filter((c) => !c.deleted && !c.hidden).map(formatCategory),
        }));
      return JSON.stringify(groups, null, 2);
    }

    case "get_category": {
      const args = CategoryRef.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(
        CategoryResponseSchema,
        `/budgets/${id}/categories/${args.category_id}`,
      );
      return JSON.stringify(formatCategory(data.data.category), null, 2);
    }

    case "update_category_budget": {
      const args = UpdateCategoryBudgetInput.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await sendTyped(
        "PATCH",
        CategoryResponseSchema,
        `/budgets/${id}/months/${args.month}/categories/${args.category_id}`,
        { category: { budgeted: args.budgeted } },
      );
      return JSON.stringify(formatCategory(data.data.category), null, 2);
    }

    case "list_transactions": {
      const args = ListTransactionsInput.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const params = new URLSearchParams();
      if (args.since_date) params.set("since_date", args.since_date);
      if (args.type) params.set("type", args.type);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const path = args.account_id
        ? `/budgets/${id}/accounts/${args.account_id}/transactions${qs}`
        : `/budgets/${id}/transactions${qs}`;
      const data = await getTyped(TransactionsResponseSchema, path);
      const txns = data.data.transactions
        .filter((t) => !t.deleted)
        .slice(-args.max_results)
        .map(formatTransaction);
      return txns.length > 0 ? JSON.stringify(txns, null, 2) : "No transactions found.";
    }

    case "get_transaction": {
      const args = TransactionRef.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(
        TransactionResponseSchema,
        `/budgets/${id}/transactions/${args.transaction_id}`,
      );
      return JSON.stringify(formatTransaction(data.data.transaction), null, 2);
    }

    case "create_transaction": {
      const args = CreateTransactionInput.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const body = transactionBody(
        UpdateTransactionInput.parse({
          ...args,
          transaction_id: "_",
        }),
      );
      body["account_id"] = args.account_id;
      const data = await sendTyped(
        "POST",
        TransactionResponseSchema,
        `/budgets/${id}/transactions`,
        {
          transaction: body,
        },
      );
      return JSON.stringify(formatTransaction(data.data.transaction), null, 2);
    }

    case "update_transaction": {
      const args = UpdateTransactionInput.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await sendTyped(
        "PUT",
        TransactionResponseSchema,
        `/budgets/${id}/transactions/${args.transaction_id}`,
        { transaction: transactionBody(args) },
      );
      return JSON.stringify(formatTransaction(data.data.transaction), null, 2);
    }

    case "list_months": {
      const args = BudgetArg.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(MonthsResponseSchema, `/budgets/${id}/months`);
      const months = data.data.months.filter((m) => !m.deleted).map(formatMonth);
      return JSON.stringify(months, null, 2);
    }

    case "get_month": {
      const args = MonthRef.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(MonthResponseSchema, `/budgets/${id}/months/${args.month}`);
      const m = data.data.month;
      return JSON.stringify(
        {
          ...formatMonth(m),
          categories: m.categories.filter((c) => !c.deleted && !c.hidden).map(formatCategory),
        },
        null,
        2,
      );
    }

    case "list_payees": {
      const args = BudgetArg.parse(rawArgs);
      const id = resolveBudget(args.budget_id);
      const data = await getTyped(PayeesResponseSchema, `/budgets/${id}/payees`);
      const payees = data.data.payees.filter((p) => !p.deleted).map(formatPayee);
      return JSON.stringify(payees, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================================
// Server bootstrap
// ============================================================================

const server = new Server({ name: "ynab", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.filter((t) => isToolEnabled(t.group, t.write)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const text = await handleTool(request.params.name, request.params.arguments ?? {});
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? `Validation error: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YNAB MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
