---
name: seo
description: Audit or improve the docs site's SEO using the repo's substantiated-practices playbook. Use when asked to check, improve, or re-verify SEO, search visibility, AI-citation readiness, or metadata/structured-data hygiene for the site.
---

# SEO for the ynab-mcp docs site

The source of truth is **`docs/research/seo-current-practices.md`** — a playbook of SEO practices
substantiated by primary sources (Google Search Central, official announcements) published or
confirmed-current within a 12-month window, researched 2026-08-02. Read it in full before acting.
Its §6 "deliberately excluded" list is binding: do not implement anything on it (llms.txt-as-SEO,
FAQPage/HowTo schema, GEO/AEO chunking, keyword density, link building, etc.) without new primary
evidence that supersedes the recorded reason.

## Workflow

1. **Check freshness first.** If the playbook is more than ~12 months old, re-run the research
   before applying it: primary sources only, in-window only, and update the playbook file (same
   evidence bar, same structure, same commit style) rather than working from stale guidance.
2. **Audit, then diff.** Compare the live site (`site/` and its build output, plus the deployed
   pages at https://ynab-mcp.redlinelabs.dev) against the playbook's §5 site audit and §7 top-10.
   The top-10 was implemented in PR #22 (2026-08-02) — verify the implementations still hold
   (canonical on the landing page, `site/public/robots.txt`, distinct per-page descriptions,
   git-derived sitemap `lastmod`, BreadcrumbList JSON-LD in `site/src/components/Head.astro`,
   `og.png`, contextual internal links) rather than re-adding them.
3. **Respect the repo's hard rules.** The claims rule: every prose claim must be falsifiable
   against the code, and `test/docs.test.ts` pins the load-bearing ones. Edit generated reference
   pages only via `site/scripts/generate-reference.ts` / `site/scripts/preambles/`, never the
   generated output. Performance guardrail: no fonts, no third-party scripts, no trackers, no new
   client JS; images keep intrinsic dimensions.
4. **Gates before any commit:** `command npm run check` at root (the `npm` alias is broken on the
   dev machine — always `command npm`), then root `command npm run build` followed by
   `cd site && command npm run build`. Conventional commits, no AI trailers.

## Standing constraints

- Measurement lives in Google Search Console and Bing Webmaster Tools (owner-verified; see PR #22
  body for setup). Prefer field data (CrUX / the AI-citation reports) over lab scores.
- The site's SEO moat is its code-verified, experience-derived content (bank-linking
  impossibility, 200 req/hr, milliunits, OAuth-vs-PAT storage). Deepen that; never add generic
  filler pages, and never fan the 8 toolset reference pages into per-tool pages.
- IndexNow is Bing-only and deploy-time; it's a separate issue once Bing is verified, not a
  content change.
