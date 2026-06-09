#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ToolContext } from "./tools.js";

import { YnabClient } from "./client.js";
import { enabledToolNames, handleTool, TOOLS } from "./tools.js";
import { isToolEnabled, parseReadOnly, parseToolsets } from "./toolsets.js";

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

const server = new Server({ name: "ynab", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.filter((t) => isToolEnabled(ctx.enabledGroups, ctx.readOnly, t.group, t.write)).map(
    (t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }),
  ),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const text = await handleTool(ctx, request.params.name, request.params.arguments ?? {});
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? `Validation error: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YNAB MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
