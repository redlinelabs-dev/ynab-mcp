import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

import type { WorkerKV } from "./worker-helpers.js";

import { oauthConfig } from "./oauth-config.js";
import { handleOAuthAuthorize, handleOAuthCallback } from "./oauth-handler.js";
import { handleTool, TOOLS } from "./tools.js";
import { isToolEnabled } from "./toolsets.js";
import { initFromStorage, makeToolContext } from "./worker-config.js";
import { kvStorage, parseScope } from "./worker-helpers.js";

interface WorkerCtx {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface Env {
  OAUTH_KV: WorkerKV;
  YNAB_DEV_TOKEN?: string;
  YNAB_CLIENT_ID: string;
  YNAB_CLIENT_SECRET: string;
  YNAB_REDIRECT_URI: string;
  COOKIE_SECRET: string;
}

export class YnabMCP extends McpAgent<Env> {
  server = new Server({ name: "ynab", version: "0.1.0" }, { capabilities: { tools: {} } });

  async init() {
    const ctx = this.env.YNAB_DEV_TOKEN
      ? makeToolContext(this.env.YNAB_DEV_TOKEN)
      : (
          await initFromStorage(
            kvStorage(this.env.OAUTH_KV),
            oauthConfig(this.env),
            fetch,
            Date.now(),
          )
        ).ctx;

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

const mcpHandler = YnabMCP.serve("/mcp");

export default {
  async fetch(request: Request, env: Env, ctx: WorkerCtx): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/authorize") {
      return handleOAuthAuthorize(oauthConfig(env), parseScope(new URL(request.url).searchParams));
    }

    if (pathname === "/callback") {
      return handleOAuthCallback(
        request,
        kvStorage(env.OAUTH_KV),
        oauthConfig(env),
        fetch,
        Date.now(),
      );
    }

    return mcpHandler.fetch(request, env, ctx);
  },
};
