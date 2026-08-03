import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { gitLastModified, sourceFileFor } from "../scripts/lastmod.ts";

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("sourceFileFor", () => {
  it("maps the root path to the landing page", () => {
    expect(sourceFileFor("/", SITE_ROOT)).toBe(join(SITE_ROOT, "src", "pages", "index.astro"));
  });

  it("maps a flat doc slug to its .md file", () => {
    expect(sourceFileFor("/reference/budgets/", SITE_ROOT)).toBe(
      join(SITE_ROOT, "src", "content", "docs", "reference", "budgets.md"),
    );
  });

  it("maps a nested doc slug to its index.md file", () => {
    expect(sourceFileFor("/host-your-own/", SITE_ROOT)).toBe(
      join(SITE_ROOT, "src", "content", "docs", "host-your-own", "index.md"),
    );
  });

  it("tolerates a slug with no leading or trailing slash", () => {
    expect(sourceFileFor("reference/budgets", SITE_ROOT)).toBe(
      join(SITE_ROOT, "src", "content", "docs", "reference", "budgets.md"),
    );
  });

  it("returns undefined for a slug with no matching source file", () => {
    expect(sourceFileFor("/does-not-exist/", SITE_ROOT)).toBeUndefined();
  });
});

describe("gitLastModified", () => {
  it("returns an ISO date for a tracked file", () => {
    const file = join(SITE_ROOT, "astro.config.mjs");
    const iso = gitLastModified(file, SITE_ROOT);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("returns undefined for a file with no git history", () => {
    const file = join(SITE_ROOT, "src", "content", "docs", "does-not-exist.md");
    expect(gitLastModified(file, SITE_ROOT)).toBeUndefined();
  });
});
