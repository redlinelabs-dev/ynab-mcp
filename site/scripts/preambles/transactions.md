The largest group — browsing, creating, updating, and deleting the individual money movements on
an account. A few tools are worth calling out:

- **Splits.** `create_transaction` and `bulk_create_transactions` accept a `subtransactions` array
  to split one transaction across several categories (e.g. a Target run that's half groceries,
  half household). Set the parent `category_id` to `null` and make the leg amounts sum to the
  parent `amount`. YNAB only supports splitting on create — there's no API to change a split's
  legs after the fact.
- **Duplicates.** `find_duplicate_transactions` finds candidates (same account, amount, and date)
  and returns them for review. It never deletes anything; pair it with `delete_transaction` once
  you've confirmed which one is the duplicate.
- **Bulk operations.** `bulk_update_transactions` and `bulk_create_transactions` do many
  transactions in one API call — prefer them over a loop of single calls, both for speed and
  because the YNAB API is rate-limited to 200 requests/hour (see
  [why the rate limit matters and which tools avoid it](/trust/#the-rate-limit-is-real-and-shared)).
- **Import.** `import_transactions` triggers a refresh on accounts already bank-linked in the YNAB
  app. It cannot create that link — see
  [the Accounts toolset](/reference/accounts/) and
  [why bank linking is impossible here](/trust/#what-this-server-cannot-do).

Every `amount` on this page is in [milliunits](/how-it-works/#milliunits): `12340` is $12.34, and
an outflow is negative. Six of the thirteen tools write; running read-only leaves only the
browsing, duplicate-detection, and summary tools — see
[what read-only actually changes](/trust/#read-only-by-default).
