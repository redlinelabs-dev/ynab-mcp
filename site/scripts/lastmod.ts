// Pure helpers behind astro.config.mjs's sitemap `lastmod` derivation. Split out so they're
// importable by vitest without booting Astro's config loader — see CLAUDE.md and issue #28.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The source file a built URL came from, so its `<lastmod>` can be a real date.
 *
 * `/` is the custom landing page; every other route is a Starlight doc, which lives at
 * either `<slug>.md` or `<slug>/index.md`. Returns undefined for anything unrecognised —
 * an unmapped URL gets no lastmod rather than a guessed one.
 */
export function sourceFileFor(pathname: string, siteRoot: string): string | undefined {
  if (pathname === "/") return join(siteRoot, "src", "pages", "index.astro");
  const slug = pathname.replace(/^\/|\/$/g, "");
  if (slug === "") return undefined;
  const docs = join(siteRoot, "src", "content", "docs");
  for (const candidate of [join(docs, `${slug}.md`), join(docs, slug, "index.md")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

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
export function gitLastModified(file: string, cwd: string): string | undefined {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", file], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "" ? undefined : out;
  } catch {
    return undefined;
  }
}
