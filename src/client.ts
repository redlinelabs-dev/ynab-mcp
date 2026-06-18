// ============================================================================
// YnabClient — the single HTTP seam to the YNAB REST API.
//
// `fetch` is injected (defaults to the global) so tests exercise every method
// without touching the network or the 200 req/hr rate limit. Every response is
// validated through a Zod schema at the boundary; `rawFetch` throws on non-2xx
// with a sliced error body.
// ============================================================================

import type { z } from "zod";

import type { BulkTxnUpdate, SaveScheduledTxnFields } from "./transactions.js";
import type { SaveTxnFields } from "./transactions.js";

import {
  AccountResponseSchema,
  AccountsResponseSchema,
  BudgetSettingsResponseSchema,
  BudgetsResponseSchema,
  BulkTransactionsResponseSchema,
  CategoriesResponseSchema,
  CategoryGroupResponseSchema,
  CategoryResponseSchema,
  ImportResponseSchema,
  MonthResponseSchema,
  MonthsResponseSchema,
  PayeeLocationResponseSchema,
  PayeeLocationsResponseSchema,
  PayeeResponseSchema,
  PayeesResponseSchema,
  ScheduledTransactionResponseSchema,
  ScheduledTransactionsResponseSchema,
  TransactionResponseSchema,
  TransactionsResponseSchema,
  UserResponseSchema,
} from "./schemas.js";
import {
  buildBulkCreateBody,
  buildBulkTransactionsBody,
  buildSaveScheduledTransaction,
  buildSaveTransaction,
} from "./transactions.js";

export interface SaveCategoryFields {
  name?: string;
  note?: string | null;
  category_group_id?: string;
}

export type FetchFn = typeof fetch;

export interface ListTransactionsOptions {
  account_id?: string;
  since_date?: string;
  until_date?: string;
  type?: "uncategorized" | "unapproved";
}

export interface CreateAccountInput {
  name: string;
  type: string;
  balance: number;
}

export class YnabClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly base = "https://api.ynab.com/v1",
  ) {}

  private async rawFetch(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const r = await this.fetchFn(`${this.base}${path}`, init);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`${method} ${path}: ${r.status} ${r.statusText} — ${text.slice(0, 300)}`);
    }
    return r;
  }

  private async getTyped<T>(schema: z.ZodType<T>, path: string): Promise<T> {
    const r = await this.rawFetch("GET", path);
    const json: unknown = await r.json();
    return schema.parse(json);
  }

  private async sendTyped<T>(
    method: "POST" | "PUT" | "PATCH",
    schema: z.ZodType<T>,
    path: string,
    body: unknown,
  ): Promise<T> {
    const r = await this.rawFetch(method, path, body);
    const json: unknown = await r.json();
    return schema.parse(json);
  }

  // --- Budgets ---

  async listBudgets() {
    const data = await this.getTyped(BudgetsResponseSchema, "/budgets");
    return data.data.budgets;
  }

  async getBudgetSettings(budget: string) {
    const data = await this.getTyped(BudgetSettingsResponseSchema, `/budgets/${budget}/settings`);
    return data.data.settings;
  }

  // --- User ---

  async getUser() {
    const data = await this.getTyped(UserResponseSchema, "/user");
    return data.data.user;
  }

  // --- Accounts ---

  async listAccounts(budget: string) {
    const data = await this.getTyped(AccountsResponseSchema, `/budgets/${budget}/accounts`);
    return data.data.accounts;
  }

  async getAccount(budget: string, accountId: string) {
    const data = await this.getTyped(
      AccountResponseSchema,
      `/budgets/${budget}/accounts/${accountId}`,
    );
    return data.data.account;
  }

  async createAccount(budget: string, account: CreateAccountInput) {
    const data = await this.sendTyped(
      "POST",
      AccountResponseSchema,
      `/budgets/${budget}/accounts`,
      { account },
    );
    return data.data.account;
  }

  // --- Categories ---

  async listCategories(budget: string) {
    const data = await this.getTyped(CategoriesResponseSchema, `/budgets/${budget}/categories`);
    return data.data.category_groups;
  }

  async getCategory(budget: string, categoryId: string) {
    const data = await this.getTyped(
      CategoryResponseSchema,
      `/budgets/${budget}/categories/${categoryId}`,
    );
    return data.data.category;
  }

  async updateCategoryBudget(budget: string, month: string, categoryId: string, budgeted: number) {
    const data = await this.sendTyped(
      "PATCH",
      CategoryResponseSchema,
      `/budgets/${budget}/months/${month}/categories/${categoryId}`,
      { category: { budgeted } },
    );
    return data.data.category;
  }

  async getMonthCategory(budget: string, month: string, categoryId: string) {
    const data = await this.getTyped(
      CategoryResponseSchema,
      `/budgets/${budget}/months/${month}/categories/${categoryId}`,
    );
    return data.data.category;
  }

  async createCategory(budget: string, fields: SaveCategoryFields) {
    const data = await this.sendTyped(
      "POST",
      CategoryResponseSchema,
      `/budgets/${budget}/categories`,
      { category: fields },
    );
    return data.data.category;
  }

  async updateCategory(budget: string, categoryId: string, fields: SaveCategoryFields) {
    const data = await this.sendTyped(
      "PATCH",
      CategoryResponseSchema,
      `/budgets/${budget}/categories/${categoryId}`,
      { category: fields },
    );
    return data.data.category;
  }

  async createCategoryGroup(budget: string, name: string) {
    const data = await this.sendTyped(
      "POST",
      CategoryGroupResponseSchema,
      `/budgets/${budget}/category_groups`,
      { category_group: { name } },
    );
    return data.data.category_group;
  }

  async updateCategoryGroup(budget: string, categoryGroupId: string, name: string) {
    const data = await this.sendTyped(
      "PATCH",
      CategoryGroupResponseSchema,
      `/budgets/${budget}/category_groups/${categoryGroupId}`,
      { category_group: { name } },
    );
    return data.data.category_group;
  }

  // --- Transactions ---

  async listTransactions(budget: string, opts: ListTransactionsOptions = {}) {
    const params = new URLSearchParams();
    if (opts.since_date) params.set("since_date", opts.since_date);
    if (opts.until_date) params.set("until_date", opts.until_date);
    if (opts.type) params.set("type", opts.type);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const path = opts.account_id
      ? `/budgets/${budget}/accounts/${opts.account_id}/transactions${qs}`
      : `/budgets/${budget}/transactions${qs}`;
    const data = await this.getTyped(TransactionsResponseSchema, path);
    return data.data.transactions;
  }

  async getTransaction(budget: string, transactionId: string) {
    const data = await this.getTyped(
      TransactionResponseSchema,
      `/budgets/${budget}/transactions/${transactionId}`,
    );
    return data.data.transaction;
  }

  async createTransaction(budget: string, fields: SaveTxnFields) {
    const data = await this.sendTyped(
      "POST",
      TransactionResponseSchema,
      `/budgets/${budget}/transactions`,
      { transaction: buildSaveTransaction(fields) },
    );
    return data.data.transaction;
  }

  async updateTransaction(budget: string, transactionId: string, fields: SaveTxnFields) {
    const data = await this.sendTyped(
      "PUT",
      TransactionResponseSchema,
      `/budgets/${budget}/transactions/${transactionId}`,
      { transaction: buildSaveTransaction(fields) },
    );
    return data.data.transaction;
  }

  async bulkUpdateTransactions(budget: string, updates: BulkTxnUpdate[]) {
    const data = await this.sendTyped(
      "PATCH",
      BulkTransactionsResponseSchema,
      `/budgets/${budget}/transactions`,
      buildBulkTransactionsBody(updates),
    );
    return data.data;
  }

  async bulkCreateTransactions(budget: string, items: SaveTxnFields[]) {
    const data = await this.sendTyped(
      "POST",
      BulkTransactionsResponseSchema,
      `/budgets/${budget}/transactions`,
      buildBulkCreateBody(items),
    );
    return data.data;
  }

  async deleteTransaction(budget: string, transactionId: string) {
    const r = await this.rawFetch("DELETE", `/budgets/${budget}/transactions/${transactionId}`);
    const json: unknown = await r.json();
    return TransactionResponseSchema.parse(json).data.transaction;
  }

  async importTransactions(budget: string) {
    const data = await this.sendTyped(
      "POST",
      ImportResponseSchema,
      `/budgets/${budget}/transactions/import`,
      {},
    );
    return data.data.transaction_ids;
  }

  async listPayeeTransactions(budget: string, payeeId: string, opts: ListTransactionsOptions = {}) {
    const params = new URLSearchParams();
    if (opts.since_date) params.set("since_date", opts.since_date);
    if (opts.until_date) params.set("until_date", opts.until_date);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const data = await this.getTyped(
      TransactionsResponseSchema,
      `/budgets/${budget}/payees/${payeeId}/transactions${qs}`,
    );
    return data.data.transactions;
  }

  async listCategoryTransactions(
    budget: string,
    categoryId: string,
    opts: ListTransactionsOptions = {},
  ) {
    const params = new URLSearchParams();
    if (opts.since_date) params.set("since_date", opts.since_date);
    if (opts.until_date) params.set("until_date", opts.until_date);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const data = await this.getTyped(
      TransactionsResponseSchema,
      `/budgets/${budget}/categories/${categoryId}/transactions${qs}`,
    );
    return data.data.transactions;
  }

  async listMonthTransactions(budget: string, month: string, opts: ListTransactionsOptions = {}) {
    const params = new URLSearchParams();
    if (opts.since_date) params.set("since_date", opts.since_date);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const data = await this.getTyped(
      TransactionsResponseSchema,
      `/budgets/${budget}/months/${month}/transactions${qs}`,
    );
    return data.data.transactions;
  }

  // --- Scheduled transactions ---

  async listScheduledTransactions(budget: string) {
    const data = await this.getTyped(
      ScheduledTransactionsResponseSchema,
      `/budgets/${budget}/scheduled_transactions`,
    );
    return data.data.scheduled_transactions;
  }

  async getScheduledTransaction(budget: string, scheduledTransactionId: string) {
    const data = await this.getTyped(
      ScheduledTransactionResponseSchema,
      `/budgets/${budget}/scheduled_transactions/${scheduledTransactionId}`,
    );
    return data.data.scheduled_transaction;
  }

  async createScheduledTransaction(budget: string, fields: SaveScheduledTxnFields) {
    const data = await this.sendTyped(
      "POST",
      ScheduledTransactionResponseSchema,
      `/budgets/${budget}/scheduled_transactions`,
      { scheduled_transaction: buildSaveScheduledTransaction(fields) },
    );
    return data.data.scheduled_transaction;
  }

  async updateScheduledTransaction(
    budget: string,
    scheduledTransactionId: string,
    fields: SaveScheduledTxnFields,
  ) {
    const data = await this.sendTyped(
      "PUT",
      ScheduledTransactionResponseSchema,
      `/budgets/${budget}/scheduled_transactions/${scheduledTransactionId}`,
      { scheduled_transaction: buildSaveScheduledTransaction(fields) },
    );
    return data.data.scheduled_transaction;
  }

  async deleteScheduledTransaction(budget: string, scheduledTransactionId: string) {
    const r = await this.rawFetch(
      "DELETE",
      `/budgets/${budget}/scheduled_transactions/${scheduledTransactionId}`,
    );
    const json: unknown = await r.json();
    return ScheduledTransactionResponseSchema.parse(json).data.scheduled_transaction;
  }

  // --- Months ---

  async listMonths(budget: string) {
    const data = await this.getTyped(MonthsResponseSchema, `/budgets/${budget}/months`);
    return data.data.months;
  }

  async getMonth(budget: string, month: string) {
    const data = await this.getTyped(MonthResponseSchema, `/budgets/${budget}/months/${month}`);
    return data.data.month;
  }

  // --- Payees ---

  async listPayees(budget: string) {
    const data = await this.getTyped(PayeesResponseSchema, `/budgets/${budget}/payees`);
    return data.data.payees;
  }

  async getPayee(budget: string, payeeId: string) {
    const data = await this.getTyped(PayeeResponseSchema, `/budgets/${budget}/payees/${payeeId}`);
    return data.data.payee;
  }

  async updatePayee(budget: string, payeeId: string, name: string) {
    const data = await this.sendTyped(
      "PATCH",
      PayeeResponseSchema,
      `/budgets/${budget}/payees/${payeeId}`,
      { payee: { name } },
    );
    return data.data.payee;
  }

  // --- Payee locations (read-only; GPS data set by the mobile app) ---

  async listPayeeLocations(budget: string) {
    const data = await this.getTyped(
      PayeeLocationsResponseSchema,
      `/budgets/${budget}/payee_locations`,
    );
    return data.data.payee_locations;
  }

  async getPayeeLocation(budget: string, payeeLocationId: string) {
    const data = await this.getTyped(
      PayeeLocationResponseSchema,
      `/budgets/${budget}/payee_locations/${payeeLocationId}`,
    );
    return data.data.payee_location;
  }

  async listPayeeLocationsForPayee(budget: string, payeeId: string) {
    const data = await this.getTyped(
      PayeeLocationsResponseSchema,
      `/budgets/${budget}/payees/${payeeId}/payee_locations`,
    );
    return data.data.payee_locations;
  }
}
