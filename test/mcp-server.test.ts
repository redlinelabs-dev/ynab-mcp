import { describe, expect, it } from "vitest";

import type { ToolDef } from "../src/tools.js";

import { toolAnnotations, toolTitle } from "../src/mcp-server.js";

function tool(name: string, write: boolean): ToolDef {
  return {
    name,
    group: "transactions",
    write,
    description: "",
    inputSchema: { type: "object", properties: {} },
    endpoints: [],
  };
}

describe("toolAnnotations", () => {
  it("marks a read tool read-only with no destructive hint", () => {
    expect(toolAnnotations(tool("list_payees", false))).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
    });
  });

  it.each(["create_payee", "bulk_create_transactions", "import_transactions"])(
    "treats %s as additive",
    (name) => {
      expect(toolAnnotations(tool(name, true))).toMatchObject({ destructiveHint: false });
    },
  );

  it.each(["update_payee", "bulk_update_transactions", "delete_transaction"])(
    "treats %s as destructive",
    (name) => {
      expect(toolAnnotations(tool(name, true))).toMatchObject({ destructiveHint: true });
    },
  );
});

describe("toolTitle", () => {
  it("title-cases each underscore-separated word", () => {
    expect(toolTitle("bulk_update_transactions")).toBe("Bulk Update Transactions");
  });

  it("capitalizes a single-word name", () => {
    expect(toolTitle("ping")).toBe("Ping");
  });
});
