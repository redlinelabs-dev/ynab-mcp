import type { VersionNegotiationMode } from "@modelcontextprotocol/client";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";

import type { ToolContext } from "../src/tools.js";

import { YnabClient } from "../src/client.js";
import { buildMcpHttpHandler } from "../src/mcp-server.js";
import { TOOLS } from "../src/tools.js";
import { parseToolsets } from "../src/toolsets.js";

const budgets = { data: { budgets: [{ id: "b1", name: "Home" }] } };

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  const ynabFetch: typeof fetch = () =>
    Promise.resolve(new Response(JSON.stringify(budgets), { status: 200 }));
  return {
    client: new YnabClient("tok", ynabFetch),
    enabledGroups: parseToolsets("all"),
    readOnly: false,
    defaultBudget: "last-used",
    ...over,
  };
}

// Drive the handler in-process: the URL is never dialed.
async function connect(mode: VersionNegotiationMode, toolCtx: ToolContext = ctx()) {
  const handler = buildMcpHttpHandler(toolCtx);
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: "test", version: "0.0.0" }, { versionNegotiation: { mode } });
  await client.connect(transport);
  return client;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test.local/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("buildMcpHttpHandler", () => {
  it("serves a 2025-era client over the initialize handshake", async () => {
    const client = await connect("legacy");

    expect(client.getProtocolEra()).toBe("legacy");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("list_budgets");
    const result = await client.callTool({ name: "list_budgets", arguments: {} });
    expect(JSON.stringify(result.content)).toContain("Home");
  });

  it("serves a 2026-07-28 client without a handshake", async () => {
    const client = await connect({ pin: "2026-07-28" });

    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
    const result = await client.callTool({ name: "list_budgets", arguments: {} });
    expect(JSON.stringify(result.content)).toContain("Home");
  });

  // SSE is buffered by Tailscale `serve` / reverse proxies, which hangs tool calls
  // for clients behind them — both eras must answer with a plain JSON body.
  it("answers 2025-era requests with JSON, not an SSE stream", async () => {
    const handler = buildMcpHttpHandler(ctx());

    const res = await handler.fetch(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  });

  // toNodeHandler aborts request.signal when the client disconnects; a 2025-era
  // exchange must release its transport then, not when the upstream call returns.
  it("settles a 2025-era request when the client disconnects mid-call", async () => {
    const hangingYnab: typeof fetch = () => new Promise<Response>(() => {});
    const handler = buildMcpHttpHandler(ctx({ client: new YnabClient("tok", hangingYnab) }));
    const disconnect = new AbortController();
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_budgets" } };

    const pending = handler.fetch(new Request(post(call), { signal: disconnect.signal }), {
      parsedBody: call,
    });
    setTimeout(() => disconnect.abort(), 20);

    const settled = await Promise.race([
      pending.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 1000)),
    ]);
    expect(settled).toBe("settled");
  });

  it("settles a 2026-era request when the client disconnects mid-call", async () => {
    const hangingYnab: typeof fetch = () => new Promise<Response>(() => {});
    const handler = buildMcpHttpHandler(ctx({ client: new YnabClient("tok", hangingYnab) }));
    const disconnect = new AbortController();
    const call = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_budgets",
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    const headers = {
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": "list_budgets",
    };

    const pending = handler.fetch(new Request(post(call, headers), { signal: disconnect.signal }), {
      parsedBody: call,
    });
    setTimeout(() => disconnect.abort(), 20);

    const settled = await Promise.race([
      pending.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 1000)),
    ]);
    expect(settled).toBe("settled");
  });

  it("marks read tools read-only and deletes destructive", async () => {
    const client = await connect("legacy");

    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("list_budgets")?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });
    expect(byName.get("delete_transaction")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(byName.get("create_transaction")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it("advertises every tool's input schema unchanged", async () => {
    const client = await connect("legacy");

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(TOOLS.length);
    for (const t of TOOLS) {
      expect(tools.find((x) => x.name === t.name)?.inputSchema).toEqual(t.inputSchema);
    }
  });

  it("gives every tool a human-readable title", async () => {
    const client = await connect("legacy");

    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "list_budgets")?.title).toBe("List Budgets");
  });

  it("hides write tools from a read-only context on both eras", async () => {
    for (const mode of ["legacy", { pin: "2026-07-28" }] satisfies VersionNegotiationMode[]) {
      const client = await connect(mode, ctx({ readOnly: true }));

      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain("list_budgets");
      expect(names).not.toContain("delete_transaction");
    }
  });

  it("refuses a hidden write tool called directly on both eras", async () => {
    for (const mode of ["legacy", { pin: "2026-07-28" }] satisfies VersionNegotiationMode[]) {
      const client = await connect(mode, ctx({ readOnly: true }));

      const result = await client.callTool({
        name: "delete_transaction",
        arguments: { transaction_id: "t1" },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toMatch(/not enabled/);
    }
  });
});
