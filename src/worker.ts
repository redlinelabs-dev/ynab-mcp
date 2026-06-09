import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

import { handleTool, TOOLS } from "./tools.js";
import { isToolEnabled } from "./toolsets.js";
import { makeToolContext } from "./worker-config.js";

interface Env {
  YNAB_DEV_TOKEN: string;
}

export class YnabMCP extends McpAgent<Env> {
  server = new Server({ name: "ynab", version: "0.1.0" }, { capabilities: { tools: {} } });

  async init() {
    const ctx = makeToolContext(this.env.YNAB_DEV_TOKEN);

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS.filter((t) =>
        isToolEnabled(ctx.enabledGroups, ctx.readOnly, t.group, t.write),
      ).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
  }
}

export default YnabMCP.serve("/mcp");
