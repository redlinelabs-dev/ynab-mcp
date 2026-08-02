// ============================================================================
// Demo Budget fixtures — a believable, entirely fictional YNAB budget.
//
// `createDemoState()` builds a fresh, mutable snapshot every time it's called
// (so tests never share state). The shapes here intentionally mirror the Zod
// schemas in `src/schemas.ts` — `src/demo.ts` serves them straight through the
// same validation live responses go through, so a malformed fixture fails the
// test suite instead of silently drifting.
//
// Simplification (documented, not a bug): categories carry a single
// budgeted/activity/balance snapshot representing the *current* month
// (`CURRENT_MONTH`). Every month endpoint returns that same snapshot — real
// YNAB tracks per-month category assignment, but one flat snapshot is enough
// to be coherent and screenshot-worthy without a month-by-month ledger.
// ============================================================================

import type {
  Account,
  Category,
  CategoryGroup,
  MonthSummary,
  Payee,
  ScheduledTransaction,
  Transaction,
} from "./schemas.js";

/** Convert a dollar amount (with cents) to milliunits. */
function milli(dollars: number): number {
  return Math.round(dollars * 1000);
}

export const DEMO_BUDGET_ID = "demo-budget";
export const DEMO_BUDGET_NAME = "Demo Budget";
export const CURRENT_MONTH = "2026-08-01";
export const DEMO_MONTHS = ["2026-06-01", "2026-07-01", "2026-08-01"];

export interface DemoCurrencyFormat {
  iso_code: string;
  decimal_digits: number;
  currency_symbol: string;
}

export const DEMO_CURRENCY: DemoCurrencyFormat = {
  iso_code: "USD",
  decimal_digits: 2,
  currency_symbol: "$",
};

export interface DemoState {
  budgetId: string;
  budgetName: string;
  currency: DemoCurrencyFormat;
  currentMonth: string;
  months: string[];
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  payees: Payee[];
  transactions: Transaction[];
  scheduledTransactions: ScheduledTransaction[];
  serverKnowledge: number;
  /** ISO timestamp of the last write, surfaced as a budget's `last_modified_on`. */
  lastModifiedOn: string;
  /**
   * Bidirectional link between the two legs of a transfer (transaction id ->
   * the other leg's transaction id). Not part of any YNAB response shape —
   * internal bookkeeping so `src/demo.ts` can keep a transfer's two ledger
   * entries in sync on update/delete without guessing which transaction is
   * the other side.
   */
  transferLinks: Map<string, string>;
  nextId: (prefix: string) => string;
}

function makeIdCounter(): (prefix: string) => string {
  let seq = 1000;
  return (prefix: string) => `${prefix}-${seq++}`;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function buildAccounts(): Account[] {
  return [
    {
      id: "acc-checking",
      name: "Checking",
      type: "checking",
      on_budget: true,
      closed: false,
      balance: milli(2458.32),
      cleared_balance: milli(2458.32),
      uncleared_balance: 0,
      deleted: false,
    },
    {
      id: "acc-savings",
      name: "Savings",
      type: "savings",
      on_budget: true,
      closed: false,
      balance: milli(12750.0),
      cleared_balance: milli(12750.0),
      uncleared_balance: 0,
      deleted: false,
    },
    {
      id: "acc-credit-card",
      name: "Rewards Credit Card",
      type: "creditCard",
      on_budget: true,
      closed: false,
      balance: milli(-284.75),
      cleared_balance: milli(-284.75),
      uncleared_balance: 0,
      deleted: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Payees
// ---------------------------------------------------------------------------

function buildPayees(): Payee[] {
  const names = [
    ["payee-landlord", "Maple Street Apartments"],
    ["payee-power", "Riverside Electric Co-op"],
    ["payee-water", "Cedar County Water Utility"],
    ["payee-internet", "Northlink Broadband"],
    ["payee-grocery-1", "Green Valley Grocers"],
    ["payee-grocery-2", "Sunrise Farmers Market"],
    ["payee-coffee", "Daily Grind Coffee"],
    ["payee-dining-1", "Blue Pepper Bistro"],
    ["payee-dining-2", "Golden Wok Takeout"],
    ["payee-streaming", "StreamBox"],
    ["payee-music", "TuneStream"],
    ["payee-gym", "Iron Peak Fitness"],
    ["payee-gas", "Fuel & Go"],
    ["payee-pharmacy", "Corner Drug Pharmacy"],
    ["payee-marketplace", "Marketplace Direct"],
    ["payee-employer", "Nimbus Analytics Payroll"],
    ["payee-cinema", "Starlight Cinema"],
    ["payee-hardware", "Ridgeline Hardware"],
    ["payee-vet", "Pinecrest Veterinary Clinic"],
  ];
  const payees: Payee[] = names.map(([id, name]) => {
    if (id === undefined || name === undefined) throw new Error("unreachable");
    return { id, name, transfer_account_id: null, deleted: false };
  });
  // YNAB gives every account a "Transfer : <account>" payee the moment the
  // account exists, not just once someone actually transfers to it — so the
  // demo seeds one per fixture account up front (see also the `POST /accounts`
  // handler in src/demo.ts, which does the same for accounts created mid-session).
  payees.push(
    {
      id: "payee-transfer-checking",
      name: "Transfer : Checking",
      transfer_account_id: "acc-checking",
      deleted: false,
    },
    {
      id: "payee-transfer-savings",
      name: "Transfer : Savings",
      transfer_account_id: "acc-savings",
      deleted: false,
    },
    {
      id: "payee-transfer-credit-card",
      name: "Transfer : Rewards Credit Card",
      transfer_account_id: "acc-credit-card",
      deleted: false,
    },
  );
  return payees;
}

// ---------------------------------------------------------------------------
// Category groups + categories
// ---------------------------------------------------------------------------

interface CategorySeed {
  id: string;
  name: string;
  budgeted: number;
  goal_target?: number;
}

function buildCategoryGroups(): CategoryGroup[] {
  const groups: { id: string; name: string; categories: CategorySeed[] }[] = [
    {
      id: "grp-immediate",
      name: "Immediate Obligations",
      categories: [
        { id: "cat-rent", name: "Rent", budgeted: milli(1800) },
        { id: "cat-electric", name: "Electric", budgeted: milli(120) },
        { id: "cat-water", name: "Water", budgeted: milli(45) },
        { id: "cat-internet", name: "Internet", budgeted: milli(70) },
      ],
    },
    {
      id: "grp-true-expenses",
      name: "True Expenses",
      categories: [
        { id: "cat-groceries", name: "Groceries", budgeted: milli(600) },
        { id: "cat-gas", name: "Gas & Transportation", budgeted: milli(90) },
        { id: "cat-car", name: "Car Maintenance", budgeted: milli(50), goal_target: milli(600) },
        { id: "cat-home", name: "Home Maintenance", budgeted: milli(40) },
        { id: "cat-medical", name: "Medical", budgeted: milli(60) },
      ],
    },
    {
      id: "grp-quality-of-life",
      name: "Quality of Life",
      categories: [
        { id: "cat-dining", name: "Dining Out", budgeted: milli(250) },
        { id: "cat-entertainment", name: "Entertainment", budgeted: milli(80) },
        { id: "cat-subscriptions", name: "Subscriptions", budgeted: milli(35) },
        { id: "cat-fitness", name: "Fitness", budgeted: milli(60) },
      ],
    },
    {
      id: "grp-just-for-fun",
      name: "Just for Fun",
      categories: [
        { id: "cat-hobbies", name: "Hobbies", budgeted: milli(50) },
        { id: "cat-gifts", name: "Gifts", budgeted: milli(30) },
      ],
    },
  ];

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    hidden: false,
    deleted: false,
    categories: g.categories.map((c) => ({
      id: c.id,
      category_group_id: g.id,
      category_group_name: g.name,
      name: c.name,
      hidden: false,
      budgeted: c.budgeted,
      activity: 0, // filled in by `applyActivityFromTransactions` below
      balance: c.budgeted,
      goal_type: c.goal_target !== undefined ? "TB" : null,
      goal_target: c.goal_target ?? null,
      deleted: false,
    })),
  }));
}

/** Recompute each category's current-month activity/balance from its transactions. */
export function refreshCategoryActivity(
  groups: CategoryGroup[],
  transactions: Transaction[],
): void {
  const activityByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (!t.date.startsWith(CURRENT_MONTH.slice(0, 7))) continue;
    if (t.category_id === null || t.deleted) continue;
    activityByCategory.set(t.category_id, (activityByCategory.get(t.category_id) ?? 0) + t.amount);
  }
  for (const group of groups) {
    for (const category of group.categories) {
      const activity = activityByCategory.get(category.id) ?? 0;
      category.activity = activity;
      category.balance = category.budgeted + activity;
    }
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

interface TxnSeed {
  id: string;
  date: string;
  amount: number;
  account_id: string;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  memo?: string | null;
  cleared?: string;
  approved?: boolean;
  transfer_account_id?: string | null;
}

function payeeName(payees: Payee[], id: string): string {
  const p = payees.find((x) => x.id === id);
  if (!p) throw new Error(`unknown demo payee: ${id}`);
  return p.name;
}

function categoryName(groups: CategoryGroup[], id: string): string {
  for (const g of groups) {
    const c = g.categories.find((x) => x.id === id);
    if (c) return c.name;
  }
  throw new Error(`unknown demo category: ${id}`);
}

function accountName(accounts: Account[], id: string): string {
  const a = accounts.find((x) => x.id === id);
  if (!a) throw new Error(`unknown demo account: ${id}`);
  return a.name;
}

function buildTransactions(
  accounts: Account[],
  payees: Payee[],
  groups: CategoryGroup[],
): Transaction[] {
  const p = (id: string) => payeeName(payees, id);
  const c = (id: string) => categoryName(groups, id);

  const seeds: TxnSeed[] = [
    // --- June 2026 ---
    {
      id: "txn-2001",
      date: "2026-06-01",
      amount: milli(2650),
      account_id: "acc-checking",
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      memo: "Biweekly paycheck",
    },
    {
      id: "txn-2002",
      date: "2026-06-01",
      amount: milli(-1800),
      account_id: "acc-checking",
      payee_id: "payee-landlord",
      payee_name: p("payee-landlord"),
      category_id: "cat-rent",
      category_name: c("cat-rent"),
      memo: "June rent",
    },
    {
      id: "txn-2003",
      date: "2026-06-03",
      amount: milli(-92.14),
      account_id: "acc-checking",
      payee_id: "payee-grocery-1",
      payee_name: p("payee-grocery-1"),
      category_id: "cat-groceries",
      category_name: c("cat-groceries"),
    },
    {
      id: "txn-2004",
      date: "2026-06-05",
      amount: milli(-95.2),
      account_id: "acc-checking",
      payee_id: "payee-power",
      payee_name: p("payee-power"),
      category_id: "cat-electric",
      category_name: c("cat-electric"),
      memo: "June electric bill",
    },
    {
      id: "txn-2005",
      date: "2026-06-08",
      amount: milli(-38.6),
      account_id: "acc-checking",
      payee_id: "payee-water",
      payee_name: p("payee-water"),
      category_id: "cat-water",
      category_name: c("cat-water"),
    },
    {
      id: "txn-2006",
      date: "2026-06-08",
      amount: milli(-70.0),
      account_id: "acc-checking",
      payee_id: "payee-internet",
      payee_name: p("payee-internet"),
      category_id: "cat-internet",
      category_name: c("cat-internet"),
    },
    {
      id: "txn-2007",
      date: "2026-06-12",
      amount: milli(-48.3),
      account_id: "acc-credit-card",
      payee_id: "payee-dining-1",
      payee_name: p("payee-dining-1"),
      category_id: "cat-dining",
      category_name: c("cat-dining"),
    },
    {
      id: "txn-2008",
      date: "2026-06-15",
      amount: milli(2650),
      account_id: "acc-checking",
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      memo: "Biweekly paycheck",
    },
    {
      id: "txn-2009",
      date: "2026-06-18",
      amount: milli(-56.4),
      account_id: "acc-checking",
      payee_id: "payee-gas",
      payee_name: p("payee-gas"),
      category_id: "cat-gas",
      category_name: c("cat-gas"),
    },
    {
      id: "txn-2010",
      date: "2026-06-22",
      amount: milli(-15.0),
      account_id: "acc-credit-card",
      payee_id: "payee-streaming",
      payee_name: p("payee-streaming"),
      category_id: "cat-subscriptions",
      category_name: c("cat-subscriptions"),
    },
    {
      id: "txn-2011",
      date: "2026-06-27",
      amount: milli(-31.75),
      account_id: "acc-credit-card",
      payee_id: "payee-grocery-2",
      payee_name: p("payee-grocery-2"),
      category_id: "cat-groceries",
      category_name: c("cat-groceries"),
    },

    // --- July 2026 ---
    {
      id: "txn-3001",
      date: "2026-07-01",
      amount: milli(2650),
      account_id: "acc-checking",
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      memo: "Biweekly paycheck",
    },
    {
      id: "txn-3002",
      date: "2026-07-01",
      amount: milli(-1800),
      account_id: "acc-checking",
      payee_id: "payee-landlord",
      payee_name: p("payee-landlord"),
      category_id: "cat-rent",
      category_name: c("cat-rent"),
      memo: "July rent",
    },
    {
      id: "txn-3003",
      date: "2026-07-04",
      amount: milli(-18.75),
      account_id: "acc-checking",
      payee_id: "payee-hardware",
      payee_name: p("payee-hardware"),
      category_id: "cat-home",
      category_name: c("cat-home"),
      memo: "Grill supplies",
    },
    {
      id: "txn-3004",
      date: "2026-07-06",
      amount: milli(-101.05),
      account_id: "acc-checking",
      payee_id: "payee-power",
      payee_name: p("payee-power"),
      category_id: "cat-electric",
      category_name: c("cat-electric"),
      memo: "July electric bill",
    },
    {
      id: "txn-3005",
      date: "2026-07-06",
      amount: milli(-42.8),
      account_id: "acc-checking",
      payee_id: "payee-water",
      payee_name: p("payee-water"),
      category_id: "cat-water",
      category_name: c("cat-water"),
    },
    {
      id: "txn-3006",
      date: "2026-07-06",
      amount: milli(-70.0),
      account_id: "acc-checking",
      payee_id: "payee-internet",
      payee_name: p("payee-internet"),
      category_id: "cat-internet",
      category_name: c("cat-internet"),
    },
    {
      id: "txn-3007",
      date: "2026-07-10",
      amount: milli(-60.0),
      account_id: "acc-checking",
      payee_id: "payee-gym",
      payee_name: p("payee-gym"),
      category_id: "cat-fitness",
      category_name: c("cat-fitness"),
      memo: "Monthly membership",
    },
    {
      id: "txn-3008",
      date: "2026-07-13",
      amount: milli(-8.4),
      account_id: "acc-credit-card",
      payee_id: "payee-coffee",
      payee_name: p("payee-coffee"),
      category_id: "cat-dining",
      category_name: c("cat-dining"),
    },
    {
      id: "txn-3009",
      date: "2026-07-15",
      amount: milli(2650),
      account_id: "acc-checking",
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      memo: "Biweekly paycheck",
    },
    {
      id: "txn-3010",
      date: "2026-07-19",
      amount: milli(-27.4),
      account_id: "acc-credit-card",
      payee_id: "payee-cinema",
      payee_name: p("payee-cinema"),
      category_id: "cat-entertainment",
      category_name: c("cat-entertainment"),
    },
    {
      id: "txn-3011",
      date: "2026-07-24",
      amount: milli(-64.2),
      account_id: "acc-credit-card",
      payee_id: "payee-grocery-1",
      payee_name: p("payee-grocery-1"),
      category_id: "cat-groceries",
      category_name: c("cat-groceries"),
    },
    {
      id: "txn-3012",
      date: "2026-07-29",
      amount: milli(-19.5),
      account_id: "acc-checking",
      payee_id: "payee-vet",
      payee_name: p("payee-vet"),
      category_id: "cat-medical",
      category_name: c("cat-medical"),
      memo: "Annual checkup — Biscuit",
    },

    // --- August 2026 (current month) ---
    {
      id: "txn-4001",
      date: "2026-08-01",
      amount: milli(2650),
      account_id: "acc-checking",
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      memo: "Biweekly paycheck",
    },
    {
      id: "txn-4002",
      date: "2026-08-01",
      amount: milli(-1800),
      account_id: "acc-checking",
      payee_id: "payee-landlord",
      payee_name: p("payee-landlord"),
      category_id: "cat-rent",
      category_name: c("cat-rent"),
      memo: "August rent",
    },
    {
      id: "txn-4003",
      date: "2026-08-02",
      amount: milli(-86.42),
      account_id: "acc-checking",
      payee_id: "payee-grocery-1",
      payee_name: p("payee-grocery-1"),
      category_id: "cat-groceries",
      category_name: c("cat-groceries"),
    },
    {
      id: "txn-4004",
      date: "2026-08-03",
      amount: milli(-54.3),
      account_id: "acc-credit-card",
      payee_id: "payee-dining-1",
      payee_name: p("payee-dining-1"),
      category_id: "cat-dining",
      category_name: c("cat-dining"),
    },
    {
      id: "txn-4005",
      date: "2026-08-04",
      amount: milli(-98.45),
      account_id: "acc-checking",
      payee_id: "payee-power",
      payee_name: p("payee-power"),
      category_id: "cat-electric",
      category_name: c("cat-electric"),
      memo: "August electric bill",
    },
    {
      id: "txn-4006",
      date: "2026-08-05",
      amount: milli(-41.2),
      account_id: "acc-checking",
      payee_id: "payee-water",
      payee_name: p("payee-water"),
      category_id: "cat-water",
      category_name: c("cat-water"),
    },
    {
      id: "txn-4007",
      date: "2026-08-05",
      amount: milli(-70.0),
      account_id: "acc-checking",
      payee_id: "payee-internet",
      payee_name: p("payee-internet"),
      category_id: "cat-internet",
      category_name: c("cat-internet"),
    },
    {
      id: "txn-4008",
      date: "2026-08-07",
      amount: milli(-4.75),
      account_id: "acc-credit-card",
      payee_id: "payee-coffee",
      payee_name: p("payee-coffee"),
      category_id: "cat-dining",
      category_name: c("cat-dining"),
    },
    {
      id: "txn-4009",
      date: "2026-08-09",
      amount: milli(-112.34),
      account_id: "acc-credit-card",
      payee_id: "payee-grocery-2",
      payee_name: p("payee-grocery-2"),
      category_id: "cat-groceries",
      category_name: c("cat-groceries"),
    },
    {
      id: "txn-4010",
      date: "2026-08-10",
      amount: milli(-60.0),
      account_id: "acc-checking",
      payee_id: "payee-gym",
      payee_name: p("payee-gym"),
      category_id: "cat-fitness",
      category_name: c("cat-fitness"),
      memo: "Monthly membership",
    },
    {
      id: "txn-4011",
      date: "2026-08-11",
      amount: milli(-15.0),
      account_id: "acc-credit-card",
      payee_id: "payee-streaming",
      payee_name: p("payee-streaming"),
      category_id: "cat-subscriptions",
      category_name: c("cat-subscriptions"),
    },
    {
      id: "txn-4012",
      date: "2026-08-11",
      amount: milli(-10.99),
      account_id: "acc-credit-card",
      payee_id: "payee-music",
      payee_name: p("payee-music"),
      category_id: "cat-subscriptions",
      category_name: c("cat-subscriptions"),
    },
    {
      id: "txn-4013",
      date: "2026-08-13",
      amount: milli(-18.75),
      account_id: "acc-credit-card",
      payee_id: "payee-hardware",
      payee_name: p("payee-hardware"),
      category_id: "cat-home",
      category_name: c("cat-home"),
      memo: "Paint and supplies",
    },
    {
      id: "txn-4014",
      date: "2026-08-14",
      amount: milli(-36.0),
      account_id: "acc-credit-card",
      payee_id: "payee-cinema",
      payee_name: p("payee-cinema"),
      category_id: "cat-entertainment",
      category_name: c("cat-entertainment"),
    },
    {
      id: "txn-4015",
      date: "2026-08-15",
      amount: milli(2650),
      account_id: "acc-checking",
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      memo: "Biweekly paycheck",
      cleared: "uncleared",
      approved: false,
    },
    {
      id: "txn-4016",
      date: "2026-08-15",
      amount: milli(-12.48),
      account_id: "acc-checking",
      payee_id: "payee-pharmacy",
      payee_name: p("payee-pharmacy"),
      category_id: "cat-medical",
      category_name: c("cat-medical"),
    },
    {
      id: "txn-4017",
      date: "2026-08-16",
      amount: milli(-28.9),
      account_id: "acc-credit-card",
      payee_id: "payee-dining-2",
      payee_name: p("payee-dining-2"),
      category_id: "cat-dining",
      category_name: c("cat-dining"),
    },
    {
      id: "txn-4018",
      date: "2026-08-20",
      amount: milli(-219.99),
      account_id: "acc-credit-card",
      payee_id: "payee-marketplace",
      payee_name: p("payee-marketplace"),
      category_id: "cat-hobbies",
      category_name: c("cat-hobbies"),
      memo: "Model kit",
    },
    {
      id: "txn-4019",
      date: "2026-08-22",
      amount: milli(-50.0),
      account_id: "acc-checking",
      payee_id: "payee-transfer-savings",
      payee_name: p("payee-transfer-savings"),
      category_id: null,
      category_name: null,
      transfer_account_id: "acc-savings",
      memo: "Move to savings",
    },
    {
      id: "txn-4020",
      date: "2026-08-22",
      amount: milli(50.0),
      account_id: "acc-savings",
      payee_id: "payee-transfer-checking",
      payee_name: p("payee-transfer-checking"),
      category_id: null,
      category_name: null,
      transfer_account_id: "acc-checking",
      memo: "Move to savings",
    },
    {
      id: "txn-4021",
      date: "2026-08-25",
      amount: milli(-18.5),
      account_id: "acc-checking",
      payee_id: "payee-gas",
      payee_name: p("payee-gas"),
      category_id: "cat-gas",
      category_name: c("cat-gas"),
      cleared: "uncleared",
    },
    {
      id: "txn-4022",
      date: "2026-08-27",
      amount: milli(-34.21),
      account_id: "acc-checking",
      payee_id: "payee-grocery-1",
      payee_name: p("payee-grocery-1"),
      category_id: "cat-groceries",
      category_name: c("cat-groceries"),
      cleared: "uncleared",
      approved: false,
    },
  ];

  return seeds.map((s) => ({
    id: s.id,
    date: s.date,
    amount: s.amount,
    memo: s.memo ?? null,
    cleared: s.cleared ?? "cleared",
    approved: s.approved ?? true,
    flag_color: null,
    account_id: s.account_id,
    account_name: accountName(accounts, s.account_id),
    payee_id: s.payee_id,
    payee_name: s.payee_name,
    category_id: s.category_id,
    category_name: s.category_name,
    import_id: null,
    transfer_account_id: s.transfer_account_id ?? null,
    subtransactions: [],
    deleted: false,
  }));
}

// ---------------------------------------------------------------------------
// Scheduled transactions
// ---------------------------------------------------------------------------

function buildScheduledTransactions(
  accounts: Account[],
  payees: Payee[],
  groups: CategoryGroup[],
): ScheduledTransaction[] {
  const p = (id: string) => payeeName(payees, id);
  const c = (id: string) => categoryName(groups, id);
  const a = (id: string) => accountName(accounts, id);

  return [
    {
      id: "sched-rent",
      date_first: "2026-01-01",
      date_next: "2026-09-01",
      frequency: "monthly",
      amount: milli(-1800),
      memo: "Rent",
      account_id: "acc-checking",
      account_name: a("acc-checking"),
      payee_id: "payee-landlord",
      payee_name: p("payee-landlord"),
      category_id: "cat-rent",
      category_name: c("cat-rent"),
      deleted: false,
    },
    {
      id: "sched-internet",
      date_first: "2026-01-06",
      date_next: "2026-09-06",
      frequency: "monthly",
      amount: milli(-70),
      memo: null,
      account_id: "acc-checking",
      account_name: a("acc-checking"),
      payee_id: "payee-internet",
      payee_name: p("payee-internet"),
      category_id: "cat-internet",
      category_name: c("cat-internet"),
      deleted: false,
    },
    {
      id: "sched-streaming",
      date_first: "2026-02-11",
      date_next: "2026-09-11",
      frequency: "monthly",
      amount: milli(-15),
      memo: null,
      account_id: "acc-credit-card",
      account_name: a("acc-credit-card"),
      payee_id: "payee-streaming",
      payee_name: p("payee-streaming"),
      category_id: "cat-subscriptions",
      category_name: c("cat-subscriptions"),
      deleted: false,
    },
    {
      id: "sched-paycheck",
      date_first: "2026-01-15",
      date_next: "2026-08-29",
      frequency: "everyOtherWeek",
      amount: milli(2650),
      memo: "Biweekly paycheck",
      account_id: "acc-checking",
      account_name: a("acc-checking"),
      payee_id: "payee-employer",
      payee_name: p("payee-employer"),
      category_id: null,
      category_name: null,
      deleted: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

function buildMonthSummary(
  month: string,
  transactions: Transaction[],
  budgeted: number,
): MonthSummary {
  const monthTxns = transactions.filter((t) => t.date.startsWith(month.slice(0, 7)) && !t.deleted);
  const income = monthTxns
    .filter((t) => t.category_id === null && t.transfer_account_id === null && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const activity = monthTxns
    .filter((t) => t.transfer_account_id === null)
    .reduce((sum, t) => sum + t.amount, 0);
  return {
    month,
    note: null,
    income,
    budgeted,
    activity,
    // Simplification (documented, not a bug): real YNAB lets this go negative
    // when a budget over-assigns relative to income; the demo clamps at 0 so
    // the fixture never shows an over-budgeted month.
    to_be_budgeted: Math.max(income - budgeted, 0),
    age_of_money: 42,
    deleted: false,
  };
}

// ---------------------------------------------------------------------------
// State assembly
// ---------------------------------------------------------------------------

export function createDemoState(): DemoState {
  const accounts = buildAccounts();
  const payees = buildPayees();
  const categoryGroups = buildCategoryGroups();
  const transactions = buildTransactions(accounts, payees, categoryGroups);
  refreshCategoryActivity(categoryGroups, transactions);
  const scheduledTransactions = buildScheduledTransactions(accounts, payees, categoryGroups);

  const totalBudgeted = categoryGroups
    .flatMap((g) => g.categories)
    .reduce((sum, c) => sum + c.budgeted, 0);
  const months = DEMO_MONTHS.map((m) => buildMonthSummary(m, transactions, totalBudgeted));

  // The one pre-seeded transfer pair (checking -> savings) — see the
  // `transfer_account_id`/`payee-transfer-*` wiring in `buildTransactions`.
  const transferLinks = new Map<string, string>([
    ["txn-4019", "txn-4020"],
    ["txn-4020", "txn-4019"],
  ]);

  return {
    budgetId: DEMO_BUDGET_ID,
    budgetName: DEMO_BUDGET_NAME,
    currency: DEMO_CURRENCY,
    currentMonth: CURRENT_MONTH,
    months: months.map((m) => m.month),
    accounts,
    categoryGroups,
    payees,
    transactions,
    scheduledTransactions,
    serverKnowledge: 0,
    lastModifiedOn: new Date().toISOString(),
    transferLinks,
    nextId: makeIdCounter(),
  };
}

export function allCategories(state: DemoState): Category[] {
  return state.categoryGroups.flatMap((g) => g.categories);
}

export function monthSummaries(state: DemoState): MonthSummary[] {
  const totalBudgeted = allCategories(state).reduce((sum, c) => sum + c.budgeted, 0);
  return state.months.map((m) => buildMonthSummary(m, state.transactions, totalBudgeted));
}
