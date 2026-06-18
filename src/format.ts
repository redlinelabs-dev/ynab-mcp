// ============================================================================
// Formatters — token-efficient, fully typed output shapes. Amounts stay in
// milliunits but each gets a human-readable `*_units` sibling (÷1000).
// ============================================================================

import type {
  Account,
  Category,
  CategoryGroup,
  MonthSummary,
  Payee,
  PayeeLocation,
  ScheduledTransaction,
  Transaction,
} from "./schemas.js";

import { units } from "./money.js";

export function formatAccount(a: Account) {
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

export function formatCategory(c: Category) {
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

export function formatTransaction(t: Transaction) {
  const legs = (t.subtransactions ?? []).filter((s) => !s.deleted);
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
    ...(legs.length > 0 && {
      subtransactions: legs.map((s) => ({
        amount: s.amount,
        amount_units: units(s.amount),
        category: s.category_name,
        payee: s.payee_name,
        memo: s.memo,
      })),
    }),
  };
}

export function formatScheduledTransaction(s: ScheduledTransaction) {
  return {
    id: s.id,
    date_next: s.date_next,
    frequency: s.frequency,
    amount: s.amount,
    amount_units: units(s.amount),
    payee: s.payee_name,
    category: s.category_name,
    account: s.account_name ?? s.account_id,
    memo: s.memo,
  };
}

export function formatMonth(m: MonthSummary) {
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

export function formatPayee(p: Payee) {
  return { id: p.id, name: p.name, is_transfer: p.transfer_account_id !== null };
}

export function formatPayeeLocation(l: PayeeLocation) {
  return { id: l.id, payee_id: l.payee_id, latitude: l.latitude, longitude: l.longitude };
}

export function formatCategoryGroup(g: CategoryGroup) {
  return { id: g.id, name: g.name, hidden: g.hidden };
}
