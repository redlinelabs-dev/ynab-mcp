// YNAB amounts are in milliunits: 1000 milliunits = one currency unit.

/** Convert a milliunit amount to currency units (e.g. -15000 → -15). */
export function units(milli: number): number {
  return Math.round(milli) / 1000;
}
