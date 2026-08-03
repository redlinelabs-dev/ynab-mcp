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
//
// The rendering itself is pure and lives in ./reference-format.ts (unit-tested); this file
// is the thin bootstrap that wires it to the filesystem and `dist/`, matching the root
// package's src/index.ts convention — see CLAUDE.md and issue #28.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolGroup } from "../../dist/toolsets.js";

import { TOOLS } from "../../dist/tools.js";
import { ALL_GROUPS } from "../../dist/toolsets.js";
import { renderGroupPage } from "./reference-format.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, "..");
const PREAMBLE_DIR = join(__dirname, "preambles");
const OUT_DIR = join(SITE_ROOT, "src", "content", "docs", "reference");

function readPreamble(group: ToolGroup): string {
  const path = join(PREAMBLE_DIR, `${group}.md`);
  return existsSync(path) ? readFileSync(path, "utf8").trimEnd() : "";
}

function main(): void {
  for (const group of ALL_GROUPS) {
    const tools = TOOLS.filter((t) => t.group === group);
    const content = renderGroupPage(group, tools, readPreamble(group));
    writeFileSync(join(OUT_DIR, `${group}.md`), content);
  }
  console.error(`[generate-reference] wrote ${ALL_GROUPS.length} reference page(s) to ${OUT_DIR}`);
}

main();
