// @ts-check
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * The source file a built URL came from, so its `<lastmod>` can be a real date.
 *
 * `/` is the custom landing page; every other route is a Starlight doc, which lives at
 * either `<slug>.md` or `<slug>/index.md`. Returns undefined for anything unrecognised —
 * an unmapped URL gets no lastmod rather than a guessed one.
 */
function sourceFileFor(pathname) {
  if (pathname === "/") return join(SITE_ROOT, "src", "pages", "index.astro");
  const slug = pathname.replace(/^\/|\/$/g, "");
  if (slug === "") return undefined;
  const docs = join(SITE_ROOT, "src", "content", "docs");
  for (const candidate of [join(docs, `${slug}.md`), join(docs, slug, "index.md")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const lastmodCache = new Map();

/**
 * Last commit date for one file, or undefined.
 *
 * Google uses `<lastmod>` only when it is "consistently and verifiably accurate", so this
 * is deliberately the *file's* git history and nothing else — never the build time, which
 * would claim every page changed on every unrelated redeploy. Anything git can't answer
 * (shallow clone, untracked file, no git at all) yields no lastmod for that URL, which is
 * the honest outcome: omitting the tag is fine, stamping a wrong one is not.
 * https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *
 * NB: this needs real history. The Pages workflow checks out with `fetch-depth: 0` for it.
 */
function gitLastModified(file) {
  if (lastmodCache.has(file)) return lastmodCache.get(file);
  let iso;
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", file], {
      cwd: SITE_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    iso = out === "" ? undefined : out;
  } catch {
    iso = undefined;
  }
  lastmodCache.set(file, iso);
  return iso;
}

// Public docs site for ynab-mcp (consumers, not contributors — see ADR-0005).
// Deployed to GitHub Pages behind the custom domain https://ynab-mcp.redlinelabs.dev/
// (CNAME + .nojekyll in public/, path-filtered workflow at .github/workflows/pages.yml).
export default defineConfig({
  site: "https://ynab-mcp.redlinelabs.dev",
  integrations: [
    // Declared explicitly so `serialize` can attach a real per-file lastmod. Starlight
    // adds @astrojs/sitemap itself only when the config doesn't already list it, so this
    // replaces its copy rather than doubling up. No `priority`/`changefreq`: Google
    // disregards both.
    sitemap({
      serialize(item) {
        const file = sourceFileFor(new URL(item.url).pathname);
        const lastmod = file === undefined ? undefined : gitLastModified(file);
        return lastmod === undefined ? item : { ...item, lastmod };
      },
    }),
    starlight({
      title: "ynab-mcp",
      description:
        "An MCP server that connects an AI agent to your YNAB budget — read balances and categories, " +
        "categorize transactions, or just ask questions, without giving the agent your bank.",
      favicon: "/favicon.svg",
      // Starlight's own <head>, plus og:image and BreadcrumbList JSON-LD.
      components: { Head: "./src/components/Head.astro" },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/redlinelabs-dev/ynab-mcp" },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [{ label: "Quick start", slug: "start-here/quick-start" }],
        },
        {
          label: "Connect your agent",
          items: [
            { label: "Claude Desktop", slug: "connect/claude-desktop" },
            { label: "Claude Code", slug: "connect/claude-code" },
            { label: "Codex app", slug: "connect/codex-app" },
            { label: "Codex CLI", slug: "connect/codex-cli" },
            { label: "hermes-agent", slug: "connect/hermes-agent" },
            { label: "Generic MCP client", slug: "connect/generic-mcp-client" },
          ],
        },
        {
          label: "Host your own",
          items: [{ label: "Docker & docker-compose", slug: "host-your-own" }],
        },
        {
          label: "Trust",
          items: [{ label: "What's stored, what isn't possible", slug: "trust" }],
        },
        {
          label: "Reference",
          items: [
            { label: "Budgets", slug: "reference/budgets" },
            { label: "Accounts", slug: "reference/accounts" },
            { label: "Categories", slug: "reference/categories" },
            { label: "Transactions", slug: "reference/transactions" },
            { label: "Months", slug: "reference/months" },
            { label: "Payees", slug: "reference/payees" },
            { label: "Scheduled transactions", slug: "reference/scheduled" },
            { label: "Money movements", slug: "reference/money_movements" },
          ],
        },
        {
          label: "How it works",
          items: [{ label: "Jargon, decoded", slug: "how-it-works" }],
        },
      ],
    }),
  ],
});
