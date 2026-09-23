// The MCP Server wiring, shared by every transport (stdio in index.ts, HTTP in
// server.ts). Given a ToolContext, registers the tools/list + tools/call handlers —
// toolset/read-only gating on list, Zod-aware error wrapping on call — and wraps
// it in an HTTP handler that serves both protocol eras (2025-era handshake and
// the 2026-07-28 per-request envelope) from one endpoint.

import type { ListToolsResult, ToolAnnotations } from "@modelcontextprotocol/server";

import {
  createMcpHandler,
  isLegacyRequest,
  Server,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import type { ToolContext, ToolDef } from "./tools.js";

import { handleTool, TOOLS } from "./tools.js";
import { isToolEnabled } from "./toolsets.js";

const SERVER_INFO = { name: "ynab", version: "0.2.2" }; // x-release-please-version

// Tool input schemas are authored as plain (partly readonly) literals in tools.ts;
// parsing them once into the SDK's JSON-value shape avoids a type assertion.
const ToolInputSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.json()).optional(),
  required: z.array(z.string()).optional(),
});
const LISTED_TOOLS = TOOLS.map((t) => ({
  def: t,
  inputSchema: ToolInputSchema.parse(t.inputSchema),
}));

// Tools that only add records (never overwrite or remove existing ones).
const ADDITIVE = /^(create_|bulk_create_|import_)/;

export function toolAnnotations(t: ToolDef): ToolAnnotations {
  return {
    readOnlyHint: !t.write,
    ...(t.write ? { destructiveHint: !ADDITIVE.test(t.name) } : {}),
    openWorldHint: true,
  };
}

// "list_budgets" → "List Budgets"
export function toolTitle(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildMcpServer(ctx: ToolContext): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(
    "tools/list",
    async (): Promise<ListToolsResult> => ({
      tools: LISTED_TOOLS.filter(({ def: t }) =>
        isToolEnabled(ctx.enabledGroups, ctx.readOnly, t.group, t.write),
      ).map(({ def: t, inputSchema }) => ({
        name: t.name,
        title: toolTitle(t.name),
        description: t.description,
        inputSchema,
        annotations: toolAnnotations(t),
      })),
    }),
  );

  server.setRequestHandler("tools/call", async (request) => {
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
      return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

type FetchOptions = Parameters<ReturnType<typeof createMcpHandler>["fetch"]>[1];

export interface McpHttpHandler {
  fetch: (request: Request, options?: FetchOptions) => Promise<Response>;
  close: () => Promise<void>;
}

// One web-standard handler for both protocol eras. Every response is a single
// JSON body, never SSE: SSE gets buffered by reverse proxies (e.g. Tailscale
// `serve`), which makes tool calls hang until the client times out. The SDK's
// built-in 2025-era fallback always streams, so legacy traffic is routed to our
// own stateless JSON transport instead.
export function buildMcpHttpHandler(ctx: ToolContext): McpHttpHandler {
  // Built only if this handler sees a 2026-era request. server.ts makes one handler
  // per HTTP request, so this just skips construction for 2025-era requests.
  let modern: ReturnType<typeof createMcpHandler> | undefined;
  const getModern = () =>
    (modern ??= createMcpHandler(() => buildMcpServer(ctx), {
      legacy: "reject",
      responseMode: "json",
    }));

  async function legacy(request: Request, options?: FetchOptions): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = buildMcpServer(ctx);
    // A client disconnect aborts request.signal (toNodeHandler). Settle then —
    // nobody is left to read the reply — instead of holding the transport open
    // until the in-flight YNAB call returns.
    const disconnected = new Promise<Response>((resolve) => {
      const gone = () => resolve(new Response(null, { status: 499 }));
      if (request.signal.aborted) gone();
      else request.signal.addEventListener("abort", gone, { once: true });
    });
    try {
      await server.connect(transport);
      const reply = transport.handleRequest(request, options);
      reply.catch(() => {}); // may settle after a disconnect already won the race
      return await Promise.race([reply, disconnected]);
    } finally {
      void transport.close();
      void server.close();
    }
  }

  return {
    fetch: async (request, options) =>
      (await isLegacyRequest(request, options?.parsedBody))
        ? legacy(request, options)
        : getModern().fetch(request, options),
    close: async () => {
      await modern?.close();
    },
  };
}
