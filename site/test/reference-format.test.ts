import { describe, expect, it } from "vitest";

import type { Endpoint, ToolDef } from "../../dist/tools.js";

import {
  endpointLine,
  escapeCell,
  milliunitsNote,
  paramsTable,
  propDescription,
  renderGroupPage,
  renderTool,
  typeOf,
} from "../scripts/reference-format.ts";

describe("typeOf", () => {
  it("reads a plain type", () => {
    expect(typeOf({ type: "string" })).toBe("string");
  });

  it("renders an enum as its pipe-joined values", () => {
    expect(typeOf({ enum: ["red", "green"] })).toBe("enum: red | green");
  });

  it("renders a bare array without an item type", () => {
    expect(typeOf({ type: "array" })).toBe("array");
  });

  it("renders an array of a scalar item type", () => {
    expect(typeOf({ type: "array", items: { type: "string" } })).toBe("array of string");
  });

  it("renders an array of object with its field names", () => {
    const schema = {
      type: "array",
      items: { type: "object", properties: { amount: {}, memo: {} } },
    };
    expect(typeOf(schema)).toBe("array of object (amount, memo)");
  });

  it("falls back to unknown for a non-object schema", () => {
    expect(typeOf(null)).toBe("unknown");
    expect(typeOf(undefined)).toBe("unknown");
  });

  it("falls back to unknown when a schema has no type or enum", () => {
    expect(typeOf({})).toBe("unknown");
  });
});

describe("propDescription", () => {
  it("returns the description when present", () => {
    expect(propDescription({ description: "The budget id." })).toBe("The budget id.");
  });

  it("returns an empty string when absent", () => {
    expect(propDescription({})).toBe("");
    expect(propDescription(null)).toBe("");
  });
});

describe("escapeCell", () => {
  it("escapes pipes and collapses newlines", () => {
    expect(escapeCell("a | b\nc")).toBe("a \\| b c");
  });
});

const budgetIdTool: ToolDef = {
  name: "get_budget",
  group: "budgets",
  write: false,
  description: "Read a single budget.",
  inputSchema: {
    type: "object",
    properties: {
      budget_id: { type: "string", description: "Budget id or alias." },
    },
  },
  endpoints: [
    {
      method: "GET",
      path: "/budgets/{budget_id}",
      opAnchor: "https://api.ynab.com/v1#/Budgets/getBudgetById",
    },
  ],
};

const writeTool: ToolDef = {
  name: "update_category_budget",
  group: "categories",
  write: true,
  description: "Set a category's budgeted amount for a month.",
  inputSchema: {
    type: "object",
    properties: {
      category_id: { type: "string" },
      budgeted: { type: "number", description: "Milliunits." },
    },
    required: ["category_id", "budgeted"],
  },
  endpoints: [
    {
      method: "PATCH",
      path: "/budgets/{budget_id}/months/{month}/categories/{category_id}",
      opAnchor: "https://api.ynab.com/v1#/Categories/updateMonthCategory",
    },
  ],
};

describe("paramsTable", () => {
  it("renders a table row per property with the required marker", () => {
    const table = paramsTable(writeTool);
    expect(table).toContain("| `category_id` | string | ✓ |  |");
    expect(table).toContain("| `budgeted` | number | ✓ | Milliunits. |");
  });

  it("renders a placeholder for a tool with no parameters", () => {
    const tool: ToolDef = { ...budgetIdTool, inputSchema: { type: "object", properties: {} } };
    expect(paramsTable(tool)).toBe("_No parameters._");
  });
});

describe("milliunitsNote", () => {
  it("returns null when no field carries milliunits", () => {
    expect(milliunitsNote(budgetIdTool)).toBeNull();
  });

  it("lists milliunit fields when present", () => {
    expect(milliunitsNote(writeTool)).toBe(
      '<div class="tool-milliunits">**Milliunits:** `budgeted` — 1000 = one currency unit.</div>',
    );
  });
});

describe("endpointLine", () => {
  it("renders the method, path, and a link built from the anchor", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/budgets",
      opAnchor: "https://api.ynab.com/v1#/Budgets/getBudgets",
    };
    expect(endpointLine(endpoint)).toBe(
      "- **GET** `/budgets` → [Budgets/getBudgets](https://api.ynab.com/v1#/Budgets/getBudgets)",
    );
  });
});

describe("renderTool", () => {
  it("badges a read tool and omits the milliunits callout", () => {
    const rendered = renderTool(budgetIdTool);
    expect(rendered).toContain('<span class="tool-badge tool-badge-read">READ</span>');
    expect(rendered).not.toContain("tool-milliunits");
  });

  it("badges a write tool and includes the milliunits callout", () => {
    const rendered = renderTool(writeTool);
    expect(rendered).toContain('<span class="tool-badge tool-badge-write">WRITE</span>');
    expect(rendered).toContain("tool-milliunits");
  });
});

describe("renderGroupPage", () => {
  it("sorts tools by name, keeps the preamble verbatim, and marks the generated section", () => {
    const page = renderGroupPage(
      "budgets",
      [
        { ...writeTool, name: "z_tool", group: "budgets" },
        { ...budgetIdTool, name: "a_tool" },
      ],
      "Hand-written intro.",
    );
    expect(page).toContain('title: "Reference: Budgets"');
    expect(page).toContain("Hand-written intro.");
    const aIndex = page.indexOf("### `a_tool`");
    const zIndex = page.indexOf("### `z_tool`");
    expect(aIndex).toBeGreaterThan(-1);
    expect(zIndex).toBeGreaterThan(aIndex);
    expect(page).toContain("<!-- GENERATED:BEGIN -->");
    expect(page).toContain("<!-- GENERATED:END -->");
  });
});
