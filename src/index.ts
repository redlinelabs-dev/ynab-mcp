#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildMcpServer } from "./mcp-server.js";
import { buildStdioContext } from "./stdio-config.js";
import { enabledToolNames } from "./tools.js";

// --- Config ---

const result = buildStdioContext(process.env);

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

const { ctx, demo } = result;

if (demo) {
  console.error("[ynab-mcp] Demo mode: serving a fictional Demo Budget — no YNAB account needed.");
}

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
