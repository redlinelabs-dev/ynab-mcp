#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { ToolContext } from "./tools.js";

import { YnabClient } from "./client.js";
import { buildMcpServer } from "./mcp-server.js";
import { enabledToolNames } from "./tools.js";
import { parseReadOnly, parseToolsets } from "./toolsets.js";

// --- Config ---

const TOKEN = process.env["YNAB_TOKEN"] ?? "";
const DEFAULT_BUDGET = (process.env["YNAB_BUDGET_ID"] ?? "last-used").trim() || "last-used";

if (!TOKEN) {
  console.error(
    "Set YNAB_TOKEN to a YNAB Personal Access Token (Account Settings > Developer Settings).",
  );
  process.exit(1);
}

const ctx: ToolContext = {
  client: new YnabClient(TOKEN),
  enabledGroups: parseToolsets(process.env["YNAB_TOOLSETS"]),
  readOnly: parseReadOnly(process.env["YNAB_READ_ONLY"]),
  defaultBudget: DEFAULT_BUDGET,
};

if (enabledToolNames(ctx).size === 0) {
  console.error("[ynab-mcp] No tools enabled — check YNAB_TOOLSETS / YNAB_READ_ONLY.");
}

// --- Server bootstrap ---

const server = buildMcpServer(ctx);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YNAB MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
