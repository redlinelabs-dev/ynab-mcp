// ============================================================================
// Pure config resolution for the stdio bootstrap (`src/index.ts`).
//
// Split out so the "should we exit, and why" logic is unit-testable without
// spawning a process. `YNAB_DEMO` truthy swaps in a fixture-backed `fetch`
// (`src/demo.ts`) and makes `YNAB_TOKEN` optional — no other tool/schema code
// branches on demo mode; this is the only seam.
// ============================================================================

import type { ToolContext } from "./tools.js";

import { YnabClient } from "./client.js";
import { createDemoFetch } from "./demo.js";
import { parseReadOnly, parseToolsets } from "./toolsets.js";

export type StdioConfigResult =
  | { ok: true; ctx: ToolContext; demo: boolean }
  | { ok: false; error: string };

/** `YNAB_DEMO` is truthy: "true" or "1" (case-insensitive, trimmed). */
export function parseDemoFlag(raw: string | undefined): boolean {
  return ["1", "true"].includes((raw ?? "").trim().toLowerCase());
}

export function buildStdioContext(env: NodeJS.ProcessEnv): StdioConfigResult {
  const demo = parseDemoFlag(env["YNAB_DEMO"]);
  const defaultBudget = (env["YNAB_BUDGET_ID"] ?? "last-used").trim() || "last-used";
  const enabledGroups = parseToolsets(env["YNAB_TOOLSETS"]);
  const readOnly = parseReadOnly(env["YNAB_READ_ONLY"]);

  if (demo) {
    const client = new YnabClient("demo-token", createDemoFetch());
    return { ok: true, demo: true, ctx: { client, enabledGroups, readOnly, defaultBudget } };
  }

  const token = (env["YNAB_TOKEN"] ?? "").trim();
  if (!token) {
    return {
      ok: false,
      error:
        "Set YNAB_TOKEN to a YNAB Personal Access Token (Account Settings > Developer Settings), " +
        "or set YNAB_DEMO=1 to try the server against a fictional demo budget with no credentials.",
    };
  }

  const client = new YnabClient(token);
  return { ok: true, demo: false, ctx: { client, enabledGroups, readOnly, defaultBudget } };
}
