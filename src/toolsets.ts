// ============================================================================
// Toolset gating — pure logic, parameterized by the parsed env values.
//
// Operators choose which tool groups load to keep the model's context lean,
// along two orthogonal axes:
//   YNAB_TOOLSETS   — comma-separated group names, or "all" (default)
//   YNAB_READ_ONLY  — "true"/"1"/"yes" exposes only non-mutating tools
// ============================================================================

export type ToolGroup =
  | "budgets"
  | "accounts"
  | "categories"
  | "transactions"
  | "months"
  | "payees"
  | "scheduled";

export const ALL_GROUPS: ToolGroup[] = [
  "budgets",
  "accounts",
  "categories",
  "transactions",
  "months",
  "payees",
  "scheduled",
];

export function isToolGroup(s: string): s is ToolGroup {
  return ALL_GROUPS.filter((g) => g === s).length > 0;
}

/** Parse YNAB_TOOLSETS into a set of groups. Empty/"all"/undefined → every group. */
export function parseToolsets(raw: string | undefined): Set<ToolGroup> {
  const value = (raw ?? "all").trim().toLowerCase();
  if (value === "" || value === "all") {
    return new Set<ToolGroup>(ALL_GROUPS);
  }
  const tokens = value
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
}

export function parseReadOnly(raw: string | undefined): boolean {
  return ["1", "true", "yes"].includes((raw ?? "").trim().toLowerCase());
}

export function isToolEnabled(
  enabledGroups: Set<ToolGroup>,
  readOnly: boolean,
  group: ToolGroup,
  write: boolean,
): boolean {
  return enabledGroups.has(group) && (!readOnly || !write);
}
