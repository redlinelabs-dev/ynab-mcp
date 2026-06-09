import { describe, expect, it } from "vitest";

import type {
  Account,
  Category,
  MonthSummary,
  Payee,
  ScheduledTransaction,
  Transaction,
} from "../src/schemas.js";

import {
  formatAccount,
  formatCategory,
  formatMonth,
  formatPayee,
  formatScheduledTransaction,
  formatTransaction,
} from "../src/format.js";

describe("formatAccount", () => {
  const account: Account = {
    id: "acct-1",
    name: "Checking",
    type: "checking",
    on_budget: true,
    closed: false,
    balance: 15000,
    cleared_balance: 12000,
    uncleared_balance: 3000,
    deleted: false,
  };

  it("passes through id, name, type, on_budget, closed, balance", () => {
    const result = formatAccount(account);

    expect(result.id).toBe("acct-1");
    expect(result.name).toBe("Checking");
    expect(result.type).toBe("checking");
    expect(result.on_budget).toBe(true);
    expect(result.closed).toBe(false);
    expect(result.balance).toBe(15000);
  });

  it("converts balance to balance_units in currency units", () => {
    const result = formatAccount(account);
    expect(result.balance_units).toBe(15);
  });

  it("converts cleared_balance to cleared_balance_units", () => {
    const result = formatAccount(account);
    expect(result.cleared_balance_units).toBe(12);
  });

  it("converts uncleared_balance to uncleared_balance_units", () => {
    const result = formatAccount(account);
    expect(result.uncleared_balance_units).toBe(3);
  });

  it("converts a negative balance correctly", () => {
    const negative: Account = { ...account, balance: -50000 };
    expect(formatAccount(negative).balance_units).toBe(-50);
  });
});

describe("formatCategory", () => {
  const category: Category = {
    id: "cat-1",
    category_group_id: "grp-1",
    category_group_name: "Bills",
    name: "Rent",
    hidden: false,
    budgeted: 120000,
    activity: -90000,
    balance: 30000,
    goal_type: null,
    goal_target: null,
    deleted: false,
  };

  it("uses category_group_name as group when present", () => {
    const result = formatCategory(category);
    expect(result.group).toBe("Bills");
  });

  it("falls back to category_group_id when category_group_name is absent", () => {
    const noName: Category = { ...category, category_group_name: undefined };
    expect(formatCategory(noName).group).toBe("grp-1");
  });

  it("converts budgeted to budgeted_units", () => {
    expect(formatCategory(category).budgeted_units).toBe(120);
  });

  it("converts activity to activity_units", () => {
    expect(formatCategory(category).activity_units).toBe(-90);
  });

  it("converts balance to balance_units", () => {
    expect(formatCategory(category).balance_units).toBe(30);
  });
});

describe("formatTransaction", () => {
  const txn: Transaction = {
    id: "txn-1",
    date: "2026-06-01",
    amount: -15000,
    memo: "coffee",
    cleared: "cleared",
    approved: true,
    flag_color: null,
    account_id: "acct-1",
    account_name: "Checking",
    payee_id: "pay-1",
    payee_name: "Starbucks",
    category_id: "cat-1",
    category_name: "Dining Out",
    import_id: null,
    transfer_account_id: null,
    deleted: false,
  };

  it("converts amount to amount_units", () => {
    expect(formatTransaction(txn).amount_units).toBe(-15);
  });

  it("passes through date, memo, cleared, approved, flag_color", () => {
    const result = formatTransaction(txn);
    expect(result.date).toBe("2026-06-01");
    expect(result.memo).toBe("coffee");
    expect(result.cleared).toBe("cleared");
    expect(result.approved).toBe(true);
    expect(result.flag_color).toBeNull();
  });

  it("uses payee_name for payee field", () => {
    expect(formatTransaction(txn).payee).toBe("Starbucks");
  });

  it("uses category_name for category field", () => {
    expect(formatTransaction(txn).category).toBe("Dining Out");
  });

  it("uses account_name for account field when present", () => {
    expect(formatTransaction(txn).account).toBe("Checking");
  });

  it("falls back to account_id for account field when account_name is absent", () => {
    const noName: Transaction = { ...txn, account_name: undefined };
    expect(formatTransaction(noName).account).toBe("acct-1");
  });
});

describe("formatScheduledTransaction", () => {
  const scheduled: ScheduledTransaction = {
    id: "sched-1",
    date_first: "2026-01-01",
    date_next: "2026-07-01",
    frequency: "monthly",
    amount: -50000,
    memo: "rent",
    account_id: "acct-1",
    account_name: "Checking",
    payee_id: "pay-1",
    payee_name: "Landlord",
    category_id: "cat-1",
    category_name: "Rent",
    deleted: false,
  };

  it("converts amount to amount_units", () => {
    expect(formatScheduledTransaction(scheduled).amount_units).toBe(-50);
  });

  it("passes through id, date_next, frequency, amount, memo", () => {
    const result = formatScheduledTransaction(scheduled);
    expect(result.id).toBe("sched-1");
    expect(result.date_next).toBe("2026-07-01");
    expect(result.frequency).toBe("monthly");
    expect(result.amount).toBe(-50000);
    expect(result.memo).toBe("rent");
  });

  it("uses account_name for account when present", () => {
    expect(formatScheduledTransaction(scheduled).account).toBe("Checking");
  });

  it("falls back to account_id when account_name is absent", () => {
    const noName: ScheduledTransaction = { ...scheduled, account_name: undefined };
    expect(formatScheduledTransaction(noName).account).toBe("acct-1");
  });
});

describe("formatMonth", () => {
  const month: MonthSummary = {
    month: "2026-06-01",
    note: "good month",
    income: 500000,
    budgeted: 480000,
    activity: -460000,
    to_be_budgeted: 20000,
    age_of_money: 30,
    deleted: false,
  };

  it("converts income to income_units", () => {
    expect(formatMonth(month).income_units).toBe(500);
  });

  it("converts budgeted to budgeted_units", () => {
    expect(formatMonth(month).budgeted_units).toBe(480);
  });

  it("converts activity to activity_units", () => {
    expect(formatMonth(month).activity_units).toBe(-460);
  });

  it("converts to_be_budgeted to to_be_budgeted_units", () => {
    expect(formatMonth(month).to_be_budgeted_units).toBe(20);
  });

  it("passes through month, age_of_money, note", () => {
    const result = formatMonth(month);
    expect(result.month).toBe("2026-06-01");
    expect(result.age_of_money).toBe(30);
    expect(result.note).toBe("good month");
  });
});

describe("formatPayee", () => {
  it("sets is_transfer to false when transfer_account_id is null", () => {
    const payee: Payee = {
      id: "pay-1",
      name: "Starbucks",
      transfer_account_id: null,
      deleted: false,
    };
    expect(formatPayee(payee).is_transfer).toBe(false);
  });

  it("sets is_transfer to true when transfer_account_id is non-null", () => {
    const payee: Payee = {
      id: "pay-2",
      name: "Transfer",
      transfer_account_id: "acct-2",
      deleted: false,
    };
    expect(formatPayee(payee).is_transfer).toBe(true);
  });

  it("passes through id and name", () => {
    const payee: Payee = {
      id: "pay-1",
      name: "Starbucks",
      transfer_account_id: null,
      deleted: false,
    };
    const result = formatPayee(payee);
    expect(result.id).toBe("pay-1");
    expect(result.name).toBe("Starbucks");
  });
});
