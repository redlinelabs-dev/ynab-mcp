// Generates site/src/content/docs/reference/<group>.md — one Starlight page per toolset
// group — from the `TOOLS` array in ../../src/tools.ts (imported from the compiled
// ../../dist/tools.js, so this script needs `npm run build` to have run at the root
// first; the site build and the Pages workflow both do that before this).
//
// Each group page is: a hand-written plain-english preamble (scripts/preambles/<group>.md,
// read and re-emitted unchanged — regenerating never clobbers the prose) followed by a
// generated section per tool, marked off so it's obvious which half is which. Re-running
// this on an unchanged TOOLS array produces byte-identical output (issue #14).
//
// Deliberately plain Node + fs, no templating engine — this is a small, mechanical
// transform and the repo's lint rules (no `any`, no `as`) apply here too.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Endpoint, ToolDef } from "../../dist/tools.js";
import type { ToolGroup } from "../../dist/toolsets.js";

import { TOOLS } from "../../dist/tools.js";
import { ALL_GROUPS } from "../../dist/toolsets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, "..");
const PREAMBLE_DIR = join(__dirname, "preambles");
const OUT_DIR = join(SITE_ROOT, "src", "content", "docs", "reference");

const GROUP_TITLES: Record<ToolGroup, string> = {
  budgets: "Budgets",
  accounts: "Accounts",
  categories: "Categories",
  transactions: "Transactions",
  months: "Months",
  payees: "Payees",
  scheduled: "Scheduled transactions",
  money_movements: "Money movements",
};

// The frontmatter `description` for each group page — Starlight turns it into the page's
// <meta name="description"> and og:description.
//
// Hand-written per group rather than templated from the group name and tool count, because
// one string reshaped eight ways is exactly the boilerplate Google names as a reason to
// ignore a description and rewrite a title. Each of these says what its toolset actually
// does, and, like every other claim on this site, has to be falsifiable against `TOOLS` —
// keep them true when tools are added or removed.
const GROUP_DESCRIPTIONS: Record<ToolGroup, string> = {
  budgets:
    "List the YNAB budgets this server can reach, read one by id or the last-used / default " +
    "alias, check its currency and date-format settings, and confirm which YNAB user it is " +
    "authenticated as.",
  accounts:
    "List and read the accounts in a YNAB budget, and create manual ones. Linking an account " +
    "to a bank is possible only in the YNAB app, so no tool here can do it.",
  categories:
    "Read category groups, categories, and a category's figures for a given month — then " +
    "rename them, move them between groups, or set a month's budgeted amount in milliunits.",
  transactions:
    "The largest toolset: browse transactions by account, category, payee, or month; create " +
    "them, splits included; update, delete, and bulk-write many in one API call; flag likely " +
    "duplicates; and summarise spending without reading every row.",
  months:
    "Read a YNAB budget's monthly summaries — income, budgeted, activity, and to-be-budgeted — " +
    "for every month or for one month with its full category breakdown.",
  payees:
    "List, read, create, and rename the payees in a YNAB budget, and read the GPS locations " +
    "the YNAB mobile app recorded against them. The location tools are read-only.",
  scheduled:
    "Create, read, update, and delete YNAB scheduled transactions — the recurring or " +
    "future-dated templates themselves, with their next date and frequency.",
  money_movements:
    "Read YNAB's money movement records, across a whole budget or scoped to one month, " +
    "individually or by group. Every tool in this toolset is read-only.",
};

// Field names that carry a monetary amount in milliunits (1000 = one currency unit) —
// see CLAUDE.md. Anything in this set gets a callout on the tool's page. Kept as a flat
// name set rather than inferred from the JSON schema because the schema has no type that
// distinguishes "a number" from "a number of milliunits" — YNAB's own convention is the
// field name.
const MILLIUNIT_FIELDS = new Set(["amount", "balance", "budgeted", "goal_target"]);

type JsonSchemaProp = {
  type?: string;
  enum?: unknown[];
  description?: string;
  items?: { type?: string; properties?: Record<string, unknown> };
  default?: unknown;
};

function isJsonSchemaProp(value: unknown): value is JsonSchemaProp {
  return typeof value === "object" && value !== null;
}

function typeOf(raw: unknown): string {
  if (!isJsonSchemaProp(raw)) return "unknown";
  if (Array.isArray(raw.enum)) return `enum: ${raw.enum.map(String).join(" | ")}`;
  if (raw.type === "array") {
    const items = raw.items;
    if (items && items.type === "object" && items.properties) {
      const fields = Object.keys(items.properties).join(", ");
      return `array of object (${fields})`;
    }
    return `array${items?.type ? ` of ${items.type}` : ""}`;
  }
  return raw.type ?? "unknown";
}

function propDescription(raw: unknown): string {
  return isJsonSchemaProp(raw) && raw.description ? raw.description : "";
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function paramsTable(tool: ToolDef): string {
  const props = Object.entries(tool.inputSchema.properties);
  if (props.length === 0) return "_No parameters._";
  const required = new Set(tool.inputSchema.required ?? []);
  const rows = props.map(([name, schema]) => {
    const req = required.has(name) ? "✓" : "";
    return `| \`${name}\` | ${escapeCell(typeOf(schema))} | ${req} | ${escapeCell(propDescription(schema))} |`;
  });
  return ["| Name | Type | Required | Description |", "|---|---|---|---|", ...rows].join("\n");
}

function milliunitsNote(tool: ToolDef): string | null {
  const props = Object.keys(tool.inputSchema.properties);
  const fields = props.filter((p) => MILLIUNIT_FIELDS.has(p));
  if (fields.length === 0) return null;
  const list = fields.map((f) => `\`${f}\``).join(", ");
  return `<div class="tool-milliunits">**Milliunits:** ${list} — 1000 = one currency unit.</div>`;
}

function endpointLine(endpoint: Endpoint): string {
  const [, tagAndOp] = endpoint.opAnchor.split("#/");
  return `- **${endpoint.method}** \`${endpoint.path}\` → [${tagAndOp}](${endpoint.opAnchor})`;
}

function renderTool(tool: ToolDef): string {
  const badgeClass = tool.write ? "tool-badge-write" : "tool-badge-read";
  const badgeText = tool.write ? "WRITE" : "READ";
  const badge = `<span class="tool-badge ${badgeClass}">${badgeText}</span>`;
  const note = milliunitsNote(tool);
  const lines = [`### \`${tool.name}\` ${badge}`, "", tool.description];
  if (note) lines.push("", note);
  lines.push(
    "",
    "**Parameters**",
    "",
    paramsTable(tool),
    "",
    "**YNAB API**",
    "",
    tool.endpoints.map(endpointLine).join("\n"),
  );
  return lines.join("\n");
}

function readPreamble(group: ToolGroup): string {
  const path = join(PREAMBLE_DIR, `${group}.md`);
  return existsSync(path) ? readFileSync(path, "utf8").trimEnd() : "";
}

function renderGroupPage(group: ToolGroup): string {
  const tools = TOOLS.filter((t) => t.group === group).sort((a, b) => a.name.localeCompare(b.name));
  const title = `Reference: ${GROUP_TITLES[group]}`;
  const description = GROUP_DESCRIPTIONS[group];
  const preamble = readPreamble(group);
  const generatedBody = tools.map(renderTool).join("\n\n");
  return [
    "---",
    `title: "${title}"`,
    `description: "${description}"`,
    "---",
    "",
    "<!--",
    "  This page is generated by site/scripts/generate-reference.ts from src/tools.ts.",
    "  The section above the GENERATED marker is hand-written prose",
    `  (site/scripts/preambles/${group}.md) and survives regeneration. Everything from the`,
    "  marker down is regenerated on every run — hand edits below it will be overwritten.",
    "-->",
    "",
    preamble,
    "",
    "## Tools",
    "",
    "<!-- GENERATED:BEGIN -->",
    "",
    generatedBody,
    "",
    "<!-- GENERATED:END -->",
    "",
  ].join("\n");
}

function main(): void {
  for (const group of ALL_GROUPS) {
    const content = renderGroupPage(group);
    writeFileSync(join(OUT_DIR, `${group}.md`), content);
  }
  console.error(`[generate-reference] wrote ${ALL_GROUPS.length} reference page(s) to ${OUT_DIR}`);
}

main();
